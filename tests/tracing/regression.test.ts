/**
 * Regression Tests for Tracing
 *
 * Ensures tracing additions don't break existing SDK functionality
 */

import { Tracer, JsonlTraceSink, TraceEvent, TraceEventData, TraceSink } from '../../src/tracing';

describe('Tracing Module - Regression Tests', () => {
  describe('Exports', () => {
    it('should export all tracing classes and types', () => {
      expect(Tracer).toBeDefined();
      expect(JsonlTraceSink).toBeDefined();
      expect(TraceSink).toBeDefined();
    });

    it('should export TypeScript types', () => {
      // Type-only check - ensures types are exported
      const event: TraceEvent = {
        v: 1,
        type: 'test',
        ts: new Date().toISOString(),
        run_id: 'test',
        seq: 1,
        data: {},
      };

      const data: TraceEventData = {
        goal: 'test goal',
      };

      expect(event).toBeDefined();
      expect(data).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should not require uuid package for basic usage', () => {
      // Users can provide their own run IDs (no uuid required)
      const sink = new JsonlTraceSink('/tmp/test.jsonl');
      const tracer = new Tracer('my-custom-run-id', sink);

      expect(tracer.getRunId()).toBe('my-custom-run-id');

      tracer.close();
    });

    it('should work with string run IDs', () => {
      const sink = new JsonlTraceSink('/tmp/test.jsonl');

      // Should accept any string
      const tracer1 = new Tracer('simple-id', sink);
      expect(tracer1.getRunId()).toBe('simple-id');

      const tracer2 = new Tracer('123e4567-e89b-12d3-a456-426614174000', sink);
      expect(tracer2.getRunId()).toBe('123e4567-e89b-12d3-a456-426614174000');

      tracer1.close();
      tracer2.close();
    });
  });

  describe('Module Structure', () => {
    it('should have proper TypeScript module structure', () => {
      // Ensure classes can be instantiated
      const sink = new JsonlTraceSink('/tmp/test.jsonl');
      expect(sink).toBeInstanceOf(JsonlTraceSink);
      expect(sink).toBeInstanceOf(TraceSink);

      const tracer = new Tracer('test', sink);
      expect(tracer).toBeInstanceOf(Tracer);

      tracer.close();
    });

    it('should allow extending TraceSink', () => {
      class CustomSink extends TraceSink {
        emit(event: Record<string, any>): void {
          // Custom implementation
        }

        async close(): Promise<void> {
          // Custom implementation
        }

        getSinkType(): string {
          return 'CustomSink';
        }
      }

      const customSink = new CustomSink();
      expect(customSink).toBeInstanceOf(TraceSink);
      expect(customSink.getSinkType()).toBe('CustomSink');
    });
  });

  describe('Performance', () => {
    it('should have minimal overhead for event emission', () => {
      const sink = new JsonlTraceSink('/tmp/perf-test.jsonl');
      const tracer = new Tracer('perf-test', sink);

      const start = Date.now();

      // Emit 1000 events
      for (let i = 0; i < 1000; i++) {
        tracer.emit('test', { index: i } as any);
      }

      const duration = Date.now() - start;

      // Should complete in less than 1 second (very generous threshold)
      expect(duration).toBeLessThan(1000);

      tracer.close();
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory on close', async () => {
      const sink = new JsonlTraceSink('/tmp/memory-test.jsonl');
      const tracer = new Tracer('memory-test', sink);

      tracer.emit('test', { data: 'test' } as any);

      await tracer.close();

      // Attempting to emit after close should be safe (no crash)
      sink.emit({ test: 'after close' } as any);

      expect(sink.isClosed()).toBe(true);
    });
  });

  describe('Error Resilience', () => {
    it('should handle errors gracefully without crashing', () => {
      const sink = new JsonlTraceSink('/tmp/error-test.jsonl');
      const tracer = new Tracer('error-test', sink);

      // Should not throw
      expect(() => {
        tracer.emit('test', {});
        tracer.emitRunStart('Agent');
        tracer.emitStepStart('step-1', 1, 'goal');
        tracer.emitError('step-1', 'error message');
        tracer.emitRunEnd(1);
      }).not.toThrow();

      tracer.close();
    });
  });
});
