/**
 * Tracer Class
 *
 * High-level API for emitting trace events with automatic sequencing and timestamps
 */

import { TraceSink } from './sink';
import { TraceEvent, TraceEventData } from './types';

/**
 * Tracer provides a high-level API for recording agent execution traces
 */
export class Tracer {
  private runId: string;
  private sink: TraceSink;
  private seq: number;

  /**
   * Create a new Tracer
   * @param runId - Unique run identifier (UUID)
   * @param sink - TraceSink implementation (e.g., JsonlTraceSink)
   */
  constructor(runId: string, sink: TraceSink) {
    this.runId = runId;
    this.sink = sink;
    this.seq = 0;
  }

  /**
   * Emit a trace event
   * @param eventType - Type of event (e.g., 'run_start', 'snapshot')
   * @param data - Event-specific payload
   * @param stepId - Optional step UUID
   */
  emit(
    eventType: string,
    data: TraceEventData,
    stepId?: string
  ): void {
    this.seq += 1;

    // Generate timestamps
    const tsMs = Date.now();
    const ts = new Date(tsMs).toISOString();

    const event: TraceEvent = {
      v: 1,
      type: eventType,
      ts,
      ts_ms: tsMs,
      run_id: this.runId,
      seq: this.seq,
      data,
    };

    if (stepId) {
      event.step_id = stepId;
    }

    this.sink.emit(event);
  }

  /**
   * Emit run_start event
   * @param agent - Agent type (e.g., 'SentienceAgent')
   * @param llmModel - Optional LLM model name
   * @param config - Optional configuration
   */
  emitRunStart(
    agent: string,
    llmModel?: string,
    config?: Record<string, any>
  ): void {
    const data: TraceEventData = { agent };
    if (llmModel) data.llm_model = llmModel;
    if (config) data.config = config;

    this.emit('run_start', data);
  }

  /**
   * Emit step_start event
   * @param stepId - Step UUID
   * @param stepIndex - Step number (1-indexed)
   * @param goal - Goal description
   * @param attempt - Retry attempt number (0 = first try)
   * @param preUrl - Optional URL before step execution
   */
  emitStepStart(
    stepId: string,
    stepIndex: number,
    goal: string,
    attempt: number = 0,
    preUrl?: string
  ): void {
    const data: TraceEventData = {
      step_id: stepId,
      step_index: stepIndex,
      goal,
      attempt,
    };

    if (preUrl) {
      data.url = preUrl;
    }

    this.emit('step_start', data, stepId);
  }

  /**
   * Emit run_end event
   * @param steps - Total number of steps executed
   */
  emitRunEnd(steps: number): void {
    this.emit('run_end', { steps });
  }

  /**
   * Emit error event
   * @param stepId - Step UUID where error occurred
   * @param error - Error message
   * @param attempt - Retry attempt number
   */
  emitError(stepId: string, error: string, attempt: number = 0): void {
    this.emit('error', { step_id: stepId, error, attempt }, stepId);
  }

  /**
   * Close the underlying sink (flush buffered data)
   * @param blocking - If false, upload happens in background (default: true). Only applies to CloudTraceSink.
   */
  async close(blocking: boolean = true): Promise<void> {
    // Check if sink has a close method that accepts blocking parameter
    if (typeof (this.sink as any).close === 'function' && (this.sink as any).close.length > 0) {
      await (this.sink as any).close(blocking);
    } else {
      await this.sink.close();
    }
  }

  /**
   * Get run ID
   */
  getRunId(): string {
    return this.runId;
  }

  /**
   * Get current sequence number
   */
  getSeq(): number {
    return this.seq;
  }

  /**
   * Get sink type (for debugging)
   */
  getSinkType(): string {
    return this.sink.getSinkType();
  }
}
