/**
 * Agent Integration Tests with Tracing
 *
 * Tests that SentienceAgent works correctly with tracer enabled/disabled
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SentienceAgent } from '../../src/agent';
import { Tracer } from '../../src/tracing/tracer';
import { JsonlTraceSink } from '../../src/tracing/jsonl-sink';
import { TraceEvent } from '../../src/tracing/types';

// Mock browser and LLM
const mockBrowser: any = {
  getPage: () => ({
    url: () => 'https://example.com',
  }),
};

const mockLLM: any = {
  generate: async () => ({
    content: 'FINISH()',
    modelName: 'mock-model',
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
  }),
};

describe('Agent Integration with Tracing', () => {
  // FIX: Create a unique temporary directory for this specific test execution
  // This prevents collision with other test files running in parallel
  let testDir: string;
  let testFile: string;

  beforeAll(() => {
    // Create a unique temp dir prefix
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentience-agent-test-'));
    testFile = path.join(testDir, 'agent-test.jsonl');
  });

  afterAll(() => {
    // Safe cleanup of the unique directory
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  beforeEach(() => {
    // Just ensure the file is gone, but the DIR exists from beforeAll
    if (fs.existsSync(testFile)) {
      try {
        fs.unlinkSync(testFile);
      } catch (e) {
        // Ignore file deletion errors
      }
    }
  });

  afterEach(async () => {
    // Wait a bit for file handles to close (Windows needs this)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Only delete the test file, not the directory
    // The directory is unique to this test file and will be cleaned up in afterAll
    if (fs.existsSync(testFile)) {
      try {
        fs.unlinkSync(testFile);
      } catch (err) {
        // Ignore file deletion errors (file may still be in use)
      }
    }
  });

  describe('Backward Compatibility (No Tracer)', () => {
    it('should work without tracer (existing behavior)', async () => {
      const agent = new SentienceAgent(mockBrowser, mockLLM);

      // Mock snapshot
      const mockSnapshot = jest.spyOn(require('../../src/snapshot'), 'snapshot');
      mockSnapshot.mockResolvedValue({
        status: 'success',
        url: 'https://example.com',
        elements: [
          { id: 1, role: 'button', text: 'Click me', importance: 0.8, bbox: { x: 0, y: 0, width: 100, height: 50 }, visual_cues: {} },
        ],
      });

      const result = await agent.act('Finish task');

      expect(result.success).toBe(true);
      expect(result.action).toBe('finish');

      mockSnapshot.mockRestore();
    });

    it('should not have tracer-related side effects', async () => {
      const agent = new SentienceAgent(mockBrowser, mockLLM);

      expect(agent.getTracer()).toBeUndefined();

      // closeTracer should be safe to call even without tracer
      await agent.closeTracer();
    });
  });

  describe('Agent with Tracer', () => {
    it('should accept tracer parameter', () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);
      const agent = new SentienceAgent(mockBrowser, mockLLM, 50, true, tracer);

      expect(agent.getTracer()).toBe(tracer);

      agent.closeTracer();
    });

    it('should emit events during act() execution', async () => {
      // Ensure directory exists before creating sink
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      
      // Ensure file doesn't exist from previous test runs
      if (fs.existsSync(testFile)) {
        try {
          fs.unlinkSync(testFile);
        } catch (err) {
          // Ignore unlink errors
        }
      }
      
      const sink = new JsonlTraceSink(testFile);
      
      // Verify sink initialized properly
      const writeStream = (sink as any).writeStream;
      if (!writeStream) {
        throw new Error('JsonlTraceSink failed to initialize writeStream');
      }
      if (writeStream.destroyed) {
        throw new Error('JsonlTraceSink writeStream is already destroyed');
      }
      
      // Emit a test event to ensure the sink can write
      const tracer = new Tracer('test-run', sink);
      tracer.emit('test_init', { test: true } as any);
      
      // Wait a moment to ensure the test event is written
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const agent = new SentienceAgent(mockBrowser, mockLLM, 50, false, tracer);

      // Mock snapshot
      const mockSnapshot = jest.spyOn(require('../../src/snapshot'), 'snapshot');
      mockSnapshot.mockResolvedValue({
        status: 'success',
        url: 'https://example.com',
        elements: [
          {
            id: 1,
            role: 'button',
            text: 'Submit',
            importance: 0.9,
            bbox: { x: 10, y: 20, width: 100, height: 40 },
            visual_cues: { is_clickable: true },
          },
        ],
      });

      await agent.act('Complete the task');
      await agent.closeTracer();

      mockSnapshot.mockRestore();

      // Wait for file to be written and flushed (stream may be buffered)
      // Use a retry loop to handle slow CI environments
      let fileExists = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (fs.existsSync(testFile)) {
          // Also check that file has content (not just empty file)
          try {
            const stats = fs.statSync(testFile);
            if (stats.size > 0) {
              fileExists = true;
              break;
            }
          } catch {
            // File might be deleted between exists and stat, continue waiting
          }
        }
      }

      // Verify file exists before reading with better diagnostics
      if (!fileExists) {
        const dirExists = fs.existsSync(testDir);
        const dirWritable = dirExists ? (() => {
          try {
            fs.accessSync(testDir, fs.constants.W_OK);
            return true;
          } catch {
            return false;
          }
        })() : false;
        const currentWriteStream = (sink as any).writeStream;
        const streamDestroyed = currentWriteStream?.destroyed ?? true;
        throw new Error(`Trace file not created after 3s: ${testFile}. Directory exists: ${dirExists}, Directory writable: ${dirWritable}, Stream destroyed: ${streamDestroyed}`);
      }

      // Read trace file - verify it exists one more time before reading
      if (!fs.existsSync(testFile)) {
        throw new Error(`Trace file disappeared after verification: ${testFile}`);
      }

      const content = fs.readFileSync(testFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      // If no lines, no events were written
      if (lines.length === 0) {
        throw new Error(`Trace file exists but is empty: ${testFile}`);
      }
      
      const events = lines.map(line => JSON.parse(line) as TraceEvent);

      // Should have at least: step_start, snapshot, llm_response, action
      expect(events.length).toBeGreaterThanOrEqual(4);

      // Check event types
      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain('step_start');
      expect(eventTypes).toContain('snapshot');
      expect(eventTypes).toContain('llm_response');
      expect(eventTypes).toContain('action');

      // Verify all events have same run_id
      const runIds = new Set(events.map(e => e.run_id));
      expect(runIds.size).toBe(1);

      // Verify step_id is set for step events
      const stepStartEvent = events.find(e => e.type === 'step_start');
      expect(stepStartEvent?.step_id).toBeDefined();

      const snapshotEvent = events.find(e => e.type === 'snapshot');
      expect(snapshotEvent?.step_id).toBe(stepStartEvent?.step_id);
    });

    it('should emit error events on failure', async () => {
      // Ensure directory exists and is writable before creating sink
      try {
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir, { recursive: true });
        }
        // Verify directory is writable
        fs.accessSync(testDir, fs.constants.W_OK);
      } catch (err: any) {
        throw new Error(`Failed to create/write to test directory: ${testDir}. Error: ${err.message}`);
      }
      
      // Ensure file doesn't exist from previous test runs
      if (fs.existsSync(testFile)) {
        try {
          fs.unlinkSync(testFile);
        } catch (err) {
          // Ignore unlink errors
        }
      }
      
      const sink = new JsonlTraceSink(testFile);
      
      // Verify sink initialized properly (writeStream should exist and not be destroyed)
      const writeStream = (sink as any).writeStream;
      if (!writeStream) {
        throw new Error('JsonlTraceSink failed to initialize writeStream');
      }
      if (writeStream.destroyed) {
        throw new Error('JsonlTraceSink writeStream is already destroyed');
      }
      
      const tracer = new Tracer('test-run', sink);
      
      // Manually emit a test event to ensure the sink can write
      tracer.emit('test_init', { test: true } as any);
      
      // Wait a moment to ensure the test event is written
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const agent = new SentienceAgent(mockBrowser, mockLLM, 50, false, tracer);

      // Mock snapshot to fail
      const mockSnapshot = jest.spyOn(require('../../src/snapshot'), 'snapshot');
      mockSnapshot.mockRejectedValue(new Error('Snapshot failed'));

      try {
        await agent.act('Do something', 1); // maxRetries = 1
      } catch (error) {
        // Expected to fail
      }

      await agent.closeTracer();
      mockSnapshot.mockRestore();

      // Wait for file to be written and flushed (stream may be buffered)
      // Use a retry loop to handle slow CI environments
      // Also ensure directory exists throughout (may be deleted by parallel tests)
      let fileExists = false;
      for (let i = 0; i < 30; i++) {
        // Re-ensure directory exists (may have been deleted by parallel test cleanup)
        if (!fs.existsSync(testDir)) {
          try {
            fs.mkdirSync(testDir, { recursive: true });
          } catch (err) {
            // Directory creation failed, continue trying
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        if (fs.existsSync(testFile)) {
          // Also check that file has content (not just empty file)
          try {
            const stats = fs.statSync(testFile);
            if (stats.size > 0) {
              fileExists = true;
              break;
            }
          } catch {
            // File might be deleted between exists and stat, continue waiting
          }
        }
      }

      // Verify file exists before reading with better diagnostics
      if (!fileExists) {
        // Re-check directory state (may have changed during wait)
        let dirExists = fs.existsSync(testDir);
        let dirWritable = false;
        
        // If directory doesn't exist, try to recreate it for diagnostics
        if (!dirExists) {
          try {
            fs.mkdirSync(testDir, { recursive: true });
            dirExists = true;
            fs.accessSync(testDir, fs.constants.W_OK);
            dirWritable = true;
          } catch (err) {
            // Directory creation/access failed
          }
        } else {
          try {
            fs.accessSync(testDir, fs.constants.W_OK);
            dirWritable = true;
          } catch {
            // Directory not writable
          }
        }
        
        const currentWriteStream = (sink as any).writeStream;
        const streamDestroyed = currentWriteStream?.destroyed ?? true;
        const streamErrored = currentWriteStream?.errored ? String(currentWriteStream.errored) : null;
        const sinkClosed = sink.isClosed();
        throw new Error(`Trace file not created after 3s: ${testFile}. Directory exists: ${dirExists}, Directory writable: ${dirWritable}, Stream destroyed: ${streamDestroyed}, Sink closed: ${sinkClosed}${streamErrored ? `, Stream error: ${streamErrored}` : ''}`);
      }

      // Read trace file - verify it exists one more time before reading
      if (!fs.existsSync(testFile)) {
        throw new Error(`Trace file disappeared after verification: ${testFile}`);
      }

      const content = fs.readFileSync(testFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      // If no lines, no events were written
      if (lines.length === 0) {
        throw new Error(`Trace file exists but is empty: ${testFile}`);
      }
      
      const events = lines.map(line => JSON.parse(line) as TraceEvent);

      // Should have step_start and error events
      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain('step_start');
      expect(eventTypes).toContain('error');

      // Check error event
      const errorEvent = events.find(e => e.type === 'error');
      expect(errorEvent?.data.error).toContain('Snapshot failed');
    });

    it('should track step count across multiple actions', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);
      const agent = new SentienceAgent(mockBrowser, mockLLM, 50, false, tracer);

      // Mock snapshot
      const mockSnapshot = jest.spyOn(require('../../src/snapshot'), 'snapshot');
      mockSnapshot.mockResolvedValue({
        status: 'success',
        url: 'https://example.com',
        elements: [],
      });

      await agent.act('First action');
      await agent.act('Second action');
      await agent.act('Third action');

      await agent.closeTracer();
      mockSnapshot.mockRestore();

      // Read trace file
      const content = fs.readFileSync(testFile, 'utf-8');
      const lines = content.trim().split('\n');
      const events = lines.map(line => JSON.parse(line) as TraceEvent);

      // Get all step_start events
      const stepStarts = events.filter(e => e.type === 'step_start');
      expect(stepStarts.length).toBe(3);

      // Verify step indices
      expect(stepStarts[0].data.step_index).toBe(1);
      expect(stepStarts[1].data.step_index).toBe(2);
      expect(stepStarts[2].data.step_index).toBe(3);

      // Verify goals
      expect(stepStarts[0].data.goal).toBe('First action');
      expect(stepStarts[1].data.goal).toBe('Second action');
      expect(stepStarts[2].data.goal).toBe('Third action');
    });

    it('should preserve agent functionality with tracer', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);
      const agent = new SentienceAgent(mockBrowser, mockLLM, 50, false, tracer);

      // Mock snapshot
      const mockSnapshot = jest.spyOn(require('../../src/snapshot'), 'snapshot');
      mockSnapshot.mockResolvedValue({
        status: 'success',
        url: 'https://example.com',
        elements: [],
      });

      const result = await agent.act('Test goal');

      // Verify result structure unchanged
      expect(result.success).toBe(true);
      expect(result.goal).toBe('Test goal');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.attempt).toBe(0);

      // Verify history tracking still works
      const history = agent.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].goal).toBe('Test goal');

      // Verify token tracking still works
      const tokenStats = agent.getTokenStats();
      expect(tokenStats.totalPromptTokens).toBeGreaterThan(0);

      await agent.closeTracer();
      mockSnapshot.mockRestore();
    });
  });

  describe('clearHistory with tracer', () => {
    it('should reset step count when clearing history', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);
      const agent = new SentienceAgent(mockBrowser, mockLLM, 50, false, tracer);

      // Mock snapshot
      const mockSnapshot = jest.spyOn(require('../../src/snapshot'), 'snapshot');
      mockSnapshot.mockResolvedValue({
        status: 'success',
        url: 'https://example.com',
        elements: [],
      });

      await agent.act('First');
      await agent.act('Second');

      agent.clearHistory();

      await agent.act('After clear');
      await agent.closeTracer();

      mockSnapshot.mockRestore();

      // Read trace file
      const content = fs.readFileSync(testFile, 'utf-8');
      const lines = content.trim().split('\n');
      const events = lines.map(line => JSON.parse(line) as TraceEvent);

      const stepStarts = events.filter(e => e.type === 'step_start');

      // Step indices should be 1, 2, then reset to 1
      expect(stepStarts[0].data.step_index).toBe(1);
      expect(stepStarts[1].data.step_index).toBe(2);
      expect(stepStarts[2].data.step_index).toBe(1); // Reset!
    });
  });
});
