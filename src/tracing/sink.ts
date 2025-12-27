/**
 * TraceSink Abstract Class
 *
 * Defines the interface for trace event sinks (local files, cloud storage, etc.)
 */

/**
 * Abstract base class for trace sinks
 */
export abstract class TraceSink {
  /**
   * Emit a trace event
   * @param event - Event dictionary to emit
   */
  abstract emit(event: Record<string, any>): void;

  /**
   * Close the sink and flush buffered data
   */
  abstract close(): Promise<void>;

  /**
   * Get unique identifier for this sink (for debugging)
   */
  abstract getSinkType(): string;
}
