/**
 * CloudTraceSink - Enterprise Cloud Upload
 *
 * Implements "Local Write, Batch Upload" pattern for cloud tracing
 *
 * PRODUCTION HARDENING:
 * - Uses persistent cache directory (~/.sentience/traces/pending/) to survive crashes
 * - Supports non-blocking close() to avoid hanging user scripts
 * - Preserves traces locally on upload failure
 */

import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { TraceSink } from './sink';

/**
 * Optional logger interface for SDK users
 */
export interface SentienceLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Get persistent cache directory for traces
 * Uses ~/.sentience/traces/pending/ (survives process crashes)
 */
function getPersistentCacheDir(): string {
  const homeDir = os.homedir();
  const cacheDir = path.join(homeDir, '.sentience', 'traces', 'pending');

  // Create directory if it doesn't exist
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  return cacheDir;
}

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
  private runId: string;
  private writeStream: fs.WriteStream | null = null;
  private closed: boolean = false;
  private apiKey?: string;
  private apiUrl: string;
  private logger?: SentienceLogger;

  // File size tracking (NEW)
  private traceFileSizeBytes: number = 0;
  private screenshotTotalSizeBytes: number = 0;

  /**
   * Create a new CloudTraceSink
   *
   * @param uploadUrl - Pre-signed PUT URL from Sentience API
   * @param runId - Run ID for persistent cache naming
   * @param apiKey - Sentience API key for calling /v1/traces/complete
   * @param apiUrl - Sentience API base URL (default: https://api.sentienceapi.com)
   * @param logger - Optional logger instance for logging file sizes and errors
   */
  constructor(
    uploadUrl: string,
    runId?: string,
    apiKey?: string,
    apiUrl?: string,
    logger?: SentienceLogger
  ) {
    super();
    this.uploadUrl = uploadUrl;
    this.runId = runId || `trace-${Date.now()}`;
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || 'https://api.sentienceapi.com';
    this.logger = logger;

    // PRODUCTION FIX: Use persistent cache directory instead of /tmp
    // This ensures traces survive process crashes!
    const cacheDir = getPersistentCacheDir();
    this.tempFilePath = path.join(cacheDir, `${this.runId}.jsonl`);

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
   * @param blocking - If false, upload happens in background (default: true)
   *
   * PRODUCTION FIX: Non-blocking mode prevents hanging user scripts
   * on slow uploads (Risk #2 from production hardening plan)
   */
  async close(blocking: boolean = true): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Non-blocking mode: fire-and-forget background upload
    if (!blocking) {
      // Close the write stream synchronously
      if (this.writeStream && !this.writeStream.destroyed) {
        this.writeStream.end();
      }

      // Upload in background (don't await)
      this._doUpload().catch((error) => {
        console.error(`❌ [Sentience] Background upload failed: ${error.message}`);
        console.error(`   Local trace preserved at: ${this.tempFilePath}`);
      });

      console.log('📤 [Sentience] Trace upload started in background');
      return;
    }

    // Blocking mode: wait for upload to complete
    await this._doUpload();
  }

  /**
   * Internal upload logic (called by both blocking and non-blocking close)
   */
  private async _doUpload(): Promise<void> {

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

      // 2. Generate index after closing file
      this.generateIndex();

      // 2. Read and compress trace data (using async operations)
      try {
        await fsPromises.access(this.tempFilePath);
      } catch {
        console.warn('[CloudTraceSink] Temp file does not exist, skipping upload');
        return;
      }

      const traceData = await fsPromises.readFile(this.tempFilePath);
      const compressedData = zlib.gzipSync(traceData);

      // Measure trace file size (NEW)
      this.traceFileSizeBytes = compressedData.length;

      // Log file sizes if logger is provided (NEW)
      if (this.logger) {
        this.logger.info(
          `Trace file size: ${(this.traceFileSizeBytes / 1024 / 1024).toFixed(2)} MB`
        );
        this.logger.info(
          `Screenshot total: ${(this.screenshotTotalSizeBytes / 1024 / 1024).toFixed(2)} MB`
        );
      }

      // 3. Upload to cloud via pre-signed URL
      console.log(
        `📤 [Sentience] Uploading trace to cloud (${compressedData.length} bytes)...`
      );

      const statusCode = await this._uploadToCloud(compressedData);

      if (statusCode === 200) {
        console.log('✅ [Sentience] Trace uploaded successfully');

        // Upload trace index file
        await this._uploadIndex();

        // Call /v1/traces/complete to report file sizes
        await this._completeTrace();

        // 4. Delete temp file on success
        await fsPromises.unlink(this.tempFilePath);
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
   * Call /v1/traces/complete to report file sizes to gateway.
   *
   * This is a best-effort call - failures are logged but don't affect upload success.
   */
  private async _completeTrace(): Promise<void> {
    if (!this.apiKey) {
      // No API key - skip complete call
      return;
    }

    return new Promise((resolve) => {
      const url = new URL(`${this.apiUrl}/v1/traces/complete`);
      const protocol = url.protocol === 'https:' ? https : http;

      const body = JSON.stringify({
        run_id: this.runId,
        stats: {
          trace_file_size_bytes: this.traceFileSizeBytes,
          screenshot_total_size_bytes: this.screenshotTotalSizeBytes,
        },
      });

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: 10000, // 10 second timeout
      };

      const req = protocol.request(options, (res) => {
        // Consume response data
        res.on('data', () => {});
        res.on('end', () => {
          if (res.statusCode === 200) {
            this.logger?.info('Trace completion reported to gateway');
          } else {
            this.logger?.warn(
              `Failed to report trace completion: HTTP ${res.statusCode}`
            );
          }
          resolve();
        });
      });

      req.on('error', (error) => {
        // Best-effort - log but don't fail
        this.logger?.warn(`Error reporting trace completion: ${error.message}`);
        resolve();
      });

      req.on('timeout', () => {
        req.destroy();
        this.logger?.warn('Trace completion request timeout');
        resolve();
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Generate trace index file (automatic on close)
   */
  private generateIndex(): void {
    try {
      const { writeTraceIndex } = require('./indexer');
      writeTraceIndex(this.tempFilePath);
    } catch (error: any) {
      // Non-fatal: log but don't crash
      console.log(`⚠️  Failed to generate trace index: ${error.message}`);
    }
  }

  /**
   * Upload trace index file to cloud storage.
   *
   * Called after successful trace upload to provide fast timeline rendering.
   * The index file enables O(1) step lookups without parsing the entire trace.
   */
  private async _uploadIndex(): Promise<void> {
    // Construct index file path (same as trace file with .index.json extension)
    const indexPath = this.tempFilePath.replace('.jsonl', '.index.json');

    try {
      // Check if index file exists
      await fsPromises.access(indexPath);
    } catch {
      this.logger?.warn('Index file not found, skipping index upload');
      return;
    }

    try {
      // Request index upload URL from API
      if (!this.apiKey) {
        this.logger?.info('No API key provided, skipping index upload');
        return;
      }

      const uploadUrlResponse = await this._requestIndexUploadUrl();
      if (!uploadUrlResponse) {
        return;
      }

      // Read and compress index file
      const indexData = await fsPromises.readFile(indexPath);
      const compressedIndex = zlib.gzipSync(indexData);
      const indexSize = compressedIndex.length;

      this.logger?.info(`Index file size: ${(indexSize / 1024).toFixed(2)} KB`);

      console.log(`📤 [Sentience] Uploading trace index (${indexSize} bytes)...`);

      // Upload index to cloud storage
      const statusCode = await this._uploadIndexToCloud(uploadUrlResponse, compressedIndex);

      if (statusCode === 200) {
        console.log('✅ [Sentience] Trace index uploaded successfully');

        // Delete local index file after successful upload
        try {
          await fsPromises.unlink(indexPath);
        } catch {
          // Ignore cleanup errors
        }
      } else {
        this.logger?.warn(`Index upload failed: HTTP ${statusCode}`);
        console.log(`⚠️  [Sentience] Index upload failed: HTTP ${statusCode}`);
      }
    } catch (error: any) {
      // Non-fatal: log but don't crash
      this.logger?.warn(`Error uploading trace index: ${error.message}`);
      console.log(`⚠️  [Sentience] Error uploading trace index: ${error.message}`);
    }
  }

  /**
   * Request index upload URL from Sentience API
   */
  private async _requestIndexUploadUrl(): Promise<string | null> {
    return new Promise((resolve) => {
      const url = new URL(`${this.apiUrl}/v1/traces/index_upload`);
      const protocol = url.protocol === 'https:' ? https : http;

      const body = JSON.stringify({ run_id: this.runId });

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: 10000,
      };

      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const response = JSON.parse(data);
              resolve(response.upload_url || null);
            } catch {
              this.logger?.warn('Failed to parse index upload URL response');
              resolve(null);
            }
          } else {
            this.logger?.warn(`Failed to get index upload URL: HTTP ${res.statusCode}`);
            resolve(null);
          }
        });
      });

      req.on('error', (error) => {
        this.logger?.warn(`Error requesting index upload URL: ${error.message}`);
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        this.logger?.warn('Index upload URL request timeout');
        resolve(null);
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Upload index data to cloud using pre-signed URL
   */
  private async _uploadIndexToCloud(uploadUrl: string, data: Buffer): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = new URL(uploadUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Content-Length': data.length,
        },
        timeout: 30000, // 30 second timeout
      };

      const req = protocol.request(options, (res) => {
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
        reject(new Error('Index upload timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Get unique identifier for this sink
   */
  getSinkType(): string {
    return `CloudTraceSink(${this.uploadUrl.substring(0, 50)}...)`;
  }
}
