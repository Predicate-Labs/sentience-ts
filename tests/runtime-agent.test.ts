import { RuntimeAgent, RuntimeStep, StepVerification } from '../src/runtime-agent';
import { AgentRuntime } from '../src/agent-runtime';
import { Tracer } from '../src/tracing/tracer';
import { TraceSink } from '../src/tracing/sink';
import { MockPage } from './mocks/browser-mock';
import { LLMProvider } from '../src/llm-provider';
import type { LLMResponse } from '../src/llm-provider';
import type { Element, Snapshot } from '../src/types';
import type { Predicate } from '../src/verification';

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
    return { content, modelName: this.modelName };
  }
}

class VisionProviderStub extends ProviderStub {
  supportsVision(): boolean {
    return true;
  }

  public visionCalls: Array<{ system: string; user: string; image: string; options?: any }> = [];

  async generateWithImage(
    systemPrompt: string,
    userPrompt: string,
    imageBase64: string,
    options: Record<string, any> = {}
  ): Promise<LLMResponse> {
    this.visionCalls.push({ system: systemPrompt, user: userPrompt, image: imageBase64, options });
    const content = (this as any).responses?.length ? (this as any).responses.shift() : 'FINISH()';
    return { content, modelName: this.modelName };
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

describe('RuntimeAgent (runtime-backed agent)', () => {
  it('structured executor succeeds without vision', async () => {
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
      {
        status: 'success',
        url: 'https://example.com/done',
        elements: [makeClickableElement(1)],
        timestamp: 't2',
      },
    ];

    const browserLike = {
      snapshot: async () => snapshots.shift() as Snapshot,
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    const executor = new ProviderStub(['CLICK(1)']);
    const agent = new RuntimeAgent({ runtime, executor });

    const pred: Predicate = ctx => ({
      passed: (ctx.url || '').endsWith('/done'),
      reason: '',
      details: {},
    });

    const step: RuntimeStep = {
      goal: 'Click OK',
      maxSnapshotAttempts: 1,
      verifications: [
        {
          predicate: pred,
          label: 'url_done',
          required: true,
          eventually: true,
          timeoutMs: 2000,
          pollMs: 0,
          maxSnapshotAttempts: 1,
        } satisfies StepVerification,
      ],
    };

    const ok = await agent.runStep({ taskGoal: 'test', step });
    expect(ok).toBe(true);
    expect(executor.calls.length).toBe(1);
    expect(page.mouseClickCalls.length).toBeGreaterThan(0);
  });

  it('vision executor fallback is used after verification fail', async () => {
    const sink = new MockSink();
    const tracer = new Tracer('run', sink);
    const page = new MockPage('https://example.com/start') as any;

    const snapshots: Snapshot[] = [
      // ramp snapshot
      {
        status: 'success',
        url: 'https://example.com/start',
        elements: [makeClickableElement(1)],
        timestamp: 't1',
      },
      // verification attempt #1: fail
      {
        status: 'success',
        url: 'https://example.com/still',
        elements: [makeClickableElement(1)],
        timestamp: 't2',
      },
      // verification after vision retry: pass
      {
        status: 'success',
        url: 'https://example.com/done',
        elements: [makeClickableElement(1)],
        timestamp: 't3',
      },
    ];

    const browserLike = {
      snapshot: async () => snapshots.shift() as Snapshot,
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    const executor = new ProviderStub(['CLICK(1)']);
    const vision = new VisionProviderStub(['CLICK(1)']);
    const agent = new RuntimeAgent({ runtime, executor, visionExecutor: vision });

    const pred: Predicate = ctx => ({
      passed: (ctx.url || '').endsWith('/done'),
      reason: (ctx.url || '').endsWith('/done') ? '' : 'not done',
      details: {},
    });

    const step: RuntimeStep = {
      goal: 'Try click; fallback if needed',
      maxSnapshotAttempts: 1,
      visionExecutorEnabled: true,
      maxVisionExecutorAttempts: 1,
      verifications: [
        {
          predicate: pred,
          label: 'url_done',
          required: true,
          eventually: true,
          // Force structured attempt to FAIL fast so fallback triggers.
          timeoutMs: 0,
          pollMs: 0,
          maxSnapshotAttempts: 1,
        },
      ],
    };

    const ok = await agent.runStep({ taskGoal: 'test', step });
    expect(ok).toBe(true);
    expect(executor.calls.length).toBe(1);
    expect(vision.visionCalls.length).toBe(1);
  });

  it('snapshot limit ramp increases limit on low confidence', async () => {
    const sink = new MockSink();
    const tracer = new Tracer('run', sink);
    const page = new MockPage('https://example.com/start') as any;

    const seenLimits: number[] = [];
    const snapshots: Snapshot[] = [
      {
        status: 'success',
        url: 'https://example.com/start',
        elements: [makeClickableElement(1)],
        timestamp: 't1',
        diagnostics: { confidence: 0.1, reasons: [], metrics: { quiet_ms: 10 } } as any,
      },
      {
        status: 'success',
        url: 'https://example.com/start',
        elements: [makeClickableElement(1)],
        timestamp: 't2',
        diagnostics: { confidence: 0.9, reasons: [], metrics: { quiet_ms: 10 } } as any,
      },
      {
        status: 'success',
        url: 'https://example.com/done',
        elements: [makeClickableElement(1)],
        timestamp: 't3',
      },
    ];

    const browserLike = {
      snapshot: async (_page: any, options?: any) => {
        if (options?.limit !== undefined) {
          seenLimits.push(Number(options.limit));
        }
        return snapshots.shift() as Snapshot;
      },
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    const executor = new ProviderStub(['CLICK(1)']);
    const agent = new RuntimeAgent({ runtime, executor });

    const pred: Predicate = ctx => ({
      passed: (ctx.url || '').endsWith('/done'),
      reason: '',
      details: {},
    });

    const step: RuntimeStep = {
      goal: 'ramp',
      minConfidence: 0.7,
      snapshotLimitBase: 60,
      snapshotLimitStep: 40,
      snapshotLimitMax: 220,
      maxSnapshotAttempts: 2,
      verifications: [
        {
          predicate: pred,
          label: 'url_done',
          required: true,
          eventually: true,
          timeoutMs: 2000,
          pollMs: 0,
          maxSnapshotAttempts: 1,
        },
      ],
    };

    const ok = await agent.runStep({ taskGoal: 'test', step });
    expect(ok).toBe(true);
    expect(seenLimits.slice(0, 2)).toEqual([60, 100]);
  });

  it('short-circuits to vision on canvas + low actionables', async () => {
    const sink = new MockSink();
    const tracer = new Tracer('run', sink);
    const page = new MockPage('https://example.com/start') as any;

    // Make page.evaluate("document.querySelectorAll('canvas').length") return 1
    const originalEvaluate = page.evaluate.bind(page);
    page.evaluate = async (script: any, ...args: any[]) => {
      if (typeof script === 'string' && script.includes("querySelectorAll('canvas')")) {
        return 1 as any;
      }
      return originalEvaluate(script, ...args);
    };

    const snapshots: Snapshot[] = [
      { status: 'success', url: 'https://example.com/start', elements: [], timestamp: 't1' },
      { status: 'success', url: 'https://example.com/done', elements: [], timestamp: 't2' },
    ];

    const browserLike = {
      snapshot: async () => snapshots.shift() as Snapshot,
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    const executor = new ProviderStub(['CLICK(999)']);
    const vision = new VisionProviderStub(['CLICK_XY(100, 200)']);
    const agent = new RuntimeAgent({
      runtime,
      executor,
      visionExecutor: vision,
      shortCircuitCanvas: true,
    });

    const pred: Predicate = ctx => ({
      passed: (ctx.url || '').endsWith('/done'),
      reason: '',
      details: {},
    });

    const step: RuntimeStep = {
      goal: 'canvas step',
      minActionables: 1,
      maxSnapshotAttempts: 1,
      visionExecutorEnabled: true,
      maxVisionExecutorAttempts: 1,
      verifications: [
        {
          predicate: pred,
          label: 'url_done',
          required: true,
          eventually: true,
          timeoutMs: 2000,
          pollMs: 0,
          maxSnapshotAttempts: 1,
        },
      ],
    };

    const ok = await agent.runStep({ taskGoal: 'test', step });
    expect(ok).toBe(true);
    expect(executor.calls.length).toBe(0);
    expect(vision.visionCalls.length).toBe(1);
    expect(page.mouseClickCalls).toEqual([{ x: 100, y: 200 }]);
  });
});
