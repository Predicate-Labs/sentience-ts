import { Page } from 'playwright';

import { AgentRuntime, AssertionHandle, AttachOptions } from './agent-runtime';
import { Predicate } from './verification';
import { Tracer } from './tracing/tracer';

class DebuggerAssertionHandle extends AssertionHandle {
  private dbg: SentienceDebugger;
  private autoClose: boolean;
  private openedStepId: string | null;

  constructor(
    dbg: SentienceDebugger,
    predicate: Predicate,
    label: string,
    required: boolean,
    autoClose: boolean,
    openedStepId: string | null
  ) {
    super(dbg.runtime, predicate, label, required);
    this.dbg = dbg;
    this.autoClose = autoClose;
    this.openedStepId = openedStepId;
  }

  override once(): boolean {
    const ok = super.once();
    if (this.autoClose && this.dbg.isAutoStepOpenFor(this.openedStepId)) {
      void this.dbg.endStep();
    }
    return ok;
  }

  override async eventually(
    options: Parameters<AssertionHandle['eventually']>[0] = {}
  ): Promise<boolean> {
    const ok = await super.eventually(options);
    if (this.autoClose && this.dbg.isAutoStepOpenFor(this.openedStepId)) {
      await this.dbg.endStep();
    }
    return ok;
  }
}

export class SentienceDebugger {
  readonly runtime: AgentRuntime;
  private stepOpen: boolean = false;
  private autoStep: boolean = true;
  private autoOpenedStep: boolean = false;
  private autoOpenedStepId: string | null = null;

  constructor(runtime: AgentRuntime, options?: { autoStep?: boolean }) {
    this.runtime = runtime;
    this.autoStep = options?.autoStep !== undefined ? Boolean(options.autoStep) : true;
  }

  static attach(page: Page, tracer: Tracer, options?: AttachOptions): SentienceDebugger {
    const runtime = AgentRuntime.fromPlaywrightPage(page, tracer, options);
    return new SentienceDebugger(runtime);
  }

  isAutoStepOpenFor(stepId: string | null): boolean {
    return Boolean(
      this.stepOpen &&
      this.autoOpenedStep &&
      this.autoOpenedStepId &&
      stepId &&
      this.autoOpenedStepId === stepId
    );
  }

  beginStep(goal: string, stepIndex?: number): string {
    // If we previously auto-opened a verification step, close it before starting a real step.
    if (this.stepOpen && this.autoOpenedStep) {
      void this.endStep();
      this.autoOpenedStep = false;
      this.autoOpenedStepId = null;
    }
    this.stepOpen = true;
    return this.runtime.beginStep(goal, stepIndex);
  }

  async endStep(opts: Parameters<AgentRuntime['emitStepEnd']>[0] = {}): Promise<any> {
    this.stepOpen = false;
    this.autoOpenedStep = false;
    this.autoOpenedStepId = null;
    // emitStepEnd is synchronous; wrap to satisfy async/await lint rules.
    return await Promise.resolve(this.runtime.emitStepEnd(opts));
  }

  async step(goal: string, fn: () => Promise<void> | void, stepIndex?: number): Promise<void> {
    this.beginStep(goal, stepIndex);
    try {
      await fn();
    } finally {
      await this.endStep();
    }
  }

  async snapshot(options?: Record<string, any>) {
    return this.runtime.snapshot(options);
  }

  async recordAction(action: string, url?: string): Promise<void> {
    return await this.runtime.recordAction(action, url);
  }

  check(predicate: Predicate, label: string, required: boolean = false) {
    let didAutoOpen = false;
    let openedStepId: string | null = null;
    if (!this.stepOpen) {
      if (!this.autoStep) {
        throw new Error(
          `No active step. Call dbg.beginStep(...) or dbg.step(...) before check(label=${JSON.stringify(
            label
          )}).`
        );
      }
      this.beginStep(`verify:${label}`);
      didAutoOpen = true;
      openedStepId = this.runtime.stepId;
      this.autoOpenedStep = true;
      this.autoOpenedStepId = openedStepId;
    }
    const base = this.runtime.check(predicate, label, required);
    if (!didAutoOpen) {
      return base;
    }
    // Return an auto-closing handle for the common "casual" sidecar usage pattern.
    // We still call runtime.check(...) above to keep behavior consistent.
    return new DebuggerAssertionHandle(this, predicate, label, required, true, openedStepId);
  }
}

/**
 * Predicate rebrand alias for SentienceDebugger.
 * Kept as a runtime alias to avoid breaking existing integrations.
 */
export const PredicateDebugger = SentienceDebugger;
