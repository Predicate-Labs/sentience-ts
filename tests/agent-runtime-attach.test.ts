import { AgentRuntime } from '../src/agent-runtime';
import { SentienceBrowser } from '../src/browser';
import { TraceSink } from '../src/tracing/sink';
import { Tracer } from '../src/tracing/tracer';
import { MockPage } from './mocks/browser-mock';

class MockSink extends TraceSink {
  emit(): void {
    // no-op
  }
  async close(): Promise<void> {
    // no-op
  }
  getSinkType(): string {
    return 'MockSink';
  }
}

describe('AgentRuntime.fromPlaywrightPage()', () => {
  it('creates runtime using SentienceBrowser.fromPage()', () => {
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

    const spy = jest.spyOn(SentienceBrowser, 'fromPage').mockReturnValue(browserLike as any);

    const runtime = AgentRuntime.fromPlaywrightPage(page, tracer);

    expect(spy).toHaveBeenCalledWith(page, undefined, undefined);
    expect(typeof runtime.browser.snapshot).toBe('function');
    expect(runtime.page).toBe(page);

    spy.mockRestore();
  });

  it('passes apiKey and apiUrl to SentienceBrowser.fromPage()', () => {
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

    const spy = jest.spyOn(SentienceBrowser, 'fromPage').mockReturnValue(browserLike as any);

    const runtime = AgentRuntime.fromPlaywrightPage(page, tracer, {
      apiKey: 'sk_test',
      apiUrl: 'https://api.example.com',
    });

    expect(spy).toHaveBeenCalledWith(page, 'sk_test', 'https://api.example.com');
    expect(typeof runtime.browser.snapshot).toBe('function');

    spy.mockRestore();
  });
});
