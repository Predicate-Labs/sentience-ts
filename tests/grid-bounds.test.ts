/**
 * Tests for getGridBounds functionality
 */

import {
  getGridBounds,
  Snapshot,
  Element,
  BBox,
  LayoutHints,
  GridPosition,
  GridInfo,
} from '../src';

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

describe('GridInfo modal detection fields', () => {
  it('should accept GridInfo with z-index and modal fields', () => {
    // Test that GridInfo type accepts the new optional fields
    const gridInfo = {
      grid_id: 1,
      bbox: { x: 100, y: 100, width: 500, height: 400 } as BBox,
      row_count: 2,
      col_count: 3,
      item_count: 6,
      confidence: 0.95,
      z_index: 1000,
      z_index_max: 1000,
      blocks_interaction: true,
      viewport_coverage: 0.25,
    };

    expect(gridInfo.z_index).toBe(1000);
    expect(gridInfo.z_index_max).toBe(1000);
    expect(gridInfo.blocks_interaction).toBe(true);
    expect(gridInfo.viewport_coverage).toBe(0.25);
  });

  it('should accept GridInfo without optional modal fields', () => {
    // Test backward compatibility - new fields are optional
    const gridInfo = {
      grid_id: 0,
      bbox: { x: 0, y: 0, width: 100, height: 100 } as BBox,
      row_count: 1,
      col_count: 1,
      item_count: 1,
      confidence: 1.0,
    };

    expect(gridInfo.grid_id).toBe(0);
    expect(gridInfo.confidence).toBe(1.0);
    // Optional fields should be undefined
    expect((gridInfo as any).z_index).toBeUndefined();
    expect((gridInfo as any).z_index_max).toBeUndefined();
    expect((gridInfo as any).blocks_interaction).toBeUndefined();
    expect((gridInfo as any).viewport_coverage).toBeUndefined();
  });
});

describe('Snapshot modal detection fields', () => {
  it('should accept snapshot without modal fields', () => {
    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [],
    };

    // modal_detected and modal_grids should be undefined by default
    expect(snapshot.modal_detected).toBeUndefined();
    expect(snapshot.modal_grids).toBeUndefined();
  });

  it('should accept snapshot with modal_detected true', () => {
    const modalGrid = {
      grid_id: 1,
      bbox: { x: 200, y: 150, width: 600, height: 400 } as BBox,
      row_count: 1,
      col_count: 2,
      item_count: 5,
      confidence: 1.0,
      z_index: 1000,
      z_index_max: 1000,
      blocks_interaction: true,
      viewport_coverage: 0.2,
    };

    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [],
      modal_detected: true,
      modal_grids: [modalGrid],
    };

    expect(snapshot.modal_detected).toBe(true);
    expect(snapshot.modal_grids).toBeDefined();
    expect(snapshot.modal_grids!.length).toBe(1);
    expect(snapshot.modal_grids![0].z_index).toBe(1000);
    expect(snapshot.modal_grids![0].blocks_interaction).toBe(true);
  });

  it('should accept snapshot with modal_detected false', () => {
    const snapshot: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [],
      modal_detected: false,
    };

    expect(snapshot.modal_detected).toBe(false);
    expect(snapshot.modal_grids).toBeUndefined();
  });
});
