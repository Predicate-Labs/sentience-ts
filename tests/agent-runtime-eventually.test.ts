import { AgentRuntime } from '../src/agent-runtime';
import { TraceSink } from '../src/tracing/sink';
import { Tracer } from '../src/tracing/tracer';
import { Predicate } from '../src/verification';
import { Snapshot } from '../src/types';
import { MockPage } from './mocks/browser-mock';

class MockSink extends TraceSink {
  public events: any[] = [];
  emit(event: Record<string, any>): void {
    this.events.push(event);
  }
  async close(): Promise<void> {
    // no-op
  }
  getSinkType(): string {
    return 'MockSink';
  }
}

describe('AgentRuntime.check().eventually()', () => {
  it('records only final assertion and emits attempt events', async () => {
    const sink = new MockSink();
    const tracer = new Tracer('test-run', sink);
    const page = new MockPage('https://example.com') as any;

    const snapshots: Snapshot[] = [
      { status: 'success', url: 'https://example.com', elements: [], timestamp: 't1' },
      { status: 'success', url: 'https://example.com', elements: [], timestamp: 't2' },
      { status: 'success', url: 'https://example.com/done', elements: [], timestamp: 't3' },
    ];

    const browserLike = {
      snapshot: async () => snapshots.shift() as Snapshot,
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    runtime.beginStep('Test');

    const pred: Predicate = ctx => {
      const ok = (ctx.url || '').endsWith('/done');
      return {
        passed: ok,
        reason: ok ? '' : 'not done',
        details: { selector: "text~'Done'", reason_code: ok ? 'ok' : 'no_match' },
      };
    };

    const ok = await runtime.check(pred, 'eventually_done').eventually({
      timeoutMs: 2000,
      pollMs: 0,
    });

    expect(ok).toBe(true);

    const stepEnd = runtime.getAssertionsForStepEnd();
    expect(stepEnd.assertions.length).toBe(1);
    expect(stepEnd.assertions[0].label).toBe('eventually_done');
    expect(stepEnd.assertions[0].passed).toBe(true);
    expect((stepEnd.assertions[0] as any).final).toBe(true);

    // emitted attempt events + final event (at least 3)
    const verificationEvents = sink.events.filter(e => e.type === 'verification');
    expect(verificationEvents.length).toBeGreaterThanOrEqual(3);
  });

  it('can gate on minConfidence and stop with snapshot_exhausted', async () => {
    const sink = new MockSink();
    const tracer = new Tracer('test-run', sink);
    const page = new MockPage('https://example.com') as any;

    const snapshots: Snapshot[] = [
      {
        status: 'success',
        url: 'https://example.com',
        elements: [],
        timestamp: 't1',
        diagnostics: {
          confidence: 0.1,
          reasons: ['dom_unstable'],
          metrics: { quiet_ms: 50 },
        } as any,
      },
      {
        status: 'success',
        url: 'https://example.com',
        elements: [],
        timestamp: 't2',
        diagnostics: {
          confidence: 0.1,
          reasons: ['dom_unstable'],
          metrics: { quiet_ms: 50 },
        } as any,
      },
    ];

    const browserLike = {
      snapshot: async () => snapshots.shift() as Snapshot,
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    runtime.beginStep('Test');

    const pred: Predicate = _ctx => ({
      passed: true,
      reason: 'would pass',
      details: {},
    });

    const ok = await runtime.check(pred, 'min_confidence_gate').eventually({
      timeoutMs: 2000,
      pollMs: 0,
      minConfidence: 0.7,
      maxSnapshotAttempts: 2,
    });

    expect(ok).toBe(false);

    const stepEnd = runtime.getAssertionsForStepEnd();
    expect(stepEnd.assertions.length).toBe(1);
    expect(stepEnd.assertions[0].label).toBe('min_confidence_gate');
    expect(stepEnd.assertions[0].passed).toBe(false);
    expect((stepEnd.assertions[0] as any).details.reason_code).toBe('snapshot_exhausted');
  });

  it('can use vision fallback after snapshot_exhausted (YES/NO)', async () => {
    const sink = new MockSink();
    const tracer = new Tracer('test-run', sink);
    const page = new MockPage('https://example.com') as any;

    const snapshots: Snapshot[] = [
      {
        status: 'success',
        url: 'https://example.com',
        elements: [],
        timestamp: 't1',
        diagnostics: {
          confidence: 0.1,
          reasons: ['dom_unstable'],
          metrics: { quiet_ms: 50 },
        } as any,
      },
    ];

    const browserLike = {
      snapshot: async () => snapshots.shift() as Snapshot,
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    runtime.beginStep('Test');

    const visionProvider = {
      supportsVision: () => true,
      generateWithImage: async () => ({ content: 'YES' }),
    } as any;

    const pred: Predicate = _ctx => ({
      passed: false,
      reason: 'should not run',
      details: {},
    });

    const ok = await runtime.check(pred, 'vision_fallback_check').eventually({
      timeoutMs: 2000,
      pollMs: 0,
      minConfidence: 0.7,
      maxSnapshotAttempts: 1,
      visionProvider,
    });

    expect(ok).toBe(true);

    const stepEnd = runtime.getAssertionsForStepEnd();
    expect(stepEnd.assertions.length).toBe(1);
    expect(stepEnd.assertions[0].passed).toBe(true);
    expect((stepEnd.assertions[0] as any).vision_fallback).toBe(true);
    expect((stepEnd.assertions[0] as any).details.reason_code).toBe('vision_fallback_pass');
  });
});
