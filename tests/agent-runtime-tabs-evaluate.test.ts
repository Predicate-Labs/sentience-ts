import { AgentRuntime } from '../src/agent-runtime';
import { TraceSink } from '../src/tracing/sink';
import { Tracer } from '../src/tracing/tracer';

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

function makeTestRuntime(page: any) {
  const sink = new MockSink();
  const tracer = new Tracer('test-run', sink);
  const browserLike = {
    snapshot: async () => ({
      status: 'success',
      url: page.url(),
      elements: [],
      timestamp: 't1',
    }),
  };
  return new AgentRuntime(browserLike as any, page as any, tracer);
}

describe('AgentRuntime tabs and evaluateJs', () => {
  it('evaluateJs returns normalized text output', async () => {
    const page = {
      evaluate: jest.fn().mockResolvedValue({ hello: 'world' }),
      url: jest.fn().mockReturnValue('https://example.com'),
      on: jest.fn(),
    };
    const runtime = makeTestRuntime(page);
    const result = await runtime.evaluateJs({ code: '({hello:"world"})', max_output_chars: 10 });
    expect(result.ok).toBe(true);
    expect(result.text).toBe('{"hello":"world"}'.slice(0, 10) + '...');
    expect(result.truncated).toBe(true);
  });

  it('supports list/open/switch/close tab flow', async () => {
    const pages: any[] = [];
    const context: any = {
      pages: () => pages,
      newPage: jest.fn().mockImplementation(async () => {
        const page = makePage('https://newtab', pages, context);
        pages.push(page);
        return page;
      }),
    };

    const page1 = makePage('https://example.com', pages, context);
    pages.push(page1);

    const runtime = makeTestRuntime(page1);

    const initial = await runtime.listTabs();
    expect(initial.ok).toBe(true);
    expect(initial.tabs.length).toBe(1);
    const initialTabId = initial.tabs[0].tab_id;

    const opened = await runtime.openTab('https://newtab');
    expect(opened.ok).toBe(true);
    expect(opened.tab?.is_active).toBe(true);

    const switched = await runtime.switchTab(initialTabId);
    expect(switched.ok).toBe(true);
    expect(switched.tab?.tab_id).toBe(initialTabId);

    const closed = await runtime.closeTab(initialTabId);
    expect(closed.ok).toBe(true);
  });
});

function makePage(url: string, pages: any[], context: any) {
  const page: any = {
    url: jest.fn().mockReturnValue(url),
    title: jest.fn().mockResolvedValue(`Title ${url}`),
    goto: jest.fn().mockResolvedValue(undefined),
    bringToFront: jest.fn().mockResolvedValue(undefined),
    isClosed: jest.fn().mockReturnValue(false),
    close: jest.fn().mockImplementation(async () => {
      page.isClosed.mockReturnValue(true);
      const idx = pages.indexOf(page);
      if (idx >= 0) pages.splice(idx, 1);
    }),
    context: () => context,
    on: jest.fn(),
  };
  return page;
}
