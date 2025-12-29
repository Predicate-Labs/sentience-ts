/**
 * Tests for trace indexing functionality.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildTraceIndex, writeTraceIndex, readStepEvents } from '../../src/tracing/indexer';
import { TraceIndex, StepIndex } from '../../src/tracing/index-schema';

describe('Trace Indexing', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-indexing-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('buildTraceIndex', () => {
    it('should handle empty trace file', () => {
      const tracePath = path.join(tmpDir, 'empty.jsonl');
      fs.writeFileSync(tracePath, '');

      const index = buildTraceIndex(tracePath);

      expect(index).toBeInstanceOf(TraceIndex);
      expect(index.version).toBe(1);
      expect(index.run_id).toBe('empty');
      expect(index.summary.event_count).toBe(0);
      expect(index.summary.step_count).toBe(0);
      expect(index.summary.error_count).toBe(0);
      expect(index.steps.length).toBe(0);
    });

    it('should index single step trace correctly', () => {
      const tracePath = path.join(tmpDir, 'single-step.jsonl');

      const events = [
        {
          v: 1,
          type: 'step_start',
          ts: '2025-12-29T10:00:00.000Z',
          step_id: 'step-1',
          data: { goal: 'Test goal' },
        },
        {
          v: 1,
          type: 'action',
          ts: '2025-12-29T10:00:01.000Z',
          step_id: 'step-1',
          data: { type: 'CLICK', target_element_id: 42, success: true },
        },
        {
          v: 1,
          type: 'step_end',
          ts: '2025-12-29T10:00:02.000Z',
          step_id: 'step-1',
          data: {},
        },
      ];

      fs.writeFileSync(tracePath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      const index = buildTraceIndex(tracePath);

      expect(index.summary.event_count).toBe(3);
      expect(index.summary.step_count).toBe(1);
      expect(index.steps.length).toBe(1);

      const step = index.steps[0];
      expect(step).toBeInstanceOf(StepIndex);
      expect(step.step_id).toBe('step-1');
      expect(step.step_index).toBe(1);
      expect(step.goal).toBe('Test goal');
      expect(step.status).toBe('ok');
      expect(step.counters.events).toBe(3);
      expect(step.counters.actions).toBe(1);
      expect(step.offset_start).toBe(0);
      expect(step.offset_end).toBeGreaterThan(step.offset_start);
    });

    it('should index multiple steps in order', () => {
      const tracePath = path.join(tmpDir, 'multi-step.jsonl');

      const events = [
        {
          v: 1,
          type: 'step_start',
          ts: '2025-12-29T10:00:00.000Z',
          step_id: 'step-1',
          data: { goal: 'First step' },
        },
        {
          v: 1,
          type: 'step_end',
          ts: '2025-12-29T10:00:01.000Z',
          step_id: 'step-1',
          data: {},
        },
        {
          v: 1,
          type: 'step_start',
          ts: '2025-12-29T10:00:02.000Z',
          step_id: 'step-2',
          data: { goal: 'Second step' },
        },
        {
          v: 1,
          type: 'step_end',
          ts: '2025-12-29T10:00:03.000Z',
          step_id: 'step-2',
          data: {},
        },
      ];

      fs.writeFileSync(tracePath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      const index = buildTraceIndex(tracePath);

      expect(index.summary.step_count).toBe(2);
      expect(index.steps.length).toBe(2);
      expect(index.steps[0].step_id).toBe('step-1');
      expect(index.steps[0].step_index).toBe(1);
      expect(index.steps[1].step_id).toBe('step-2');
      expect(index.steps[1].step_index).toBe(2);
    });

    it('should track byte offsets accurately for seeking', () => {
      const tracePath = path.join(tmpDir, 'offset-test.jsonl');

      const events = [
        {
          v: 1,
          type: 'step_start',
          ts: '2025-12-29T10:00:00.000Z',
          step_id: 'step-1',
          data: {},
        },
        {
          v: 1,
          type: 'action',
          ts: '2025-12-29T10:00:01.000Z',
          step_id: 'step-1',
          data: { type: 'CLICK' },
        },
        {
          v: 1,
          type: 'step_start',
          ts: '2025-12-29T10:00:02.000Z',
          step_id: 'step-2',
          data: {},
        },
        {
          v: 1,
          type: 'action',
          ts: '2025-12-29T10:00:03.000Z',
          step_id: 'step-2',
          data: { type: 'TYPE' },
        },
      ];

      fs.writeFileSync(tracePath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      const index = buildTraceIndex(tracePath);

      // Read step-1 events using offset
      const step1 = index.steps[0];
      const step1Events = readStepEvents(tracePath, step1.offset_start, step1.offset_end);

      expect(step1Events.length).toBe(2);
      expect(step1Events[0].step_id).toBe('step-1');
      expect(step1Events[0].type).toBe('step_start');
      expect(step1Events[1].step_id).toBe('step-1');
      expect(step1Events[1].type).toBe('action');

      // Read step-2 events using offset
      const step2 = index.steps[1];
      const step2Events = readStepEvents(tracePath, step2.offset_start, step2.offset_end);

      expect(step2Events.length).toBe(2);
      expect(step2Events[0].step_id).toBe('step-2');
      expect(step2Events[1].type).toBe('action');
    });

    it('should produce deterministic snapshot digests', () => {
      const snapshotData = {
        url: 'https://example.com',
        viewport: { width: 1920, height: 1080 },
        elements: [
          {
            id: 1,
            role: 'button',
            text: 'Click me',
            bbox: { x: 10.0, y: 20.0, width: 100.0, height: 50.0 },
            is_primary: true,
            is_clickable: true,
          },
        ],
      };

      const tracePath = path.join(tmpDir, 'digest-test.jsonl');

      const event = {
        v: 1,
        type: 'snapshot',
        ts: '2025-12-29T10:00:00.000Z',
        step_id: 'step-1',
        data: snapshotData,
      };

      fs.writeFileSync(tracePath, JSON.stringify(event) + '\n');

      const index1 = buildTraceIndex(tracePath);
      const index2 = buildTraceIndex(tracePath);

      const digest1 = index1.steps[0].snapshot_after.digest;
      const digest2 = index2.steps[0].snapshot_after.digest;

      expect(digest1).toBe(digest2);
      expect(digest1).toMatch(/^sha256:/);
    });

    it('should resist noise in snapshot digests', () => {
      const baseSnapshot = {
        url: 'https://example.com',
        viewport: { width: 1920, height: 1080 },
        elements: [
          {
            id: 1,
            role: 'button',
            text: '  Click  me  ', // Extra whitespace
            bbox: { x: 10.0, y: 20.0, width: 100.0, height: 50.0 },
          },
        ],
      };

      const shiftedSnapshot = {
        url: 'https://example.com',
        viewport: { width: 1920, height: 1080 },
        elements: [
          {
            id: 1,
            role: 'button',
            text: 'Click me', // No extra whitespace
            bbox: { x: 10.5, y: 20.5, width: 100.5, height: 50.5 }, // Sub-2px shift
          },
        ],
      };

      const trace1Path = path.join(tmpDir, 'base.jsonl');
      const trace2Path = path.join(tmpDir, 'shifted.jsonl');

      fs.writeFileSync(
        trace1Path,
        JSON.stringify({
          v: 1,
          type: 'snapshot',
          ts: '2025-12-29T10:00:00.000Z',
          step_id: 'step-1',
          data: baseSnapshot,
        }) + '\n'
      );

      fs.writeFileSync(
        trace2Path,
        JSON.stringify({
          v: 1,
          type: 'snapshot',
          ts: '2025-12-29T10:00:00.000Z',
          step_id: 'step-1',
          data: shiftedSnapshot,
        }) + '\n'
      );

      const index1 = buildTraceIndex(trace1Path);
      const index2 = buildTraceIndex(trace2Path);

      const digest1 = index1.steps[0].snapshot_after.digest;
      const digest2 = index2.steps[0].snapshot_after.digest;

      expect(digest1).toBe(digest2); // Should be identical despite noise
    });

    it('should not leak sensitive text in action digests', () => {
      const tracePath = path.join(tmpDir, 'privacy-test.jsonl');

      const sensitiveText = 'my-secret-password';
      const event = {
        v: 1,
        type: 'action',
        ts: '2025-12-29T10:00:00.000Z',
        step_id: 'step-1',
        data: {
          type: 'TYPE',
          target_element_id: 15,
          text: sensitiveText,
          success: true,
        },
      };

      fs.writeFileSync(tracePath, JSON.stringify(event) + '\n');

      const index = buildTraceIndex(tracePath);

      // Convert index to JSON string
      const indexJson = JSON.stringify(index.toJSON());

      // Verify sensitive text is NOT in index
      expect(indexJson).not.toContain(sensitiveText);

      // Verify action digest exists and is a hash
      const actionDigest = index.steps[0].action.args_digest;
      expect(actionDigest).toBeTruthy();
      expect(actionDigest).toMatch(/^sha256:/);
    });

    it('should create synthetic step for events without step_id', () => {
      const tracePath = path.join(tmpDir, 'synthetic-step.jsonl');

      const events = [
        { v: 1, type: 'run_start', ts: '2025-12-29T10:00:00.000Z', data: {} },
        { v: 1, type: 'action', ts: '2025-12-29T10:00:01.000Z', data: {} },
        { v: 1, type: 'run_end', ts: '2025-12-29T10:00:02.000Z', data: {} },
      ];

      fs.writeFileSync(tracePath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      const index = buildTraceIndex(tracePath);

      expect(index.summary.step_count).toBe(1);
      expect(index.steps.length).toBe(1);
      expect(index.steps[0].step_id).toBe('step-0'); // Synthetic step
    });

    it('should produce idempotent indexes', () => {
      const tracePath = path.join(tmpDir, 'idempotent.jsonl');

      const events = [
        {
          v: 1,
          type: 'step_start',
          ts: '2025-12-29T10:00:00.000Z',
          step_id: 'step-1',
          data: {},
        },
        {
          v: 1,
          type: 'action',
          ts: '2025-12-29T10:00:01.000Z',
          step_id: 'step-1',
          data: { type: 'CLICK' },
        },
      ];

      fs.writeFileSync(tracePath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      const index1 = buildTraceIndex(tracePath);
      const index2 = buildTraceIndex(tracePath);

      // Compare all fields except created_at (timestamp will differ)
      expect(index1.version).toBe(index2.version);
      expect(index1.run_id).toBe(index2.run_id);
      expect(index1.trace_file.sha256).toBe(index2.trace_file.sha256);
      expect(index1.summary.event_count).toBe(index2.summary.event_count);
      expect(index1.steps.length).toBe(index2.steps.length);

      for (let i = 0; i < index1.steps.length; i++) {
        expect(index1.steps[i].step_id).toBe(index2.steps[i].step_id);
        expect(index1.steps[i].offset_start).toBe(index2.steps[i].offset_start);
        expect(index1.steps[i].offset_end).toBe(index2.steps[i].offset_end);
      }
    });

    it('should count errors correctly', () => {
      const tracePath = path.join(tmpDir, 'errors.jsonl');

      const events = [
        {
          v: 1,
          type: 'step_start',
          ts: '2025-12-29T10:00:00.000Z',
          step_id: 'step-1',
          data: {},
        },
        {
          v: 1,
          type: 'error',
          ts: '2025-12-29T10:00:01.000Z',
          step_id: 'step-1',
          data: { message: 'Something failed' },
        },
      ];

      fs.writeFileSync(tracePath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      const index = buildTraceIndex(tracePath);

      expect(index.summary.error_count).toBe(1);
      expect(index.steps[0].status).toBe('error');
    });

    it('should count LLM calls correctly', () => {
      const tracePath = path.join(tmpDir, 'llm.jsonl');

      const events = [
        {
          v: 1,
          type: 'step_start',
          ts: '2025-12-29T10:00:00.000Z',
          step_id: 'step-1',
          data: {},
        },
        {
          v: 1,
          type: 'llm_response',
          ts: '2025-12-29T10:00:01.000Z',
          step_id: 'step-1',
          data: {},
        },
        {
          v: 1,
          type: 'llm_response',
          ts: '2025-12-29T10:00:02.000Z',
          step_id: 'step-1',
          data: {},
        },
      ];

      fs.writeFileSync(tracePath, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

      const index = buildTraceIndex(tracePath);

      expect(index.steps[0].counters.llm_calls).toBe(2);
    });

    it('should skip malformed JSON lines gracefully', () => {
      const tracePath = path.join(tmpDir, 'malformed.jsonl');

      const lines = [
        JSON.stringify({ v: 1, type: 'run_start', ts: '2025-12-29T10:00:00.000Z', data: {} }),
        'this is not valid json', // Malformed line
        JSON.stringify({ v: 1, type: 'run_end', ts: '2025-12-29T10:00:01.000Z', data: {} }),
      ];

      fs.writeFileSync(tracePath, lines.join('\n') + '\n');

      const index = buildTraceIndex(tracePath);

      // Should have 2 valid events (malformed line skipped)
      expect(index.summary.event_count).toBe(2);
    });

    it('should throw error for non-existent file', () => {
      expect(() => {
        buildTraceIndex('/nonexistent/trace.jsonl');
      }).toThrow('Trace file not found');
    });
  });

  describe('writeTraceIndex', () => {
    it('should create index file', () => {
      const tracePath = path.join(tmpDir, 'test.jsonl');

      const event = {
        v: 1,
        type: 'run_start',
        ts: '2025-12-29T10:00:00.000Z',
        data: {},
      };

      fs.writeFileSync(tracePath, JSON.stringify(event) + '\n');

      const indexPath = writeTraceIndex(tracePath);

      expect(fs.existsSync(indexPath)).toBe(true);
      expect(indexPath).toMatch(/\.index\.json$/);

      // Verify index content
      const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      expect(indexData.version).toBe(1);
      expect(indexData.run_id).toBe('test');
      expect(indexData.summary).toBeDefined();
      expect(indexData.steps).toBeDefined();
    });
  });
});
