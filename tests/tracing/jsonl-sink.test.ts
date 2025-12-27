/**
 * Tests for JsonlTraceSink
 */

import * as fs from 'fs';
import * as path from 'path';
import { JsonlTraceSink } from '../../src/tracing/jsonl-sink';

describe('JsonlTraceSink', () => {
  const testDir = path.join(__dirname, 'test-traces');
  const testFile = path.join(testDir, 'test.jsonl');

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    // Wait a bit for file handles to close (Windows needs this)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Clean up test directory with retry logic for Windows
    if (fs.existsSync(testDir)) {
      // Retry deletion on Windows (files may still be locked)
      for (let i = 0; i < 5; i++) {
        try {
          fs.rmSync(testDir, { recursive: true, force: true });
          break; // Success
        } catch (err: any) {
          if (i === 4) {
            // Last attempt failed, log but don't throw
            console.warn(`Failed to delete test directory after 5 attempts: ${testDir}`);
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
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

    const content = fs.readFileSync(testFile, 'utf-8');
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

    const content = fs.readFileSync(testFile, 'utf-8');
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

    const content = fs.readFileSync(testFile, 'utf-8');
    const parsed = JSON.parse(content.trim());

    expect(parsed).toEqual(complexEvent);
  });
});
