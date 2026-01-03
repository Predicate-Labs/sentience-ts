/**
 * Tests for TraceFileManager utility
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TraceFileManager } from '../../src/utils/trace-file-manager';
import { TraceEvent } from '../../src/tracing/types';

describe('TraceFileManager', () => {
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-file-manager-test-'));
    testFile = path.join(testDir, 'test.jsonl');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('ensureDirectory', () => {
    it('should create directory if it does not exist', () => {
      const newDir = path.join(testDir, 'new-dir');
      expect(fs.existsSync(newDir)).toBe(false);

      TraceFileManager.ensureDirectory(newDir);

      expect(fs.existsSync(newDir)).toBe(true);
    });

    it('should not throw if directory already exists', () => {
      expect(() => TraceFileManager.ensureDirectory(testDir)).not.toThrow();
    });
  });

  describe('createWriteStream', () => {
    it('should create write stream for file', async () => {
      const stream = TraceFileManager.createWriteStream(testFile);

      expect(stream).not.toBeNull();
      expect(stream).toBeInstanceOf(fs.WriteStream);
      if (stream) {
        await TraceFileManager.closeStream(stream);
      }
    });

    it('should create parent directories if needed', async () => {
      const nestedFile = path.join(testDir, 'nested', 'deep', 'file.jsonl');
      const stream = TraceFileManager.createWriteStream(nestedFile);

      expect(stream).not.toBeNull();
      expect(fs.existsSync(path.dirname(nestedFile))).toBe(true);
      if (stream) {
        await TraceFileManager.closeStream(stream);
      }
    });
  });

  describe('writeEvent', () => {
    it('should write trace event as JSON line', async () => {
      const stream = TraceFileManager.createWriteStream(testFile);
      if (!stream) {
        fail('Failed to create stream');
        return;
      }

      const event: TraceEvent = {
        v: 1,
        type: 'test',
        ts: '2024-01-01T00:00:00.000Z',
        run_id: 'test-run',
        seq: 1,
        data: { goal: 'test goal' },
      };

      const result = TraceFileManager.writeEvent(stream, event);
      await TraceFileManager.closeStream(stream);

      expect(result).toBe(true);
      const content = fs.readFileSync(testFile, 'utf-8');
      expect(content).toContain('"type":"test"');
      expect(content.trim()).toMatch(/^\{.*\}$/);
    });
  });

  describe('closeStream', () => {
    it('should close stream successfully', async () => {
      const stream = TraceFileManager.createWriteStream(testFile);
      if (!stream) {
        fail('Failed to create stream');
        return;
      }

      await expect(TraceFileManager.closeStream(stream)).resolves.not.toThrow();
      expect(stream.destroyed).toBe(true);
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', () => {
      fs.writeFileSync(testFile, 'test');
      expect(TraceFileManager.fileExists(testFile)).toBe(true);
    });

    it('should return false for non-existent file', () => {
      expect(TraceFileManager.fileExists(path.join(testDir, 'nonexistent.jsonl'))).toBe(false);
    });
  });

  describe('getFileSize', () => {
    it('should return file size in bytes', () => {
      const content = 'test content';
      fs.writeFileSync(testFile, content);
      expect(TraceFileManager.getFileSize(testFile)).toBe(content.length);
    });

    it('should return 0 for non-existent file', () => {
      expect(TraceFileManager.getFileSize(path.join(testDir, 'nonexistent.jsonl'))).toBe(0);
    });
  });

  describe('deleteFile', () => {
    it('should delete existing file', () => {
      fs.writeFileSync(testFile, 'test');
      expect(TraceFileManager.deleteFile(testFile)).toBe(true);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should return false for non-existent file', () => {
      expect(TraceFileManager.deleteFile(path.join(testDir, 'nonexistent.jsonl'))).toBe(false);
    });
  });
});
