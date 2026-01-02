/**
 * Tests for Tracer
 */

import * as fs from 'fs';
import * as path from 'path';
import { Tracer } from '../../src/tracing/tracer';
import { JsonlTraceSink } from '../../src/tracing/jsonl-sink';
import { TraceSink } from '../../src/tracing/sink';
import { TraceEvent } from '../../src/tracing/types';

describe('Tracer', () => {
  const testDir = path.join(__dirname, 'test-traces');
  const testFile = path.join(testDir, 'tracer-test.jsonl');

  beforeEach(() => {
    // Clean up and recreate test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
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

  describe('Basic functionality', () => {
    it('should create tracer with run ID and sink', () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run-123', sink);

      expect(tracer.getRunId()).toBe('test-run-123');
      expect(tracer.getSeq()).toBe(0);

      tracer.close();
    });

    it('should auto-increment sequence numbers', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emit('event1', {});
      expect(tracer.getSeq()).toBe(1);

      tracer.emit('event2', {});
      expect(tracer.getSeq()).toBe(2);

      tracer.emit('event3', {});
      expect(tracer.getSeq()).toBe(3);

      await tracer.close();
    });

    it('should generate timestamps in ISO 8601 format', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      const before = Date.now();
      tracer.emit('test', { data: 'test' });
      const after = Date.now();

      await tracer.close();
      
      // Wait a bit for file to be fully written and flushed (Windows needs this)
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify file exists before reading
      if (!fs.existsSync(testFile)) {
        throw new Error(`Trace file not created: ${testFile}`);
      }

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;

      expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(event.ts_ms).toBeGreaterThanOrEqual(before);
      expect(event.ts_ms).toBeLessThanOrEqual(after);
    });

    it('should include all required fields in emitted events', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run-456', sink);

      tracer.emit('test_event', { key: 'value' }, 'step-123');

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;

      expect(event.v).toBe(1);
      expect(event.type).toBe('test_event');
      expect(event.ts).toBeDefined();
      expect(event.ts_ms).toBeDefined();
      expect(event.run_id).toBe('test-run-456');
      expect(event.seq).toBe(1);
      expect(event.data).toEqual({ key: 'value' });
      expect(event.step_id).toBe('step-123');
    });

    it('should omit step_id if not provided', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emit('test_event', { key: 'value' });

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;

      expect(event.step_id).toBeUndefined();
    });
  });

  describe('Convenience methods', () => {
    it('should emit run_start event', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitRunStart('SentienceAgent', 'gpt-4o', { timeout: 30000 });

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;

      expect(event.type).toBe('run_start');
      expect(event.data.agent).toBe('SentienceAgent');
      expect(event.data.llm_model).toBe('gpt-4o');
      expect(event.data.config).toEqual({ timeout: 30000 });
      expect(event.step_id).toBeUndefined();
    });

    it('should emit run_start with optional fields', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitRunStart('SentienceAgent');

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;

      expect(event.type).toBe('run_start');
      expect(event.data.agent).toBe('SentienceAgent');
      expect(event.data.llm_model).toBeUndefined();
      expect(event.data.config).toBeUndefined();
    });

    it('should emit step_start event', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitStepStart('step-001', 1, 'Click the button', 0, 'https://example.com');

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;

      expect(event.type).toBe('step_start');
      expect(event.step_id).toBe('step-001');
      expect(event.data.step_id).toBe('step-001');
      expect(event.data.step_index).toBe(1);
      expect(event.data.goal).toBe('Click the button');
      expect(event.data.attempt).toBe(0);
      expect(event.data.url).toBe('https://example.com');
    });

    it('should emit step_start with default attempt and no URL', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitStepStart('step-002', 2, 'Type text');

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;

      expect(event.type).toBe('step_start');
      expect(event.data.attempt).toBe(0);
      expect(event.data.url).toBeUndefined();
    });

    it('should emit run_end event', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitRunEnd(5);

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;

      expect(event.type).toBe('run_end');
      expect(event.data.steps).toBe(5);
      expect(event.data.status).toBe('unknown'); // Default status
      expect(event.step_id).toBeUndefined();
    });

    it('should emit run_end event with status parameter', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitRunEnd(5, 'success');

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;

      expect(event.type).toBe('run_end');
      expect(event.data.steps).toBe(5);
      expect(event.data.status).toBe('success');
    });

    it('should track execution statistics', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      // Emit run_start (should track startedAt)
      tracer.emitRunStart('TestAgent', 'gpt-4');
      expect(tracer.getStats().started_at).not.toBeNull();
      expect(tracer.getStats().total_events).toBe(1);

      // Emit step_start (should track totalSteps)
      tracer.emitStepStart('step-1', 1, 'Goal 1', 0);
      expect(tracer.getStats().total_steps).toBe(1);
      expect(tracer.getStats().total_events).toBe(2);

      tracer.emitStepStart('step-2', 2, 'Goal 2', 0);
      expect(tracer.getStats().total_steps).toBe(2);
      expect(tracer.getStats().total_events).toBe(3);

      // Emit run_end (should track endedAt)
      tracer.emitRunEnd(2);
      expect(tracer.getStats().ended_at).not.toBeNull();
      expect(tracer.getStats().total_events).toBe(4);

      // Get stats
      const stats = tracer.getStats();
      expect(stats.total_steps).toBe(2);
      expect(stats.total_events).toBe(4);
      expect(stats.final_status).toBe('unknown');
      expect(stats.started_at).not.toBeNull();
      expect(stats.ended_at).not.toBeNull();
      expect(stats.duration_ms).not.toBeNull();
      expect(stats.duration_ms).toBeGreaterThanOrEqual(0);

      await tracer.close();
    });

    it('should set final status', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      // Default status is "unknown"
      expect(tracer.getStats().final_status).toBe('unknown');

      // Set status
      tracer.setFinalStatus('success');
      expect(tracer.getStats().final_status).toBe('success');

      // Status should be included in run_end
      tracer.emitRunEnd(1);

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;
      expect(event.data.status).toBe('success');
    });

    it('should reject invalid final status', () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      // Invalid status should throw error
      expect(() => {
        tracer.setFinalStatus('invalid' as any);
      }).toThrow('Invalid status');
    });

    it('should emit error event', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitError('step-003', 'Element not found', 2);

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;

      expect(event.type).toBe('error');
      expect(event.step_id).toBe('step-003');
      expect(event.data.step_id).toBe('step-003');
      expect(event.data.error).toBe('Element not found');
      expect(event.data.attempt).toBe(2);
    });

    it('should emit error with default attempt', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitError('step-004', 'Timeout');

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const event = JSON.parse(content.trim()) as TraceEvent;

      expect(event.data.attempt).toBe(0);
    });
  });

  describe('Integration', () => {
    it('should produce valid event sequence', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      // Simulate agent execution
      tracer.emitRunStart('SentienceAgent', 'gpt-4o');
      tracer.emitStepStart('step-1', 1, 'Navigate to page', 0, 'https://start.com');
      tracer.emit('snapshot', { url: 'https://start.com', elements: [] }, 'step-1');
      tracer.emit('action', { action_type: 'click', element_id: 5 }, 'step-1');
      tracer.emitStepStart('step-2', 2, 'Fill form', 0, 'https://form.com');
      tracer.emit('action', { action_type: 'type', text: 'test' }, 'step-2');
      tracer.emitRunEnd(2);

      await tracer.close();

      const content = fs.readFileSync(testFile, 'utf-8');
      const lines = content.trim().split('\n');
      const events = lines.map(line => JSON.parse(line) as TraceEvent);

      expect(events.length).toBe(7);

      // Check sequence numbers
      events.forEach((event, index) => {
        expect(event.seq).toBe(index + 1);
      });

      // Check event types
      expect(events[0].type).toBe('run_start');
      expect(events[1].type).toBe('step_start');
      expect(events[2].type).toBe('snapshot');
      expect(events[3].type).toBe('action');
      expect(events[4].type).toBe('step_start');
      expect(events[5].type).toBe('action');
      expect(events[6].type).toBe('run_end');

      // Check all events have same run_id
      events.forEach(event => {
        expect(event.run_id).toBe('test-run');
      });

      // Check step IDs
      expect(events[1].step_id).toBe('step-1');
      expect(events[2].step_id).toBe('step-1');
      expect(events[3].step_id).toBe('step-1');
      expect(events[4].step_id).toBe('step-2');
      expect(events[5].step_id).toBe('step-2');
    });
  });

  describe('Error handling', () => {
    it('should close sink when tracer is closed', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emit('test', {});
      await tracer.close();

      expect(sink.isClosed()).toBe(true);
    });

    it('should work with custom sink implementations', async () => {
      class MockSink extends TraceSink {
        public events: any[] = [];
        public closeCount = 0;

        emit(event: Record<string, any>): void {
          this.events.push(event);
        }

        async close(): Promise<void> {
          this.closeCount++;
        }

        getSinkType(): string {
          return 'MockSink';
        }
      }

      const mockSink = new MockSink();
      const tracer = new Tracer('test-run', mockSink);

      tracer.emit('event1', { data: 1 });
      tracer.emit('event2', { data: 2 });

      expect(mockSink.events.length).toBe(2);
      expect(mockSink.events[0].type).toBe('event1');
      expect(mockSink.events[1].type).toBe('event2');

      await tracer.close();
      expect(mockSink.closeCount).toBe(1);
    });
  });

  describe('getSinkType', () => {
    it('should return sink type from underlying sink', () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      expect(tracer.getSinkType()).toBe(`JsonlTraceSink(${testFile})`);

      tracer.close();
    });
  });

  describe('Automatic status inference', () => {
    it('should automatically infer final status from step outcomes', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitRunStart('TestAgent', 'gpt-4');

      // Emit successful step
      tracer.emitStepStart('step-1', 1, 'Goal 1', 0);
      tracer.emit('step_end', { success: true, action: 'click' }, 'step-1');

      // Emit another successful step
      tracer.emitStepStart('step-2', 2, 'Goal 2', 0);
      tracer.emit('step_end', { success: true, action: 'type' }, 'step-2');

      // Close without explicitly setting status or calling emitRunEnd
      // Status should be auto-inferred as "success"
      await tracer.close();

      // Verify status was auto-inferred
      expect(tracer.getStats().final_status).toBe('success');

      // Verify stats reflect the inferred status
      const stats = tracer.getStats();
      expect(stats.final_status).toBe('success');
      expect(stats.total_steps).toBe(2);
    });

    it('should automatically infer "partial" status when there are both successes and errors', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitRunStart('TestAgent', 'gpt-4');

      // Emit successful step
      tracer.emitStepStart('step-1', 1, 'Goal 1', 0);
      tracer.emit('step_end', { success: true, action: 'click' }, 'step-1');

      // Emit error
      tracer.emitError('step-2', 'Element not found', 0);

      // Close without explicitly setting status
      await tracer.close();

      // Verify status was auto-inferred as "partial" (has both successes and errors)
      expect(tracer.getStats().final_status).toBe('partial');
    });

    it('should automatically infer "failure" status when there are only errors', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitRunStart('TestAgent', 'gpt-4');

      // Emit error without any successful steps
      tracer.emitError('step-1', 'Element not found', 0);

      // Close without explicitly setting status
      await tracer.close();

      // Verify status was auto-inferred as "failure" (only errors, no successes)
      expect(tracer.getStats().final_status).toBe('failure');
    });

    it('should not override explicitly set status', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitRunStart('TestAgent', 'gpt-4');

      // Emit successful step
      tracer.emitStepStart('step-1', 1, 'Goal 1', 0);
      tracer.emit('step_end', { success: true, action: 'click' }, 'step-1');

      // Explicitly set status to "partial" (even though we have success)
      tracer.setFinalStatus('partial');

      // Close - should not override explicit status
      await tracer.close();

      // Verify explicit status was preserved
      expect(tracer.getStats().final_status).toBe('partial');
    });

    it('should set final_status automatically when close() is called', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitRunStart('TestAgent', 'gpt-4');

      // Emit successful steps
      tracer.emitStepStart('step-1', 1, 'Goal 1', 0);
      tracer.emit('step_end', { success: true, action: 'click' }, 'step-1');

      tracer.emitStepStart('step-2', 2, 'Goal 2', 0);
      tracer.emit('step_end', { success: true, action: 'type' }, 'step-2');

      // Verify status is still "unknown" before close
      expect(tracer.getStats().final_status).toBe('unknown');

      // Close should auto-infer status
      await tracer.close();

      // Verify status was auto-inferred after close
      expect(tracer.getStats().final_status).toBe('success');
      expect(tracer.getStats().total_steps).toBe(2);
    });

    it('should include auto-inferred final_status in run_end event when emitRunEnd is called', async () => {
      const sink = new JsonlTraceSink(testFile);
      const tracer = new Tracer('test-run', sink);

      tracer.emitRunStart('TestAgent', 'gpt-4');

      // Emit successful step
      tracer.emitStepStart('step-1', 1, 'Goal 1', 0);
      tracer.emit('step_end', { success: true, action: 'click' }, 'step-1');

      // Verify status is still "unknown" before emitRunEnd
      expect(tracer.getStats().final_status).toBe('unknown');

      // emitRunEnd should auto-infer status if not provided
      tracer.emitRunEnd(1);

      // Verify status was auto-inferred
      expect(tracer.getStats().final_status).toBe('success');

      // Close the tracer
      await tracer.close();

      // Read trace file and verify run_end event has the inferred status
      const content = fs.readFileSync(testFile, 'utf-8');
      const lines = content.trim().split('\n');
      const runEndEvents = lines
        .map(line => JSON.parse(line))
        .filter((event: any) => event.type === 'run_end');

      expect(runEndEvents.length).toBeGreaterThan(0);
      // The run_end event should have the auto-inferred status
      const lastRunEnd = runEndEvents[runEndEvents.length - 1];
      expect(lastRunEnd.data.status).toBe('success');
    });

    it('should include auto-inferred final_status in stats when close() is called with CloudTraceSink', async () => {
      const { CloudTraceSink } = await import('../../src/tracing/cloud-sink');

      const uploadUrl = 'https://sentience.nyc3.digitaloceanspaces.com/user123/run456/trace.jsonl.gz';
      const runId = 'test-close-status-' + Date.now();
      const apiKey = 'sk_test_123';
      const apiUrl = 'https://api.sentience.ai';

      const sink = new CloudTraceSink(uploadUrl, runId, apiKey, apiUrl);
      const tracer = new Tracer(runId, sink);

      tracer.emitRunStart('TestAgent', 'gpt-4');

      // Emit successful step
      tracer.emitStepStart('step-1', 1, 'Goal 1', 0);
      tracer.emit('step_end', { success: true, action: 'click' }, 'step-1');

      // Verify status is still "unknown" before close
      expect(tracer.getStats().final_status).toBe('unknown');

      // Note: We don't actually call close() here because it would try to upload
      // Instead, we verify that the status inference logic works correctly
      // The actual upload and completion request are tested in cloud-sink.test.ts

      // Manually trigger the inference logic (simulating what close() does)
      if (tracer.getStats().final_status === 'unknown') {
        // Access private method via type assertion (for testing only)
        (tracer as any)._inferFinalStatus();
      }

      // Verify status was auto-inferred
      expect(tracer.getStats().final_status).toBe('success');
    });
  });
});
