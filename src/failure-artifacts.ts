import fs from 'fs';
import os from 'os';
import path from 'path';

export type PersistMode = 'onFail' | 'always';

export interface FailureArtifactsOptions {
  bufferSeconds?: number;
  captureOnAction?: boolean;
  fps?: number;
  persistMode?: PersistMode;
  outputDir?: string;
}

interface FrameRecord {
  ts: number;
  fileName: string;
  filePath: string;
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

  async persist(reason: string | null, status: 'failure' | 'success'): Promise<string | null> {
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

    await fs.promises.writeFile(
      path.join(runDir, 'steps.json'),
      JSON.stringify(this.steps, null, 2)
    );

    const manifest = {
      run_id: this.runId,
      created_at_ms: ts,
      status,
      reason,
      buffer_seconds: this.options.bufferSeconds,
      frame_count: this.frames.length,
      frames: this.frames.map(frame => ({ file: frame.fileName, ts: frame.ts })),
    };
    await fs.promises.writeFile(
      path.join(runDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    this.persisted = true;
    return runDir;
  }

  async cleanup(): Promise<void> {
    await fs.promises.rm(this.tempDir, { recursive: true, force: true });
  }
}
