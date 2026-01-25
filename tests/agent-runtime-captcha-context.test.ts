import { AgentRuntime } from '../src/agent-runtime';
import { Tracer } from '../src/tracing/tracer';
import { TraceSink } from '../src/tracing/sink';
import { CaptchaDiagnostics, Snapshot } from '../src/types';
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

describe('AgentRuntime captcha context', () => {
  it('exposes evaluateJs hook to captcha handlers', async () => {
    const sink = new MockSink();
    const tracer = new Tracer('test-run', sink);
    const page = new MockPage('https://example.com') as any;
    page.evaluate = jest.fn().mockResolvedValue('ok');

    const captcha: CaptchaDiagnostics = {
      detected: true,
      confidence: 0.9,
      provider_hint: 'recaptcha',
      evidence: {
        iframe_src_hits: ['https://www.google.com/recaptcha/api2/anchor'],
        selector_hits: [],
        text_hits: [],
        url_hits: [],
      },
    };

    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [],
      diagnostics: { captcha },
      timestamp: 't1',
    };

    const browserLike = {
      snapshot: async () => snapshot,
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    runtime.beginStep('captcha_test');

    const ctx = (runtime as any).buildCaptchaContext(snapshot, 'gateway');
    expect(typeof ctx.evaluateJs).toBe('function');

    const result = await ctx.evaluateJs('1+1');
    expect(result).toBe('ok');
    expect(page.evaluate).toHaveBeenCalled();
  });
});
