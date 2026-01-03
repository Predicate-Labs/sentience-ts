/**
 * TraceSink Abstract Class
 *
 * Defines the interface for trace event sinks (local files, cloud storage, etc.)
 */

import { TraceEvent } from './types';

/**
 * Abstract base class for trace sinks
 */
export abstract class TraceSink {
  /**
   * Emit a trace event
   * @param event - Trace event to emit
   */
  abstract emit(event: TraceEvent): void;

  /**
   * Close the sink and flush buffered data
   */
  abstract close(): Promise<void>;

  /**
   * Get unique identifier for this sink (for debugging)
   */
  abstract getSinkType(): string;
}
