/**
 * AgentRuntime-backed agent with optional vision executor fallback.
 *
 * This keeps the control plane verification-first:
 * - Actions may be proposed by either a structured executor (DOM snapshot prompt)
 *   or a vision executor (screenshot prompt).
 * - Verification is always executed via AgentRuntime predicates.
 */

import { AgentRuntime } from './agent-runtime';
import { LLMProvider } from './llm-provider';
import { LLMInteractionHandler } from './utils/llm-interaction-handler';
import type { Snapshot, Element, BBox } from './types';
import type { Predicate } from './verification';

export interface StepVerification {
  predicate: Predicate;
  label: string;
  required?: boolean;
  eventually?: boolean;
  timeoutMs?: number;
  pollMs?: number;
  maxSnapshotAttempts?: number;
  minConfidence?: number;
}

export interface RuntimeStep {
  goal: string;
  intent?: string;
  verifications?: StepVerification[];

  // Snapshot quality policy (handled at agent layer; SDK core unchanged).
  snapshotLimitBase?: number;
  snapshotLimitStep?: number;
  snapshotLimitMax?: number;
  maxSnapshotAttempts?: number;
  minConfidence?: number;
  minActionables?: number;

  // Vision executor fallback (bounded).
  visionExecutorEnabled?: boolean;
  maxVisionExecutorAttempts?: number;
}

type ParsedAction =
  | { kind: 'finish' }
  | { kind: 'press'; key: string }
  | { kind: 'click_id'; id: number }
  | { kind: 'type_id'; id: number; text: string }
  | { kind: 'click_xy'; x: number; y: number }
  | { kind: 'click_rect'; x: number; y: number; w: number; h: number };

export class RuntimeAgent {
  readonly runtime: AgentRuntime;
  readonly executor: LLMProvider;
  readonly visionExecutor?: LLMProvider;
  readonly visionVerifier?: LLMProvider;
  readonly shortCircuitCanvas: boolean;

  private structuredLLM: LLMInteractionHandler;

  constructor(opts: {
    runtime: AgentRuntime;
    executor: LLMProvider;
    visionExecutor?: LLMProvider;
    visionVerifier?: LLMProvider;
    shortCircuitCanvas?: boolean;
  }) {
    this.runtime = opts.runtime;
    this.executor = opts.executor;
    this.visionExecutor = opts.visionExecutor;
    this.visionVerifier = opts.visionVerifier;
    this.shortCircuitCanvas = opts.shortCircuitCanvas ?? true;
    this.structuredLLM = new LLMInteractionHandler(this.executor, false);
  }

  async runStep(opts: { taskGoal: string; step: RuntimeStep }): Promise<boolean> {
    const { taskGoal, step } = opts;
    this.runtime.beginStep(step.goal);

    const snap = await this.snapshotWithRamp(step);

    if (await this.shouldShortCircuitToVision(step, snap)) {
      return await this.visionExecutorAttempt({ taskGoal, step, snap });
    }

    // 1) Structured executor attempt.
    const action = await this.proposeStructuredAction({ taskGoal, step, snap });
    await this.executeAction(action, snap);
    const ok = await this.applyVerifications(step);
    if (ok) return true;

    // 2) Optional vision executor fallback (bounded).
    const enabled = step.visionExecutorEnabled ?? true;
    const maxAttempts = step.maxVisionExecutorAttempts ?? 1;
    if (enabled && maxAttempts > 0) {
      return await this.visionExecutorAttempt({ taskGoal, step, snap });
    }

    return false;
  }

  private async snapshotWithRamp(step: RuntimeStep): Promise<Snapshot> {
    const base = step.snapshotLimitBase ?? 60;
    const stepInc = step.snapshotLimitStep ?? 40;
    const max = step.snapshotLimitMax ?? 220;
    const attempts = Math.max(1, step.maxSnapshotAttempts ?? 3);
    const minConf = step.minConfidence;
    const minActionables = step.minActionables;

    let limit = base;
    let last: Snapshot | null = null;

    for (let i = 0; i < attempts; i++) {
      last = await this.runtime.snapshot({ limit, goal: step.goal });

      if (typeof minConf === 'number') {
        const conf = last?.diagnostics?.confidence;
        if (typeof conf === 'number' && Number.isFinite(conf) && conf < minConf) {
          limit = Math.min(max, limit + stepInc);
          continue;
        }
      }

      if (typeof minActionables === 'number') {
        if (this.countActionables(last) < minActionables) {
          limit = Math.min(max, limit + stepInc);
          continue;
        }
      }

      return last;
    }

    if (!last) throw new Error('snapshot() returned null/undefined repeatedly');
    return last;
  }

  private async proposeStructuredAction(opts: {
    taskGoal: string;
    step: RuntimeStep;
    snap: Snapshot;
  }): Promise<string> {
    const { taskGoal, step, snap } = opts;
    const domContext = this.structuredLLM.buildContext(snap, step.goal);
    const combinedGoal = `${taskGoal}\n\nSTEP: ${step.goal}`;
    const resp = await this.structuredLLM.queryLLM(domContext, combinedGoal);
    return this.extractActionFromText(resp.content);
  }

  private async visionExecutorAttempt(opts: {
    taskGoal: string;
    step: RuntimeStep;
    snap: Snapshot | null;
  }): Promise<boolean> {
    const { taskGoal, step, snap } = opts;
    const provider = this.visionExecutor;
    if (!provider || !provider.supportsVision?.()) return false;

    const url = this.runtime.page?.url?.() ?? snap?.url ?? '(unknown)';
    const buf = (await (this.runtime.page as any).screenshot({ type: 'png' })) as Buffer;
    const imageBase64 = Buffer.from(buf).toString('base64');

    const { systemPrompt, userPrompt } = this.visionExecutorPrompts({
      taskGoal,
      step,
      url,
      snap,
    });

    const resp = await provider.generateWithImage(systemPrompt, userPrompt, imageBase64, {
      temperature: 0.0,
    });

    const action = this.extractActionFromText(resp.content);
    await this.executeAction(action, snap ?? undefined);

    // This is a retry of the same step; clear prior step assertions.
    this.runtime.flushAssertions();
    return await this.applyVerifications(step);
  }

  private async applyVerifications(step: RuntimeStep): Promise<boolean> {
    const verifications = step.verifications ?? [];
    if (verifications.length === 0) return true;

    let allOk = true;
    for (const v of verifications) {
      const required = v.required ?? true;
      const eventually = v.eventually ?? true;
      let ok: boolean;
      if (eventually) {
        ok = await this.runtime.check(v.predicate, v.label, required).eventually({
          timeoutMs: v.timeoutMs ?? 10_000,
          pollMs: v.pollMs ?? 250,
          minConfidence: v.minConfidence,
          maxSnapshotAttempts: v.maxSnapshotAttempts,
          visionProvider: this.visionVerifier,
        });
      } else {
        ok = this.runtime.assert(v.predicate, v.label, required);
      }
      allOk = allOk && ok;
    }

    return this.runtime.requiredAssertionsPassed() && allOk;
  }

  private async executeAction(action: string, snap?: Snapshot): Promise<void> {
    const url = this.runtime.page?.url?.() ?? snap?.url;
    await this.runtime.recordAction(action, url);

    const parsed = this.parseAction(action);

    if (parsed.kind === 'finish') return;

    if (parsed.kind === 'press') {
      await this.runtime.page.keyboard.press(parsed.key);
      await this.stabilizeBestEffort();
      return;
    }

    if (parsed.kind === 'click_xy') {
      await this.runtime.page.mouse.click(parsed.x, parsed.y);
      await this.stabilizeBestEffort();
      return;
    }

    if (parsed.kind === 'click_rect') {
      const x = parsed.x + parsed.w / 2;
      const y = parsed.y + parsed.h / 2;
      await this.runtime.page.mouse.click(x, y);
      await this.stabilizeBestEffort();
      return;
    }

    if (!snap) throw new Error('Cannot execute CLICK(id)/TYPE(id, ...) without a snapshot');

    if (parsed.kind === 'click_id') {
      const el = this.findElement(snap, parsed.id);
      if (!el) throw new Error(`Element id ${parsed.id} not found in snapshot`);
      await this.clickBBox(el.bbox);
      await this.stabilizeBestEffort();
      return;
    }

    if (parsed.kind === 'type_id') {
      const el = this.findElement(snap, parsed.id);
      if (!el) throw new Error(`Element id ${parsed.id} not found in snapshot`);
      await this.clickBBox(el.bbox);
      await this.runtime.page.keyboard.type(parsed.text);
      await this.stabilizeBestEffort();
      return;
    }
  }

  private async stabilizeBestEffort(): Promise<void> {
    try {
      await this.runtime.page.waitForTimeout(50);
    } catch {
      // best-effort
    }
  }

  private clickBBox(bbox: BBox): Promise<void> {
    const x = bbox.x + bbox.width / 2;
    const y = bbox.y + bbox.height / 2;
    return this.runtime.page.mouse.click(x, y);
  }

  private findElement(snap: Snapshot, id: number): Element | undefined {
    return snap.elements.find(e => e.id === id);
  }

  private countActionables(snap: Snapshot): number {
    let n = 0;
    for (const el of snap.elements ?? []) {
      if (el.visual_cues?.is_clickable) n += 1;
    }
    return n;
  }

  private async shouldShortCircuitToVision(
    step: RuntimeStep,
    snap: Snapshot | null
  ): Promise<boolean> {
    const enabled = step.visionExecutorEnabled ?? true;
    if (!enabled) return false;
    if (!this.visionExecutor || !this.visionExecutor.supportsVision?.()) return false;
    if (!snap) return true;

    const minActionables = step.minActionables;
    if (typeof minActionables === 'number' && this.countActionables(snap) < minActionables) {
      if (this.shortCircuitCanvas) {
        try {
          const n = await this.runtime.page.evaluate("document.querySelectorAll('canvas').length");
          if (typeof n === 'number' && n > 0) return true;
        } catch {
          // ignore
        }
      }
    }
    return false;
  }

  private visionExecutorPrompts(opts: {
    taskGoal: string;
    step: RuntimeStep;
    url: string;
    snap: Snapshot | null;
  }): { systemPrompt: string; userPrompt: string } {
    const verifyTargets = this.verificationTargetsHuman(opts.step.verifications ?? []);
    const snapshotSummary = opts.snap
      ? `\n\nStructured snapshot summary:\n- url: ${opts.snap.url}\n- elements: ${opts.snap.elements?.length ?? 0}\n`
      : '';

    const systemPrompt = `You are a vision-capable web automation executor.

TASK GOAL:
${opts.taskGoal}

STEP GOAL:
${opts.step.goal}

CURRENT URL (text):
${opts.url || '(unknown)'}

VERIFICATION TARGETS (text):
${verifyTargets || '(none provided)'}${snapshotSummary}

RESPONSE FORMAT:
Return ONLY ONE of:
- CLICK(id)
- TYPE(id, "text")
- CLICK_XY(x, y)
- CLICK_RECT(x, y, w, h)
- PRESS("key")
- FINISH()

No explanations, no markdown.
`;

    return {
      systemPrompt,
      userPrompt: 'From the screenshot, return the single best next action:',
    };
  }

  private verificationTargetsHuman(verifications: StepVerification[]): string {
    if (!verifications.length) return '';
    return verifications
      .map(v => `- ${v.label} (${(v.required ?? true) ? 'required' : 'optional'})`)
      .join('\n');
  }

  private parseAction(action: string): ParsedAction {
    const s = action.trim();

    if (/^FINISH\s*\(\s*\)\s*$/i.test(s)) return { kind: 'finish' };

    const mXY = s.match(/^CLICK_XY\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/i);
    if (mXY) return { kind: 'click_xy', x: Number(mXY[1]), y: Number(mXY[2]) };

    const mRect = s.match(
      /^CLICK_RECT\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/i
    );
    if (mRect) {
      return {
        kind: 'click_rect',
        x: Number(mRect[1]),
        y: Number(mRect[2]),
        w: Number(mRect[3]),
        h: Number(mRect[4]),
      };
    }

    const mClick = s.match(/^CLICK\s*\(\s*(\d+)\s*\)\s*$/i);
    if (mClick) return { kind: 'click_id', id: Number(mClick[1]) };

    const mType = s.match(/^TYPE\s*\(\s*(\d+)\s*,\s*["']([^"']*)["']\s*\)\s*$/i);
    if (mType) return { kind: 'type_id', id: Number(mType[1]), text: mType[2] };

    const mPress = s.match(/^PRESS\s*\(\s*["']([^"']+)["']\s*\)\s*$/i);
    if (mPress) return { kind: 'press', key: mPress[1] };

    throw new Error(`Unknown action format: ${action}`);
  }

  private extractActionFromText(text: string): string {
    const cleaned = (text || '').replace(/```[\w]*\n?/g, '').trim();
    const pat =
      /(CLICK_XY\s*\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)|CLICK_RECT\s*\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)|CLICK\s*\(\s*\d+\s*\)|TYPE\s*\(\s*\d+\s*,\s*["'].*?["']\s*\)|PRESS\s*\(\s*["'].*?["']\s*\)|FINISH\s*\(\s*\))/i;
    const m = cleaned.match(pat);
    return m ? m[1] : cleaned;
  }
}
