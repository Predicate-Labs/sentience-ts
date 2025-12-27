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
            fs.unlinkSync(filePath);
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

      sink.emit({ v: 1, type: 'test1', seq: 1 });
      sink.emit({ v: 1, type: 'test2', seq: 2 });

      await sink.close();

      // Verify request was made
      expect((mockServer as any).lastRequest).toBeDefined();
      expect((mockServer as any).lastRequest.method).toBe('PUT');
    });

    it('should raise error when emitting after close', async () => {
      const sink = new CloudTraceSink(uploadUrl, 'test-run-' + Date.now());
      await sink.close();

      expect(() => {
        sink.emit({ v: 1, type: 'test', seq: 1 });
      }).toThrow('CloudTraceSink is closed');
    });

    it('should be idempotent on multiple close calls', async () => {
      const sink = new CloudTraceSink(uploadUrl, 'test-run-' + Date.now());
      sink.emit({ v: 1, type: 'test', seq: 1 });

      await sink.close();
      await sink.close();
      await sink.close();

      // Should only upload once
      expect((mockServer as any).lastRequest).toBeDefined();
    });
  });

  describe('Upload functionality', () => {
    it('should upload gzip-compressed JSONL data', async () => {
      const sink = new CloudTraceSink(uploadUrl, 'test-run-' + Date.now());

      sink.emit({ v: 1, type: 'run_start', seq: 1, data: { agent: 'TestAgent' } });
      sink.emit({ v: 1, type: 'run_end', seq: 2, data: { steps: 1 } });

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
      sink.emit({ v: 1, type: 'test', seq: 1 });

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

      const sink = new CloudTraceSink(uploadUrl, 'test-run-' + Date.now());
      sink.emit({ v: 1, type: 'test', seq: 1 });

      const tempFilePath = (sink as any).tempFilePath;

      await sink.close();

      // Temp file should still exist on error
      expect(fs.existsSync(tempFilePath)).toBe(true);

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
      const sink = new CloudTraceSink(invalidUrl);

      sink.emit({ v: 1, type: 'test', seq: 1 });

      // Should not throw, just log error
      await expect(sink.close()).resolves.not.toThrow();
    });

    it('should handle upload timeout gracefully', async () => {
      // Create server that doesn't respond
      const slowServer = http.createServer((req, res) => {
        // Never respond - will timeout
      });

      await new Promise<void>((resolve) => {
        slowServer.listen(0, () => resolve());
      });

      const address = slowServer.address();
      if (address && typeof address === 'object') {
        const slowUrl = `http://localhost:${address.port}/slow`;
        const sink = new CloudTraceSink(slowUrl);

        sink.emit({ v: 1, type: 'test', seq: 1 });

        // Should timeout and handle gracefully
        await sink.close();

        slowServer.close();
      }
    });

    it('should preserve trace on any error', async () => {
      const sink = new CloudTraceSink('http://invalid-url-that-doesnt-exist.local/upload');

      sink.emit({ v: 1, type: 'test', seq: 1 });

      const tempFilePath = (sink as any).tempFilePath;

      await sink.close();

      // Temp file should exist because upload failed
      expect(fs.existsSync(tempFilePath)).toBe(true);

      // Verify content is correct
      const content = fs.readFileSync(tempFilePath, 'utf-8');
      const event = JSON.parse(content.trim());
      expect(event.type).toBe('test');

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
      tracer.emit('custom_event', { data: 'value' });
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
});
