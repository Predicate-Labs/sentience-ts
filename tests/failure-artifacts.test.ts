import fs from 'fs';
import os from 'os';
import path from 'path';
import { FailureArtifactBuffer } from '../src/failure-artifacts';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('FailureArtifactBuffer', () => {
  it('prunes frames by time window', async () => {
    const tmp = makeTempDir('sentience-test-');
    const now = { t: 0 };
    const timeNow = () => now.t;
    const buf = new FailureArtifactBuffer('run-1', { bufferSeconds: 1, outputDir: tmp }, timeNow);

    await buf.addFrame(Buffer.from('one'), 'png');
    expect(buf.frameCount()).toBe(1);

    now.t = 2000;
    await buf.addFrame(Buffer.from('two'), 'png');
    expect(buf.frameCount()).toBe(1);
  });

  it('persists manifest and steps', async () => {
    const tmp = makeTempDir('sentience-test-');
    const now = { t: 1000 };
    const timeNow = () => now.t;
    const buf = new FailureArtifactBuffer('run-2', { outputDir: tmp }, timeNow);

    buf.recordStep('CLICK', 's1', 1, 'https://example.com');
    await buf.addFrame(Buffer.from('frame'), 'png');

    const snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [
        { id: 1, input_type: 'password', value: 'secret' },
        { id: 2, input_type: 'email', value: 'user@example.com' },
      ],
    };
    const diagnostics = { confidence: 0.8, reasons: ['ok'], metrics: { quiet_ms: 10 } };
    const runDir = await buf.persist('assert_failed', 'failure', snapshot, diagnostics, {
      backend: 'MockBackend',
      url: 'https://example.com',
    });
    expect(runDir).toBeTruthy();
    const manifest = JSON.parse(
      fs.readFileSync(path.join(runDir as string, 'manifest.json'), 'utf-8')
    );
    const steps = JSON.parse(fs.readFileSync(path.join(runDir as string, 'steps.json'), 'utf-8'));
    const snapJson = JSON.parse(
      fs.readFileSync(path.join(runDir as string, 'snapshot.json'), 'utf-8')
    );
    const diagJson = JSON.parse(
      fs.readFileSync(path.join(runDir as string, 'diagnostics.json'), 'utf-8')
    );
    expect(manifest.run_id).toBe('run-2');
    expect(manifest.frame_count).toBe(1);
    expect(manifest.snapshot).toBe('snapshot.json');
    expect(manifest.diagnostics).toBe('diagnostics.json');
    expect(manifest.metadata.backend).toBe('MockBackend');
    expect(steps.length).toBe(1);
    expect(snapJson.url).toBe('https://example.com');
    expect(diagJson.confidence).toBe(0.8);
    expect(snapJson.elements[0].value).toBeNull();
    expect(snapJson.elements[0].value_redacted).toBe(true);
    expect(snapJson.elements[1].value).toBeNull();
    expect(snapJson.elements[1].value_redacted).toBe(true);
  });

  it('allows redaction callback to drop frames', async () => {
    const tmp = makeTempDir('sentience-test-');
    const buf = new FailureArtifactBuffer('run-3', {
      outputDir: tmp,
      onBeforePersist: () => ({ dropFrames: true }),
    });
    await buf.addFrame(Buffer.from('frame'), 'png');
    const runDir = await buf.persist('fail', 'failure', { status: 'success' });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(runDir as string, 'manifest.json'), 'utf-8')
    );
    expect(manifest.frame_count).toBe(0);
    expect(manifest.frames_dropped).toBe(true);
  });

  // -------------------- Phase 4: Clip generation tests --------------------

  it('clip mode off skips generation', async () => {
    const tmp = makeTempDir('sentience-test-');
    const buf = new FailureArtifactBuffer('run-clip-off', {
      outputDir: tmp,
      clip: { mode: 'off' },
    });
    await buf.addFrame(Buffer.from('frame'), 'png');
    const runDir = await buf.persist('fail', 'failure');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(runDir as string, 'manifest.json'), 'utf-8')
    );
    expect(manifest.clip).toBeNull();
    expect(manifest.clip_fps).toBeNull();
  });

  it('manifest includes clip fields when frames exist', async () => {
    const tmp = makeTempDir('sentience-test-');
    // With clip.mode='auto' and ffmpeg likely not available in test env,
    // clip should be null but manifest should still include the fields
    const buf = new FailureArtifactBuffer('run-clip-auto', {
      outputDir: tmp,
      clip: { mode: 'auto', fps: 10 },
    });
    await buf.addFrame(Buffer.from('frame'), 'png');
    const runDir = await buf.persist('fail', 'failure');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(runDir as string, 'manifest.json'), 'utf-8')
    );
    // clip and clip_fps fields should exist in manifest (even if null)
    expect('clip' in manifest).toBe(true);
    expect('clip_fps' in manifest).toBe(true);
  });

  it('clip not generated when frames are dropped', async () => {
    const tmp = makeTempDir('sentience-test-');
    const buf = new FailureArtifactBuffer('run-clip-dropped', {
      outputDir: tmp,
      clip: { mode: 'on' },
      onBeforePersist: () => ({ dropFrames: true }),
    });
    await buf.addFrame(Buffer.from('frame'), 'png');
    const runDir = await buf.persist('fail', 'failure');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(runDir as string, 'manifest.json'), 'utf-8')
    );
    expect(manifest.clip).toBeNull();
    expect(manifest.frames_dropped).toBe(true);
  });

  it('clip options use defaults when not specified', () => {
    const tmp = makeTempDir('sentience-test-');
    const buf = new FailureArtifactBuffer('run-defaults', { outputDir: tmp });
    const opts = buf.getOptions();
    expect(opts.clip.mode).toBe('auto');
    expect(opts.clip.fps).toBe(8);
    expect(opts.clip.seconds).toBeUndefined();
  });

  it('clip options can be customized', () => {
    const tmp = makeTempDir('sentience-test-');
    const buf = new FailureArtifactBuffer('run-custom', {
      outputDir: tmp,
      clip: { mode: 'on', fps: 15, seconds: 30 },
    });
    const opts = buf.getOptions();
    expect(opts.clip.mode).toBe('on');
    expect(opts.clip.fps).toBe(15);
    expect(opts.clip.seconds).toBe(30);
  });

  // -------------------- Phase 5: Cloud upload tests --------------------

  it('uploadToCloud returns null when no artifacts directory', async () => {
    const tmp = makeTempDir('sentience-test-');
    const buf = new FailureArtifactBuffer('run-upload-1', {
      outputDir: path.join(tmp, 'nonexistent'),
    });

    const result = await buf.uploadToCloud('test-key');
    expect(result).toBeNull();
  });

  it('uploadToCloud returns null when no manifest', async () => {
    const tmp = makeTempDir('sentience-test-');
    // Create a directory but no manifest
    const runDir = path.join(tmp, 'run-upload-2-123');
    fs.mkdirSync(runDir, { recursive: true });

    const buf = new FailureArtifactBuffer('run-upload-2', { outputDir: tmp });

    const result = await buf.uploadToCloud('test-key', undefined, runDir);
    expect(result).toBeNull();
  });

  it('collectArtifactsForUpload collects correct files', async () => {
    const tmp = makeTempDir('sentience-test-');
    const buf = new FailureArtifactBuffer('run-collect', { outputDir: tmp });
    await buf.addFrame(Buffer.from('frame1'), 'png');

    const runDir = await buf.persist('fail', 'failure', { status: 'success' }, { confidence: 0.9 });
    expect(runDir).toBeTruthy();

    // Read manifest
    const manifest = JSON.parse(fs.readFileSync(path.join(runDir!, 'manifest.json'), 'utf-8'));

    // Use private method to collect artifacts (access via any)
    const artifacts = (buf as any).collectArtifactsForUpload(runDir, manifest);

    // Should have: manifest.json, steps.json, snapshot.json, diagnostics.json, and 1 frame
    const artifactNames = artifacts.map((a: any) => a.name);
    expect(artifactNames).toContain('manifest.json');
    expect(artifactNames).toContain('steps.json');
    expect(artifactNames).toContain('snapshot.json');
    expect(artifactNames).toContain('diagnostics.json');
    expect(artifactNames.some((n: string) => n.startsWith('frames/'))).toBe(true);

    // Verify all files have valid properties
    for (const artifact of artifacts) {
      expect(fs.existsSync(artifact.filePath)).toBe(true);
      expect(artifact.sizeBytes).toBeGreaterThan(0);
      expect(['application/json', 'image/png', 'image/jpeg']).toContain(artifact.contentType);
    }
  });

  it('uploadToCloud handles missing frames gracefully', async () => {
    const tmp = makeTempDir('sentience-test-');
    const buf = new FailureArtifactBuffer('run-no-frames', { outputDir: tmp });

    // Persist without adding frames - should still work
    const runDir = await buf.persist('fail', 'failure', { status: 'success' });
    expect(runDir).toBeTruthy();

    const manifest = JSON.parse(fs.readFileSync(path.join(runDir!, 'manifest.json'), 'utf-8'));
    expect(manifest.frame_count).toBe(0);

    // Should still be able to collect artifacts (just no frames)
    const artifacts = (buf as any).collectArtifactsForUpload(runDir, manifest);
    const hasFrames = artifacts.some((a: any) => a.name.startsWith('frames/'));
    expect(hasFrames).toBe(false);
  });
});
