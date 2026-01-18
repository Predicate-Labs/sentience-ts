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

    const runDir = await buf.persist('assert_failed', 'failure');
    expect(runDir).toBeTruthy();
    const manifest = JSON.parse(
      fs.readFileSync(path.join(runDir as string, 'manifest.json'), 'utf-8')
    );
    const steps = JSON.parse(fs.readFileSync(path.join(runDir as string, 'steps.json'), 'utf-8'));
    expect(manifest.run_id).toBe('run-2');
    expect(manifest.frame_count).toBe(1);
    expect(steps.length).toBe(1);
  });
});
