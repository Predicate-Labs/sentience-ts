import { AgentRuntime } from '../src/agent-runtime';
import { TraceSink } from '../src/tracing/sink';
import { Tracer } from '../src/tracing/tracer';
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

describe('AgentRuntime.scrollBy() deterministic verification', () => {
  it('passes when scrollTop delta >= minDeltaPx', async () => {
    const sink = new MockSink();
    const tracer = new Tracer('test-run', sink);
    const page = new MockPage('https://example.com') as any;
    const browserLike = {
      snapshot: async () => ({
        status: 'success',
        url: 'https://example.com',
        elements: [],
        timestamp: 't1',
      }),
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    runtime.beginStep('scroll');

    const ok = await runtime.scrollBy(200, {
      verify: true,
      minDeltaPx: 50,
      timeoutMs: 1000,
      pollMs: 1,
    });
    expect(ok).toBe(true);

    const hasScrollVerification = sink.events.some(
      e => e.type === 'verification' && e.data?.kind === 'scroll' && e.data?.passed === true
    );
    expect(hasScrollVerification).toBe(true);
  });

  it('fails when scrollTop delta stays below minDeltaPx', async () => {
    const sink = new MockSink();
    const tracer = new Tracer('test-run', sink);
    const page = new MockPage('https://example.com') as any;

    // Override wheel to be a no-op scroll (simulates blocked scroll).
    (page.mouse as any).wheel = async (_dx: number, _dy: number) => {
      // no-op
    };

    const browserLike = {
      snapshot: async () => ({
        status: 'success',
        url: 'https://example.com',
        elements: [],
        timestamp: 't1',
      }),
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    runtime.beginStep('scroll');

    const ok = await runtime.scrollBy(200, {
      verify: true,
      minDeltaPx: 50,
      timeoutMs: 30,
      pollMs: 1,
      jsFallback: false,
    });
    expect(ok).toBe(false);

    const hasFailedScrollVerification = sink.events.some(
      e => e.type === 'verification' && e.data?.kind === 'scroll' && e.data?.passed === false
    );
    expect(hasFailedScrollVerification).toBe(true);
  });
});
