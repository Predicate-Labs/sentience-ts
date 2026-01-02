/**
 * Type definitions for trace index schema using concrete classes.
 */

export class TraceFileInfo {
  constructor(
    public path: string,
    public size_bytes: number,
    public sha256: string,
    public line_count: number | null = null  // Number of lines in the trace file
  ) {}

  toJSON() {
    return {
      path: this.path,
      size_bytes: this.size_bytes,
      sha256: this.sha256,
      line_count: this.line_count,
    };
  }
}

export class TraceSummary {
  constructor(
    public first_ts: string,
    public last_ts: string,
    public event_count: number,
    public step_count: number,
    public error_count: number,
    public final_url: string | null,
    public status: 'success' | 'failure' | 'partial' | 'unknown' | null = null,
    public agent_name: string | null = null,  // Agent name from run_start event
    public duration_ms: number | null = null,  // Calculated duration in milliseconds
    public counters: { snapshot_count: number; action_count: number; error_count: number } | null = null  // Aggregated counters
  ) {}

  toJSON() {
    return {
      first_ts: this.first_ts,
      last_ts: this.last_ts,
      event_count: this.event_count,
      step_count: this.step_count,
      error_count: this.error_count,
      final_url: this.final_url,
      status: this.status,
      agent_name: this.agent_name,
      duration_ms: this.duration_ms,
      counters: this.counters,
    };
  }
}

export class SnapshotInfo {
  constructor(
    public snapshot_id: string | null = null,
    public digest: string | null = null,
    public url: string | null = null
  ) {}

  toJSON() {
    return {
      snapshot_id: this.snapshot_id,
      digest: this.digest,
      url: this.url,
    };
  }
}

export class ActionInfo {
  constructor(
    public type: string | null = null,
    public target_element_id: number | null = null,
    public args_digest: string | null = null,
    public success: boolean | null = null
  ) {}

  toJSON() {
    return {
      type: this.type,
      target_element_id: this.target_element_id,
      args_digest: this.args_digest,
      success: this.success,
    };
  }
}

export class StepCounters {
  constructor(
    public events: number = 0,
    public snapshots: number = 0,
    public actions: number = 0,
    public llm_calls: number = 0
  ) {}

  toJSON() {
    return {
      events: this.events,
      snapshots: this.snapshots,
      actions: this.actions,
      llm_calls: this.llm_calls,
    };
  }
}

export type StepStatus = 'success' | 'failure' | 'partial' | 'unknown';

export class StepIndex {
  constructor(
    public step_index: number,
    public step_id: string,
    public goal: string | null,
    public status: StepStatus,
    public ts_start: string,
    public ts_end: string,
    public offset_start: number,
    public offset_end: number,
    public line_number: number | null = null,  // Line number for byte-range fetching
    public url_before: string | null,
    public url_after: string | null,
    public snapshot_before: SnapshotInfo,
    public snapshot_after: SnapshotInfo,
    public action: ActionInfo,
    public counters: StepCounters
  ) {}

  toJSON() {
    return {
      step_index: this.step_index,
      step_id: this.step_id,
      goal: this.goal,
      status: this.status,
      ts_start: this.ts_start,
      ts_end: this.ts_end,
      offset_start: this.offset_start,
      offset_end: this.offset_end,
      line_number: this.line_number,
      url_before: this.url_before,
      url_after: this.url_after,
      snapshot_before: this.snapshot_before.toJSON(),
      snapshot_after: this.snapshot_after.toJSON(),
      action: this.action.toJSON(),
      counters: this.counters.toJSON(),
    };
  }
}

export class TraceIndex {
  constructor(
    public version: number,
    public run_id: string,
    public created_at: string,
    public trace_file: TraceFileInfo,
    public summary: TraceSummary,
    public steps: StepIndex[] = []
  ) {}

  toJSON() {
    return {
      version: this.version,
      run_id: this.run_id,
      created_at: this.created_at,
      trace_file: this.trace_file.toJSON(),
      summary: this.summary.toJSON(),
      steps: this.steps.map((s) => s.toJSON()),
    };
  }

  /**
   * Convert to SS format.
   * 
   * Maps SDK field names to frontend expectations:
   * - created_at -> generated_at
   * - first_ts -> start_time
   * - last_ts -> end_time
   * - step_index -> step (already 1-based, good!)
   * - ts_start -> timestamp
   * - Filters out "unknown" status
   */
  toSentienceStudioJSON(): any {
    // Calculate duration if not already set
    let durationMs = this.summary.duration_ms;
    if (durationMs === null && this.summary.first_ts && this.summary.last_ts) {
      const start = new Date(this.summary.first_ts);
      const end = new Date(this.summary.last_ts);
      durationMs = end.getTime() - start.getTime();
    }

    // Aggregate counters if not already set
    let counters = this.summary.counters;
    if (counters === null) {
      const snapshotCount = this.steps.reduce((sum, s) => sum + s.counters.snapshots, 0);
      const actionCount = this.steps.reduce((sum, s) => sum + s.counters.actions, 0);
      counters = {
        snapshot_count: snapshotCount,
        action_count: actionCount,
        error_count: this.summary.error_count,
      };
    }

    return {
      version: this.version,
      run_id: this.run_id,
      generated_at: this.created_at,  // Renamed from created_at
      trace_file: {
        path: this.trace_file.path,
        size_bytes: this.trace_file.size_bytes,
        line_count: this.trace_file.line_count,  // Added
      },
      summary: {
        agent_name: this.summary.agent_name,  // Added
        total_steps: this.summary.step_count,  // Renamed from step_count
        status: this.summary.status !== 'unknown' ? this.summary.status : null,  // Filter out unknown
        start_time: this.summary.first_ts,  // Renamed from first_ts
        end_time: this.summary.last_ts,  // Renamed from last_ts
        duration_ms: durationMs,  // Added
        counters: counters,  // Added
      },
      steps: this.steps.map((s) => ({
        step: s.step_index,  // Already 1-based ✅
        byte_offset: s.offset_start,
        line_number: s.line_number,  // Added
        timestamp: s.ts_start,  // Use start time
        action: {
          type: s.action.type || '',
          goal: s.goal,  // Move goal into action
          digest: s.action.args_digest,
        },
        snapshot: s.snapshot_after.url ? {
          url: s.snapshot_after.url,
          digest: s.snapshot_after.digest,
        } : undefined,
        status: s.status !== 'unknown' ? s.status : undefined,  // Filter out unknown
      })),
    };
  }
}
