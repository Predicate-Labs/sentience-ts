/**
 * Tests for SentienceContext (Token-Slasher Context Middleware).
 *
 * These tests verify the formatting logic and element selection strategy
 * without requiring a real browser or extension.
 */

import {
  SentienceContext,
  SentienceContextState,
  TopElementSelector,
} from '../../src/backends/sentience-context';
import type { Element, Snapshot, BBox, VisualCues, Viewport } from '../../src/types';

/**
 * Helper to create test elements with defaults.
 */
function makeElement(params: {
  id: number;
  role?: string;
  text?: string;
  importance?: number;
  bbox?: BBox;
  visual_cues?: VisualCues;
  doc_y?: number;
  group_key?: string;
  group_index?: number;
  in_dominant_group?: boolean;
  href?: string;
}): Element {
  return {
    id: params.id,
    role: params.role ?? 'button',
    text: params.text ?? null,
    importance: params.importance ?? 50,
    bbox: params.bbox ?? { x: 0, y: 0, width: 100, height: 30 },
    visual_cues: params.visual_cues ?? {
      is_primary: false,
      background_color_name: null,
      is_clickable: true,
    },
    in_viewport: true,
    is_occluded: false,
    z_index: 1,
    doc_y: params.doc_y,
    group_key: params.group_key,
    group_index: params.group_index,
    in_dominant_group: params.in_dominant_group,
    href: params.href,
  };
}

/**
 * Helper to create test snapshots.
 */
function makeSnapshot(elements: Element[], dominant_group_key?: string): Snapshot {
  return {
    status: 'success',
    url: 'https://example.com',
    viewport: { width: 1920, height: 1080 },
    elements,
    dominant_group_key,
  };
}

describe('SentienceContext', () => {
  describe('initialization', () => {
    it('should use default values', () => {
      const ctx = new SentienceContext();

      expect(ctx.selector.byImportance).toBe(60);
      expect(ctx.selector.fromDominantGroup).toBe(15);
      expect(ctx.selector.byPosition).toBe(10);
    });

    it('should use custom values', () => {
      const ctx = new SentienceContext({
        predicateApiKey: 'test-key',
        maxElements: 100,
        showOverlay: true,
        topElementSelector: {
          byImportance: 30,
          fromDominantGroup: 10,
          byPosition: 5,
        },
      });

      expect(ctx.selector.byImportance).toBe(30);
      expect(ctx.selector.fromDominantGroup).toBe(10);
      expect(ctx.selector.byPosition).toBe(5);
    });

    it('should have correct default selector values', () => {
      const ctx = new SentienceContext({
        topElementSelector: {},
      });
      expect(ctx.selector.byImportance).toBe(60);
      expect(ctx.selector.fromDominantGroup).toBe(15);
      expect(ctx.selector.byPosition).toBe(10);
    });
  });

  describe('_formatSnapshotForLLM', () => {
    it('should format basic elements', () => {
      const ctx = new SentienceContext({
        topElementSelector: {
          byImportance: 10,
          fromDominantGroup: 5,
          byPosition: 5,
        },
      });

      const elements = [
        makeElement({ id: 1, role: 'button', text: 'Click me', importance: 80 }),
        makeElement({
          id: 2,
          role: 'link',
          text: 'Go home',
          importance: 60,
          href: 'https://example.com',
        }),
      ];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const lines = result.trim().split('\n');

      expect(lines).toHaveLength(2);
      // Check format: ID|role|text|imp|is_primary|docYq|ord|DG|href
      const parts = lines[0].split('|');
      expect(parts[0]).toBe('1'); // id
      expect(parts[1]).toBe('button'); // role
      expect(parts[2]).toBe('Click me'); // text
      expect(parts[3]).toBe('80'); // importance
      expect(parts[4]).toBe('0'); // is_primary (False)
    });

    it('should set is_primary flag correctly from visual_cues', () => {
      const ctx = new SentienceContext({
        topElementSelector: {
          byImportance: 10,
          fromDominantGroup: 5,
          byPosition: 5,
        },
      });

      const elements = [
        makeElement({
          id: 1,
          role: 'button',
          text: 'Primary CTA',
          importance: 90,
          visual_cues: { is_primary: true, background_color_name: null, is_clickable: true },
        }),
        makeElement({
          id: 2,
          role: 'button',
          text: 'Secondary',
          importance: 70,
          visual_cues: { is_primary: false, background_color_name: null, is_clickable: true },
        }),
      ];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const lines = result.trim().split('\n');

      // First element should have is_primary=1
      const parts1 = lines[0].split('|');
      expect(parts1[4]).toBe('1');

      // Second element should have is_primary=0
      const parts2 = lines[1].split('|');
      expect(parts2[4]).toBe('0');
    });

    it('should override role to link when element has href', () => {
      const ctx = new SentienceContext();

      const elements = [
        makeElement({
          id: 1,
          role: 'button',
          text: 'Button with href',
          importance: 80,
          href: 'https://example.com',
        }),
      ];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const parts = result.trim().split('|');

      expect(parts[1]).toBe('link');
    });

    it('should normalize whitespace in text', () => {
      const ctx = new SentienceContext({ topElementSelector: { byImportance: 10 } });

      const elements = [
        makeElement({
          id: 1,
          role: 'button',
          text: 'Line1\nLine2\tTabbed   Spaces',
          importance: 80,
        }),
      ];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const parts = result.trim().split('|');

      // All whitespace should be normalized to single spaces
      expect(parts[2]).toBe('Line1 Line2 Tabbed Spaces');
    });

    it('should truncate long text to 30 chars', () => {
      const ctx = new SentienceContext({ topElementSelector: { byImportance: 10 } });

      const longText = 'A'.repeat(50); // 50 characters
      const elements = [makeElement({ id: 1, role: 'button', text: longText, importance: 80 })];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const parts = result.trim().split('|');

      // Should be truncated to 27 chars + "..."
      expect(parts[2].length).toBe(30);
      expect(parts[2].endsWith('...')).toBe(true);
    });

    it('should set DG flag correctly for dominant group elements', () => {
      const ctx = new SentienceContext({
        topElementSelector: { byImportance: 10, fromDominantGroup: 5 },
      });

      const elements = [
        makeElement({
          id: 1,
          role: 'link',
          text: 'In DG',
          importance: 80,
          in_dominant_group: true,
        }),
        makeElement({
          id: 2,
          role: 'link',
          text: 'Not in DG',
          importance: 70,
          in_dominant_group: false,
        }),
      ];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const lines = result.trim().split('\n');

      // DG flag is at index 7 (after ord at index 6)
      const parts1 = lines[0].split('|');
      expect(parts1[7]).toBe('1');

      const parts2 = lines[1].split('|');
      expect(parts2[7]).toBe('0');
    });

    it('should compute rank_in_group locally for dominant group elements', () => {
      const ctx = new SentienceContext({
        topElementSelector: { byImportance: 10, fromDominantGroup: 10 },
      });

      const elements = [
        makeElement({
          id: 1,
          role: 'link',
          text: 'Third',
          importance: 70,
          doc_y: 300,
          in_dominant_group: true,
        }),
        makeElement({
          id: 2,
          role: 'link',
          text: 'First',
          importance: 80,
          doc_y: 100,
          in_dominant_group: true,
        }),
        makeElement({
          id: 3,
          role: 'link',
          text: 'Second',
          importance: 90,
          doc_y: 200,
          in_dominant_group: true,
        }),
        makeElement({
          id: 4,
          role: 'button',
          text: 'Not in DG',
          importance: 95,
          doc_y: 50,
          in_dominant_group: false,
        }),
      ];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const lines = result.trim().split('\n');

      // Find elements and check ord values
      const ordValues: Record<number, string> = {};
      for (const line of lines) {
        const parts = line.split('|');
        const elId = parseInt(parts[0], 10);
        const ordVal = parts[6];
        ordValues[elId] = ordVal;
      }

      // Element 2 (doc_y=100) should be rank 0
      expect(ordValues[2]).toBe('0');
      // Element 3 (doc_y=200) should be rank 1
      expect(ordValues[3]).toBe('1');
      // Element 1 (doc_y=300) should be rank 2
      expect(ordValues[1]).toBe('2');
      // Element 4 (not in DG) should have "-"
      expect(ordValues[4]).toBe('-');
    });
  });

  describe('_compressHref', () => {
    it('should extract domain from full URL', () => {
      const ctx = new SentienceContext();

      // @ts-expect-error - accessing private method for testing
      expect(ctx._compressHref('https://github.com/user/repo')).toBe('github');
      // @ts-expect-error - accessing private method for testing
      expect(ctx._compressHref('https://www.example.com/page')).toBe('example');
    });

    it('should extract last segment from relative URL', () => {
      const ctx = new SentienceContext();

      // @ts-expect-error - accessing private method for testing
      expect(ctx._compressHref('/api/items/123')).toBe('123');
      // @ts-expect-error - accessing private method for testing
      expect(ctx._compressHref('/products/widget')).toBe('widget');
    });

    it('should return empty string for empty href', () => {
      const ctx = new SentienceContext();

      // @ts-expect-error - accessing private method for testing
      expect(ctx._compressHref('')).toBe('');
      // @ts-expect-error - accessing private method for testing
      expect(ctx._compressHref(undefined)).toBe('');
    });

    it('should truncate long domain to 10 chars', () => {
      const ctx = new SentienceContext();

      // @ts-expect-error - accessing private method for testing
      const result = ctx._compressHref('https://verylongdomainname.com/page');
      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  describe('element selection', () => {
    it('should select top elements by importance', () => {
      const ctx = new SentienceContext({
        topElementSelector: {
          byImportance: 2,
          fromDominantGroup: 0,
          byPosition: 0,
        },
      });

      const elements = [
        makeElement({ id: 1, role: 'button', importance: 50 }),
        makeElement({ id: 2, role: 'button', importance: 100 }),
        makeElement({ id: 3, role: 'button', importance: 75 }),
        makeElement({ id: 4, role: 'button', importance: 25 }),
      ];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const lines = result.trim().split('\n');

      // Should only have 2 elements (top by importance)
      expect(lines).toHaveLength(2);

      // Should be elements 2 and 3 (highest importance)
      const ids = lines.map(line => parseInt(line.split('|')[0], 10));
      expect(ids).toContain(2);
      expect(ids).toContain(3);
    });

    it('should include elements from dominant group', () => {
      const ctx = new SentienceContext({
        topElementSelector: {
          byImportance: 1,
          fromDominantGroup: 2,
          byPosition: 0,
        },
      });

      const elements = [
        makeElement({ id: 1, role: 'button', importance: 100 }), // Top by importance
        makeElement({
          id: 2,
          role: 'link',
          importance: 30,
          in_dominant_group: true,
          group_index: 0,
        }),
        makeElement({
          id: 3,
          role: 'link',
          importance: 20,
          in_dominant_group: true,
          group_index: 1,
        }),
        makeElement({ id: 4, role: 'link', importance: 40, in_dominant_group: false }),
      ];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const lines = result.trim().split('\n');

      // Should have 3 elements: 1 (importance) + 2 (dominant group)
      expect(lines).toHaveLength(3);

      const ids = lines.map(line => parseInt(line.split('|')[0], 10));
      expect(ids).toContain(1); // top by importance
      expect(ids).toContain(2); // dominant group
      expect(ids).toContain(3); // dominant group
      expect(ids).not.toContain(4); // not in dominant group
    });

    it('should include top elements by position (lowest doc_y)', () => {
      const ctx = new SentienceContext({
        topElementSelector: {
          byImportance: 0,
          fromDominantGroup: 0,
          byPosition: 2,
        },
      });

      const elements = [
        makeElement({ id: 1, role: 'button', importance: 50, doc_y: 500 }),
        makeElement({ id: 2, role: 'button', importance: 30, doc_y: 100 }),
        makeElement({ id: 3, role: 'button', importance: 40, doc_y: 200 }),
        makeElement({ id: 4, role: 'button', importance: 60, doc_y: 800 }),
      ];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const lines = result.trim().split('\n');

      // Should have 2 elements with lowest doc_y
      expect(lines).toHaveLength(2);

      const ids = lines.map(line => parseInt(line.split('|')[0], 10));
      expect(ids).toContain(2); // doc_y=100
      expect(ids).toContain(3); // doc_y=200
    });

    it('should deduplicate elements selected by multiple criteria', () => {
      const ctx = new SentienceContext({
        topElementSelector: {
          byImportance: 2,
          fromDominantGroup: 2,
          byPosition: 2,
        },
      });

      // Element 1 qualifies for all three criteria
      const elements = [
        makeElement({
          id: 1,
          role: 'button',
          importance: 100,
          doc_y: 50,
          in_dominant_group: true,
          group_index: 0,
        }),
        makeElement({ id: 2, role: 'button', importance: 80, doc_y: 100 }),
        makeElement({
          id: 3,
          role: 'link',
          importance: 30,
          doc_y: 200,
          in_dominant_group: true,
          group_index: 1,
        }),
      ];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const lines = result.trim().split('\n');

      // Element 1 should appear only once despite qualifying for all criteria
      const ids = lines.map(line => parseInt(line.split('|')[0], 10));
      expect(ids.filter(id => id === 1)).toHaveLength(1);
    });
  });

  describe('interactive role filtering', () => {
    it('should only include interactive roles', () => {
      const ctx = new SentienceContext({ topElementSelector: { byImportance: 10 } });

      const elements = [
        makeElement({ id: 1, role: 'button', importance: 80 }),
        makeElement({ id: 2, role: 'link', importance: 70 }),
        makeElement({ id: 3, role: 'heading', importance: 90 }), // Not interactive
        makeElement({ id: 4, role: 'textbox', importance: 60 }),
        makeElement({ id: 5, role: 'paragraph', importance: 85 }), // Not interactive
      ];
      const snap = makeSnapshot(elements);

      // @ts-expect-error - accessing private method for testing
      const result = ctx._formatSnapshotForLLM(snap);
      const lines = result.trim().split('\n');

      const ids = lines.map(line => parseInt(line.split('|')[0], 10));
      expect(ids).toContain(1); // button
      expect(ids).toContain(2); // link
      expect(ids).not.toContain(3); // heading - not interactive
      expect(ids).toContain(4); // textbox
      expect(ids).not.toContain(5); // paragraph - not interactive
    });
  });

  describe('SentienceContextState', () => {
    it('should have correct structure', () => {
      const mockSnap = makeSnapshot([makeElement({ id: 1, role: 'button', importance: 80 })]);

      const state: SentienceContextState = {
        url: 'https://test.com',
        snapshot: mockSnap,
        promptBlock: 'test prompt',
      };

      expect(state.url).toBe('https://test.com');
      expect(state.snapshot).toBe(mockSnap);
      expect(state.promptBlock).toBe('test prompt');
    });
  });
});
