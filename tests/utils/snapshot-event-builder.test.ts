/**
 * Tests for SnapshotEventBuilder utility
 */

import { SnapshotEventBuilder } from '../../src/utils/snapshot-event-builder';
import { Snapshot, Element, BBox, VisualCues } from '../../src/types';
import { TraceEventData } from '../../src/tracing/types';

describe('SnapshotEventBuilder', () => {
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

  describe('buildSnapshotEventData', () => {
    it('should build snapshot event data with normalized importance scores', () => {
      const elements = [
        createMockElement(1, 0.1),
        createMockElement(2, 0.5),
        createMockElement(3, 0.9),
      ];
      const snap = createMockSnapshot(elements);

      const eventData = SnapshotEventBuilder.buildSnapshotEventData(snap);

      expect(eventData.url).toBe('https://example.com');
      expect(eventData.element_count).toBe(3);
      expect(eventData.elements).toBeDefined();
      expect(eventData.elements?.length).toBe(3);

      // Check normalized importance scores (0-1 range)
      const scores = eventData.elements!.map(el => el.importance_score!);
      expect(Math.min(...scores)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...scores)).toBeLessThanOrEqual(1);
    });

    it('should handle empty elements array', () => {
      const snap = createMockSnapshot([]);

      const eventData = SnapshotEventBuilder.buildSnapshotEventData(snap);

      expect(eventData.element_count).toBe(0);
      // Elements array may be empty but still defined
      expect(eventData.elements).toBeDefined();
      expect(eventData.elements?.length).toBe(0);
    });

    it('should include screenshot if present', () => {
      const snap: Snapshot = {
        ...createMockSnapshot([createMockElement(1)]),
        screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANS',
        screenshot_format: 'png',
      };

      const eventData = SnapshotEventBuilder.buildSnapshotEventData(snap);

      expect(eventData.screenshot_base64).toBe('iVBORw0KGgoAAAANS');
      expect(eventData.screenshot_format).toBe('png');
    });

    it('should extract base64 from data URL', () => {
      const snap: Snapshot = {
        ...createMockSnapshot([createMockElement(1)]),
        screenshot: 'data:image/jpeg;base64,test123',
      };

      const eventData = SnapshotEventBuilder.buildSnapshotEventData(snap);

      expect(eventData.screenshot_base64).toBe('test123');
    });

    it('should include step_id if provided', () => {
      const snap = createMockSnapshot([createMockElement(1)]);
      const stepId = 'test-step-id';

      const eventData = SnapshotEventBuilder.buildSnapshotEventData(snap, stepId);

      expect(eventData.step_id).toBe(stepId);
    });

    it('should set importance_score to 0.5 when all elements have same importance', () => {
      const elements = [
        createMockElement(1, 0.5),
        createMockElement(2, 0.5),
        createMockElement(3, 0.5),
      ];
      const snap = createMockSnapshot(elements);

      const eventData = SnapshotEventBuilder.buildSnapshotEventData(snap);

      eventData.elements?.forEach(el => {
        expect(el.importance_score).toBe(0.5);
      });
    });
  });
});
