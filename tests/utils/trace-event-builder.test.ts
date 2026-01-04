/**
 * Tests for trace event builder functionality.
 */

import { describe, it, expect } from '@jest/globals';
import { TraceEventBuilder } from '../../src/utils/trace-event-builder';
import { Snapshot, Element, BBox, VisualCues, Viewport } from '../../src/types';
import { LLMResponse } from '../../src/llm-provider';
import { AgentActResult } from '../../src/agent';
import { SnapshotDiff } from '../../src/snapshot-diff';

function createBBox(x: number = 0, y: number = 0, width: number = 100, height: number = 50): BBox {
  return { x, y, width, height };
}

function createVisualCues(): VisualCues {
  return {
    is_primary: false,
    background_color_name: null,
    is_clickable: true,
  };
}

function createElement(
  id: number,
  options: {
    role?: string;
    text?: string | null;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    importance?: number;
    diff_status?: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'MOVED';
  } = {}
): Element {
  return {
    id,
    role: options.role || 'button',
    text: options.text !== undefined ? options.text : `Element ${id}`,
    importance: options.importance || 500,
    bbox: createBBox(options.x, options.y, options.width, options.height),
    visual_cues: createVisualCues(),
    in_viewport: true,
    is_occluded: false,
    z_index: 0,
    diff_status: options.diff_status,
  };
}

function createSnapshot(elements: Element[], url: string = 'http://example.com'): Snapshot {
  const viewport: Viewport = { width: 1920, height: 1080 };
  return {
    status: 'success',
    url,
    viewport,
    elements,
  };
}

describe('TraceEventBuilder', () => {
  describe('buildStepEndData', () => {
    it('should build basic step_end event with elements in pre field', () => {
      const elements = [
        createElement(1, { text: 'Button 1', diff_status: 'ADDED' }),
        createElement(2, { text: 'Button 2' }),
        createElement(3, { text: 'Button 3', diff_status: 'MODIFIED' }),
      ];
      const snapshot = createSnapshot(elements);

      const llmResponse: LLMResponse = {
        content: 'click(1)',
        modelName: 'gpt-4',
        promptTokens: 100,
        completionTokens: 10,
        totalTokens: 110,
      };

      const result: AgentActResult = {
        success: true,
        action: 'click',
        elementId: 1,
        outcome: 'Clicked element 1',
        urlChanged: true,
        durationMs: 500,
        attempt: 0,
        goal: 'Click the button',
      };

      const stepEndData = TraceEventBuilder.buildStepEndData({
        stepId: 'step-1',
        stepIndex: 1,
        goal: 'Click the button',
        attempt: 0,
        preUrl: 'http://example.com/page1',
        postUrl: 'http://example.com/page2',
        snapshot,
        llmResponse,
        result,
      });

      // Verify basic structure
      expect(stepEndData.v).toBe(1);
      expect(stepEndData.step_id).toBe('step-1');
      expect(stepEndData.step_index).toBe(1);
      expect(stepEndData.goal).toBe('Click the button');
      expect(stepEndData.attempt).toBe(0);

      // Verify pre field exists and contains URL, digest, and elements
      expect(stepEndData.pre).toBeDefined();
      expect(stepEndData.pre!.url).toBe('http://example.com/page1');
      expect(stepEndData.pre!.snapshot_digest).toBeDefined();
      expect(stepEndData.pre!.elements).toBeDefined();
      expect(stepEndData.pre!.elements).toHaveLength(3);

      // Verify element data structure
      const el1 = stepEndData.pre!.elements![0];
      expect(el1.id).toBe(1);
      expect(el1.role).toBe('button');
      expect(el1.text).toBe('Button 1');
      expect(el1.diff_status).toBe('ADDED');
      expect(el1.bbox).toBeDefined();
      expect(el1.importance).toBe(500);
      expect(el1.importance_score).toBeDefined();

      const el2 = stepEndData.pre!.elements![1];
      expect(el2.id).toBe(2);
      expect(el2.diff_status).toBeUndefined();

      const el3 = stepEndData.pre!.elements![2];
      expect(el3.id).toBe(3);
      expect(el3.diff_status).toBe('MODIFIED');

      // Verify other fields
      expect(stepEndData.post).toBeDefined();
      expect(stepEndData.post!.url).toBe('http://example.com/page2');
      expect(stepEndData.llm).toBeDefined();
      expect(stepEndData.exec).toBeDefined();
      expect(stepEndData.verify).toBeDefined();
    });

    it('should include normalized importance_score for each element', () => {
      const elements = [
        createElement(1, { importance: 100, diff_status: 'ADDED' }),
        createElement(2, { importance: 500 }),
        createElement(3, { importance: 1000, diff_status: 'MODIFIED' }),
      ];
      const snapshot = createSnapshot(elements);

      const llmResponse: LLMResponse = {
        content: 'click(2)',
        modelName: 'gpt-4',
        promptTokens: 100,
        completionTokens: 10,
        totalTokens: 110,
      };

      const result: AgentActResult = {
        success: true,
        action: 'click',
        elementId: 2,
        outcome: 'Clicked element 2',
        urlChanged: false,
        durationMs: 300,
        attempt: 0,
        goal: 'Click button',
      };

      const stepEndData = TraceEventBuilder.buildStepEndData({
        stepId: 'step-1',
        stepIndex: 1,
        goal: 'Click button',
        attempt: 0,
        preUrl: 'http://example.com',
        postUrl: 'http://example.com',
        snapshot,
        llmResponse,
        result,
      });

      // Verify importance_score is normalized to [0, 1]
      expect(stepEndData.pre).toBeDefined();
      expect(stepEndData.pre!.elements![0].importance_score).toBeCloseTo(0.0, 2); // Min
      expect(stepEndData.pre!.elements![1].importance_score).toBeCloseTo(0.444, 2); // Mid
      expect(stepEndData.pre!.elements![2].importance_score).toBeCloseTo(1.0, 2); // Max
    });

    it('should handle empty elements array', () => {
      const snapshot = createSnapshot([]);

      const llmResponse: LLMResponse = {
        content: 'navigate("http://example.com")',
        modelName: 'gpt-4',
        promptTokens: 50,
        completionTokens: 5,
        totalTokens: 55,
      };

      const result: AgentActResult = {
        success: true,
        action: 'navigate',
        outcome: 'Navigated to page',
        urlChanged: true,
        durationMs: 200,
        attempt: 0,
        goal: 'Navigate to page',
      };

      const stepEndData = TraceEventBuilder.buildStepEndData({
        stepId: 'step-1',
        stepIndex: 1,
        goal: 'Navigate to page',
        attempt: 0,
        preUrl: 'http://example.com/old',
        postUrl: 'http://example.com',
        snapshot,
        llmResponse,
        result,
      });

      // Should have elements field but it's empty
      expect(stepEndData.pre).toBeDefined();
      expect(stepEndData.pre!.elements).toBeDefined();
      expect(stepEndData.pre!.elements).toHaveLength(0);
    });

    it('should preserve all diff_status types in elements', () => {
      const elements = [
        createElement(1, { text: 'Added', diff_status: 'ADDED' }),
        createElement(2, { text: 'Modified', diff_status: 'MODIFIED' }),
        createElement(3, { text: 'Moved', diff_status: 'MOVED' }),
        createElement(4, { text: 'Unchanged' }), // No diff_status
      ];
      const snapshot = createSnapshot(elements);

      const llmResponse: LLMResponse = {
        content: 'click(1)',
        modelName: 'gpt-4',
        promptTokens: 100,
        completionTokens: 10,
        totalTokens: 110,
      };

      const result: AgentActResult = {
        success: true,
        action: 'click',
        elementId: 1,
        outcome: 'Clicked',
        urlChanged: true,
        durationMs: 500,
        attempt: 0,
        goal: 'Click',
      };

      const stepEndData = TraceEventBuilder.buildStepEndData({
        stepId: 'step-1',
        stepIndex: 1,
        goal: 'Click',
        attempt: 0,
        preUrl: 'http://example.com',
        postUrl: 'http://example.com',
        snapshot,
        llmResponse,
        result,
      });

      expect(stepEndData.pre).toBeDefined();
      const elementsById = new Map(stepEndData.pre!.elements!.map(el => [el.id, el]));

      expect(elementsById.get(1)?.diff_status).toBe('ADDED');
      expect(elementsById.get(2)?.diff_status).toBe('MODIFIED');
      expect(elementsById.get(3)?.diff_status).toBe('MOVED');
      expect(elementsById.get(4)?.diff_status).toBeUndefined();
    });
  });

  describe('integration with SnapshotDiff', () => {
    it('should build step_end event with computed diff_status', () => {
      // Previous snapshot
      const previousElements = [
        createElement(1, { text: 'Button 1' }),
        createElement(2, { text: 'Old Text' }),
      ];
      const previousSnapshot = createSnapshot(previousElements);

      // Current snapshot
      const currentElements = [
        createElement(1, { text: 'Button 1' }), // Unchanged
        createElement(2, { text: 'New Text' }), // Modified
        createElement(3, { text: 'New Button' }), // Added
      ];
      const currentSnapshot = createSnapshot(currentElements);

      // Compute diff_status
      const elementsWithDiff = SnapshotDiff.computeDiffStatus(currentSnapshot, previousSnapshot);

      // Create snapshot with diff_status
      const snapshotWithDiff: Snapshot = {
        ...currentSnapshot,
        elements: elementsWithDiff,
      };

      const llmResponse: LLMResponse = {
        content: 'click(3)',
        modelName: 'gpt-4',
        promptTokens: 120,
        completionTokens: 12,
        totalTokens: 132,
      };

      const result: AgentActResult = {
        success: true,
        action: 'click',
        elementId: 3,
        outcome: 'Clicked new button',
        urlChanged: true,
        durationMs: 400,
        attempt: 0,
        goal: 'Click new button',
      };

      // Build step_end event
      const stepEndData = TraceEventBuilder.buildStepEndData({
        stepId: 'step-1',
        stepIndex: 1,
        goal: 'Click new button',
        attempt: 0,
        preUrl: 'http://example.com',
        postUrl: 'http://example.com/next',
        snapshot: snapshotWithDiff,
        llmResponse,
        result,
      });

      // Verify elements are in step_end event with correct diff_status
      expect(stepEndData.pre).toBeDefined();
      expect(stepEndData.pre!.elements).toBeDefined();
      expect(stepEndData.pre!.elements).toHaveLength(3);

      const elementsById = new Map(stepEndData.pre!.elements!.map(el => [el.id, el]));

      // Element 1: unchanged (diff_status should be undefined)
      expect(elementsById.get(1)?.diff_status).toBeUndefined();

      // Element 2: modified
      expect(elementsById.get(2)?.diff_status).toBe('MODIFIED');

      // Element 3: added
      expect(elementsById.get(3)?.diff_status).toBe('ADDED');
    });
  });
});
