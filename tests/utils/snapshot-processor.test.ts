/**
 * Tests for SnapshotProcessor utility
 */

import { SnapshotProcessor } from '../../src/utils/snapshot-processor';
import { Snapshot, Element, BBox, VisualCues } from '../../src/types';

describe('SnapshotProcessor', () => {
  const createMockElement = (id: number, importance: number = 0.5): Element => ({
    id,
    role: 'button',
    text: `Button ${id}`,
    importance,
    bbox: { x: 10, y: 20, width: 100, height: 30 },
    visual_cues: {
      is_primary: false,
      background_color_name: null,
      is_clickable: true,
    },
    in_viewport: true,
    is_occluded: false,
    z_index: 1,
  });

  const createMockSnapshot = (elements: Element[]): Snapshot => ({
    status: 'success',
    url: 'https://example.com',
    timestamp: new Date().toISOString(),
    elements,
  });

  describe('process', () => {
    it('should process snapshot with diff status and filtering', () => {
      const elements = [
        createMockElement(1, 0.9),
        createMockElement(2, 0.8),
        createMockElement(3, 0.7),
        createMockElement(4, 0.6),
        createMockElement(5, 0.5),
      ];
      const snap = createMockSnapshot(elements);

      const processed = SnapshotProcessor.process(snap, undefined, 'test goal', 3);

      expect(processed.original).toBe(snap);
      expect(processed.withDiff.elements.length).toBe(5);
      expect(processed.filtered.elements.length).toBe(3); // Limited to 3
      expect(processed.filtered.elements[0].importance).toBe(0.9); // Sorted by importance
    });

    it('should compute diff status when previous snapshot provided', () => {
      const prevElements = [createMockElement(1, 0.9), createMockElement(2, 0.8)];
      const prevSnap = createMockSnapshot(prevElements);

      const currElements = [createMockElement(1, 0.9), createMockElement(3, 0.8)];
      const currSnap = createMockSnapshot(currElements);

      const processed = SnapshotProcessor.process(currSnap, prevSnap, 'test', 10);

      // Should include: element 1 (unchanged), element 3 (ADDED), element 2 (REMOVED)
      expect(processed.withDiff.elements.length).toBe(3);
      const element1 = processed.withDiff.elements.find(el => el.id === 1);
      const element2 = processed.withDiff.elements.find(el => el.id === 2);
      const element3 = processed.withDiff.elements.find(el => el.id === 3);
      expect(element1).toBeDefined();
      expect(element2).toBeDefined();
      expect(element3).toBeDefined();
      // Element 3 should be ADDED
      expect(element3?.diff_status).toBe('ADDED');
      // Element 2 should be REMOVED
      expect(element2?.diff_status).toBe('REMOVED');
    });

    it('should filter elements by goal', () => {
      const elements = [
        { ...createMockElement(1, 0.9), text: 'search button' },
        { ...createMockElement(2, 0.8), text: 'submit button' },
        { ...createMockElement(3, 0.7), text: 'cancel button' },
      ];
      const snap = createMockSnapshot(elements);

      const processed = SnapshotProcessor.process(snap, undefined, 'search', 10);

      // Should boost elements matching "search" keyword
      expect(processed.filtered.elements.length).toBeGreaterThan(0);
      const searchElement = processed.filtered.elements.find(el => el.text?.includes('search'));
      expect(searchElement).toBeDefined();
    });
  });
});
