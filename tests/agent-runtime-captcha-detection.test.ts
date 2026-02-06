import { AgentRuntime } from '../src/agent-runtime';
import { TraceSink } from '../src/tracing/sink';
import { Tracer } from '../src/tracing/tracer';
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

function makeRuntime(): AgentRuntime {
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
  runtime.setCaptchaOptions({ minConfidence: 0.1, policy: 'abort' });
  return runtime;
}

function makeSnapshot(captcha: CaptchaDiagnostics): Snapshot {
  return {
    status: 'success',
    url: 'https://example.com',
    elements: [],
    diagnostics: { captcha },
    timestamp: 't1',
  };
}

describe('AgentRuntime captcha detection', () => {
  it('ignores passive recaptcha badges', () => {
    const runtime = makeRuntime();
    const captcha: CaptchaDiagnostics = {
      detected: true,
      confidence: 0.95,
      provider_hint: 'recaptcha',
      evidence: {
        iframe_src_hits: ['https://www.google.com/recaptcha/api2/anchor?ar=1'],
        selector_hits: [],
        text_hits: [],
        url_hits: [],
      },
    };

    const detected = (runtime as any).isCaptchaDetected(makeSnapshot(captcha));
    expect(detected).toBe(false);
  });

  it('detects interactive captcha challenges', () => {
    const runtime = makeRuntime();
    const captcha: CaptchaDiagnostics = {
      detected: true,
      confidence: 0.95,
      provider_hint: 'recaptcha',
      evidence: {
        iframe_src_hits: [],
        selector_hits: [],
        text_hits: ["I'm not a robot"],
        url_hits: [],
      },
    };

    const detected = (runtime as any).isCaptchaDetected(makeSnapshot(captcha));
    expect(detected).toBe(true);
  });
});
