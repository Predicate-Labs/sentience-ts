import { AgentRuntime } from '../src/agent-runtime';
import { TraceSink } from '../src/tracing/sink';
import { Tracer } from '../src/tracing/tracer';
import { isDisabled, isEnabled, valueEquals } from '../src/verification';
import { BBox, Element, Snapshot, VisualCues } from '../src/types';
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

function makeElement(
  id: number,
  role: string,
  text: string | null,
  extras: Partial<Element> = {}
): Element {
  const cues: VisualCues = {
    is_primary: false,
    background_color_name: null,
    is_clickable: true,
  };
  return {
    id,
    role,
    text: text ?? undefined,
    importance: 10,
    bbox: { x: 0, y: 0, width: 100, height: 40 } as BBox,
    visual_cues: cues,
    ...extras,
  } as Element;
}

describe('AgentRuntime.beginStep() stepId format', () => {
  it('generates stepId in step-N format', () => {
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

    const stepId1 = runtime.beginStep('Step 1');
    expect(stepId1).toBe('step-1');
    expect(runtime.stepIndex).toBe(1);

    const stepId2 = runtime.beginStep('Step 2');
    expect(stepId2).toBe('step-2');
    expect(runtime.stepIndex).toBe(2);
  });

  it('generates stepId matching explicit stepIndex', () => {
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

    const stepId = runtime.beginStep('Custom step', 10);
    expect(stepId).toBe('step-10');
    expect(runtime.stepIndex).toBe(10);
  });
});

describe('AgentRuntime.assert() with state predicates', () => {
  it('uses snapshot context for enabled/disabled/value assertions', () => {
    const sink = new MockSink();
    const tracer = new Tracer('test-run', sink);
    const page = new MockPage('https://example.com') as any;

    const elements: Element[] = [
      makeElement(1, 'button', 'Submit', { disabled: false }),
      makeElement(2, 'textbox', null, { value: 'hello', input_type: 'text' }),
      makeElement(3, 'button', 'Disabled', { disabled: true }),
    ];

    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements,
      timestamp: 't1',
    };

    const browserLike = {
      snapshot: async () => snapshot,
    };

    const runtime = new AgentRuntime(browserLike as any, page as any, tracer);
    runtime.beginStep('Test');
    runtime.lastSnapshot = snapshot;

    expect(runtime.assert(isEnabled("text~'Submit'"), 'enabled')).toBe(true);
    expect(runtime.assert(isDisabled("text~'Disabled'"), 'disabled')).toBe(true);
    expect(runtime.assert(valueEquals('role=textbox', 'hello'), 'value')).toBe(true);

    const stepEnd = runtime.getAssertionsForStepEnd();
    expect(stepEnd.assertions.length).toBe(3);
  });
});
