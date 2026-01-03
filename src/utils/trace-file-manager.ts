/**
 * TraceFileManager - Common trace file operations
 *
 * Extracts common file operations from CloudTraceSink and JsonlTraceSink
 * to reduce duplication and standardize error handling
 */

import * as fs from 'fs';
import * as path from 'path';
import { TraceEvent } from '../tracing/types';

export interface TraceFileOptions {
  flags?: string;
  encoding?: BufferEncoding;
  autoClose?: boolean;
}

/**
 * TraceFileManager provides static methods for common trace file operations
 */
export class TraceFileManager {
  /**
   * Ensure directory exists and is writable
   *
   * @param dirPath - Directory path to ensure exists
   * @throws Error if directory cannot be created or is not writable
   */
  static ensureDirectory(dirPath: string): void {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      // Verify directory is writable
      fs.accessSync(dirPath, fs.constants.W_OK);
    } catch (error) {
      throw new Error(`Failed to create or access directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Create a write stream for trace file
   *
   * @param filePath - Path to trace file
   * @param options - Stream options
   * @returns WriteStream or null if creation fails
   */
  static createWriteStream(
    filePath: string,
    options: TraceFileOptions = {}
  ): fs.WriteStream | null {
    try {
      const dir = path.dirname(filePath);
      this.ensureDirectory(dir);

      const stream = fs.createWriteStream(filePath, {
        flags: options.flags || 'a',
        encoding: options.encoding || 'utf-8',
        autoClose: options.autoClose !== false,
      });

      return stream;
    } catch (error) {
      console.error(`[TraceFileManager] Failed to create write stream for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Write a trace event as JSON line
   *
   * @param stream - Write stream
   * @param event - Trace event to write
   * @returns True if written successfully, false otherwise
   */
  static writeEvent(stream: fs.WriteStream, event: TraceEvent): boolean {
    try {
      const jsonLine = JSON.stringify(event) + '\n';
      const written = stream.write(jsonLine);

      // Handle backpressure
      if (!written) {
        stream.once('drain', () => {
          // Stream is ready again
        });
      }

      return true;
    } catch (error) {
      console.error('[TraceFileManager] Failed to write event:', error);
      return false;
    }
  }

  /**
   * Close and flush a write stream
   *
   * @param stream - Write stream to close
   * @returns Promise that resolves when stream is closed
   */
  static async closeStream(stream: fs.WriteStream): Promise<void> {
    return new Promise((resolve, reject) => {
      if (stream.destroyed) {
        resolve();
        return;
      }

      stream.end(() => {
        resolve();
      });

      stream.once('error', error => {
        reject(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!stream.destroyed) {
          stream.destroy();
          resolve();
        }
      }, 5000);
    });
  }

  /**
   * Check if a file exists
   *
   * @param filePath - File path to check
   * @returns True if file exists, false otherwise
   */
  static fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Get file size in bytes
   *
   * @param filePath - File path
   * @returns File size in bytes, or 0 if file doesn't exist
   */
  static getFileSize(filePath: string): number {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return stats.size;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Delete a file safely
   *
   * @param filePath - File path to delete
   * @returns True if deleted successfully, false otherwise
   */
  static deleteFile(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[TraceFileManager] Failed to delete file ${filePath}:`, error);
      return false;
    }
  }
}
