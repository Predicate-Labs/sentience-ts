import { PredicateBrowserAgent } from '../src/agents/browser-agent';
import { AgentRuntime } from '../src/agent-runtime';
import { Tracer } from '../src/tracing/tracer';
import { TraceSink } from '../src/tracing/sink';
import { MockPage } from './mocks/browser-mock';
import { LLMProvider } from '../src/llm-provider';
import type { LLMResponse } from '../src/llm-provider';
import type { Snapshot, Element } from '../src/types';

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

class ProviderStub extends LLMProvider {
  private responses: string[];
  public calls: Array<{ system: string; user: string; options?: any }> = [];

  constructor(responses: string[] = []) {
    super();
    this.responses = [...responses];
  }

  get modelName(): string {
    return 'stub';
  }

  supportsJsonMode(): boolean {
    return true;
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
    options: Record<string, any> = {}
  ): Promise<LLMResponse> {
    this.calls.push({ system: systemPrompt, user: userPrompt, options });
    const content = this.responses.length ? (this.responses.shift() as string) : 'FINISH()';
    return {
      content,
      modelName: this.modelName,
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
    };
  }
}

function makeClickableElement(id: number): Element {
  return {
    id,
    role: 'button',
    text: 'OK',
    importance: 100,
    bbox: { x: 10, y: 20, width: 100, height: 40 },
    visual_cues: { is_primary: true, is_clickable: true, background_color_name: null },
    in_viewport: true,
    is_occluded: false,
    z_index: 1,
  };
}

describe('PredicateBrowserAgent', () => {
  it('allows compactPromptBuilder override', async () => {
    const sink = new MockSink();
    const tracer = new Tracer('run', sink);
    const page = new MockPage('https://example.com/start') as any;

    const snapshots: Snapshot[] = [
      {
        status: 'success',
        url: 'https://example.com/start',
        elements: [makeClickableElement(1)],
        timestamp: 't1',
      },
    ];

    const browserLike = {
      snapshot: async () => snapshots.shift() as Snapshot,
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    const executor = new ProviderStub(['CLICK(1)']);

    const agent = new PredicateBrowserAgent({
      runtime,
      executor,
      config: {
        compactPromptBuilder: () => ({ systemPrompt: 'SYSTEM_CUSTOM', userPrompt: 'USER_CUSTOM' }),
        captcha: { policy: 'abort' },
      },
    });

    const ok = await agent.step({
      taskGoal: 'test',
      step: { goal: 'Click OK', maxSnapshotAttempts: 1 },
    });

    expect(ok.ok).toBe(true);
    expect(executor.calls.length).toBe(1);
    expect(executor.calls[0].system).toContain('SYSTEM_CUSTOM');
    expect(executor.calls[0].user).toBe('USER_CUSTOM');
  });

  it('tracks token usage when opt-in enabled', async () => {
    const sink = new MockSink();
    const tracer = new Tracer('run', sink);
    const page = new MockPage('https://example.com/start') as any;

    const snapshots: Snapshot[] = [
      {
        status: 'success',
        url: 'https://example.com/start',
        elements: [makeClickableElement(1)],
        timestamp: 't1',
      },
    ];

    const browserLike = {
      snapshot: async () => snapshots.shift() as Snapshot,
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    const executor = new ProviderStub(['FINISH()']);

    const agent = new PredicateBrowserAgent({
      runtime,
      executor,
      config: { tokenUsageEnabled: true, captcha: { policy: 'abort' } },
    });

    const out = await agent.step({
      taskGoal: 'test',
      step: { goal: 'No-op', maxSnapshotAttempts: 1 },
    });
    expect(out.ok).toBe(true);

    const usage = agent.getTokenUsage();
    expect(usage.enabled).toBe(true);
    expect(usage.total.totalTokens).toBeGreaterThanOrEqual(18);
    expect(usage.byRole.executor.calls).toBeGreaterThanOrEqual(1);

    agent.resetTokenUsage();
    const usage2 = agent.getTokenUsage();
    expect(usage2.total.totalTokens).toBe(0);
  });
});
