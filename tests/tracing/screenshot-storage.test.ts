/**
 * Tests for screenshot storage and upload in CloudTraceSink
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CloudTraceSink, SentienceLogger } from '../../src/tracing/cloud-sink';
import { ScreenshotMetadata } from '../../src/types';

// Mock logger for testing
class MockLogger implements SentienceLogger {
  public logs: string[] = [];

  info(message: string): void {
    this.logs.push(`[INFO] ${message}`);
  }

  warn(message: string): void {
    this.logs.push(`[WARN] ${message}`);
  }

  error(message: string): void {
    this.logs.push(`[ERROR] ${message}`);
  }
}

describe('Screenshot Storage', () => {
  let uploadUrl: string;
  let runId: string;
  let cacheDir: string;

  beforeEach(() => {
    uploadUrl = 'https://sentience.nyc3.digitaloceanspaces.com/user123/run456/trace.jsonl.gz';
    runId = `test-screenshot-${Date.now()}`;
    cacheDir = path.join(os.homedir(), '.sentience', 'traces', 'pending');
  });

  afterEach(() => {
    // Cleanup test files
    const tracePath = path.join(cacheDir, `${runId}.jsonl`);
    const screenshotDir = path.join(cacheDir, `${runId}_screenshots`);
    
    if (fs.existsSync(tracePath)) {
      fs.unlinkSync(tracePath);
    }
    
    if (fs.existsSync(screenshotDir)) {
      const files = fs.readdirSync(screenshotDir);
      for (const file of files) {
        fs.unlinkSync(path.join(screenshotDir, file));
      }
      fs.rmdirSync(screenshotDir);
    }
  });

  describe('storeScreenshot', () => {
    it('should create screenshot directory on initialization', () => {
      const sink = new CloudTraceSink(uploadUrl, runId);
      const screenshotDir = path.join(cacheDir, `${runId}_screenshots`);
      
      expect(fs.existsSync(screenshotDir)).toBe(true);
      
      sink.close(false);
    });

    it('should save screenshot to file', () => {
      // Create a test base64 image (1x1 PNG)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const testDataUrl = `data:image/png;base64,${testImageBase64}`;

      const sink = new CloudTraceSink(uploadUrl, runId);
      
      sink.storeScreenshot(1, testDataUrl, 'png', 'step_001');

      // Verify file was created
      const screenshotDir = path.join(cacheDir, `${runId}_screenshots`);
      const screenshotFile = path.join(screenshotDir, 'step_0001.png');
      
      expect(fs.existsSync(screenshotFile)).toBe(true);

      // Verify file content
      const fileData = fs.readFileSync(screenshotFile);
      const expectedData = Buffer.from(testImageBase64, 'base64');
      expect(fileData).toEqual(expectedData);

      sink.close(false);
    });

    it('should track metadata correctly', () => {
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const testDataUrl = `data:image/png;base64,${testImageBase64}`;

      const sink = new CloudTraceSink(uploadUrl, runId);
      sink.storeScreenshot(1, testDataUrl, 'png', 'step_001');

      // Access private metadata via type assertion
      const metadata = (sink as any).screenshotMetadata.get(1) as ScreenshotMetadata;
      
      expect(metadata).toBeDefined();
      expect(metadata.sequence).toBe(1);
      expect(metadata.format).toBe('png');
      expect(metadata.stepId).toBe('step_001');
      expect(metadata.sizeBytes).toBeGreaterThan(0);

      sink.close(false);
    });

    it('should update size counter', () => {
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const testDataUrl = `data:image/png;base64,${testImageBase64}`;

      const sink = new CloudTraceSink(uploadUrl, runId);
      const initialSize = (sink as any).screenshotTotalSizeBytes;

      sink.storeScreenshot(1, testDataUrl, 'png');
      const sizeAfterFirst = (sink as any).screenshotTotalSizeBytes;
      expect(sizeAfterFirst).toBeGreaterThan(initialSize);

      sink.storeScreenshot(2, testDataUrl, 'png');
      const sizeAfterSecond = (sink as any).screenshotTotalSizeBytes;
      expect(sizeAfterSecond).toBeGreaterThan(sizeAfterFirst);

      sink.close(false);
    });

    it('should handle JPEG format', () => {
      // Minimal JPEG in base64 (1x1 JPEG)
      const testJpegBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wA=';
      const testDataUrl = `data:image/jpeg;base64,${testJpegBase64}`;

      const sink = new CloudTraceSink(uploadUrl, runId);
      sink.storeScreenshot(1, testDataUrl, 'jpeg');

      // Verify file was created with .jpeg extension
      const screenshotDir = path.join(cacheDir, `${runId}_screenshots`);
      const screenshotFile = path.join(screenshotDir, 'step_0001.jpeg');
      expect(fs.existsSync(screenshotFile)).toBe(true);

      // Verify metadata format
      const metadata = (sink as any).screenshotMetadata.get(1) as ScreenshotMetadata;
      expect(metadata.format).toBe('jpeg');

      sink.close(false);
    });

    it('should handle base64 without prefix', () => {
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const sink = new CloudTraceSink(uploadUrl, runId);
      sink.storeScreenshot(1, testImageBase64, 'png');

      // Verify file was created
      const screenshotDir = path.join(cacheDir, `${runId}_screenshots`);
      const screenshotFile = path.join(screenshotDir, 'step_0001.png');
      expect(fs.existsSync(screenshotFile)).toBe(true);

      sink.close(false);
    });

    it('should raise error when closed', () => {
      const sink = new CloudTraceSink(uploadUrl, runId);
      sink.close();

      const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      expect(() => {
        sink.storeScreenshot(1, testDataUrl, 'png');
      }).toThrow('CloudTraceSink is closed');
    });

    it('should handle errors gracefully', () => {
      const logger = new MockLogger();
      const sink = new CloudTraceSink(uploadUrl, runId, undefined, undefined, logger);

      // Try to store invalid base64 (should not crash)
      sink.storeScreenshot(1, 'invalid_base64_data!!!', 'png');

      // Verify error was logged but didn't crash
      const errorLogs = logger.logs.filter(log => log.includes('ERROR') || log.includes('Failed'));
      expect(errorLogs.length).toBeGreaterThan(0);

      sink.close(false);
    });
  });

  describe('_requestScreenshotUrls', () => {
    it('should request URLs from gateway', async () => {
      const apiKey = 'sk_test_123';
      const sink = new CloudTraceSink(uploadUrl, runId, apiKey);

      // Mock HTTP request
      const originalRequest = require('https').request;
      const mockUrls = {
        '1': 'https://sentience.nyc3.digitaloceanspaces.com/user123/run456/screenshots/step_0001.png?signature=...',
        '2': 'https://sentience.nyc3.digitaloceanspaces.com/user123/run456/screenshots/step_0002.png?signature=...',
      };

      let requestCalled = false;
      require('https').request = jest.fn((options: any, callback: any) => {
        requestCalled = true;
        const mockRes = {
          statusCode: 200,
          on: jest.fn((event: string, handler: any) => {
            if (event === 'data') {
              handler(JSON.stringify({ upload_urls: mockUrls }));
            } else if (event === 'end') {
              handler();
            }
          }),
        };
        setTimeout(() => callback(mockRes), 0);
        return {
          write: jest.fn(),
          end: jest.fn(),
          on: jest.fn(),
        };
      });

      const result = await (sink as any)._requestScreenshotUrls([1, 2]);

      expect(requestCalled).toBe(true);
      expect(result.size).toBe(2);
      expect(result.get(1)).toBe(mockUrls['1']);
      expect(result.get(2)).toBe(mockUrls['2']);

      require('https').request = originalRequest;
      sink.close(false);
    });

    it('should return empty map on failure', async () => {
      const apiKey = 'sk_test_123';
      const sink = new CloudTraceSink(uploadUrl, runId, apiKey);

      // Mock HTTP request with failure
      const originalRequest = require('https').request;
      require('https').request = jest.fn((options: any, callback: any) => {
        const mockRes = {
          statusCode: 500,
          on: jest.fn((event: string, handler: any) => {
            if (event === 'end') {
              handler();
            }
          }),
        };
        setTimeout(() => callback(mockRes), 0);
        return {
          write: jest.fn(),
          end: jest.fn(),
          on: jest.fn(),
        };
      });

      const result = await (sink as any)._requestScreenshotUrls([1, 2]);

      expect(result.size).toBe(0);

      require('https').request = originalRequest;
      sink.close(false);
    });
  });

  describe('_cleanupFiles', () => {
    it('should delete screenshot directory on successful upload', async () => {
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const testDataUrl = `data:image/png;base64,${testImageBase64}`;

      const sink = new CloudTraceSink(uploadUrl, runId);
      sink.storeScreenshot(1, testDataUrl, 'png');

      // Mark as successful and cleanup
      (sink as any).uploadSuccessful = true;
      await (sink as any)._cleanupFiles();

      // Verify screenshot directory was deleted
      const screenshotDir = path.join(cacheDir, `${runId}_screenshots`);
      expect(fs.existsSync(screenshotDir)).toBe(false);
    });
  });
});

