/**
 * Tests for getGridBounds functionality
 */

import { getGridBounds, Snapshot, Element, BBox, LayoutHints, GridPosition } from '../src';

/**
 * Helper to create test elements with layout data
 */
function createTestElement(
  elementId: number,
  x: number,
  y: number,
  width: number,
  height: number,
  gridId?: number | null,
  rowIndex?: number | null,
  colIndex?: number | null,
  text?: string | null,
  href?: string | null
): Element {
  let layout: LayoutHints | undefined = undefined;
  if (gridId != null) {
    let gridPos: GridPosition | undefined = undefined;
    if (rowIndex != null && colIndex != null) {
      gridPos = {
        row_index: rowIndex,
        col_index: colIndex,
        cluster_id: gridId,
      };
    }
    layout = {
      grid_id: gridId,
      grid_pos: gridPos,
      grid_confidence: 1.0,
      parent_confidence: 1.0,
      region_confidence: 1.0,
    };
  }

  return {
    id: elementId,
    role: 'link',
    text: text || `Element ${elementId}`,
    importance: 100,
    bbox: { x, y, width, height },
    visual_cues: {
      is_primary: false,
      background_color_name: null,
      is_clickable: true,
    },
    in_viewport: true,
    is_occluded: false,
    z_index: 0,
    layout,
    href: href || undefined,
  };
}

describe('getGridBounds', () => {
  it('should return empty array for empty snapshot', () => {
    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [],
    };

    const result = getGridBounds(snapshot);
    expect(result).toEqual([]);
  });

  it('should return empty array when no layout data', () => {
    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [createTestElement(1, 10, 20, 100, 50), createTestElement(2, 120, 20, 100, 50)],
    };

    const result = getGridBounds(snapshot);
    expect(result).toEqual([]);
  });

  it('should compute bounds for single 2x2 grid', () => {
    const elements: Element[] = [
      createTestElement(1, 10, 20, 100, 50, 0, 0, 0),
      createTestElement(2, 120, 20, 100, 50, 0, 0, 1),
      createTestElement(3, 10, 80, 100, 50, 0, 1, 0),
      createTestElement(4, 120, 80, 100, 50, 0, 1, 1),
    ];

    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements,
    };

    const result = getGridBounds(snapshot);
    expect(result.length).toBe(1);

    const grid = result[0];
    expect(grid.grid_id).toBe(0);
    expect(grid.bbox.x).toBe(10);
    expect(grid.bbox.y).toBe(20);
    expect(grid.bbox.width).toBe(210); // max_x (120+100) - min_x (10)
    expect(grid.bbox.height).toBe(110); // max_y (80+50) - min_y (20)
    expect(grid.row_count).toBe(2);
    expect(grid.col_count).toBe(2);
    expect(grid.item_count).toBe(4);
    expect(grid.confidence).toBe(1.0);
  });

  it('should handle multiple distinct grids', () => {
    // Grid 0: 2x1 at top
    const grid0Elements: Element[] = [
      createTestElement(1, 10, 20, 100, 50, 0, 0, 0),
      createTestElement(2, 120, 20, 100, 50, 0, 0, 1),
    ];
    // Grid 1: 1x3 at bottom
    const grid1Elements: Element[] = [
      createTestElement(3, 10, 200, 100, 50, 1, 0, 0),
      createTestElement(4, 10, 260, 100, 50, 1, 1, 0),
      createTestElement(5, 10, 320, 100, 50, 1, 2, 0),
    ];

    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [...grid0Elements, ...grid1Elements],
    };

    const result = getGridBounds(snapshot);
    expect(result.length).toBe(2);

    // Check grid 0
    const grid0 = result[0];
    expect(grid0.grid_id).toBe(0);
    expect(grid0.bbox.x).toBe(10);
    expect(grid0.bbox.y).toBe(20);
    expect(grid0.bbox.width).toBe(210);
    expect(grid0.bbox.height).toBe(50);
    expect(grid0.row_count).toBe(1);
    expect(grid0.col_count).toBe(2);
    expect(grid0.item_count).toBe(2);

    // Check grid 1
    const grid1 = result[1];
    expect(grid1.grid_id).toBe(1);
    expect(grid1.bbox.x).toBe(10);
    expect(grid1.bbox.y).toBe(200);
    expect(grid1.bbox.width).toBe(100);
    expect(grid1.bbox.height).toBe(170); // max_y (320+50) - min_y (200)
    expect(grid1.row_count).toBe(3);
    expect(grid1.col_count).toBe(1);
    expect(grid1.item_count).toBe(3);
  });

  it('should filter by specific grid_id', () => {
    const elements: Element[] = [
      createTestElement(1, 10, 20, 100, 50, 0, 0, 0),
      createTestElement(2, 120, 20, 100, 50, 0, 0, 1),
      createTestElement(3, 10, 200, 100, 50, 1, 0, 0),
    ];

    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements,
    };

    // Get only grid 0
    let result = getGridBounds(snapshot, 0);
    expect(result.length).toBe(1);
    expect(result[0].grid_id).toBe(0);
    expect(result[0].item_count).toBe(2);

    // Get only grid 1
    result = getGridBounds(snapshot, 1);
    expect(result.length).toBe(1);
    expect(result[0].grid_id).toBe(1);
    expect(result[0].item_count).toBe(1);

    // Get non-existent grid
    result = getGridBounds(snapshot, 99);
    expect(result).toEqual([]);
  });

  it('should handle grid elements without grid_pos', () => {
    // Elements with grid_id but no grid_pos (should still be counted)
    const elements: Element[] = [
      createTestElement(1, 10, 20, 100, 50, 0, null, null),
      createTestElement(2, 120, 20, 100, 50, 0, null, null),
    ];

    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements,
    };

    const result = getGridBounds(snapshot);
    expect(result.length).toBe(1);
    const grid = result[0];
    expect(grid.grid_id).toBe(0);
    expect(grid.item_count).toBe(2);
    expect(grid.row_count).toBe(0); // No grid_pos means no rows/cols counted
    expect(grid.col_count).toBe(0);
  });

  it('should infer product_grid label', () => {
    const elements: Element[] = [
      createTestElement(
        1,
        10,
        20,
        100,
        50,
        0,
        0,
        0,
        'Wireless Headphones $50',
        'https://example.com/product/headphones'
      ),
      createTestElement(
        2,
        120,
        20,
        100,
        50,
        0,
        0,
        1,
        'Bluetooth Speaker $30',
        'https://example.com/product/speaker'
      ),
      createTestElement(
        3,
        10,
        80,
        100,
        50,
        0,
        1,
        0,
        'USB-C Cable $10',
        'https://example.com/product/cable'
      ),
    ];

    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements,
    };

    const result = getGridBounds(snapshot);
    expect(result.length).toBe(1);
    expect(result[0].label).toBe('product_grid');
  });

  it('should infer article_feed label', () => {
    const elements: Element[] = [
      createTestElement(1, 10, 20, 100, 50, 0, 0, 0, 'Breaking News 2 hours ago'),
      createTestElement(2, 10, 80, 100, 50, 0, 1, 0, 'Tech Update 3 days ago'),
    ];

    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements,
    };

    const result = getGridBounds(snapshot);
    expect(result.length).toBe(1);
    expect(result[0].label).toBe('article_feed');
  });

  it('should infer navigation label', () => {
    const elements: Element[] = [
      createTestElement(1, 10, 20, 80, 30, 0, 0, 0, 'Home'),
      createTestElement(2, 100, 20, 80, 30, 0, 0, 1, 'About'),
      createTestElement(3, 190, 20, 80, 30, 0, 0, 2, 'Contact'),
    ];

    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements,
    };

    const result = getGridBounds(snapshot);
    expect(result.length).toBe(1);
    expect(result[0].label).toBe('navigation');
  });

  it('should sort results by grid_id', () => {
    const elements: Element[] = [
      createTestElement(1, 10, 20, 100, 50, 2, 0, 0),
      createTestElement(2, 10, 200, 100, 50, 0, 0, 0),
      createTestElement(3, 10, 380, 100, 50, 1, 0, 0),
    ];

    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements,
    };

    const result = getGridBounds(snapshot);
    expect(result.length).toBe(3);
    expect(result[0].grid_id).toBe(0);
    expect(result[1].grid_id).toBe(1);
    expect(result[2].grid_id).toBe(2);
  });
});
