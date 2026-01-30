import { Page } from 'playwright';

import { AgentRuntime, AttachOptions } from './agent-runtime';
import { Predicate } from './verification';
import { Tracer } from './tracing/tracer';

export class SentienceDebugger {
  readonly runtime: AgentRuntime;
  private stepOpen: boolean = false;

  constructor(runtime: AgentRuntime) {
    this.runtime = runtime;
  }

  static attach(page: Page, tracer: Tracer, options?: AttachOptions): SentienceDebugger {
    const runtime = AgentRuntime.fromPlaywrightPage(page, tracer, options);
    return new SentienceDebugger(runtime);
  }

  beginStep(goal: string, stepIndex?: number): string {
    this.stepOpen = true;
    return this.runtime.beginStep(goal, stepIndex);
  }

  async endStep(opts: Parameters<AgentRuntime['emitStepEnd']>[0] = {}): Promise<any> {
    this.stepOpen = false;
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

  check(predicate: Predicate, label: string, required: boolean = false) {
    if (!this.stepOpen) {
      this.beginStep(`verify:${label}`);
    }
    return this.runtime.check(predicate, label, required);
  }
}
