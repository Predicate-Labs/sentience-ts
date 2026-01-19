import { spawnSync } from 'child_process';
import fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import os from 'os';
import path from 'path';
import { URL } from 'url';
import * as zlib from 'zlib';

const SENTIENCE_API_URL = 'https://api.sentienceapi.com';

/**
 * Optional logger interface for SDK users
 */
export interface SentienceLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export type PersistMode = 'onFail' | 'always';
export type ClipMode = 'off' | 'auto' | 'on';

export interface ClipOptions {
  /**
   * Clip generation mode:
   * - "off": Never generate clips
   * - "auto": Generate only if ffmpeg is available on PATH (default)
   * - "on": Always attempt to generate (will warn if ffmpeg missing)
   */
  mode?: ClipMode;
  /** Frames per second for the generated video (default: 8) */
  fps?: number;
  /** Duration of clip in seconds. If undefined, uses bufferSeconds */
  seconds?: number;
}

export interface FailureArtifactsOptions {
  bufferSeconds?: number;
  captureOnAction?: boolean;
  fps?: number;
  persistMode?: PersistMode;
  outputDir?: string;
  onBeforePersist?: ((ctx: RedactionContext) => RedactionResult) | null;
  redactSnapshotValues?: boolean;
  clip?: ClipOptions;
}

interface FrameRecord {
  ts: number;
  fileName: string;
  filePath: string;
}

export interface RedactionContext {
  runId: string;
  reason: string | null;
  status: 'failure' | 'success';
  snapshot: any;
  diagnostics: any;
  framePaths: string[];
  metadata: Record<string, any>;
}

export interface RedactionResult {
  snapshot?: any;
  diagnostics?: any;
  framePaths?: string[];
  dropFrames?: boolean;
}

/** Response from POST /v1/traces/artifacts/init */
interface ArtifactsInitResponse {
  upload_urls: Array<{
    name: string;
    upload_url: string;
    storage_key: string;
  }>;
  artifact_index_upload: {
    upload_url: string;
    storage_key: string;
  };
  expires_in: number;
}

async function writeJsonAtomic(filePath: string, data: any): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2));
  await fs.promises.rename(tmpPath, filePath);
}

/**
 * Check if ffmpeg is available on the system PATH.
 */
function isFfmpegAvailable(): boolean {
  try {
    const result = spawnSync('ffmpeg', ['-version'], {
      timeout: 5000,
      stdio: 'pipe',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Generate an MP4 video clip from a directory of frames using ffmpeg.
 */
function generateClipFromFrames(framesDir: string, outputPath: string, fps: number = 8): boolean {
  // Find all frame files and sort them
  const files = fs
    .readdirSync(framesDir)
    .filter(
      f =>
        f.startsWith('frame_') && (f.endsWith('.png') || f.endsWith('.jpeg') || f.endsWith('.jpg'))
    )
    .sort();

  if (files.length === 0) {
    console.warn('No frame files found for clip generation');
    return false;
  }

  // Create a temporary file list for ffmpeg concat demuxer
  const listFile = path.join(framesDir, 'frames_list.txt');
  const frameDuration = 1.0 / fps;

  try {
    // Write the frames list file
    const listContent =
      files.map(f => `file '${f}'\nduration ${frameDuration}`).join('\n') +
      `\nfile '${files[files.length - 1]}'`; // ffmpeg concat quirk

    fs.writeFileSync(listFile, listContent);

    // Run ffmpeg to generate the clip
    const result = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-vsync',
        'vfr',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-crf',
        '23',
        outputPath,
      ],
      {
        timeout: 60000, // 1 minute timeout
        cwd: framesDir,
        stdio: 'pipe',
      }
    );

    if (result.status !== 0) {
      const stderr = result.stderr?.toString('utf-8').slice(0, 500) ?? '';
      console.warn(`ffmpeg failed with return code ${result.status}: ${stderr}`);
      return false;
    }

    return fs.existsSync(outputPath);
  } catch (err) {
    console.warn(`Error generating clip: ${err}`);
    return false;
  } finally {
    // Clean up the list file
    try {
      fs.unlinkSync(listFile);
    } catch {
      // ignore
    }
  }
}

function redactSnapshotDefaults(payload: any): any {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  const elements = Array.isArray(payload.elements) ? payload.elements : null;
  if (!elements) {
    return payload;
  }
  const redactedElements = elements.map((el: any) => {
    if (!el || typeof el !== 'object') return el;
    const inputType = String(el.input_type || '').toLowerCase();
    if (['password', 'email', 'tel'].includes(inputType) && 'value' in el) {
      return { ...el, value: null, value_redacted: true };
    }
    return el;
  });
  return { ...payload, elements: redactedElements };
}

export class FailureArtifactBuffer {
  private runId: string;
  private options: Required<FailureArtifactsOptions>;
  private frames: FrameRecord[] = [];
  private steps: Record<string, any>[] = [];
  private persisted = false;
  private timeNow: () => number;
  private tempDir: string;
  private framesDir: string;

  constructor(
    runId: string,
    options: FailureArtifactsOptions = {},
    timeNow: () => number = () => Date.now()
  ) {
    this.runId = runId;
    this.options = {
      bufferSeconds: options.bufferSeconds ?? 15,
      captureOnAction: options.captureOnAction ?? true,
      fps: options.fps ?? 0,
      persistMode: options.persistMode ?? 'onFail',
      outputDir: options.outputDir ?? '.sentience/artifacts',
      onBeforePersist: options.onBeforePersist ?? null,
      redactSnapshotValues: options.redactSnapshotValues ?? true,
      clip: {
        mode: options.clip?.mode ?? 'auto',
        fps: options.clip?.fps ?? 8,
        seconds: options.clip?.seconds,
      },
    };
    this.timeNow = timeNow;
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentience-artifacts-'));
    this.framesDir = path.join(this.tempDir, 'frames');
    fs.mkdirSync(this.framesDir, { recursive: true });
  }

  getOptions(): Required<FailureArtifactsOptions> {
    return this.options;
  }

  recordStep(action: string, stepId: string | null, stepIndex: number, url?: string): void {
    this.steps.push({
      ts: this.timeNow(),
      action,
      step_id: stepId,
      step_index: stepIndex,
      url,
    });
  }

  async addFrame(image: Buffer, fmt: 'jpeg' | 'png' = 'jpeg'): Promise<void> {
    const ts = this.timeNow();
    const fileName = `frame_${ts}.${fmt}`;
    const filePath = path.join(this.framesDir, fileName);
    await fs.promises.writeFile(filePath, image);
    this.frames.push({ ts, fileName, filePath });
    this.prune();
  }

  frameCount(): number {
    return this.frames.length;
  }

  private prune(): void {
    const cutoff = this.timeNow() - this.options.bufferSeconds * 1000;
    const keep: FrameRecord[] = [];
    for (const frame of this.frames) {
      if (frame.ts >= cutoff) {
        keep.push(frame);
      } else {
        try {
          fs.unlinkSync(frame.filePath);
        } catch {
          // ignore
        }
      }
    }
    this.frames = keep;
  }

  async persist(
    reason: string | null,
    status: 'failure' | 'success',
    snapshot?: any,
    diagnostics?: any,
    metadata?: Record<string, any>
  ): Promise<string | null> {
    if (this.persisted) {
      return null;
    }

    const outDir = this.options.outputDir;
    await fs.promises.mkdir(outDir, { recursive: true });
    const ts = this.timeNow();
    const runDir = path.join(outDir, `${this.runId}-${ts}`);
    const framesOut = path.join(runDir, 'frames');
    await fs.promises.mkdir(framesOut, { recursive: true });

    for (const frame of this.frames) {
      await fs.promises.copyFile(frame.filePath, path.join(framesOut, frame.fileName));
    }

    await writeJsonAtomic(path.join(runDir, 'steps.json'), this.steps);

    let snapshotPayload = snapshot;
    if (snapshotPayload && this.options.redactSnapshotValues) {
      snapshotPayload = redactSnapshotDefaults(snapshotPayload);
    }

    let diagnosticsPayload = diagnostics;
    let framePaths = this.frames.map(frame => frame.filePath);
    let dropFrames = false;

    if (this.options.onBeforePersist) {
      try {
        const result = this.options.onBeforePersist({
          runId: this.runId,
          reason,
          status,
          snapshot: snapshotPayload,
          diagnostics: diagnosticsPayload,
          framePaths,
          metadata: metadata ?? {},
        });
        if (result.snapshot !== undefined) {
          snapshotPayload = result.snapshot;
        }
        if (result.diagnostics !== undefined) {
          diagnosticsPayload = result.diagnostics;
        }
        if (result.framePaths) {
          framePaths = result.framePaths;
        }
        dropFrames = Boolean(result.dropFrames);
      } catch {
        dropFrames = true;
      }
    }

    if (!dropFrames) {
      for (const framePath of framePaths) {
        if (!fs.existsSync(framePath)) {
          continue;
        }
        const fileName = path.basename(framePath);
        await fs.promises.copyFile(framePath, path.join(framesOut, fileName));
      }
    }

    let snapshotWritten = false;
    if (snapshotPayload) {
      await writeJsonAtomic(path.join(runDir, 'snapshot.json'), snapshotPayload);
      snapshotWritten = true;
    }

    let diagnosticsWritten = false;
    if (diagnosticsPayload) {
      await writeJsonAtomic(path.join(runDir, 'diagnostics.json'), diagnosticsPayload);
      diagnosticsWritten = true;
    }

    // Generate video clip from frames (optional, requires ffmpeg)
    let clipGenerated = false;
    const clipOptions = this.options.clip;

    if (!dropFrames && framePaths.length > 0 && clipOptions.mode !== 'off') {
      let shouldGenerate = false;

      if (clipOptions.mode === 'auto') {
        // Only generate if ffmpeg is available
        shouldGenerate = isFfmpegAvailable();
        if (!shouldGenerate) {
          // Silent in auto mode - just skip
        }
      } else if (clipOptions.mode === 'on') {
        // Always attempt to generate
        shouldGenerate = true;
        if (!isFfmpegAvailable()) {
          console.warn(
            "ffmpeg not found on PATH but clip.mode='on'. " +
              'Install ffmpeg to generate video clips.'
          );
          shouldGenerate = false;
        }
      }

      if (shouldGenerate) {
        const clipPath = path.join(runDir, 'failure.mp4');
        clipGenerated = generateClipFromFrames(framesOut, clipPath, clipOptions.fps ?? 8);
        if (clipGenerated) {
          console.log(`Generated failure clip: ${clipPath}`);
        } else {
          console.warn('Failed to generate video clip');
        }
      }
    }

    const manifest = {
      run_id: this.runId,
      created_at_ms: ts,
      status,
      reason,
      buffer_seconds: this.options.bufferSeconds,
      frame_count: dropFrames ? 0 : framePaths.length,
      frames: dropFrames ? [] : framePaths.map(p => ({ file: path.basename(p), ts: null })),
      snapshot: snapshotWritten ? 'snapshot.json' : null,
      diagnostics: diagnosticsWritten ? 'diagnostics.json' : null,
      clip: clipGenerated ? 'failure.mp4' : null,
      clip_fps: clipGenerated ? (clipOptions.fps ?? 8) : null,
      metadata: metadata ?? {},
      frames_redacted: !dropFrames && Boolean(this.options.onBeforePersist),
      frames_dropped: dropFrames,
    };
    await writeJsonAtomic(path.join(runDir, 'manifest.json'), manifest);

    this.persisted = true;
    return runDir;
  }

  async cleanup(): Promise<void> {
    await fs.promises.rm(this.tempDir, { recursive: true, force: true });
  }

  /**
   * Upload persisted artifacts to cloud storage.
   *
   * This method uploads all artifacts from a persisted directory to cloud storage
   * using presigned URLs from the gateway. It follows the same pattern as trace
   * screenshot uploads.
   *
   * @param apiKey - Sentience API key for authentication
   * @param apiUrl - Sentience API base URL (default: https://api.sentienceapi.com)
   * @param persistedDir - Path to persisted artifacts directory. If undefined, uses the
   *                       most recent persist() output directory.
   * @param logger - Optional logger for progress/error messages
   * @returns artifact_index_key on success, null on failure
   *
   * @example
   * const buf = new FailureArtifactBuffer('run-123', options);
   * await buf.addFrame(screenshotBytes);
   * const runDir = await buf.persist('assertion failed', 'failure');
   * const artifactKey = await buf.uploadToCloud('sk-...');
   * // artifactKey can be passed to /v1/traces/complete
   */
  async uploadToCloud(
    apiKey: string,
    apiUrl?: string,
    persistedDir?: string,
    logger?: SentienceLogger
  ): Promise<string | null> {
    const baseUrl = apiUrl || SENTIENCE_API_URL;

    // Determine which directory to upload
    let targetDir = persistedDir;
    if (!targetDir) {
      // Find most recent persisted directory
      const outputDir = this.options.outputDir;
      if (!fs.existsSync(outputDir)) {
        logger?.warn('No artifacts directory found');
        return null;
      }

      // Look for directories matching runId pattern
      const entries = fs.readdirSync(outputDir, { withFileTypes: true });
      const matchingDirs = entries
        .filter(e => e.isDirectory() && e.name.startsWith(this.runId))
        .map(e => ({
          name: e.name,
          path: path.join(outputDir, e.name),
          mtime: fs.statSync(path.join(outputDir, e.name)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (matchingDirs.length === 0) {
        logger?.warn(`No persisted artifacts found for runId=${this.runId}`);
        return null;
      }
      targetDir = matchingDirs[0].path;
    }

    if (!fs.existsSync(targetDir)) {
      logger?.warn(`Artifacts directory not found: ${targetDir}`);
      return null;
    }

    // Read manifest to understand what files need uploading
    const manifestPath = path.join(targetDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      logger?.warn('manifest.json not found in artifacts directory');
      return null;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Build list of artifacts to upload
    const artifacts = this.collectArtifactsForUpload(targetDir, manifest);
    if (artifacts.length === 0) {
      logger?.warn('No artifacts to upload');
      return null;
    }

    logger?.info(`Uploading ${artifacts.length} artifact(s) to cloud`);

    // Request presigned URLs from gateway
    const uploadUrls = await this.requestArtifactUrls(apiKey, baseUrl, artifacts, logger);
    if (!uploadUrls) {
      return null;
    }

    // Upload artifacts in parallel
    const artifactIndexKey = await this.uploadArtifacts(artifacts, uploadUrls, logger);

    if (artifactIndexKey) {
      // Report completion to gateway
      await this.completeArtifacts(apiKey, baseUrl, artifactIndexKey, artifacts, logger);
    }

    return artifactIndexKey;
  }

  private collectArtifactsForUpload(
    persistedDir: string,
    manifest: any
  ): Array<{ name: string; sizeBytes: number; contentType: string; filePath: string }> {
    const artifacts: Array<{
      name: string;
      sizeBytes: number;
      contentType: string;
      filePath: string;
    }> = [];

    // Core JSON artifacts
    const jsonFiles = ['manifest.json', 'steps.json'];
    if (manifest.snapshot) {
      jsonFiles.push('snapshot.json');
    }
    if (manifest.diagnostics) {
      jsonFiles.push('diagnostics.json');
    }

    for (const filename of jsonFiles) {
      const filePath = path.join(persistedDir, filename);
      if (fs.existsSync(filePath)) {
        artifacts.push({
          name: filename,
          sizeBytes: fs.statSync(filePath).size,
          contentType: 'application/json',
          filePath,
        });
      }
    }

    // Video clip
    if (manifest.clip) {
      const clipPath = path.join(persistedDir, 'failure.mp4');
      if (fs.existsSync(clipPath)) {
        artifacts.push({
          name: 'failure.mp4',
          sizeBytes: fs.statSync(clipPath).size,
          contentType: 'video/mp4',
          filePath: clipPath,
        });
      }
    }

    // Frames
    const framesDir = path.join(persistedDir, 'frames');
    if (fs.existsSync(framesDir)) {
      const frameFiles = fs.readdirSync(framesDir).sort();
      for (const frameFile of frameFiles) {
        const ext = path.extname(frameFile).toLowerCase();
        if (['.jpeg', '.jpg', '.png'].includes(ext)) {
          const framePath = path.join(framesDir, frameFile);
          const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
          artifacts.push({
            name: `frames/${frameFile}`,
            sizeBytes: fs.statSync(framePath).size,
            contentType,
            filePath: framePath,
          });
        }
      }
    }

    return artifacts;
  }

  private async requestArtifactUrls(
    apiKey: string,
    apiUrl: string,
    artifacts: Array<{ name: string; sizeBytes: number; contentType: string; filePath: string }>,
    logger?: SentienceLogger
  ): Promise<ArtifactsInitResponse | null> {
    try {
      // Prepare request payload (exclude local path)
      const artifactsPayload = artifacts.map(a => ({
        name: a.name,
        size_bytes: a.sizeBytes,
        content_type: a.contentType,
      }));

      const body = JSON.stringify({
        run_id: this.runId,
        artifacts: artifactsPayload,
      });

      return new Promise(resolve => {
        const url = new URL(`${apiUrl}/v1/traces/artifacts/init`);
        const protocol = url.protocol === 'https:' ? https : http;

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 30000,
        };

        const req = protocol.request(options, res => {
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve(JSON.parse(data));
              } catch {
                logger?.warn('Failed to parse artifact upload URLs response');
                resolve(null);
              }
            } else {
              logger?.warn(`Failed to get artifact upload URLs: HTTP ${res.statusCode}`);
              resolve(null);
            }
          });
        });

        req.on('error', error => {
          logger?.error(`Error requesting artifact upload URLs: ${error.message}`);
          resolve(null);
        });

        req.on('timeout', () => {
          req.destroy();
          logger?.warn('Artifact URLs request timeout');
          resolve(null);
        });

        req.write(body);
        req.end();
      });
    } catch (error: any) {
      logger?.error(`Error requesting artifact upload URLs: ${error.message}`);
      return null;
    }
  }

  private async uploadArtifacts(
    artifacts: Array<{ name: string; sizeBytes: number; contentType: string; filePath: string }>,
    uploadUrls: ArtifactsInitResponse,
    logger?: SentienceLogger
  ): Promise<string | null> {
    const urlMap = new Map<string, { name: string; upload_url: string; storage_key: string }>();
    for (const item of uploadUrls.upload_urls) {
      urlMap.set(item.name, item);
    }
    const indexUpload = uploadUrls.artifact_index_upload;

    const storageKeys = new Map<string, string>();
    const uploadPromises: Promise<{ name: string; success: boolean }>[] = [];

    for (const artifact of artifacts) {
      const urlInfo = urlMap.get(artifact.name);
      if (!urlInfo) {
        continue;
      }

      const uploadPromise = this.uploadSingleArtifact(artifact, urlInfo, logger).then(success => ({
        name: artifact.name,
        success,
      }));
      uploadPromises.push(uploadPromise);
    }

    // Wait for all uploads
    const results = await Promise.all(uploadPromises);

    let uploadedCount = 0;
    const failedNames: string[] = [];

    for (const result of results) {
      if (result.success) {
        uploadedCount++;
        const urlInfo = urlMap.get(result.name);
        if (urlInfo?.storage_key) {
          storageKeys.set(result.name, urlInfo.storage_key);
        }
      } else {
        failedNames.push(result.name);
      }
    }

    if (uploadedCount === artifacts.length) {
      logger?.info(`All ${uploadedCount} artifacts uploaded successfully`);
    } else {
      logger?.warn(
        `Uploaded ${uploadedCount}/${artifacts.length} artifacts. Failed: ${failedNames.join(', ')}`
      );
    }

    // Upload artifact index file
    if (indexUpload && uploadedCount > 0) {
      return this.uploadArtifactIndex(artifacts, storageKeys, indexUpload, logger);
    }

    return null;
  }

  private async uploadSingleArtifact(
    artifact: { name: string; sizeBytes: number; contentType: string; filePath: string },
    urlInfo: any,
    logger?: SentienceLogger
  ): Promise<boolean> {
    try {
      const data = fs.readFileSync(artifact.filePath);

      return new Promise(resolve => {
        const url = new URL(urlInfo.upload_url);
        const protocol = url.protocol === 'https:' ? https : http;

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'PUT',
          headers: {
            'Content-Type': artifact.contentType,
            'Content-Length': data.length,
          },
          timeout: 60000,
        };

        const req = protocol.request(options, res => {
          res.on('data', () => {});
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve(true);
            } else {
              logger?.warn(`Artifact ${artifact.name} upload failed: HTTP ${res.statusCode}`);
              resolve(false);
            }
          });
        });

        req.on('error', error => {
          logger?.warn(`Artifact ${artifact.name} upload error: ${error.message}`);
          resolve(false);
        });

        req.on('timeout', () => {
          req.destroy();
          logger?.warn(`Artifact ${artifact.name} upload timeout`);
          resolve(false);
        });

        req.write(data);
        req.end();
      });
    } catch (error: any) {
      logger?.warn(`Artifact ${artifact.name} upload error: ${error.message}`);
      return false;
    }
  }

  private async uploadArtifactIndex(
    artifacts: Array<{ name: string; sizeBytes: number; contentType: string; filePath: string }>,
    storageKeys: Map<string, string>,
    indexUpload: any,
    logger?: SentienceLogger
  ): Promise<string | null> {
    try {
      // Build index content
      const indexData = {
        run_id: this.runId,
        created_at_ms: Date.now(),
        artifacts: artifacts
          .filter(a => storageKeys.has(a.name))
          .map(a => ({
            name: a.name,
            storage_key: storageKeys.get(a.name) || '',
            content_type: a.contentType,
          })),
      };

      // Compress and upload
      const indexJson = Buffer.from(JSON.stringify(indexData, null, 2), 'utf-8');
      const compressed = zlib.gzipSync(indexJson);

      return new Promise(resolve => {
        const url = new URL(indexUpload.upload_url);
        const protocol = url.protocol === 'https:' ? https : http;

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Content-Encoding': 'gzip',
            'Content-Length': compressed.length,
          },
          timeout: 30000,
        };

        const req = protocol.request(options, res => {
          res.on('data', () => {});
          res.on('end', () => {
            if (res.statusCode === 200) {
              logger?.info('Artifact index uploaded successfully');
              resolve(indexUpload.storage_key || '');
            } else {
              logger?.warn(`Artifact index upload failed: HTTP ${res.statusCode}`);
              resolve(null);
            }
          });
        });

        req.on('error', error => {
          logger?.warn(`Error uploading artifact index: ${error.message}`);
          resolve(null);
        });

        req.on('timeout', () => {
          req.destroy();
          logger?.warn('Artifact index upload timeout');
          resolve(null);
        });

        req.write(compressed);
        req.end();
      });
    } catch (error: any) {
      logger?.warn(`Error uploading artifact index: ${error.message}`);
      return null;
    }
  }

  private async completeArtifacts(
    apiKey: string,
    apiUrl: string,
    artifactIndexKey: string,
    artifacts: Array<{ name: string; sizeBytes: number; contentType: string; filePath: string }>,
    logger?: SentienceLogger
  ): Promise<void> {
    try {
      // Calculate stats
      const totalSize = artifacts.reduce((sum, a) => sum + a.sizeBytes, 0);
      const framesArtifacts = artifacts.filter(a => a.name.startsWith('frames/'));
      const framesTotal = framesArtifacts.reduce((sum, a) => sum + a.sizeBytes, 0);

      // Get individual file sizes
      const manifestSize = artifacts.find(a => a.name === 'manifest.json')?.sizeBytes || 0;
      const snapshotSize = artifacts.find(a => a.name === 'snapshot.json')?.sizeBytes || 0;
      const diagnosticsSize = artifacts.find(a => a.name === 'diagnostics.json')?.sizeBytes || 0;
      const stepsSize = artifacts.find(a => a.name === 'steps.json')?.sizeBytes || 0;
      const clipSize = artifacts.find(a => a.name === 'failure.mp4')?.sizeBytes || 0;

      const body = JSON.stringify({
        run_id: this.runId,
        artifact_index_key: artifactIndexKey,
        stats: {
          manifest_size_bytes: manifestSize,
          snapshot_size_bytes: snapshotSize,
          diagnostics_size_bytes: diagnosticsSize,
          steps_size_bytes: stepsSize,
          clip_size_bytes: clipSize,
          frames_total_size_bytes: framesTotal,
          frames_count: framesArtifacts.length,
          total_artifact_size_bytes: totalSize,
        },
      });

      return new Promise(resolve => {
        const url = new URL(`${apiUrl}/v1/traces/artifacts/complete`);
        const protocol = url.protocol === 'https:' ? https : http;

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 10000,
        };

        const req = protocol.request(options, res => {
          res.on('data', () => {});
          res.on('end', () => {
            if (res.statusCode === 200) {
              logger?.info('Artifact completion reported to gateway');
            } else {
              logger?.warn(`Failed to report artifact completion: HTTP ${res.statusCode}`);
            }
            resolve();
          });
        });

        req.on('error', error => {
          logger?.warn(`Error reporting artifact completion: ${error.message}`);
          resolve();
        });

        req.on('timeout', () => {
          req.destroy();
          logger?.warn('Artifact completion request timeout');
          resolve();
        });

        req.write(body);
        req.end();
      });
    } catch (error: any) {
      logger?.warn(`Error reporting artifact completion: ${error.message}`);
    }
  }
}
