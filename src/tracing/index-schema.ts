/**
 * Type definitions for trace index schema using concrete classes.
 */

export class TraceFileInfo {
  constructor(
    public path: string,
    public size_bytes: number,
    public sha256: string
  ) {}

  toJSON() {
    return {
      path: this.path,
      size_bytes: this.size_bytes,
      sha256: this.sha256,
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
    public final_url: string | null
  ) {}

  toJSON() {
    return {
      first_ts: this.first_ts,
      last_ts: this.last_ts,
      event_count: this.event_count,
      step_count: this.step_count,
      error_count: this.error_count,
      final_url: this.final_url,
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

export type StepStatus = 'ok' | 'error' | 'partial';

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
}
