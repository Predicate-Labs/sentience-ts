/**
 * Agent runtime for verification loop support.
 *
 * This module provides a thin runtime wrapper that combines:
 * 1. Browser session management
 * 2. Snapshot/query helpers
 * 3. Tracer for event emission
 * 4. Assertion/verification methods
 *
 * The AgentRuntime is designed to be used in agent verification loops where
 * you need to repeatedly take snapshots, execute actions, and verify results.
 *
 * @example
 * ```typescript
 * import { SentienceBrowser } from './browser';
 * import { AgentRuntime } from './agent-runtime';
 * import { urlMatches, exists } from './verification';
 * import { Tracer, JsonlTraceSink } from './tracing';
 *
 * const browser = await SentienceBrowser.create();
 * const page = await browser.newPage();
 * await page.goto("https://example.com");
 *
 * const sink = new JsonlTraceSink("trace.jsonl");
 * const tracer = new Tracer("test-run", sink);
 *
 * const runtime = new AgentRuntime(browser, page, tracer);
 *
 * // Take snapshot and run assertions
 * await runtime.snapshot();
 * runtime.assert(urlMatches(/example\.com/), "on_homepage");
 * runtime.assert(exists("role=button"), "has_buttons");
 *
 * // Check if task is done
 * if (runtime.assertDone(exists("text~'Success'"), "task_complete")) {
 *   console.log("Task completed!");
 * }
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import { Page } from 'playwright';
import {
  EvaluateJsRequest,
  EvaluateJsResult,
  BackendCapabilities,
  Snapshot,
  TabInfo,
  TabListResult,
  TabOperationResult,
} from './types';
import { AssertContext, Predicate } from './verification';
import { Tracer } from './tracing/tracer';
import { TraceEventBuilder } from './utils/trace-event-builder';
import { LLMProvider } from './llm-provider';
import { FailureArtifactBuffer, FailureArtifactsOptions } from './failure-artifacts';
import { SentienceBrowser } from './browser';
import type { ToolRegistry } from './tools/registry';
import {
  CaptchaContext,
  CaptchaHandlingError,
  CaptchaOptions,
  CaptchaResolution,
  CaptchaSource,
} from './captcha/types';

// Define a minimal browser interface to avoid circular dependencies
interface BrowserLike {
  snapshot(page: Page, options?: Record<string, any>): Promise<Snapshot>;
}

export interface AttachOptions {
  apiKey?: string;
  apiUrl?: string;
  toolRegistry?: ToolRegistry;
  browser?: BrowserLike;
}

const DEFAULT_CAPTCHA_OPTIONS: Required<Omit<CaptchaOptions, 'handler' | 'resetSession'>> = {
  policy: 'abort',
  minConfidence: 0.7,
  timeoutMs: 120_000,
  pollMs: 1_000,
  maxRetriesNewSession: 1,
};

/**
 * Assertion record for accumulation and step_end emission.
 */
export interface AssertionRecord {
  label: string;
  passed: boolean;
  required: boolean;
  reason: string;
  details: Record<string, any>;
}

export interface EventuallyOptions {
  timeoutMs?: number;
  pollMs?: number;
  snapshotOptions?: Record<string, any>;
  /** If set, `.eventually()` will treat snapshots below this confidence as failures and resnapshot. */
  minConfidence?: number;
  /** Max number of snapshot attempts to get above minConfidence before declaring exhaustion. */
  maxSnapshotAttempts?: number;
  /** Optional: vision fallback provider used after snapshot exhaustion (last resort). */
  visionProvider?: LLMProvider;
  /** Optional: override vision system prompt (YES/NO only). */
  visionSystemPrompt?: string;
  /** Optional: override vision user prompt (YES/NO only). */
  visionUserPrompt?: string;
}

export class AssertionHandle {
  private runtime: AgentRuntime;
  private predicate: Predicate;
  private label: string;
  private required: boolean;

  constructor(runtime: AgentRuntime, predicate: Predicate, label: string, required: boolean) {
    this.runtime = runtime;
    this.predicate = predicate;
    this.label = label;
    this.required = required;
  }

  once(): boolean {
    return this.runtime.assert(this.predicate, this.label, this.required);
  }

  async eventually(options: EventuallyOptions = {}): Promise<boolean> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const pollMs = options.pollMs ?? 250;
    const snapshotOptions = options.snapshotOptions;
    const minConfidence = options.minConfidence;
    const maxSnapshotAttempts = options.maxSnapshotAttempts ?? 3;
    const visionProvider = options.visionProvider;
    const visionSystemPrompt = options.visionSystemPrompt;
    const visionUserPrompt = options.visionUserPrompt;

    const deadline = Date.now() + timeoutMs;
    let attempt = 0;
    let snapshotAttempt = 0;
    let lastOutcome: ReturnType<Predicate> | null = null;

    while (true) {
      attempt += 1;
      await this.runtime.snapshot(snapshotOptions);
      snapshotAttempt += 1;

      const diagnostics = this.runtime.lastSnapshot?.diagnostics;
      const confidence = diagnostics?.confidence;
      if (
        typeof minConfidence === 'number' &&
        typeof confidence === 'number' &&
        Number.isFinite(confidence) &&
        confidence < minConfidence
      ) {
        lastOutcome = {
          passed: false,
          reason: `Snapshot confidence ${confidence.toFixed(3)} < minConfidence ${minConfidence.toFixed(3)}`,
          details: {
            reason_code: 'snapshot_low_confidence',
            confidence,
            min_confidence: minConfidence,
            snapshot_attempt: snapshotAttempt,
            diagnostics,
          },
        };

        (this.runtime as any)._recordOutcome(
          lastOutcome,
          this.label,
          this.required,
          { eventually: true, attempt, snapshot_attempt: snapshotAttempt, final: false },
          false
        );

        if (snapshotAttempt >= maxSnapshotAttempts) {
          // Optional: vision fallback after snapshot exhaustion (last resort).
          // Keeps the assertion surface invariant; only perception changes.
          if (visionProvider && visionProvider.supportsVision?.()) {
            try {
              const buf = (await (this.runtime.page as any).screenshot({ type: 'png' })) as Buffer;
              const imageBase64 = Buffer.from(buf).toString('base64');
              const sys =
                visionSystemPrompt ?? 'You are a strict visual verifier. Answer only YES or NO.';
              const user =
                visionUserPrompt ??
                `Given the screenshot, is the following condition satisfied?\n\n${this.label}\n\nAnswer YES or NO.`;

              const resp = await visionProvider.generateWithImage(sys, user, imageBase64, {
                temperature: 0.0,
              });
              const text = (resp.content || '').trim().toLowerCase();
              const passed = text.startsWith('yes');

              const finalOutcome = {
                passed,
                reason: passed ? 'vision_fallback_yes' : 'vision_fallback_no',
                details: {
                  reason_code: passed ? 'vision_fallback_pass' : 'vision_fallback_fail',
                  vision_response: resp.content,
                  min_confidence: minConfidence,
                  snapshot_attempts: snapshotAttempt,
                },
              };

              (this.runtime as any)._recordOutcome(
                finalOutcome,
                this.label,
                this.required,
                {
                  eventually: true,
                  attempt,
                  snapshot_attempt: snapshotAttempt,
                  final: true,
                  vision_fallback: true,
                },
                true
              );
              if (this.required && !passed) {
                (this.runtime as any).persistFailureArtifacts(
                  `assert_eventually_failed:${this.label}`
                );
              }
              return passed;
            } catch {
              // fall through to snapshot_exhausted
            }
          }

          const finalOutcome = {
            passed: false,
            reason: `Snapshot exhausted after ${snapshotAttempt} attempt(s) below minConfidence ${minConfidence.toFixed(3)}`,
            details: {
              reason_code: 'snapshot_exhausted',
              confidence,
              min_confidence: minConfidence,
              snapshot_attempts: snapshotAttempt,
              diagnostics,
            },
          };

          (this.runtime as any)._recordOutcome(
            finalOutcome,
            this.label,
            this.required,
            {
              eventually: true,
              attempt,
              snapshot_attempt: snapshotAttempt,
              final: true,
              exhausted: true,
            },
            true
          );
          if (this.required) {
            (this.runtime as any).persistFailureArtifacts(`assert_eventually_failed:${this.label}`);
          }
          return false;
        }

        if (Date.now() >= deadline) {
          (this.runtime as any)._recordOutcome(
            lastOutcome,
            this.label,
            this.required,
            {
              eventually: true,
              attempt,
              snapshot_attempt: snapshotAttempt,
              final: true,
              timeout: true,
            },
            true
          );
          if (this.required) {
            (this.runtime as any).persistFailureArtifacts(
              `assert_eventually_timeout:${this.label}`
            );
          }
          return false;
        }

        await new Promise(resolve => setTimeout(resolve, pollMs));
        continue;
      }

      lastOutcome = this.predicate((this.runtime as any).ctx());

      // Emit attempt event (not recorded in step_end)
      (this.runtime as any)._recordOutcome(
        lastOutcome,
        this.label,
        this.required,
        { eventually: true, attempt, final: false },
        false
      );

      if (lastOutcome.passed) {
        // Record final success once
        (this.runtime as any)._recordOutcome(
          lastOutcome,
          this.label,
          this.required,
          { eventually: true, attempt, final: true },
          true
        );
        return true;
      }

      if (Date.now() >= deadline) {
        // Record final failure once
        (this.runtime as any)._recordOutcome(
          lastOutcome,
          this.label,
          this.required,
          { eventually: true, attempt, final: true, timeout: true },
          true
        );
        if (this.required) {
          (this.runtime as any).persistFailureArtifacts(`assert_eventually_timeout:${this.label}`);
        }
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
  }
}

/**
 * Runtime wrapper for agent verification loops.
 *
 * Provides ergonomic methods for:
 * - snapshot(): Take page snapshot
 * - assert(): Evaluate assertion predicates
 * - assertDone(): Assert task completion (required assertion)
 *
 * The runtime manages assertion state per step and emits verification events
 * to the tracer for Studio timeline display.
 */
export class AgentRuntime {
  /** Browser instance for taking snapshots */
  readonly browser: BrowserLike;
  /** Playwright Page for browser interaction */
  page: Page;
  /** Tracer for event emission */
  readonly tracer: Tracer;
  /** Optional ToolRegistry for LLM-callable tools */
  readonly toolRegistry?: ToolRegistry;

  /** Current step identifier */
  stepId: string | null = null;
  /** Current step index (0-based) */
  stepIndex: number = 0;
  /** Most recent snapshot (for assertion context) */
  lastSnapshot: Snapshot | null = null;
  private stepPreSnapshot: Snapshot | null = null;
  private stepPreUrl: string | null = null;
  /** Best-effort download records (Playwright downloads) */
  private downloads: Array<Record<string, any>> = [];
  /** Tab registry for tab operations */
  private tabRegistry: Map<string, Page> = new Map();
  private tabIds: WeakMap<Page, string> = new WeakMap();

  /** Failure artifact buffer (Phase 1) */
  private artifactBuffer: FailureArtifactBuffer | null = null;
  private artifactTimer: NodeJS.Timeout | null = null;

  /** Assertions accumulated during current step */
  private assertionsThisStep: AssertionRecord[] = [];
  private stepGoal: string | null = null;
  private lastAction: string | null = null;
  /** Task completion tracking */
  private taskDone: boolean = false;
  private taskDoneLabel: string | null = null;

  /** CAPTCHA handling (optional, disabled by default) */
  private captchaOptions: CaptchaOptions | null = null;
  private captchaRetryCount: number = 0;

  private static similarity(a: string, b: string): number {
    const s1 = a.toLowerCase();
    const s2 = b.toLowerCase();
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;

    // Bigram overlap (cheap, robust enough for suggestions)
    const bigrams = (s: string): string[] => {
      const out: string[] = [];
      for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
      return out;
    };
    const a2 = bigrams(s1);
    const b2 = bigrams(s2);
    const setB = new Set(b2);
    let common = 0;
    for (const g of a2) if (setB.has(g)) common += 1;
    return (2 * common) / (a2.length + b2.length + 1e-9);
  }

  private static stringifyEvalValue(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (Array.isArray(value) || typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  _recordOutcome(
    outcome: ReturnType<Predicate>,
    label: string,
    required: boolean,
    extra: Record<string, any> | null,
    recordInStep: boolean
  ): void {
    const details = { ...(outcome.details || {}) } as Record<string, any>;

    // Failure intelligence: nearest matches for selector-driven assertions
    if (!outcome.passed && this.lastSnapshot && typeof details.selector === 'string') {
      const selector = details.selector;
      const scored: Array<{ score: number; el: any }> = [];
      for (const el of this.lastSnapshot.elements) {
        const hay = el.name ?? el.text ?? '';
        if (!hay) continue;
        const score = AgentRuntime.similarity(selector, hay);
        scored.push({ score, el });
      }
      scored.sort((x, y) => y.score - x.score);
      details.nearest_matches = scored.slice(0, 3).map(({ score, el }) => ({
        id: el.id,
        role: el.role,
        text: (el.text ?? '').toString().slice(0, 80),
        name: (el.name ?? '').toString().slice(0, 80),
        score: Math.round(score * 10_000) / 10_000,
      }));
    }

    const record: AssertionRecord & Record<string, any> = {
      label,
      passed: outcome.passed,
      required,
      reason: outcome.reason,
      details,
      ...(extra || {}),
    };

    if (recordInStep) {
      this.assertionsThisStep.push(record);
    }

    this.tracer.emit(
      'verification',
      {
        kind: 'assert',
        ...record,
      },
      this.stepId || undefined
    );
  }

  check(predicate: Predicate, label: string, required: boolean = false): AssertionHandle {
    return new AssertionHandle(this, predicate, label, required);
  }

  /**
   * Create AgentRuntime from a raw Playwright Page (sidecar mode).
   */
  static fromPlaywrightPage(page: Page, tracer: Tracer, options?: AttachOptions): AgentRuntime {
    const browser =
      options?.browser ??
      ((): BrowserLike => {
        const sentienceBrowser = SentienceBrowser.fromPage(page, options?.apiKey, options?.apiUrl);
        return {
          snapshot: async (_page: Page, snapshotOptions?: Record<string, any>) =>
            sentienceBrowser.snapshot(snapshotOptions),
        };
      })();

    return new AgentRuntime(browser, page, tracer, options?.toolRegistry);
  }

  /**
   * Sidecar alias for fromPlaywrightPage().
   */
  static attach(page: Page, tracer: Tracer, options?: AttachOptions): AgentRuntime {
    return AgentRuntime.fromPlaywrightPage(page, tracer, options);
  }

  /**
   * Create a new AgentRuntime.
   *
   * @param browser - Browser instance for taking snapshots
   * @param page - Playwright Page for browser interaction
   * @param tracer - Tracer for emitting verification events
   */
  constructor(browser: BrowserLike, page: Page, tracer: Tracer, toolRegistry?: ToolRegistry) {
    this.browser = browser;
    this.page = page;
    this.tracer = tracer;
    this.toolRegistry = toolRegistry;

    // Best-effort download tracking (does not change behavior unless a download occurs).
    try {
      this.page.on('download', download => {
        void this.trackDownload(download);
      });
    } catch {
      // ignore
    }
  }

  capabilities(): BackendCapabilities {
    const hasTabs = typeof (this as any).listTabs === 'function';
    const hasEval = typeof (this as any).evaluateJs === 'function';
    const hasKeyboard = Boolean((this.page as any)?.keyboard);
    const hasDownloads = this.downloads.length >= 0;
    let hasPermissions = false;
    try {
      const context =
        typeof (this.page as any)?.context === 'function' ? (this.page as any).context() : null;
      hasPermissions =
        Boolean(context) &&
        typeof context.clearPermissions === 'function' &&
        typeof context.grantPermissions === 'function';
    } catch {
      hasPermissions = false;
    }
    let hasFiles = false;
    if (this.toolRegistry) {
      hasFiles = Boolean(this.toolRegistry.get('read_file'));
    }
    return {
      tabs: hasTabs,
      evaluate_js: hasEval,
      downloads: hasDownloads,
      filesystem_tools: hasFiles,
      keyboard: hasKeyboard,
      permissions: hasPermissions,
    };
  }

  can(name: keyof BackendCapabilities): boolean {
    return Boolean(this.capabilities()[name]);
  }

  /**
   * Configure CAPTCHA handling (disabled by default unless set).
   */
  setCaptchaOptions(options: CaptchaOptions): void {
    this.captchaOptions = {
      ...DEFAULT_CAPTCHA_OPTIONS,
      ...options,
    };
    this.captchaRetryCount = 0;
  }

  /**
   * Build assertion context from current state.
   */
  private ctx(): AssertContext {
    let url: string | null = null;
    if (this.lastSnapshot) {
      url = this.lastSnapshot.url;
    } else if (this.page) {
      url = this.page.url();
    }

    return {
      snapshot: this.lastSnapshot,
      url,
      stepId: this.stepId,
      downloads: this.downloads,
    };
  }

  private async trackDownload(download: any): Promise<void> {
    const rec: Record<string, any> = {
      status: 'started',
      suggested_filename: download?.suggestedFilename?.() ?? download?.suggested_filename,
      url: download?.url?.() ?? download?.url,
    };
    this.downloads.push(rec);
    try {
      const p = (await download.path?.()) as string | null;
      rec.status = 'completed';
      if (p) {
        rec.path = p;
        try {
          // Best-effort size and mime type (no new deps).
          rec.size_bytes = Number(fs.statSync(p).size);
          const ext = String(path.extname(p) || '').toLowerCase();
          const mimeByExt: Record<string, string> = {
            '.pdf': 'application/pdf',
            '.txt': 'text/plain',
            '.csv': 'text/csv',
            '.json': 'application/json',
            '.zip': 'application/zip',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
          };
          if (mimeByExt[ext]) rec.mime_type = mimeByExt[ext];
        } catch {
          // ignore
        }
      }
    } catch (e: any) {
      rec.status = 'failed';
      rec.error = String(e?.message ?? e);
    }
  }

  /**
   * Take a snapshot of the current page state.
   *
   * This updates lastSnapshot which is used as context for assertions.
   *
   * @param options - Options passed through to browser.snapshot()
   * @returns Snapshot of current page state
   */
  async snapshot(options?: Record<string, any>): Promise<Snapshot> {
    const { _skipCaptchaHandling, ...snapshotOptions } = options || {};
    this.lastSnapshot = await this.browser.snapshot(this.page, snapshotOptions);
    if (this.lastSnapshot && !this.stepPreSnapshot) {
      this.stepPreSnapshot = this.lastSnapshot;
      this.stepPreUrl = this.lastSnapshot.url;
    }
    if (!_skipCaptchaHandling) {
      await this.handleCaptchaIfNeeded(this.lastSnapshot, 'gateway');
    }
    return this.lastSnapshot;
  }

  /**
   * Evaluate JavaScript in the page context.
   */
  async evaluateJs(request: EvaluateJsRequest): Promise<EvaluateJsResult> {
    try {
      const value = await this.page.evaluate(request.code);
      const text = AgentRuntime.stringifyEvalValue(value);
      const maxChars = request.max_output_chars ?? 4000;
      const truncate = request.truncate ?? true;
      let truncated = false;
      let finalText = text;
      if (truncate && finalText.length > maxChars) {
        finalText = `${finalText.slice(0, maxChars)}...`;
        truncated = true;
      }
      return {
        ok: true,
        value,
        text: finalText,
        truncated,
      };
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  }

  /**
   * List open tabs in the current browser context.
   */
  async listTabs(): Promise<TabListResult> {
    const context = (this.page as any)?.context?.();
    if (!context || typeof context.pages !== 'function') {
      return { ok: false, tabs: [], error: 'unsupported_capability' };
    }
    this.pruneTabs();
    const pages: Page[] = context.pages();
    const tabs: TabInfo[] = [];
    for (const page of pages) {
      const tab_id = this.ensureTabId(page);
      let title: string | null = null;
      try {
        title = await page.title();
      } catch {
        title = null;
      }
      let url: string | null = null;
      try {
        url = page.url();
      } catch {
        url = null;
      }
      tabs.push({ tab_id, url, title, is_active: page === this.page });
    }
    return { ok: true, tabs };
  }

  /**
   * Open a new tab and navigate to the URL.
   */
  async openTab(url: string): Promise<TabOperationResult> {
    const context = (this.page as any)?.context?.();
    if (!context || typeof context.newPage !== 'function') {
      return { ok: false, error: 'unsupported_capability' };
    }
    this.pruneTabs();
    try {
      const page = await context.newPage();
      await page.goto(url);
      this.page = page;
      const tab_id = this.ensureTabId(page);
      let title: string | null = null;
      try {
        title = await page.title();
      } catch {
        title = null;
      }
      return { ok: true, tab: { tab_id, url: page.url?.() ?? url, title, is_active: true } };
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  }

  /**
   * Switch to an existing tab by id.
   */
  async switchTab(tab_id: string): Promise<TabOperationResult> {
    this.pruneTabs();
    const page = this.tabRegistry.get(tab_id);
    if (!page) {
      return { ok: false, error: `unknown tab_id: ${tab_id}` };
    }
    this.page = page;
    try {
      await page.bringToFront();
    } catch {
      // best-effort
    }
    let title: string | null = null;
    try {
      title = await page.title();
    } catch {
      title = null;
    }
    return {
      ok: true,
      tab: { tab_id, url: page.url?.() ?? null, title, is_active: true },
    };
  }

  /**
   * Close a tab by id.
   */
  async closeTab(tab_id: string): Promise<TabOperationResult> {
    this.pruneTabs();
    const page = this.tabRegistry.get(tab_id);
    if (!page) {
      return { ok: false, error: `unknown tab_id: ${tab_id}` };
    }
    let title: string | null = null;
    try {
      title = await page.title();
    } catch {
      title = null;
    }
    const wasActive = page === this.page;
    try {
      await page.close();
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) };
    }
    this.tabRegistry.delete(tab_id);
    if (wasActive) {
      const context = (page as any)?.context?.();
      const pages: Page[] = context?.pages?.() ?? [];
      if (pages.length > 0) {
        this.page = pages[0];
      }
    }
    return {
      ok: true,
      tab: { tab_id, url: page.url?.() ?? null, title, is_active: wasActive },
    };
  }

  private ensureTabId(page: Page): string {
    const existing = this.tabIds.get(page);
    if (existing) {
      return existing;
    }
    const tab_id = `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.tabIds.set(page, tab_id);
    this.tabRegistry.set(tab_id, page);
    return tab_id;
  }

  private pruneTabs(): void {
    for (const [tab_id, page] of this.tabRegistry.entries()) {
      try {
        const isClosed = (page as any).isClosed?.();
        if (isClosed) {
          this.tabRegistry.delete(tab_id);
        }
      } catch {
        // ignore
      }
    }
  }

  private isCaptchaDetected(snapshot: Snapshot): boolean {
    const options = this.captchaOptions;
    if (!options) {
      return false;
    }
    const captcha = snapshot.diagnostics?.captcha;
    if (!captcha || !captcha.detected) {
      return false;
    }
    // Many pages load CAPTCHA libraries proactively. Only block when we have
    // evidence it's actually present/active (iframe/url/text hits), otherwise
    // interactive runs can "do nothing" and time out.
    const evidence = captcha.evidence;
    const iframeHits = evidence?.iframe_src_hits ?? [];
    const urlHits = evidence?.url_hits ?? [];
    const textHits = evidence?.text_hits ?? [];
    if (iframeHits.length === 0 && urlHits.length === 0 && textHits.length === 0) {
      return false;
    }
    const confidence = captcha.confidence ?? 0;
    const minConfidence = options.minConfidence ?? DEFAULT_CAPTCHA_OPTIONS.minConfidence;
    return confidence >= minConfidence;
  }

  private buildCaptchaContext(snapshot: Snapshot, source: CaptchaSource): CaptchaContext {
    return {
      runId: this.tracer.getRunId(),
      stepIndex: this.stepIndex,
      url: snapshot.url,
      source,
      captcha: snapshot.diagnostics?.captcha ?? null,
      evaluateJs: async (code: string) => {
        const result = await this.evaluateJs({ code });
        if (!result.ok) {
          throw new Error(result.error ?? 'evaluateJs failed');
        }
        return result.value;
      },
    };
  }

  private emitCaptchaEvent(reasonCode: string, details: Record<string, any> = {}): void {
    this.tracer.emit(
      'verification',
      {
        kind: 'captcha',
        passed: false,
        label: reasonCode,
        details: { reason_code: reasonCode, ...details },
      },
      this.stepId || undefined
    );
  }

  private async handleCaptchaIfNeeded(snapshot: Snapshot, source: CaptchaSource): Promise<void> {
    if (!this.captchaOptions) {
      return;
    }
    if (!this.isCaptchaDetected(snapshot)) {
      return;
    }

    const options = this.captchaOptions;
    const minConfidence = options.minConfidence ?? DEFAULT_CAPTCHA_OPTIONS.minConfidence;
    const captcha = snapshot.diagnostics?.captcha ?? null;

    this.emitCaptchaEvent('captcha_detected', { captcha, min_confidence: minConfidence });

    let resolution: CaptchaResolution;
    if (options.policy === 'callback') {
      if (!options.handler) {
        this.emitCaptchaEvent('captcha_handler_error');
        throw new CaptchaHandlingError(
          'captcha_handler_error',
          'Captcha handler is required for policy="callback".'
        );
      }
      try {
        resolution = await options.handler(this.buildCaptchaContext(snapshot, source));
      } catch (err: any) {
        this.emitCaptchaEvent('captcha_handler_error', { error: String(err?.message || err) });
        throw new CaptchaHandlingError('captcha_handler_error', 'Captcha handler failed.', {
          error: String(err?.message || err),
        });
      }
      if (!resolution || !resolution.action) {
        this.emitCaptchaEvent('captcha_handler_error');
        throw new CaptchaHandlingError(
          'captcha_handler_error',
          'Captcha handler returned an invalid resolution.'
        );
      }
    } else {
      resolution = { action: 'abort' };
    }

    await this.applyCaptchaResolution(resolution, snapshot, source);
  }

  private async applyCaptchaResolution(
    resolution: CaptchaResolution,
    snapshot: Snapshot,
    source: CaptchaSource
  ): Promise<void> {
    const options = this.captchaOptions || DEFAULT_CAPTCHA_OPTIONS;
    if (resolution.action === 'abort') {
      this.emitCaptchaEvent('captcha_policy_abort', { message: resolution.message });
      throw new CaptchaHandlingError(
        'captcha_policy_abort',
        resolution.message || 'Captcha detected. Aborting per policy.'
      );
    }

    if (resolution.action === 'retry_new_session') {
      this.captchaRetryCount += 1;
      this.emitCaptchaEvent('captcha_retry_new_session');
      if (this.captchaRetryCount > (options.maxRetriesNewSession ?? 1)) {
        this.emitCaptchaEvent('captcha_retry_exhausted');
        throw new CaptchaHandlingError(
          'captcha_retry_exhausted',
          'Captcha retry_new_session exhausted.'
        );
      }
      const resetSession = this.captchaOptions?.resetSession;
      if (!resetSession) {
        throw new CaptchaHandlingError(
          'captcha_retry_new_session',
          'resetSession callback is required for retry_new_session.'
        );
      }
      await resetSession();
      return;
    }

    if (resolution.action === 'wait_until_cleared') {
      const timeoutMs =
        resolution.timeoutMs ?? options.timeoutMs ?? DEFAULT_CAPTCHA_OPTIONS.timeoutMs;
      const pollMs = resolution.pollMs ?? options.pollMs ?? DEFAULT_CAPTCHA_OPTIONS.pollMs;
      await this.waitUntilCleared(timeoutMs, pollMs, snapshot, source);
      this.emitCaptchaEvent('captcha_resumed');
    }
  }

  private async waitUntilCleared(
    timeoutMs: number,
    pollMs: number,
    snapshot: Snapshot,
    source: CaptchaSource
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      await new Promise(res => setTimeout(res, pollMs));
      const next = await this.snapshot({ _skipCaptchaHandling: true });
      if (!this.isCaptchaDetected(next)) {
        this.emitCaptchaEvent('captcha_cleared', { source });
        return;
      }
    }
    this.emitCaptchaEvent('captcha_wait_timeout', { timeout_ms: timeoutMs });
    throw new CaptchaHandlingError('captcha_wait_timeout', 'Captcha wait_until_cleared timed out.');
  }

  /**
   * Enable failure artifact buffer (Phase 1).
   */
  enableFailureArtifacts(options: FailureArtifactsOptions = {}): void {
    this.artifactBuffer = new FailureArtifactBuffer(this.tracer.getRunId(), options);
    const fps = this.artifactBuffer.getOptions().fps;
    if (fps && fps > 0) {
      const intervalMs = Math.max(1, Math.floor(1000 / fps));
      this.artifactTimer = setInterval(() => {
        this.captureArtifactFrame().catch(() => {
          // best-effort
        });
      }, intervalMs);
    }
  }

  /**
   * Disable failure artifact buffer and stop background capture.
   */
  disableFailureArtifacts(): void {
    if (this.artifactTimer) {
      clearInterval(this.artifactTimer);
      this.artifactTimer = null;
    }
  }

  /**
   * Record an action in the artifact timeline and capture a frame if enabled.
   */
  async recordAction(action: string, url?: string): Promise<void> {
    this.lastAction = action;
    if (!this.artifactBuffer) {
      return;
    }
    this.artifactBuffer.recordStep(action, this.stepId, this.stepIndex, url);
    if (this.artifactBuffer.getOptions().captureOnAction) {
      await this.captureArtifactFrame();
    }
  }

  /**
   * Emit a step_end event using TraceEventBuilder.
   */
  emitStepEnd(opts: {
    action?: string;
    success?: boolean;
    error?: string;
    outcome?: string;
    durationMs?: number;
    attempt?: number;
    verifyPassed?: boolean;
    verifySignals?: Record<string, any>;
    postUrl?: string;
    postSnapshotDigest?: string;
  }): any {
    const goal = this.stepGoal || '';
    const preSnap = this.stepPreSnapshot || this.lastSnapshot;
    const preUrl = this.stepPreUrl || preSnap?.url || this.page?.url?.() || '';
    const postUrl = opts.postUrl || this.page?.url?.() || this.lastSnapshot?.url || preUrl;

    const preDigest = preSnap ? TraceEventBuilder.buildSnapshotDigest(preSnap) : undefined;
    const postDigest =
      opts.postSnapshotDigest ||
      (this.lastSnapshot ? TraceEventBuilder.buildSnapshotDigest(this.lastSnapshot) : undefined);

    const urlChanged = Boolean(preUrl && postUrl && String(preUrl) !== String(postUrl));
    const assertionsData = this.getAssertionsForStepEnd();

    const signals = { ...(opts.verifySignals || {}) } as Record<string, any>;
    if (signals.url_changed === undefined) {
      signals.url_changed = urlChanged;
    }
    if (opts.error && signals.error === undefined) {
      signals.error = opts.error;
    }
    if (assertionsData.task_done !== undefined) {
      signals.task_done = assertionsData.task_done;
    }
    if (assertionsData.task_done_label) {
      signals.task_done_label = assertionsData.task_done_label;
    }

    const verifyPassed =
      opts.verifyPassed !== undefined ? opts.verifyPassed : this.requiredAssertionsPassed();

    const execData = {
      success: opts.success !== undefined ? opts.success : verifyPassed,
      action: opts.action || this.lastAction || 'unknown',
      outcome: opts.outcome || '',
      duration_ms: opts.durationMs,
      error: opts.error,
    };

    const verifyData = {
      passed: Boolean(verifyPassed),
      signals,
    };

    const stepEndData = TraceEventBuilder.buildRuntimeStepEndData({
      stepId: this.stepId || '',
      stepIndex: this.stepIndex,
      goal,
      attempt: opts.attempt ?? 0,
      preUrl,
      postUrl,
      preSnapshotDigest: preDigest,
      postSnapshotDigest: postDigest,
      execData,
      verifyData,
      assertions: assertionsData.assertions,
      taskDone: assertionsData.task_done,
      taskDoneLabel: assertionsData.task_done_label,
    });

    this.tracer.emit('step_end', stepEndData, this.stepId || undefined);
    return stepEndData;
  }

  private async captureArtifactFrame(): Promise<void> {
    if (!this.artifactBuffer) {
      return;
    }
    try {
      const image = await this.page.screenshot({ type: 'jpeg', quality: 80 });
      await this.artifactBuffer.addFrame(image, 'jpeg');
    } catch {
      // best-effort
    }
  }

  /**
   * Finalize artifact buffer at end of run.
   */
  async finalizeRun(success: boolean): Promise<void> {
    if (!this.artifactBuffer) {
      return;
    }
    if (success) {
      if (this.artifactBuffer.getOptions().persistMode === 'always') {
        await this.artifactBuffer.persist(
          'success',
          'success',
          this.lastSnapshot ?? undefined,
          this.lastSnapshot?.diagnostics,
          this.artifactMetadata()
        );
      }
      await this.artifactBuffer.cleanup();
    } else {
      await this.persistFailureArtifacts('finalize_failure');
    }
  }

  private async persistFailureArtifacts(reason: string): Promise<void> {
    if (!this.artifactBuffer) {
      return;
    }
    await this.artifactBuffer.persist(
      reason,
      'failure',
      this.lastSnapshot ?? undefined,
      this.lastSnapshot?.diagnostics,
      this.artifactMetadata()
    );
    await this.artifactBuffer.cleanup();
    if (this.artifactBuffer.getOptions().persistMode === 'onFail') {
      this.disableFailureArtifacts();
    }
  }

  private artifactMetadata(): Record<string, any> {
    const url = this.lastSnapshot?.url ?? this.page?.url?.();
    return {
      backend: 'playwright',
      url,
    };
  }

  /**
   * Begin a new step in the verification loop.
   *
   * This:
   * - Generates a new stepId
   * - Clears assertions from previous step
   * - Increments stepIndex (or uses provided value)
   *
   * @param goal - Description of what this step aims to achieve
   * @param stepIndex - Optional explicit step index (otherwise auto-increments)
   * @returns Generated stepId in format 'step-N' where N is the step index
   */
  beginStep(goal: string, stepIndex?: number): string {
    // Clear previous step state
    this.assertionsThisStep = [];
    this.stepPreSnapshot = null;
    this.stepPreUrl = null;
    this.stepGoal = goal;
    this.lastAction = null;

    // Update step index
    if (stepIndex !== undefined) {
      this.stepIndex = stepIndex;
    } else {
      this.stepIndex += 1;
    }

    // Generate stepId in 'step-N' format for Studio compatibility
    this.stepId = `step-${this.stepIndex}`;

    return this.stepId;
  }

  /**
   * Evaluate an assertion against current snapshot state.
   *
   * The assertion result is:
   * 1. Accumulated for inclusion in step_end.data.verify.signals.assertions
   * 2. Emitted as a dedicated 'verification' event for Studio timeline
   *
   * @param predicate - Predicate function to evaluate
   * @param label - Human-readable label for this assertion
   * @param required - If true, this assertion gates step success (default: false)
   * @returns True if assertion passed, false otherwise
   */
  assert(predicate: Predicate, label: string, required: boolean = false): boolean {
    const outcome = predicate(this.ctx());
    this._recordOutcome(outcome, label, required, null, true);
    if (required && !outcome.passed) {
      this.persistFailureArtifacts(`assert_failed:${label}`).catch(() => {
        // best-effort
      });
    }
    return outcome.passed;
  }

  /**
   * Assert task completion (required assertion).
   *
   * This is a convenience wrapper for assert() with required=true.
   * When the assertion passes, it marks the task as done.
   *
   * Use this for final verification that the agent's goal is complete.
   *
   * @param predicate - Predicate function to evaluate
   * @param label - Human-readable label for this assertion
   * @returns True if task is complete (assertion passed), false otherwise
   */
  assertDone(predicate: Predicate, label: string): boolean {
    const ok = this.assert(predicate, label, true);

    if (ok) {
      this.taskDone = true;
      this.taskDoneLabel = label;

      // Emit task_done verification event
      this.tracer.emit(
        'verification',
        {
          kind: 'task_done',
          passed: true,
          label,
        },
        this.stepId || undefined
      );
    }

    return ok;
  }

  /**
   * Get assertions data for inclusion in step_end.data.verify.signals.
   *
   * This is called when building the step_end event to include
   * assertion results in the trace.
   *
   * @returns Object with 'assertions', 'task_done', 'task_done_label' keys
   */
  getAssertionsForStepEnd(): {
    assertions: AssertionRecord[];
    task_done?: boolean;
    task_done_label?: string;
  } {
    const result: {
      assertions: AssertionRecord[];
      task_done?: boolean;
      task_done_label?: string;
    } = {
      assertions: [...this.assertionsThisStep],
    };

    if (this.taskDone) {
      result.task_done = true;
      result.task_done_label = this.taskDoneLabel || undefined;
    }

    return result;
  }

  /**
   * Get and clear assertions for current step.
   *
   * Call this at step end to get accumulated assertions
   * for the step_end event, then clear for next step.
   *
   * @returns List of assertion records from this step
   */
  flushAssertions(): AssertionRecord[] {
    const assertions = [...this.assertionsThisStep];
    this.assertionsThisStep = [];
    return assertions;
  }

  /**
   * Check if task has been marked as done via assertDone().
   */
  get isTaskDone(): boolean {
    return this.taskDone;
  }

  /**
   * Reset task_done state (for multi-task runs).
   */
  resetTaskDone(): void {
    this.taskDone = false;
    this.taskDoneLabel = null;
  }

  /**
   * Check if all assertions in current step passed.
   *
   * @returns True if all assertions passed (or no assertions made)
   */
  allAssertionsPassed(): boolean {
    return this.assertionsThisStep.every(a => a.passed);
  }

  /**
   * Check if all required assertions in current step passed.
   *
   * @returns True if all required assertions passed (or no required assertions)
   */
  requiredAssertionsPassed(): boolean {
    const required = this.assertionsThisStep.filter(a => a.required);
    return required.every(a => a.passed);
  }
}
