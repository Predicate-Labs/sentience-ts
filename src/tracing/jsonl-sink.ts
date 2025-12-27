/**
 * JSONL Trace Sink
 *
 * Writes trace events to a local JSONL (JSON Lines) file
 */

import * as fs from 'fs';
import * as path from 'path';
import { TraceSink } from './sink';

/**
 * JsonlTraceSink writes trace events to a JSONL file (one JSON object per line)
 */
export class JsonlTraceSink extends TraceSink {
  private path: string;
  private writeStream: fs.WriteStream | null = null;
  private closed: boolean = false;

  /**
   * Create a new JSONL trace sink
   * @param filePath - Path to the JSONL file (will be created if doesn't exist)
   */
  constructor(filePath: string) {
    super();
    this.path = filePath;

    // Create parent directories if needed (synchronously)
    const dir = path.dirname(filePath);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Verify directory is writable
      fs.accessSync(dir, fs.constants.W_OK);

      // Open file in append mode with line buffering
      this.writeStream = fs.createWriteStream(filePath, {
        flags: 'a',
        encoding: 'utf-8',
        autoClose: true,
      });

      // Handle stream errors (suppress logging if stream is closed)
      this.writeStream.on('error', (error) => {
        if (!this.closed) {
          console.error('[JsonlTraceSink] Stream error:', error);
        }
      });
    } catch (error) {
      console.error('[JsonlTraceSink] Failed to initialize sink:', error);
      this.writeStream = null;
    }
  }

  /**
   * Emit a trace event (write as JSON line)
   * @param event - Event dictionary
   */
  emit(event: Record<string, any>): void {
    if (this.closed) {
      console.warn('[JsonlTraceSink] Attempted to emit after close()');
      return;
    }

    if (!this.writeStream) {
      console.error('[JsonlTraceSink] Write stream not available');
      return;
    }

    try {
      const jsonLine = JSON.stringify(event) + '\n';
      this.writeStream.write(jsonLine);
    } catch (error) {
      // Log error but don't crash agent execution
      console.error('[JsonlTraceSink] Failed to write event:', error);
    }
  }

  /**
   * Close the sink and flush buffered data
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Check if stream exists and is writable
    if (!this.writeStream || this.writeStream.destroyed) {
      return;
    }

    // Store reference to satisfy TypeScript null checks
    const stream = this.writeStream;

    // Remove error listener to prevent late errors
    stream.removeAllListeners('error');

    return new Promise<void>((resolve) => {
      stream.end((err?: Error | null) => {
        if (err) {
          // Silently ignore close errors in production
          // (they're logged during stream lifetime if needed)
        }
        // Always resolve, don't reject on close errors
        resolve();
      });
    });
  }

  /**
   * Get sink type identifier
   */
  getSinkType(): string {
    return `JsonlTraceSink(${this.path})`;
  }

  /**
   * Get file path
   */
  getPath(): string {
    return this.path;
  }

  /**
   * Check if sink is closed
   */
  isClosed(): boolean {
    return this.closed;
  }
}
