/**
 * Tests for video recording functionality
 */

import { SentienceBrowser } from '../src';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('video recording', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should record video with basic setup', async () => {
    const videoDir = path.join(tempDir, 'recordings');

    const browser = new SentienceBrowser(
      undefined,
      undefined,
      true, // headless
      undefined,
      undefined,
      undefined,
      videoDir
    );

    await browser.start();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('domcontentloaded');

      const videoPath = await browser.close();

      // Verify video was created
      expect(videoPath).toBeTruthy();
      expect(videoPath).toMatch(/\.webm$/);
      expect(fs.existsSync(videoPath!)).toBe(true);

      // Verify file has content
      const stats = fs.statSync(videoPath!);
      expect(stats.size).toBeGreaterThan(0);
    } catch (error) {
      await browser.close();
      throw error;
    }
  });

  it('should record video with custom resolution', async () => {
    const videoDir = path.join(tempDir, 'recordings');

    const browser = new SentienceBrowser(
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      undefined,
      videoDir,
      { width: 1920, height: 1080 }
    );

    await browser.start();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('domcontentloaded');

      const videoPath = await browser.close();

      expect(videoPath).toBeTruthy();
      expect(fs.existsSync(videoPath!)).toBe(true);
    } catch (error) {
      await browser.close();
      throw error;
    }
  });

  it('should rename video to custom output path', async () => {
    const videoDir = path.join(tempDir, 'recordings');
    const customPath = path.join(videoDir, 'my_recording.webm');

    const browser = new SentienceBrowser(
      undefined, undefined, true, undefined, undefined, undefined,
      videoDir
    );

    await browser.start();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('domcontentloaded');

      const videoPath = await browser.close(customPath);

      // Verify video was renamed to custom path
      expect(videoPath).toBe(customPath);
      expect(fs.existsSync(customPath)).toBe(true);
    } catch (error) {
      await browser.close();
      throw error;
    }
  });

  it('should create nested directories for output path', async () => {
    const videoDir = path.join(tempDir, 'recordings');
    const nestedPath = path.join(videoDir, 'project', 'tutorials', 'video1.webm');

    const browser = new SentienceBrowser(
      undefined, undefined, true, undefined, undefined, undefined,
      videoDir
    );

    await browser.start();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('domcontentloaded');

      const videoPath = await browser.close(nestedPath);

      // Verify nested directories were created
      expect(videoPath).toBe(nestedPath);
      expect(fs.existsSync(nestedPath)).toBe(true);
      expect(fs.existsSync(path.dirname(nestedPath))).toBe(true);
    } catch (error) {
      await browser.close();
      throw error;
    }
  });

  it('should return null when recording is disabled', async () => {
    const browser = new SentienceBrowser(undefined, undefined, true);

    await browser.start();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('domcontentloaded');

      const videoPath = await browser.close();

      // Should return null when recording is disabled
      expect(videoPath).toBeNull();
    } catch (error) {
      await browser.close();
      throw error;
    }
  });

  it('should auto-create video directory', async () => {
    // Use a non-existent directory
    const videoDir = path.join(tempDir, 'new_recordings', 'subdir');

    const browser = new SentienceBrowser(
      undefined, undefined, true, undefined, undefined, undefined,
      videoDir
    );

    await browser.start();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('domcontentloaded');

      const videoPath = await browser.close();

      // Verify directory was created
      expect(fs.existsSync(videoDir)).toBe(true);
      expect(videoPath).toBeTruthy();
      expect(fs.existsSync(videoPath!)).toBe(true);
    } catch (error) {
      await browser.close();
      throw error;
    }
  });

  it('should create multiple video recordings in sequence', async () => {
    const videoDir = path.join(tempDir, 'recordings');
    const videoPaths: string[] = [];

    // Create 3 video recordings
    for (let i = 0; i < 3; i++) {
      const browser = new SentienceBrowser(
        undefined, undefined, true, undefined, undefined, undefined,
        videoDir
      );

      await browser.start();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        const outputPath = path.join(videoDir, `video_${i}.webm`);
        const videoPath = await browser.close(outputPath);

        expect(videoPath).toBe(outputPath);
        videoPaths.push(videoPath!);
      } catch (error) {
        await browser.close();
        throw error;
      }
    }

    // Verify all videos were created
    for (const videoPath of videoPaths) {
      expect(fs.existsSync(videoPath)).toBe(true);
    }
  });

  it('should use default resolution of 1280x800', () => {
    const browser = new SentienceBrowser(
      undefined, undefined, true, undefined, undefined, undefined,
      path.join(tempDir, 'recordings')
    );

    // Verify default resolution
    expect(browser['_recordVideoSize']).toEqual({ width: 1280, height: 800 });
  });

  it('should handle video recording with various resolutions', async () => {
    const resolutions = [
      { width: 1280, height: 720 },   // 720p
      { width: 1920, height: 1080 },  // 1080p
      { width: 2560, height: 1440 },  // 1440p
    ];

    for (const resolution of resolutions) {
      const videoDir = path.join(tempDir, `recordings_${resolution.width}x${resolution.height}`);

      const browser = new SentienceBrowser(
        undefined, undefined, true, undefined, undefined, undefined,
        videoDir,
        resolution
      );

      await browser.start();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        const videoPath = await browser.close();

        expect(videoPath).toBeTruthy();
        expect(fs.existsSync(videoPath!)).toBe(true);
      } catch (error) {
        await browser.close();
        throw error;
      }
    }
  });
});
