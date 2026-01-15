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
});
