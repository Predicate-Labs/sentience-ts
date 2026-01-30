import { AgentRuntime } from '../src/agent-runtime';
import { SentienceDebugger } from '../src/debugger';
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

describe('SentienceDebugger', () => {
  it('attaches via AgentRuntime.fromPlaywrightPage()', () => {
    const sink = new MockSink();
    const tracer = new Tracer('test-run', sink);
    const page = new MockPage('https://example.com') as any;
    const runtime = {} as AgentRuntime;

    const spy = jest.spyOn(AgentRuntime, 'fromPlaywrightPage').mockReturnValue(runtime);

    const dbg = SentienceDebugger.attach(page, tracer, { apiKey: 'sk', apiUrl: 'https://api' });

    expect(spy).toHaveBeenCalledWith(page, tracer, { apiKey: 'sk', apiUrl: 'https://api' });
    expect(dbg.runtime).toBe(runtime);

    spy.mockRestore();
  });

  it('step() calls beginStep and emitStepEnd', async () => {
    const runtime = {
      beginStep: jest.fn().mockReturnValue('step-1'),
      emitStepEnd: jest.fn().mockResolvedValue({}),
    } as unknown as AgentRuntime;

    const dbg = new SentienceDebugger(runtime);

    await dbg.step('verify-cart', async () => {
      // no-op
    });

    expect(runtime.beginStep).toHaveBeenCalledWith('verify-cart', undefined);
    expect(runtime.emitStepEnd).toHaveBeenCalled();
  });

  it('check() auto-opens a step if missing', () => {
    const runtime = {
      beginStep: jest.fn().mockReturnValue('step-1'),
      check: jest.fn().mockReturnValue('handle'),
    } as unknown as AgentRuntime;

    const dbg = new SentienceDebugger(runtime);

    const handle = dbg.check(
      (_ctx: any) => ({ passed: true, reason: '', details: {} }),
      'has_cart'
    );

    expect(runtime.beginStep).toHaveBeenCalledWith('verify:has_cart', undefined);
    expect(runtime.check).toHaveBeenCalled();
    expect(handle).toBe('handle');
  });
});
