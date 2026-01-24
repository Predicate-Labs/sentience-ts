import { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from '../utils/zod';

export type ToolHandler<TInput, TOutput, TContext> = (
  ctx: TContext | null,
  params: TInput
) => Promise<TOutput> | TOutput;

export interface ToolSpec<TInput = unknown, TOutput = unknown, TContext = unknown> {
  name: string;
  description?: string;
  input: ZodTypeAny;
  output: ZodTypeAny;
  handler?: ToolHandler<TInput, TOutput, TContext>;
  parameters?: Record<string, any>;
}

export function defineTool<TInput, TOutput, TContext>(
  spec: ToolSpec<TInput, TOutput, TContext>
): ToolSpec<TInput, TOutput, TContext> {
  return spec;
}

export class ToolRegistry {
  private tools = new Map<string, ToolSpec<any, any, any>>();

  register<TInput, TOutput, TContext>(spec: ToolSpec<TInput, TOutput, TContext>): ToolRegistry {
    if (this.tools.has(spec.name)) {
      throw new Error(`tool already registered: ${spec.name}`);
    }
    this.tools.set(spec.name, spec);
    return this;
  }

  get(name: string): ToolSpec | undefined {
    return this.tools.get(name);
  }

  list(): ToolSpec[] {
    return Array.from(this.tools.values());
  }

  llmTools(): Array<{ name: string; description: string; parameters: Record<string, any> }> {
    return this.list().map(spec => ({
      name: spec.name,
      description: spec.description ?? '',
      parameters: spec.parameters ?? zodToJsonSchema(spec.input),
    }));
  }

  validateInput<TInput>(name: string, payload: unknown): TInput {
    const spec = this.tools.get(name);
    if (!spec) {
      throw new Error(`tool not found: ${name}`);
    }
    const parsed = spec.input.safeParse(payload);
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }
    return parsed.data as TInput;
  }

  validateOutput<TOutput>(name: string, payload: unknown): TOutput {
    const spec = this.tools.get(name);
    if (!spec) {
      throw new Error(`tool not found: ${name}`);
    }
    const parsed = spec.output.safeParse(payload);
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }
    return parsed.data as TOutput;
  }

  validateCall<TInput>(name: string, payload: unknown): { input: TInput; spec: ToolSpec } {
    const spec = this.tools.get(name);
    if (!spec) {
      throw new Error(`tool not found: ${name}`);
    }
    return { input: this.validateInput(name, payload), spec };
  }

  async execute<TOutput>(
    name: string,
    payload: unknown,
    ctx: {
      runtime?: { tracer?: { emit: (...args: any[]) => void }; stepId?: string; step_id?: string };
    } | null = null
  ): Promise<TOutput> {
    const start = Date.now();
    const { input, spec } = this.validateCall(name, payload);
    if (!spec.handler) {
      throw new Error(`tool has no handler: ${name}`);
    }

    const runtime = ctx?.runtime;
    const tracer = runtime?.tracer;
    const stepId = runtime?.stepId ?? runtime?.step_id ?? null;

    try {
      const result = await Promise.resolve(spec.handler(ctx, input));
      const validated = this.validateOutput<TOutput>(name, result);
      if (tracer) {
        tracer.emit(
          'tool_call',
          {
            tool_name: name,
            inputs: input,
            outputs: validated,
            success: true,
            duration_ms: Date.now() - start,
          },
          stepId || undefined
        );
      }
      return validated;
    } catch (err: any) {
      if (tracer) {
        tracer.emit(
          'tool_call',
          {
            tool_name: name,
            inputs: input,
            success: false,
            error: String(err?.message ?? err),
            duration_ms: Date.now() - start,
          },
          stepId || undefined
        );
      }
      throw err;
    }
  }
}
