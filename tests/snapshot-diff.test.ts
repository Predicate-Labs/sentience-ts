/**
 * Tests for snapshot diff functionality (diff_status detection).
 */

import { describe, it, expect } from '@jest/globals';
import { SnapshotDiff } from '../src/snapshot-diff';
import { Element, Snapshot, BBox, VisualCues, Viewport } from '../src/types';

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
  } = {}
): Element {
  return {
    id,
    role: options.role || 'button',
    text: options.text !== undefined ? options.text : `Element ${id}`,
    importance: 500,
    bbox: createBBox(options.x, options.y, options.width, options.height),
    visual_cues: createVisualCues(),
    in_viewport: true,
    is_occluded: false,
    z_index: 0,
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

describe('SnapshotDiff', () => {
  describe('first snapshot', () => {
    it('should mark all elements as ADDED when no previous snapshot', () => {
      const elements = [
        createElement(1, { text: 'Button 1' }),
        createElement(2, { text: 'Button 2' }),
      ];
      const current = createSnapshot(elements);

      const result = SnapshotDiff.computeDiffStatus(current, undefined);

      expect(result).toHaveLength(2);
      expect(result.every(el => el.diff_status === 'ADDED')).toBe(true);
    });
  });

  describe('unchanged elements', () => {
    it('should not set diff_status for unchanged elements', () => {
      const elements = [createElement(1, { text: 'Button 1' })];
      const previous = createSnapshot(elements);
      const current = createSnapshot(elements);

      const result = SnapshotDiff.computeDiffStatus(current, previous);

      expect(result).toHaveLength(1);
      expect(result[0].diff_status).toBeUndefined();
    });
  });

  describe('new elements', () => {
    it('should mark new elements as ADDED', () => {
      const previousElements = [createElement(1, { text: 'Button 1' })];
      const currentElements = [
        createElement(1, { text: 'Button 1' }),
        createElement(2, { text: 'Button 2' }), // New element
      ];

      const previous = createSnapshot(previousElements);
      const current = createSnapshot(currentElements);

      const result = SnapshotDiff.computeDiffStatus(current, previous);

      const newElement = result.find(el => el.id === 2);
      expect(newElement?.diff_status).toBe('ADDED');

      const existingElement = result.find(el => el.id === 1);
      expect(existingElement?.diff_status).toBeUndefined();
    });
  });

  describe('removed elements', () => {
    it('should include removed elements with REMOVED status', () => {
      const previousElements = [
        createElement(1, { text: 'Button 1' }),
        createElement(2, { text: 'Button 2' }),
      ];
      const currentElements = [createElement(1, { text: 'Button 1' })];

      const previous = createSnapshot(previousElements);
      const current = createSnapshot(currentElements);

      const result = SnapshotDiff.computeDiffStatus(current, previous);

      // Should include both current element and removed element
      expect(result).toHaveLength(2);

      const removedElement = result.find(el => el.id === 2);
      expect(removedElement?.diff_status).toBe('REMOVED');
    });
  });

  describe('moved elements', () => {
    it('should mark elements that changed position as MOVED', () => {
      const previousElements = [createElement(1, { x: 100, y: 100 })];
      const currentElements = [createElement(1, { x: 200, y: 100 })]; // Moved 100px right

      const previous = createSnapshot(previousElements);
      const current = createSnapshot(currentElements);

      const result = SnapshotDiff.computeDiffStatus(current, previous);

      expect(result).toHaveLength(1);
      expect(result[0].diff_status).toBe('MOVED');
    });

    it('should not detect movement for small position changes', () => {
      const previousElements = [createElement(1, { x: 100, y: 100 })];
      const currentElements = [createElement(1, { x: 102, y: 102 })]; // Moved 2px (< 5px threshold)

      const previous = createSnapshot(previousElements);
      const current = createSnapshot(currentElements);

      const result = SnapshotDiff.computeDiffStatus(current, previous);

      expect(result).toHaveLength(1);
      expect(result[0].diff_status).toBeUndefined(); // No change detected
    });
  });

  describe('modified elements', () => {
    it('should mark elements with changed text as MODIFIED', () => {
      const previousElements = [createElement(1, { text: 'Old Text' })];
      const currentElements = [createElement(1, { text: 'New Text' })];

      const previous = createSnapshot(previousElements);
      const current = createSnapshot(currentElements);

      const result = SnapshotDiff.computeDiffStatus(current, previous);

      expect(result).toHaveLength(1);
      expect(result[0].diff_status).toBe('MODIFIED');
    });

    it('should mark elements with changed role as MODIFIED', () => {
      const previousElements = [createElement(1, { role: 'button' })];
      const currentElements = [createElement(1, { role: 'link' })];

      const previous = createSnapshot(previousElements);
      const current = createSnapshot(currentElements);

      const result = SnapshotDiff.computeDiffStatus(current, previous);

      expect(result).toHaveLength(1);
      expect(result[0].diff_status).toBe('MODIFIED');
    });

    it('should mark elements with both position and content changes as MODIFIED', () => {
      const previousElements = [createElement(1, { text: 'Old', x: 100 })];
      const currentElements = [createElement(1, { text: 'New', x: 200 })];

      const previous = createSnapshot(previousElements);
      const current = createSnapshot(currentElements);

      const result = SnapshotDiff.computeDiffStatus(current, previous);

      expect(result).toHaveLength(1);
      expect(result[0].diff_status).toBe('MODIFIED');
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple types of changes in one snapshot', () => {
      const previousElements = [
        createElement(1, { text: 'Unchanged' }),
        createElement(2, { text: 'Will be removed' }),
        createElement(3, { text: 'Old text' }),
        createElement(4, { x: 100 }),
      ];

      const currentElements = [
        createElement(1, { text: 'Unchanged' }),
        // Element 2 removed
        createElement(3, { text: 'New text' }), // Modified
        createElement(4, { x: 200 }), // Moved
        createElement(5, { text: 'New element' }), // Added
      ];

      const previous = createSnapshot(previousElements);
      const current = createSnapshot(currentElements);

      const result = SnapshotDiff.computeDiffStatus(current, previous);

      // Should have 5 elements (4 current + 1 removed)
      expect(result).toHaveLength(5);

      const el1 = result.find(el => el.id === 1);
      expect(el1?.diff_status).toBeUndefined(); // Unchanged

      const el2 = result.find(el => el.id === 2);
      expect(el2?.diff_status).toBe('REMOVED');

      const el3 = result.find(el => el.id === 3);
      expect(el3?.diff_status).toBe('MODIFIED');

      const el4 = result.find(el => el.id === 4);
      expect(el4?.diff_status).toBe('MOVED');

      const el5 = result.find(el => el.id === 5);
      expect(el5?.diff_status).toBe('ADDED');
    });
  });

  describe('edge cases', () => {
    it('should handle empty current snapshot', () => {
      const previousElements = [createElement(1), createElement(2)];
      const previous = createSnapshot(previousElements);
      const current = createSnapshot([]);

      const result = SnapshotDiff.computeDiffStatus(current, previous);

      // Should have 2 removed elements
      expect(result).toHaveLength(2);
      expect(result.every(el => el.diff_status === 'REMOVED')).toBe(true);
    });

    it('should handle empty previous snapshot', () => {
      const currentElements = [createElement(1), createElement(2)];
      const previous = createSnapshot([]);
      const current = createSnapshot(currentElements);

      const result = SnapshotDiff.computeDiffStatus(current, previous);

      // Should have 2 added elements
      expect(result).toHaveLength(2);
      expect(result.every(el => el.diff_status === 'ADDED')).toBe(true);
    });
  });
});
