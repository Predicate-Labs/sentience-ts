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
  private writeStream: fs.WriteStream;
  private closed: boolean = false;

  /**
   * Create a new JSONL trace sink
   * @param filePath - Path to the JSONL file (will be created if doesn't exist)
   */
  constructor(filePath: string) {
    super();
    this.path = filePath;

    // Create parent directories if needed
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open file in append mode with line buffering
    this.writeStream = fs.createWriteStream(filePath, {
      flags: 'a',
      encoding: 'utf-8',
    });
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

    return new Promise<void>((resolve, reject) => {
      this.writeStream.end((err?: Error | null) => {
        if (err) {
          console.error('[JsonlTraceSink] Error closing stream:', err);
          reject(err);
        } else {
          resolve();
        }
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
