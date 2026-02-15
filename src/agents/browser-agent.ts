import type { Snapshot, StepHookContext } from '../types';
import type { PermissionPolicy } from '../browser';
import type { AgentRuntime } from '../agent-runtime';
import type { LLMProvider } from '../llm-provider';
import { RuntimeAgent } from '../runtime-agent';
import type { RuntimeStep } from '../runtime-agent';
import type { CaptchaOptions } from '../captcha/types';
import type { CaptchaHandler } from '../captcha/types';

export interface PermissionRecoveryConfig {
  enabled?: boolean;
  maxRestarts?: number;
  autoGrant?: string[];
  geolocation?: Record<string, any> | null;
  origin?: string | null;
}

export interface VisionFallbackConfig {
  enabled?: boolean;
  maxVisionCalls?: number;
  triggerRequiresVision?: boolean;
  triggerRepeatedNoop?: boolean;
  triggerCanvasOrLowActionables?: boolean;
}

export interface CaptchaConfig {
  policy?: 'abort' | 'callback';
  // Interface-only: SDK does not ship captcha solvers. Users provide a handler/callback.
  handler?: CaptchaHandler | null;
  timeoutMs?: number | null;
  pollMs?: number | null;
  minConfidence?: number;
}

export interface PredicateBrowserAgentConfig {
  // Permissions
  permissionStartup?: PermissionPolicy | null;
  permissionRecovery?: PermissionRecoveryConfig | null;

  // Vision fallback
  vision?: VisionFallbackConfig;

  // CAPTCHA handling
  captcha?: CaptchaConfig;

  // Prompt / token controls
  historyLastN?: number; // 0 disables LLM-facing step history

  // Compact prompt customization
  // builder(taskGoal, stepGoal, domContext, snapshot, historySummary) -> {systemPrompt, userPrompt}
  compactPromptBuilder?: (
    taskGoal: string,
    stepGoal: string,
    domContext: string,
    snap: Snapshot,
    historySummary: string
  ) => { systemPrompt: string; userPrompt: string };

  compactPromptPostprocessor?: (domContext: string) => string;
}

function historySummary(items: string[]): string {
  if (!items.length) return '';
  return items.map(s => `- ${s}`).join('\n');
}

function applyCaptchaConfigToRuntime(runtime: AgentRuntime, cfg: CaptchaConfig | undefined): void {
  if (!cfg) return;

  const policy = (cfg.policy ?? 'abort').toLowerCase() as 'abort' | 'callback';
  if (policy === 'abort') {
    runtime.setCaptchaOptions({
      policy: 'abort',
      minConfidence: cfg.minConfidence ?? 0.7,
    } satisfies CaptchaOptions);
    return;
  }

  const pollMs = cfg.pollMs ?? 1_000;
  const timeoutMs = cfg.timeoutMs ?? 120_000;
  const minConfidence = cfg.minConfidence ?? 0.7;

  const handler = cfg.handler ?? null;
  if (!handler) {
    throw new Error(
      'captcha.handler is required when captcha.policy="callback". ' +
        'Provide a handler callback (e.g. human handoff or your external system).'
    );
  }

  runtime.setCaptchaOptions({
    policy: 'callback',
    handler,
    timeoutMs,
    pollMs,
    minConfidence,
  } satisfies CaptchaOptions);
}

export type StepOutcome = { stepGoal: string; ok: boolean };

export class PredicateBrowserAgent {
  readonly runtime: AgentRuntime;
  readonly executor: LLMProvider;
  readonly visionExecutor?: LLMProvider;
  readonly visionVerifier?: LLMProvider;
  readonly config: PredicateBrowserAgentConfig;

  private history: string[] = [];
  private visionCallsUsed = 0;
  private runner: RuntimeAgent;

  constructor(opts: {
    runtime: AgentRuntime;
    executor: LLMProvider;
    visionExecutor?: LLMProvider;
    visionVerifier?: LLMProvider;
    config?: PredicateBrowserAgentConfig;
  }) {
    this.runtime = opts.runtime;
    this.executor = opts.executor;
    this.visionExecutor = opts.visionExecutor;
    this.visionVerifier = opts.visionVerifier;
    this.config = {
      permissionStartup: null,
      permissionRecovery: null,
      vision: { enabled: false, maxVisionCalls: 0 },
      captcha: { policy: 'abort', handler: null },
      historyLastN: 0,
      ...(opts.config ?? {}),
    };

    applyCaptchaConfigToRuntime(this.runtime, this.config.captcha);

    this.runner = new RuntimeAgent({
      runtime: this.runtime,
      executor: this.executor,
      visionExecutor: this.visionExecutor,
      visionVerifier: this.visionVerifier,
      structuredPromptBuilder: this.config.compactPromptBuilder,
      domContextPostprocessor: this.config.compactPromptPostprocessor,
      historySummaryProvider: () => {
        const n = Math.max(0, this.config.historyLastN ?? 0);
        if (n <= 0) return '';
        const slice = this.history.slice(Math.max(0, this.history.length - n));
        return historySummary(slice);
      },
    } as any);
  }

  private recordHistory(stepGoal: string, ok: boolean) {
    const n = Math.max(0, this.config.historyLastN ?? 0);
    if (n <= 0) return;
    this.history.push(`${stepGoal} -> ${ok ? 'ok' : 'fail'}`);
    if (this.history.length > n) {
      this.history = this.history.slice(this.history.length - n);
    }
  }

  async step(opts: {
    taskGoal: string;
    step: RuntimeStep;
    onStepStart?: (ctx: StepHookContext) => void | Promise<void>;
    onStepEnd?: (ctx: StepHookContext) => void | Promise<void>;
  }): Promise<StepOutcome> {
    let step = opts.step;

    const maxVisionCalls = Math.max(0, this.config.vision?.maxVisionCalls ?? 0);
    if (
      this.config.vision?.enabled &&
      maxVisionCalls > 0 &&
      this.visionCallsUsed >= maxVisionCalls
    ) {
      step = { ...step, visionExecutorEnabled: false, maxVisionExecutorAttempts: 0 };
    }

    const ok = await this.runner.runStep({
      taskGoal: opts.taskGoal,
      step,
      onStepStart: opts.onStepStart,
      onStepEnd: opts.onStepEnd,
    });

    this.recordHistory(step.goal, ok);
    return { stepGoal: step.goal, ok };
  }

  async run(opts: {
    taskGoal: string;
    steps: RuntimeStep[];
    onStepStart?: (ctx: StepHookContext) => void | Promise<void>;
    onStepEnd?: (ctx: StepHookContext) => void | Promise<void>;
    stopOnFailure?: boolean;
  }): Promise<boolean> {
    const stopOnFailure = opts.stopOnFailure ?? true;
    for (const step of opts.steps) {
      const out = await this.step({
        taskGoal: opts.taskGoal,
        step,
        onStepStart: opts.onStepStart,
        onStepEnd: opts.onStepEnd,
      });
      if (stopOnFailure && !out.ok) return false;
    }
    return true;
  }
}
