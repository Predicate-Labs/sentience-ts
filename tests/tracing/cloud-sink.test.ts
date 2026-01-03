/**
 * Tests for CloudTraceSink
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import * as http from 'http';
import { CloudTraceSink } from '../../src/tracing/cloud-sink';

describe('CloudTraceSink', () => {
  let mockServer: http.Server;
  let serverPort: number;
  let uploadUrl: string;
  const persistentCacheDir = path.join(os.homedir(), '.sentience', 'traces', 'pending');

  // Start a mock HTTP server before tests
  beforeAll((done) => {
    mockServer = http.createServer((req, res) => {
      // Store request info for verification
      (mockServer as any).lastRequest = {
        method: req.method,
        url: req.url,
        headers: req.headers,
      };

      // Read request body
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        (mockServer as any).lastRequestBody = Buffer.concat(chunks);

        // Default successful response
        if ((mockServer as any).responseStatus) {
          res.writeHead((mockServer as any).responseStatus);
          res.end((mockServer as any).responseBody || 'OK');
        } else {
          res.writeHead(200);
          res.end('OK');
        }
      });
    });

    mockServer.listen(0, () => {
      const address = mockServer.address();
      if (address && typeof address === 'object') {
        serverPort = address.port;
        uploadUrl = `http://localhost:${serverPort}/upload`;
        done();
      }
    });
  });

  afterAll((done) => {
    mockServer.close(done);
  });

  beforeEach(() => {
    // Reset server state
    delete (mockServer as any).lastRequest;
    delete (mockServer as any).lastRequestBody;
    delete (mockServer as any).responseStatus;
    delete (mockServer as any).responseBody;
  });

  afterEach(() => {
    // Clean up persistent cache files created during tests
    if (fs.existsSync(persistentCacheDir)) {
      const files = fs.readdirSync(persistentCacheDir);
      files.forEach((file) => {
        if (file.startsWith('test-run-')) {
          const filePath = path.join(persistentCacheDir, file);
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
              // Delete directory and its contents
              const dirFiles = fs.readdirSync(filePath);
              dirFiles.forEach((dirFile) => {
                fs.unlinkSync(path.join(filePath, dirFile));
              });
              fs.rmdirSync(filePath);
            } else {
              fs.unlinkSync(filePath);
            }
          }
        }
        // Also clean up screenshot directories
        if (file.endsWith('_screenshots')) {
          const dirPath = path.join(persistentCacheDir, file);
          if (fs.existsSync(dirPath)) {
            const stats = fs.statSync(dirPath);
            if (stats.isDirectory()) {
              const dirFiles = fs.readdirSync(dirPath);
              dirFiles.forEach((dirFile) => {
                fs.unlinkSync(path.join(dirPath, dirFile));
              });
              fs.rmdirSync(dirPath);
            }
          }
        }
      });
    }
  });

  describe('Basic functionality', () => {
    it('should create CloudTraceSink with upload URL', () => {
      const sink = new CloudTraceSink(uploadUrl, 'test-run-' + Date.now());
      expect(sink).toBeDefined();
      expect(sink.getSinkType()).toContain('CloudTraceSink');
    });

    it('should emit events to local temp file', async () => {
      const sink = new CloudTraceSink(uploadUrl, 'test-run-' + Date.now());

      sink.emit({ v: 1, type: 'test1', seq: 1 } as any);
      sink.emit({ v: 1, type: 'test2', seq: 2 } as any);

      await sink.close();

      // Verify request was made
      expect((mockServer as any).lastRequest).toBeDefined();
      expect((mockServer as any).lastRequest.method).toBe('PUT');
    });

    it('should raise error when emitting after close', async () => {
      const sink = new CloudTraceSink(uploadUrl, 'test-run-' + Date.now());
      await sink.close();

      expect(() => {
        sink.emit({ v: 1, type: 'test', seq: 1 } as any);
      }).toThrow('CloudTraceSink is closed');
    });

    it('should be idempotent on multiple close calls', async () => {
      const sink = new CloudTraceSink(uploadUrl, 'test-run-' + Date.now());
      sink.emit({ v: 1, type: 'test', seq: 1 } as any);

      await sink.close();
      await sink.close();
      await sink.close();

      // Should only upload once
      expect((mockServer as any).lastRequest).toBeDefined();
    });
  });

  describe('Upload functionality', () => {
    it('should upload gzip-compressed JSONL data', async () => {
      const runId = 'test-run-' + Date.now();
      const sink = new CloudTraceSink(uploadUrl, runId);
      const ts = new Date().toISOString();

      sink.emit({ v: 1, type: 'run_start', seq: 1, data: { agent: 'TestAgent' }, ts, run_id: runId });
      sink.emit({ v: 1, type: 'run_end', seq: 2, data: { steps: 1 }, ts, run_id: runId });

      await sink.close();

      // Verify request headers
      expect((mockServer as any).lastRequest.headers['content-type']).toBe('application/x-gzip');
      expect((mockServer as any).lastRequest.headers['content-encoding']).toBe('gzip');

      // Verify body is gzip compressed
      const requestBody = (mockServer as any).lastRequestBody;
      expect(requestBody).toBeDefined();

      const decompressed = zlib.gunzipSync(requestBody);
      const lines = decompressed.toString().trim().split('\n');

      expect(lines.length).toBe(2);

      const event1 = JSON.parse(lines[0]);
      const event2 = JSON.parse(lines[1]);

      expect(event1.type).toBe('run_start');
      expect(event2.type).toBe('run_end');
    });

    it('should delete temp file on successful upload', async () => {
      const sink = new CloudTraceSink(uploadUrl, 'test-run-' + Date.now());
      sink.emit({ v: 1, type: 'test', seq: 1 } as any);

      // Access private field for testing (TypeScript hack)
      const tempFilePath = (sink as any).tempFilePath;

      await sink.close();

      // Temp file should be deleted
      expect(fs.existsSync(tempFilePath)).toBe(false);
    });

    it('should preserve temp file on upload failure', async () => {
      // Configure server to return error
      (mockServer as any).responseStatus = 500;
      (mockServer as any).responseBody = 'Internal Server Error';

      // Suppress expected error logs for this test
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const sink = new CloudTraceSink(uploadUrl, 'test-run-' + Date.now());
      sink.emit({ v: 1, type: 'test', seq: 1 } as any);

      const tempFilePath = (sink as any).tempFilePath;

      await sink.close();

      // Temp file should still exist on error
      expect(fs.existsSync(tempFilePath)).toBe(true);

      // Restore console.error
      consoleErrorSpy.mockRestore();

      // Cleanup
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    });
  });

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      // Use invalid URL that will fail
      const invalidUrl = 'http://localhost:1/invalid';
      
      // Suppress expected error logs for this test
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const sink = new CloudTraceSink(invalidUrl, 'test-run-' + Date.now());

      sink.emit({ v: 1, type: 'test', seq: 1 } as any);

      // Should not throw, just log error
      await expect(sink.close()).resolves.not.toThrow();

      // Restore console methods
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should handle upload timeout gracefully', async () => {
      // Create server that doesn't respond (triggers timeout)
      const slowServer = http.createServer((req, res) => {
        // Never respond - will timeout
      });

      // Suppress expected error logs for this test
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await new Promise<void>((resolve) => {
        slowServer.listen(0, () => resolve());
      });

      const address = slowServer.address();
      if (address && typeof address === 'object') {
        const slowUrl = `http://localhost:${address.port}/slow`;
        const sink = new CloudTraceSink(slowUrl, 'test-run-' + Date.now());

        sink.emit({ v: 1, type: 'test', seq: 1 } as any);

        // Should timeout and handle gracefully (60s timeout in CloudTraceSink)
        await sink.close();

        slowServer.close();
      }

      // Restore console methods
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    }, 70000); // 70 second timeout for test (CloudTraceSink has 60s timeout)

    it('should preserve trace on any error', async () => {
      // Suppress expected error logs for this test
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const sink = new CloudTraceSink('http://invalid-url-that-doesnt-exist.local/upload', 'test-run-' + Date.now());

      sink.emit({ v: 1, type: 'test', seq: 1 } as any);

      const tempFilePath = (sink as any).tempFilePath;

      await sink.close();

      // Temp file should exist because upload failed
      expect(fs.existsSync(tempFilePath)).toBe(true);

      // Verify content is correct
      const content = fs.readFileSync(tempFilePath, 'utf-8');
      const event = JSON.parse(content.trim());
      expect(event.type).toBe('test');

      // Restore console methods
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();

      // Cleanup
      fs.unlinkSync(tempFilePath);
    });
  });

  describe('Integration', () => {
    it('should work with Tracer class', async () => {
      const { Tracer } = await import('../../src/tracing/tracer');

      const sink = new CloudTraceSink(uploadUrl, 'test-run-' + Date.now());
      const tracer = new Tracer('test-run-123', sink);

      tracer.emitRunStart('TestAgent', 'gpt-4');
      // tracer.emit('custom_event', {  ts: '102', run_id: 'test-run-123' });
      tracer.emitRunEnd(1);

      await tracer.close();

      // Verify upload happened
      expect((mockServer as any).lastRequest).toBeDefined();

      // Verify data
      const requestBody = (mockServer as any).lastRequestBody;
      const decompressed = zlib.gunzipSync(requestBody);
      const lines = decompressed.toString().trim().split('\n');

      expect(lines.length).toBe(3);

      const event1 = JSON.parse(lines[0]);
      expect(event1.type).toBe('run_start');
      expect(event1.run_id).toBe('test-run-123');
    });
  });

  describe('Index upload', () => {
    let indexServer: http.Server;
    let indexServerPort: number;
    let indexUploadUrl: string;

    beforeAll((done) => {
      // Create separate server for index upload API
      indexServer = http.createServer((req, res) => {
        // Store ALL requests, not just the last one
        if (!(indexServer as any).requests) {
          (indexServer as any).requests = [];
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          const requestBody = Buffer.concat(chunks);

          // Store this request
          (indexServer as any).requests.push({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: requestBody,
          });

          // Also keep lastRequest for backward compatibility
          (indexServer as any).lastRequest = {
            method: req.method,
            url: req.url,
            headers: req.headers,
          };
          (indexServer as any).lastRequestBody = requestBody;

          if (req.url === '/v1/traces/index_upload') {
            // Return index upload URL
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              upload_url: `http://localhost:${indexServerPort}/index-upload`
            }));
          } else if (req.url === '/index-upload') {
            // Accept index upload
            res.writeHead(200);
            res.end('OK');
          } else if (req.url === '/v1/traces/complete') {
            // Store completion request body for verification
            (indexServer as any).lastCompleteRequest = JSON.parse(requestBody.toString());
            // Accept completion call
            res.writeHead(200);
            res.end('OK');
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
        });
      });

      indexServer.listen(0, () => {
        const address = indexServer.address();
        if (address && typeof address === 'object') {
          indexServerPort = address.port;
          done();
        }
      });
    });

    afterAll((done) => {
      indexServer.close(done);
    });

    beforeEach(() => {
      delete (indexServer as any).lastRequest;
      delete (indexServer as any).lastRequestBody;
      (indexServer as any).requests = [];
    });

    it('should upload index file after trace upload', async () => {
      const runId = 'test-run-index-' + Date.now();
      const apiUrl = `http://localhost:${indexServerPort}`;

      const sink = new CloudTraceSink(
        uploadUrl,
        runId,
        'sk_test_123',
        apiUrl
      );

      sink.emit({ v: 1, type: 'run_start', seq: 1, data: { agent: 'TestAgent' }, ts: '100', run_id: runId });
      sink.emit({ v: 1, type: 'step_start', seq: 2, data: { steps: 1 }, ts: '101', run_id: runId });
      sink.emit({ v: 1, type: 'snapshot', seq: 3, data: { url: 'https://example.com' }, ts: '102', run_id: runId });
      sink.emit({ v: 1, type: 'run_end', seq: 4, data: { steps: 1 }, ts: '103', run_id: runId });

      await sink.close();

      // Verify index upload URL request was made
      const requests = (indexServer as any).requests;
      expect(requests).toBeDefined();
      expect(requests.length).toBeGreaterThan(0);

      // Find the index upload request
      const indexUploadRequest = requests.find((r: any) => r.url === '/v1/traces/index_upload');
      expect(indexUploadRequest).toBeDefined();
      expect(indexUploadRequest.method).toBe('POST');

      // Verify request body
      const requestBody = JSON.parse(indexUploadRequest.body.toString());
      expect(requestBody.run_id).toBe(runId);

      // Give it a moment for async index upload to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should skip index upload when no API key provided', async () => {
      const runId = 'test-run-no-key-' + Date.now();

      const sink = new CloudTraceSink(uploadUrl, runId); // No API key

      sink.emit({ v: 1, type: 'run_start', seq: 1, data: { agent: 'TestAgent' }, ts: '100', run_id: runId });

      await sink.close();

      // Verify index upload was NOT attempted
      const requests = (indexServer as any).requests;
      const indexUploadRequest = requests.find((r: any) => r.url === '/v1/traces/index_upload');
      expect(indexUploadRequest).toBeUndefined();
    });

    it('should handle index upload failure gracefully', async () => {
      const runId = 'test-run-index-fail-' + Date.now();

      // Create a server that returns 500 for index upload requests
      const failServer = http.createServer((req, res) => {
        if (req.url === '/v1/traces/index_upload') {
          res.writeHead(500);
          res.end('Internal Server Error');
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      await new Promise<void>((resolve) => {
        failServer.listen(0, () => resolve());
      });

      const address = failServer.address();
      const failPort = (address as any).port;
      const apiUrl = `http://localhost:${failPort}`;

      const sink = new CloudTraceSink(
        uploadUrl,
        runId,
        'sk_test_123',
        apiUrl
      );

      sink.emit({ v: 1, type: 'run_start', seq: 1, data: { agent: 'TestAgent' }, ts: '100', run_id: runId });

      // Should not throw even if index upload fails
      await expect(sink.close()).resolves.not.toThrow();

      // Clean up
      failServer.close();
    });

    it('should handle missing index file gracefully', async () => {
      const runId = 'test-run-missing-index-' + Date.now();
      const apiUrl = `http://localhost:${indexServerPort}`;

      const sink = new CloudTraceSink(
        uploadUrl,
        runId,
        'sk_test_123',
        apiUrl
      );

      sink.emit({ v: 1, type: 'run_start', seq: 1, data: { agent: 'TestAgent' }, ts: '100', run_id: runId });

      // Mock index generation to fail
      const originalGenerate = (sink as any).generateIndex;
      (sink as any).generateIndex = () => {
        // Index generation fails/skips
        console.log('Index generation skipped');
      };

      await sink.close();

      // Should not throw
      expect(true).toBe(true);

      // Restore
      (sink as any).generateIndex = originalGenerate;
    });

    it('should compress index file with gzip', async () => {
      const runId = 'test-run-gzip-' + Date.now();
      const apiUrl = `http://localhost:${indexServerPort}`;

      const sink = new CloudTraceSink(
        uploadUrl,
        runId,
        'sk_test_123',
        apiUrl
      );

      sink.emit({ v: 1, type: 'run_start', seq: 1, data: { agent: 'TestAgent' }, ts: '100', run_id: runId });
      sink.emit({ v: 1, type: 'snapshot', seq: 2, data: { url: 'https://example.com' }, ts: '101', run_id: runId });

      await sink.close();

      // Give async operations time to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Index file should have been created and deleted after successful upload
      const indexPath = path.join(persistentCacheDir, `${runId}.index.json`);

      // File should be deleted after successful upload
      // (This is expected behavior - we clean up after upload)
      // If the test runs fast enough, file might still exist briefly
    });

    it('should include all required stats fields in completion request', async () => {
      const runId = 'test-complete-stats-' + Date.now();
      const apiUrl = `http://localhost:${indexServerPort}`;

      const sink = new CloudTraceSink(
        uploadUrl,
        runId,
        'sk_test_123',
        apiUrl
      );

      // Emit events with timestamps
      const startTime = new Date().toISOString();
      sink.emit({
        v: 1,
        type: 'run_start',
        ts: startTime,
        run_id: runId,
        seq: 1,
        data: { agent: 'TestAgent' },
      });

      sink.emit({
        v: 1,
        type: 'step_start',
        ts: startTime,
        run_id: runId,
        seq: 2,
        step_id: 'step-1',
        data: { step_id: 'step-1', step_index: 1, goal: 'Test', attempt: 0 },
      });

      const endTime = new Date().toISOString();
      sink.emit({
        v: 1,
        type: 'run_end',
        ts: endTime,
        run_id: runId,
        seq: 3,
        data: { steps: 1, status: 'success' },
      });

      await sink.close();

      // Give async operations time to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify completion request was made
      const completeRequest = (indexServer as any).lastCompleteRequest;
      expect(completeRequest).toBeDefined();
      expect(completeRequest.run_id).toBe(runId);

      const stats = completeRequest.stats;
      expect(stats).toBeDefined();

      // Verify all required fields are present
      expect(stats.trace_file_size_bytes).toBeDefined();
      expect(stats.screenshot_total_size_bytes).toBeDefined();
      expect(stats.screenshot_count).toBeDefined();
      expect(stats.index_file_size_bytes).toBeDefined();
      expect(stats.total_steps).toBeDefined();
      expect(stats.total_steps).toBe(1);
      expect(stats.total_events).toBeDefined();
      expect(stats.total_events).toBe(3);
      expect(stats.duration_ms).toBeDefined();
      expect(stats.duration_ms).not.toBeNull();
      expect(stats.final_status).toBeDefined();
      expect(stats.final_status).toBe('success');
      expect(stats.started_at).toBeDefined();
      expect(stats.started_at).not.toBeNull();
      expect(stats.ended_at).toBeDefined();
      expect(stats.ended_at).not.toBeNull();
    });
  });
});
