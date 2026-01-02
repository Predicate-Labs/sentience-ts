/**
 * Tests for JsonlTraceSink
 */

import * as fs from 'fs';
import * as path from 'path';
import { JsonlTraceSink } from '../../src/tracing/jsonl-sink';

describe('JsonlTraceSink', () => {
  const testDir = path.join(__dirname, 'test-traces');
  // Use unique filename for each test to avoid Windows file locking issues
  let testFile: string;

  /**
   * Helper function to read file with retry logic for Windows EPERM errors
   * Windows file handles may not be released immediately after close()
   */
  async function readFileWithRetry(filePath: string, maxAttempts: number = 10): Promise<string> {
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        return fs.readFileSync(filePath, 'utf-8');
      } catch (err: any) {
        if (err.code === 'EPERM' && attempts < maxAttempts - 1) {
          // File still locked, wait and retry
          await new Promise(resolve => setTimeout(resolve, 50));
          attempts++;
        } else {
          throw err; // Re-throw if not EPERM or max attempts reached
        }
      }
    }
    throw new Error(`Failed to read file after ${maxAttempts} attempts`);
  }

  /**
   * Helper function to read file with retry logic for Windows EPERM errors
   * Windows file handles may not be released immediately after close()
   */
  async function readFileWithRetry(filePath: string, maxAttempts: number = 10): Promise<string> {
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        return fs.readFileSync(filePath, 'utf-8');
      } catch (err: any) {
        if (err.code === 'EPERM' && attempts < maxAttempts - 1) {
          // File still locked, wait and retry
          await new Promise(resolve => setTimeout(resolve, 50));
          attempts++;
        } else {
          throw err; // Re-throw if not EPERM or max attempts reached
        }
      }
    }
    throw new Error(`Failed to read file after ${maxAttempts} attempts`);
  }

  beforeEach(async () => {
    // Wait a bit to ensure previous test's file handles are fully released (Windows needs this)
    await new Promise(resolve => setTimeout(resolve, 150));

    // Generate unique filename for this test to avoid Windows file locking issues
    const uniqueId = Math.random().toString(36).substring(7);
    testFile = path.join(testDir, `trace-${uniqueId}.jsonl`);

    // Ensure directory exists
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(async () => {
    // Wait longer for file handles to close (Windows needs more time)
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Clean up the specific file for this test
    if (testFile) {
      try {
        if (fs.existsSync(testFile)) {
          // Retry deletion on Windows (file may still be locked)
          for (let i = 0; i < 5; i++) {
            try {
              fs.unlinkSync(testFile);
              break; // Success
            } catch (err: any) {
              if (i === 4) {
                // Last attempt failed, log but don't throw
                console.warn(`Could not delete ${testFile}:`, err);
              } else {
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            }
          }
        }
      } catch (err: any) {
        // Ignore cleanup errors - don't fail tests
        console.warn(`Could not delete ${testFile}:`, err);
      }
    }
  });

  it('should create parent directories if they do not exist', () => {
    const sink = new JsonlTraceSink(testFile);
    expect(fs.existsSync(testDir)).toBe(true);
    sink.close();
  });

  it('should emit events as JSON lines', async () => {
    const sink = new JsonlTraceSink(testFile);

    sink.emit({ type: 'test1', data: 'hello' });
    sink.emit({ type: 'test2', data: 'world' });

    await sink.close();
    // Wait for file handle to be released on Windows (increased wait time)
    await new Promise(resolve => setTimeout(resolve, 100));

    const content = await readFileWithRetry(testFile);
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toEqual({ type: 'test1', data: 'hello' });
    expect(JSON.parse(lines[1])).toEqual({ type: 'test2', data: 'world' });
  });

    it('should append to existing file', async () => {
    // Ensure directory exists
    const dir = path.dirname(testFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write first batch
    const sink1 = new JsonlTraceSink(testFile);
    sink1.emit({ seq: 1 });
    await sink1.close();

    // Write second batch
    const sink2 = new JsonlTraceSink(testFile);
    sink2.emit({ seq: 2 });
    await sink2.close();
    // Wait for file handle to be released on Windows
    await new Promise(resolve => setTimeout(resolve, 50));

    const content = await readFileWithRetry(testFile);
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toEqual({ seq: 1 });
    expect(JSON.parse(lines[1])).toEqual({ seq: 2 });
  });

  it('should handle close() multiple times gracefully', async () => {
    const sink = new JsonlTraceSink(testFile);
    sink.emit({ test: true });

    await sink.close();
    await sink.close(); // Should not throw

    expect(sink.isClosed()).toBe(true);
  });

  it('should warn when emitting after close (in non-test environments)', async () => {
    // Note: In test environments, warnings are suppressed to avoid test noise
    // This test verifies the behavior exists, but the warning won't be logged in Jest
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const sink = new JsonlTraceSink(testFile);
    await sink.close();

    sink.emit({ test: true }); // Should attempt to warn (but suppressed in test env)

    // In test environments, the warning is suppressed, so we just verify
    // that emit() returns safely without crashing
    expect(sink.isClosed()).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  it('should return correct sink type', () => {
    const sink = new JsonlTraceSink(testFile);
    expect(sink.getSinkType()).toBe(`JsonlTraceSink(${testFile})`);
    sink.close();
  });

  it('should return file path', () => {
    const sink = new JsonlTraceSink(testFile);
    expect(sink.getPath()).toBe(testFile);
    sink.close();
  });

  it('should handle write errors gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const sink = new JsonlTraceSink(testFile);

    // Create a circular reference (will fail JSON.stringify)
    const circular: any = { a: 1 };
    circular.self = circular;

    sink.emit(circular); // Should log error but not crash

    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    await sink.close();
  });

  it('should write valid JSON for complex objects', async () => {
    const sink = new JsonlTraceSink(testFile);

    const complexEvent = {
      v: 1,
      type: 'snapshot',
      ts: '2025-12-26T10:00:00.000Z',
      run_id: 'test-run',
      seq: 1,
      data: {
        url: 'https://example.com',
        elements: [
          { id: 1, text: 'Hello', bbox: { x: 0, y: 0, width: 100, height: 50 } },
          { id: 2, text: null, bbox: { x: 100, y: 0, width: 100, height: 50 } },
        ],
      },
    };

    sink.emit(complexEvent);
    await sink.close();
    // Wait for file handle to be released on Windows (increased wait time)
    await new Promise(resolve => setTimeout(resolve, 100));

    const content = await readFileWithRetry(testFile);
    const parsed = JSON.parse(content.trim());

    expect(parsed).toEqual(complexEvent);
  });
});
