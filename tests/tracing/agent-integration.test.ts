/**
 * Agent Integration Tests with Tracing
 *
 * Tests that SentienceAgent works correctly with tracer enabled/disabled
 */

import * as fs from 'fs';
import * as path from 'path';
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
  const testDir = path.join(__dirname, 'test-traces');
  const testFile = path.join(testDir, 'agent-test.jsonl');

  beforeEach(() => {
    // Clean up and recreate test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
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
      
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);
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

      // Ensure file exists before reading
      if (!fs.existsSync(testFile)) {
        throw new Error(`Trace file not created: ${testFile}`);
      }

      // Read trace file
      const content = fs.readFileSync(testFile, 'utf-8');
      const lines = content.trim().split('\n');
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
      // Ensure directory exists before creating sink
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);
      const agent = new SentienceAgent(mockBrowser, mockLLM, 50, false, tracer);

      // Verify sink initialized properly (writeStream should exist)
      const writeStream = (sink as any).writeStream;
      if (!writeStream) {
        throw new Error('JsonlTraceSink failed to initialize writeStream');
      }

      // Mock snapshot to fail
      const mockSnapshot = jest.spyOn(require('../../src/snapshot'), 'snapshot');
      mockSnapshot.mockRejectedValue(new Error('Snapshot failed'));

      try {
        await agent.act('Do something', 1); // maxRetries = 1
      } catch (error) {
        // Expected to fail
      }

      // Close tracer to flush any buffered writes
      await agent.closeTracer();
      mockSnapshot.mockRestore();

      // Wait a bit for file to be written (stream may be buffered)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check if file exists - if not, the sink may have failed to initialize
      // or no events were emitted. In that case, verify the sink was created.
      if (!fs.existsSync(testFile)) {
        // If file doesn't exist, check if sink initialized properly
        // The sink should create the file on first write, so if it doesn't exist,
        // either no events were emitted or the sink failed to initialize
        // For this test, we expect at least step_start to be emitted
        throw new Error(`Trace file not created: ${testFile}. This suggests no events were written to the trace.`);
      }

      // Read trace file
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
