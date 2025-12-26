/**
 * Tracing Types
 *
 * Schema v1 - Compatible with Python SDK
 */

/**
 * TraceEvent represents a single event in an agent execution trace
 */
export interface TraceEvent {
  /** Schema version (always 1 for now) */
  v: number;

  /** Event type (e.g., 'run_start', 'snapshot', 'action') */
  type: string;

  /** ISO 8601 timestamp */
  ts: string;

  /** Run UUID */
  run_id: string;

  /** Sequence number (monotonically increasing) */
  seq: number;

  /** Event-specific payload */
  data: Record<string, any>;

  /** Optional step UUID (for step-scoped events) */
  step_id?: string;

  /** Optional Unix timestamp in milliseconds */
  ts_ms?: number;
}

/**
 * TraceEventData contains common fields for event payloads
 */
export interface TraceEventData {
  // Common fields
  goal?: string;
  step_index?: number;
  attempt?: number;
  step_id?: string;

  // Snapshot data
  url?: string;
  elements?: Array<{
    id: number;
    bbox: { x: number; y: number; width: number; height: number };
    role: string;
    text?: string;
  }>;

  // LLM response data
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  response_text?: string;

  // Action data
  action_type?: string;
  element_id?: number;
  text?: string;
  key?: string;
  success?: boolean;

  // Error data
  error?: string;

  // Run metadata
  agent?: string;
  llm_model?: string;
  config?: Record<string, any>;
  steps?: number;

  // Allow additional properties
  [key: string]: any;
}
