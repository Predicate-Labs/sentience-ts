/**
 * Tests for query engine
 */

import { parseSelector, query, find } from '../src/query';
import { Element, Snapshot, BBox, VisualCues } from '../src/types';

describe('parseSelector', () => {
  it('should parse simple role selector', () => {
    const q = parseSelector('role=button');
    expect(q.role).toBe('button');
  });

  it('should parse text contains selector', () => {
    const q = parseSelector("text~'Sign in'");
    expect((q as any).text_contains).toBe('Sign in');
  });

  it('should parse clickable selector', () => {
    const q = parseSelector('clickable=true');
    expect(q.clickable).toBe(true);
  });

  it('should parse combined selectors', () => {
    const q = parseSelector("role=button text~'Submit'");
    expect(q.role).toBe('button');
    expect((q as any).text_contains).toBe('Submit');
  });

  it('should parse negation selector', () => {
    const q = parseSelector('role!=link');
    expect((q as any).role_exclude).toBe('link');
  });

  it('should parse prefix selector', () => {
    const q = parseSelector("text^='Sign'");
    expect((q as any).text_prefix).toBe('Sign');
  });

  it('should parse suffix selector', () => {
    const q = parseSelector("text$='in'");
    expect((q as any).text_suffix).toBe('in');
  });

  it('should parse importance greater than', () => {
    const q = parseSelector('importance>500');
    expect((q as any).importance_min).toBeGreaterThan(500);
  });

  it('should parse importance greater than or equal', () => {
    const q = parseSelector('importance>=500');
    expect((q as any).importance_min).toBe(500);
  });

  it('should parse importance less than', () => {
    const q = parseSelector('importance<1000');
    expect((q as any).importance_max).toBeLessThan(1000);
  });

  it('should parse importance less than or equal', () => {
    const q = parseSelector('importance<=1000');
    expect((q as any).importance_max).toBe(1000);
  });

  it('should parse visible selector', () => {
    const q = parseSelector('visible=true');
    expect((q as any).visible).toBe(true);
    const q2 = parseSelector('visible=false');
    expect((q2 as any).visible).toBe(false);
  });

  it('should parse tag selector', () => {
    const q = parseSelector('tag=button');
    expect((q as any).tag).toBe('button');
  });
});

describe('query', () => {
  const createTestSnapshot = (): Snapshot => {
    const elements: Element[] = [
      {
        id: 1,
        role: 'button',
        text: 'Sign In',
        importance: 1000,
        bbox: { x: 10, y: 20, width: 100, height: 40 },
        visual_cues: { is_primary: true, background_color_name: null, is_clickable: true },
        in_viewport: true,
        is_occluded: false,
        z_index: 10,
      },
      {
        id: 2,
        role: 'button',
        text: 'Sign Out',
        importance: 500,
        bbox: { x: 120, y: 20, width: 100, height: 40 },
        visual_cues: { is_primary: false, background_color_name: null, is_clickable: true },
        in_viewport: true,
        is_occluded: false,
        z_index: 5,
      },
      {
        id: 3,
        role: 'link',
        text: 'More information',
        importance: 200,
        bbox: { x: 10, y: 70, width: 150, height: 20 },
        visual_cues: { is_primary: false, background_color_name: null, is_clickable: true },
        in_viewport: true,
        is_occluded: false,
        z_index: 1,
      },
    ];

    return {
      status: 'success',
      url: 'https://example.com',
      elements,
    };
  };

  it('should filter by importance greater than', () => {
    const snap = createTestSnapshot();
    const results = query(snap, 'importance>500');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(1);
  });

  it('should filter by importance less than', () => {
    const snap = createTestSnapshot();
    const results = query(snap, 'importance<300');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(3);
  });

  it('should filter by text prefix', () => {
    const snap = createTestSnapshot();
    const results = query(snap, "text^='Sign'");
    expect(results.length).toBe(2);
    expect(results.map((el) => el.text)).toEqual(['Sign In', 'Sign Out']);
  });

  it('should filter by text suffix', () => {
    const snap = createTestSnapshot();
    const results = query(snap, "text$='In'");
    expect(results.length).toBe(1);
    expect(results[0].text).toBe('Sign In');
  });

  it('should filter by bbox x position', () => {
    const snap = createTestSnapshot();
    const results = query(snap, 'bbox.x>100');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(2);
  });

  it('should filter by combined selectors', () => {
    const snap = createTestSnapshot();
    const results = query(snap, 'role=button importance>500');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(1);
  });

  it('should filter by visible', () => {
    const snap = createTestSnapshot();
    const results = query(snap, 'visible=true');
    expect(results.length).toBe(3); // All are visible
  });

  it('should filter by z-index', () => {
    const snap = createTestSnapshot();
    const results = query(snap, 'z_index>5');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(1);
  });

  it('should filter by in_viewport', () => {
    const snap = createTestSnapshot();
    const results = query(snap, 'in_viewport=true');
    expect(results.length).toBe(3);
  });

  it('should filter by is_occluded', () => {
    const snap = createTestSnapshot();
    const results = query(snap, 'is_occluded=false');
    expect(results.length).toBe(3);
  });
});

describe('find', () => {
  it('should find first matching element', () => {
    const snap: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [
        {
          id: 1,
          role: 'button',
          text: 'Submit',
          importance: 1000,
          bbox: { x: 10, y: 20, width: 100, height: 40 },
          visual_cues: { is_primary: true, background_color_name: null, is_clickable: true },
          in_viewport: true,
          is_occluded: false,
          z_index: 10,
        },
        {
          id: 2,
          role: 'button',
          text: 'Cancel',
          importance: 500,
          bbox: { x: 120, y: 20, width: 100, height: 40 },
          visual_cues: { is_primary: false, background_color_name: null, is_clickable: true },
          in_viewport: true,
          is_occluded: false,
          z_index: 5,
        },
      ],
    };

    const result = find(snap, 'role=button');
    expect(result).not.toBeNull();
    expect(result?.id).toBe(1); // Highest importance
  });

  it('should return null if no match', () => {
    const snap: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [
        {
          id: 1,
          role: 'button',
          text: 'Submit',
          importance: 1000,
          bbox: { x: 10, y: 20, width: 100, height: 40 },
          visual_cues: { is_primary: true, background_color_name: null, is_clickable: true },
          in_viewport: true,
          is_occluded: false,
          z_index: 10,
        },
      ],
    };

    const result = find(snap, 'role=link');
    expect(result).toBeNull();
  });
});


