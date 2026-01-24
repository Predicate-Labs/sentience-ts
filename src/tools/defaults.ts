import { z } from 'zod';
import type { AgentRuntime } from '../agent-runtime';
import type { ActionResult, Snapshot, EvaluateJsResult } from '../types';
import { ToolContext } from './context';
import { defineTool, ToolRegistry } from './registry';

const snapshotSchema = z
  .object({
    status: z.enum(['success', 'error']),
    url: z.string(),
    elements: z.array(z.any()),
  })
  .passthrough();

const actionResultSchema = z
  .object({
    success: z.boolean(),
    duration_ms: z.number(),
    outcome: z.enum(['navigated', 'dom_updated', 'no_change', 'error']).optional(),
    url_changed: z.boolean().optional(),
    snapshot_after: z.any().optional(),
    cursor: z.record(z.any()).optional(),
    error: z
      .object({
        code: z.string(),
        reason: z.string(),
        recovery_hint: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const evaluateJsOutput = z
  .object({
    ok: z.boolean(),
    value: z.any().optional(),
    text: z.string().nullable().optional(),
    truncated: z.boolean().optional(),
    error: z.string().nullable().optional(),
  })
  .passthrough();

const snapshotInput = z.object({
  limit: z.number().int().min(1).max(500).default(50),
});

const clickInput = z.object({
  element_id: z.number().int().min(1),
});

const typeInput = z.object({
  element_id: z.number().int().min(1),
  text: z.string().min(1),
  clear_first: z.boolean().default(false),
});

const scrollInput = z.object({
  delta_y: z.number(),
  x: z.number().optional(),
  y: z.number().optional(),
});

const scrollToElementInput = z.object({
  element_id: z.number().int().min(1),
  behavior: z.string().default('instant'),
  block: z.string().default('center'),
});

const clickRectInput = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
});

const pressInput = z.object({
  key: z.string().min(1),
});

const evaluateJsInput = z.object({
  code: z.string().min(1).max(8000),
  max_output_chars: z.number().int().min(1).max(20000).default(4000),
  truncate: z.boolean().default(true),
});

function getRuntime(ctx: ToolContext | null, runtime?: ToolContext | AgentRuntime): AgentRuntime {
  if (ctx) return ctx.runtime;
  if (runtime instanceof ToolContext) return runtime.runtime;
  if (runtime) return runtime;
  throw new Error('ToolContext with runtime is required');
}

function buildOutcome(
  urlBefore: string,
  urlAfter: string,
  success: boolean
): Pick<ActionResult, 'outcome' | 'url_changed'> {
  const urlChanged = urlBefore !== urlAfter;
  const outcome = urlChanged ? 'navigated' : success ? 'dom_updated' : 'error';
  return { outcome, url_changed: urlChanged };
}

function bboxCenter(bbox: {
  x: number;
  y: number;
  width: number;
  height: number;
}): [number, number] {
  return [bbox.x + bbox.width / 2, bbox.y + bbox.height / 2];
}

export function registerDefaultTools(
  registry: ToolRegistry,
  runtime?: ToolContext | AgentRuntime
): ToolRegistry {
  registry.register(
    defineTool<{ limit: number }, Snapshot, ToolContext | null>({
      name: 'snapshot_state',
      description: 'Capture a snapshot of the current page state.',
      input: snapshotInput,
      output: snapshotSchema,
      handler: async (ctx, params): Promise<Snapshot> => {
        const runtimeRef = getRuntime(ctx, runtime);
        const snap = await runtimeRef.snapshot({
          limit: params.limit,
          goal: 'tool_snapshot_state',
        });
        if (!snap) {
          throw new Error('snapshot() returned null');
        }
        return snap;
      },
    })
  );

  registry.register(
    defineTool<{ element_id: number }, ActionResult, ToolContext | null>({
      name: 'click',
      description: 'Click an element by id from the latest snapshot.',
      input: clickInput,
      output: actionResultSchema,
      handler: async (ctx, params): Promise<ActionResult> => {
        const runtimeRef = getRuntime(ctx, runtime);
        const page = runtimeRef.page;
        const snap = runtimeRef.lastSnapshot ?? (await runtimeRef.snapshot({ goal: 'tool_click' }));
        if (!snap) throw new Error('snapshot() returned null');
        const el = snap.elements.find(e => e.id === params.element_id);
        if (!el) throw new Error(`element_id not found: ${params.element_id}`);
        const [x, y] = bboxCenter(el.bbox);
        const start = Date.now();
        const urlBefore = page.url();
        await page.mouse.click(x, y);
        try {
          await page.waitForTimeout(250);
        } catch {
          /* best-effort */
        }
        const urlAfter = page.url();
        return {
          success: true,
          duration_ms: Date.now() - start,
          ...buildOutcome(urlBefore, urlAfter, true),
        };
      },
    })
  );

  registry.register(
    defineTool<
      { element_id: number; text: string; clear_first: boolean },
      ActionResult,
      ToolContext | null
    >({
      name: 'type',
      description: 'Type text into an element by id from the latest snapshot.',
      input: typeInput,
      output: actionResultSchema,
      handler: async (ctx, params): Promise<ActionResult> => {
        const runtimeRef = getRuntime(ctx, runtime);
        const page = runtimeRef.page;
        const snap = runtimeRef.lastSnapshot ?? (await runtimeRef.snapshot({ goal: 'tool_type' }));
        if (!snap) throw new Error('snapshot() returned null');
        const el = snap.elements.find(e => e.id === params.element_id);
        if (!el) throw new Error(`element_id not found: ${params.element_id}`);
        const [x, y] = bboxCenter(el.bbox);
        const start = Date.now();
        const urlBefore = page.url();
        await page.mouse.click(x, y);
        if (params.clear_first) {
          const selectAll = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
          await page.keyboard.press(selectAll);
          await page.keyboard.press('Backspace');
        }
        await page.keyboard.type(params.text);
        const urlAfter = page.url();
        return {
          success: true,
          duration_ms: Date.now() - start,
          ...buildOutcome(urlBefore, urlAfter, true),
        };
      },
    })
  );

  registry.register(
    defineTool<{ delta_y: number; x?: number; y?: number }, ActionResult, ToolContext | null>({
      name: 'scroll',
      description: 'Scroll the page by a delta amount.',
      input: scrollInput,
      output: actionResultSchema,
      handler: async (ctx, params): Promise<ActionResult> => {
        const runtimeRef = getRuntime(ctx, runtime);
        const page = runtimeRef.page;
        const start = Date.now();
        const urlBefore = page.url();
        try {
          if (page.mouse?.wheel) {
            await page.mouse.wheel(params.x ?? 0, params.delta_y);
          } else {
            await page.evaluate(
              ({ dx, dy }) => {
                window.scrollBy(dx || 0, dy || 0);
              },
              { dx: params.x ?? 0, dy: params.delta_y }
            );
          }
        } catch {
          // best-effort
        }
        const urlAfter = page.url();
        return {
          success: true,
          duration_ms: Date.now() - start,
          ...buildOutcome(urlBefore, urlAfter, true),
        };
      },
    })
  );

  registry.register(
    defineTool<
      { element_id: number; behavior: string; block: string },
      ActionResult,
      ToolContext | null
    >({
      name: 'scroll_to_element',
      description: 'Scroll the page to bring an element into view.',
      input: scrollToElementInput,
      output: actionResultSchema,
      handler: async (ctx, params): Promise<ActionResult> => {
        const runtimeRef = getRuntime(ctx, runtime);
        const page = runtimeRef.page;
        const start = Date.now();
        const urlBefore = page.url();
        await page.evaluate(
          ({ id, behavior, block }) => {
            const el = (window as any).sentience_registry?.[id];
            if (el && el.scrollIntoView) {
              el.scrollIntoView({ behavior, block, inline: 'nearest' });
            }
          },
          { id: params.element_id, behavior: params.behavior, block: params.block }
        );
        const urlAfter = page.url();
        return {
          success: true,
          duration_ms: Date.now() - start,
          ...buildOutcome(urlBefore, urlAfter, true),
        };
      },
    })
  );

  registry.register(
    defineTool<
      { x: number; y: number; width: number; height: number },
      ActionResult,
      ToolContext | null
    >({
      name: 'click_rect',
      description: 'Click at the center of a rectangle.',
      input: clickRectInput,
      output: actionResultSchema,
      handler: async (ctx, params): Promise<ActionResult> => {
        const runtimeRef = getRuntime(ctx, runtime);
        const page = runtimeRef.page;
        const start = Date.now();
        const urlBefore = page.url();
        const x = params.x + params.width / 2;
        const y = params.y + params.height / 2;
        await page.mouse.click(x, y);
        const urlAfter = page.url();
        return {
          success: true,
          duration_ms: Date.now() - start,
          ...buildOutcome(urlBefore, urlAfter, true),
        };
      },
    })
  );

  registry.register(
    defineTool<{ key: string }, ActionResult, ToolContext | null>({
      name: 'press',
      description: 'Press a key (e.g., Enter).',
      input: pressInput,
      output: actionResultSchema,
      handler: async (ctx, params): Promise<ActionResult> => {
        const runtimeRef = getRuntime(ctx, runtime);
        const page = runtimeRef.page;
        const start = Date.now();
        const urlBefore = page.url();
        await page.keyboard.press(params.key);
        const urlAfter = page.url();
        return {
          success: true,
          duration_ms: Date.now() - start,
          ...buildOutcome(urlBefore, urlAfter, true),
        };
      },
    })
  );

  registry.register(
    defineTool<
      { code: string; max_output_chars: number; truncate: boolean },
      EvaluateJsResult,
      ToolContext | null
    >({
      name: 'evaluate_js',
      description: 'Execute JavaScript in the browser context.',
      input: evaluateJsInput,
      output: evaluateJsOutput,
      handler: async (ctx, params): Promise<EvaluateJsResult> => {
        const runtimeRef = getRuntime(ctx, runtime);
        return await runtimeRef.evaluateJs({
          code: params.code,
          max_output_chars: params.max_output_chars,
          truncate: params.truncate,
        });
      },
    })
  );

  return registry;
}
