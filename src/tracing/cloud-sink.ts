/**
 * CloudTraceSink - Enterprise Cloud Upload
 *
 * Implements "Local Write, Batch Upload" pattern for cloud tracing
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { TraceSink } from './sink';

/**
 * CloudTraceSink writes trace events to a local temp file,
 * then uploads the complete trace to cloud storage on close()
 *
 * Architecture:
 * 1. **Local Buffer**: Writes to temp file (zero latency, non-blocking)
 * 2. **Pre-signed URL**: Uses secure pre-signed PUT URL from backend API
 * 3. **Batch Upload**: Uploads complete file on close() or at intervals
 * 4. **Zero Credential Exposure**: Never embeds cloud credentials in SDK
 *
 * This design ensures:
 * - Fast agent performance (microseconds per emit, not milliseconds)
 * - Security (credentials stay on backend)
 * - Reliability (network issues don't crash the agent)
 *
 * Example:
 *   const sink = new CloudTraceSink(uploadUrl);
 *   const tracer = new Tracer(runId, sink);
 *   tracer.emitRunStart('SentienceAgent');
 *   await tracer.close(); // Uploads to cloud
 */
export class CloudTraceSink extends TraceSink {
  private uploadUrl: string;
  private tempFilePath: string;
  private writeStream: fs.WriteStream | null = null;
  private closed: boolean = false;

  /**
   * Create a new CloudTraceSink
   *
   * @param uploadUrl - Pre-signed PUT URL from Sentience API
   */
  constructor(uploadUrl: string) {
    super();
    this.uploadUrl = uploadUrl;

    // Create temporary file for buffering
    const tmpDir = os.tmpdir();
    this.tempFilePath = path.join(tmpDir, `sentience-trace-${Date.now()}.jsonl`);

    try {
      // Open file in append mode
      this.writeStream = fs.createWriteStream(this.tempFilePath, {
        flags: 'a',
        encoding: 'utf-8',
        autoClose: true,
      });

      // Handle stream errors (suppress if closed)
      this.writeStream.on('error', (error) => {
        if (!this.closed) {
          console.error('[CloudTraceSink] Stream error:', error);
        }
      });
    } catch (error) {
      console.error('[CloudTraceSink] Failed to initialize sink:', error);
      this.writeStream = null;
    }
  }

  /**
   * Emit a trace event to local temp file (fast, non-blocking)
   *
   * @param event - Event dictionary from TraceEvent
   */
  emit(event: Record<string, any>): void {
    if (this.closed) {
      throw new Error('CloudTraceSink is closed');
    }

    if (!this.writeStream) {
      console.error('[CloudTraceSink] Write stream not available');
      return;
    }

    try {
      const jsonStr = JSON.stringify(event);
      this.writeStream.write(jsonStr + '\n');
    } catch (error) {
      console.error('[CloudTraceSink] Write error:', error);
    }
  }

  /**
   * Upload data to cloud using Node's built-in https module
   */
  private async _uploadToCloud(data: Buffer): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.uploadUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/x-gzip',
          'Content-Encoding': 'gzip',
          'Content-Length': data.length,
        },
        timeout: 60000, // 1 minute timeout
      };

      const req = protocol.request(options, (res) => {
        // Consume response data (even if we don't use it)
        res.on('data', () => {});
        res.on('end', () => {
          resolve(res.statusCode || 500);
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Upload timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Upload buffered trace to cloud via pre-signed URL
   *
   * This is the only network call - happens once at the end.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    try {
      // 1. Close write stream
      if (this.writeStream && !this.writeStream.destroyed) {
        const stream = this.writeStream;
        stream.removeAllListeners('error');

        await new Promise<void>((resolve) => {
          stream.end(() => {
            resolve();
          });
        });
      }

      // 2. Read and compress trace data
      if (!fs.existsSync(this.tempFilePath)) {
        console.warn('[CloudTraceSink] Temp file does not exist, skipping upload');
        return;
      }

      const traceData = fs.readFileSync(this.tempFilePath);
      const compressedData = zlib.gzipSync(traceData);

      // 3. Upload to cloud via pre-signed URL
      console.log(
        `📤 [Sentience] Uploading trace to cloud (${compressedData.length} bytes)...`
      );

      const statusCode = await this._uploadToCloud(compressedData);

      if (statusCode === 200) {
        console.log('✅ [Sentience] Trace uploaded successfully');

        // 4. Delete temp file on success
        fs.unlinkSync(this.tempFilePath);
      } else {
        console.error(`❌ [Sentience] Upload failed: HTTP ${statusCode}`);
        console.error(`   Local trace preserved at: ${this.tempFilePath}`);
      }
    } catch (error: any) {
      console.error(`❌ [Sentience] Error uploading trace: ${error.message}`);
      console.error(`   Local trace preserved at: ${this.tempFilePath}`);
      // Don't throw - preserve trace locally even if upload fails
    }
  }

  /**
   * Get unique identifier for this sink
   */
  getSinkType(): string {
    return `CloudTraceSink(${this.uploadUrl.substring(0, 50)}...)`;
  }
}
