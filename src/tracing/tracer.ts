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

  // Stats tracking
  private totalSteps: number = 0;
  private totalEvents: number = 0;
  private startedAt: Date | null = null;
  private endedAt: Date | null = null;
  private finalStatus: string = 'unknown';
  // Track step outcomes for automatic status inference
  private stepSuccesses: number = 0;
  private stepFailures: number = 0;
  private hasErrors: boolean = false;

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
  emit(eventType: string, data: TraceEventData, stepId?: string): void {
    this.seq += 1;
    this.totalEvents += 1;

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

    // Track step outcomes for automatic status inference
    if (eventType === 'step_end') {
      const success = (data as any).success || false;
      if (success) {
        this.stepSuccesses += 1;
      } else {
        this.stepFailures += 1;
      }
    } else if (eventType === 'error') {
      this.hasErrors = true;
    }
  }

  /**
   * Emit run_start event
   * @param agent - Agent type (e.g., 'SentienceAgent')
   * @param llmModel - Optional LLM model name
   * @param config - Optional configuration
   */
  emitRunStart(agent: string, llmModel?: string, config?: Record<string, any>): void {
    // Track start time
    this.startedAt = new Date();

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
    // Track step count (only count first attempt of each step)
    if (attempt === 0) {
      this.totalSteps = Math.max(this.totalSteps, stepIndex);
    }

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
   * @param status - Optional final status ("success", "failure", "partial", "unknown")
   *                 If not provided, infers from tracked outcomes or uses this.finalStatus
   */
  emitRunEnd(steps: number, status?: string): void {
    // Track end time
    this.endedAt = new Date();

    // Auto-infer status if not provided and not explicitly set
    if (status === undefined && this.finalStatus === 'unknown') {
      this._inferFinalStatus();
    }

    // Use provided status or fallback to this.finalStatus
    const finalStatus = status || this.finalStatus;

    // Ensure totalSteps is at least the provided steps value
    this.totalSteps = Math.max(this.totalSteps, steps);

    // Ensure finalStatus is a valid status value
    const validStatus: 'success' | 'failure' | 'partial' | 'unknown' =
      finalStatus === 'success' ||
      finalStatus === 'failure' ||
      finalStatus === 'partial' ||
      finalStatus === 'unknown'
        ? finalStatus
        : 'unknown';

    this.emit('run_end', { steps, status: validStatus });
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
   * Automatically infer finalStatus from tracked step outcomes if not explicitly set.
   * This is called automatically in close() if finalStatus is still "unknown".
   */
  private _inferFinalStatus(): void {
    if (this.finalStatus !== 'unknown') {
      // Status already set explicitly, don't override
      return;
    }

    // Infer from tracked outcomes
    if (this.hasErrors) {
      // Has errors - check if there were successful steps too
      if (this.stepSuccesses > 0) {
        this.finalStatus = 'partial';
      } else {
        this.finalStatus = 'failure';
      }
    } else if (this.stepSuccesses > 0) {
      // Has successful steps and no errors
      this.finalStatus = 'success';
    }
    // Otherwise stays "unknown" (no steps executed or no clear outcome)
  }

  /**
   * Close the underlying sink (flush buffered data)
   * @param blocking - If false, upload happens in background (default: true). Only applies to CloudTraceSink.
   */
  async close(blocking: boolean = true): Promise<void> {
    // Auto-infer finalStatus if not explicitly set and we have step outcomes
    if (
      this.finalStatus === 'unknown' &&
      (this.stepSuccesses > 0 || this.stepFailures > 0 || this.hasErrors)
    ) {
      this._inferFinalStatus();
    }

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

  /**
   * Set the final status of the trace run
   * @param status - Final status ("success", "failure", "partial", "unknown")
   */
  setFinalStatus(status: string): void {
    if (!['success', 'failure', 'partial', 'unknown'].includes(status)) {
      throw new Error(
        `Invalid status: ${status}. Must be one of: success, failure, partial, unknown`
      );
    }
    this.finalStatus = status;
  }

  /**
   * Get execution statistics for trace completion
   * @returns Dictionary with stats fields for /v1/traces/complete
   */
  getStats(): Record<string, any> {
    let durationMs: number | null = null;
    if (this.startedAt && this.endedAt) {
      durationMs = this.endedAt.getTime() - this.startedAt.getTime();
    }

    return {
      total_steps: this.totalSteps,
      total_events: this.totalEvents,
      duration_ms: durationMs,
      final_status: this.finalStatus,
      started_at: this.startedAt ? this.startedAt.toISOString() : null,
      ended_at: this.endedAt ? this.endedAt.toISOString() : null,
    };
  }
}
