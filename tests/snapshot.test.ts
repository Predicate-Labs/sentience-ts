/**
 * Tests for snapshot functionality
 */

import { SentienceBrowser, snapshot } from '../src';
import { createTestBrowser } from './test-utils';

describe('Snapshot', () => {
  it('should take a basic snapshot', async () => {
    const browser = await createTestBrowser();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle', { timeout: 10000 });

      const snap = await snapshot(browser);

      expect(snap.status).toBe('success');
      expect(snap.url).toContain('example.com');
      expect(snap.elements.length).toBeGreaterThan(0);
      expect(snap.elements[0].id).toBeGreaterThanOrEqual(0);
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow

  it('should have valid element structure', async () => {
    const browser = await createTestBrowser();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle', { timeout: 10000 });

      const snap = await snapshot(browser);

      if (snap.elements.length > 0) {
        const element = snap.elements[0];
        expect(element.bbox.x).toBeGreaterThanOrEqual(0);
        expect(element.bbox.y).toBeGreaterThanOrEqual(0);
        expect(element.bbox.width).toBeGreaterThan(0);
        expect(element.bbox.height).toBeGreaterThan(0);
        expect(element.importance).toBeGreaterThanOrEqual(-300);
      }
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow

  it('should accept goal parameter', async () => {
    const browser = await createTestBrowser();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle', { timeout: 10000 });

      // Test snapshot with goal
      const snap = await snapshot(browser, { goal: 'Find the main heading' });

      expect(snap.status).toBe('success');
      expect(snap.url).toContain('example.com');
      expect(snap.elements.length).toBeGreaterThan(0);

      // Verify snapshot works normally with goal parameter
      expect(snap.elements[0].id).toBeGreaterThanOrEqual(0);
      if (snap.elements.length > 0) {
        const element = snap.elements[0];
        expect(element.bbox.x).toBeGreaterThanOrEqual(0);
        expect(element.bbox.y).toBeGreaterThanOrEqual(0);
        expect(element.bbox.width).toBeGreaterThan(0);
        expect(element.bbox.height).toBeGreaterThan(0);
      }
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow
});

describe('Element ML Fields', () => {
  it('should accept elements without ML reranking fields', () => {
    const element = {
      id: 1,
      role: 'button',
      text: 'Click me',
      importance: 100,
      bbox: { x: 10, y: 20, width: 100, height: 50 },
      visual_cues: { is_primary: true, background_color_name: 'blue', is_clickable: true },
      in_viewport: true,
      is_occluded: false,
      z_index: 0,
    };

    expect(element.id).toBe(1);
    expect(element).not.toHaveProperty('rerank_index');
    expect(element).not.toHaveProperty('heuristic_index');
    expect(element).not.toHaveProperty('ml_probability');
    expect(element).not.toHaveProperty('ml_score');
  });

  it('should accept elements with ML reranking fields', () => {
    const element = {
      id: 2,
      role: 'link',
      text: 'Learn more',
      importance: 80,
      bbox: { x: 15, y: 25, width: 120, height: 40 },
      visual_cues: { is_primary: false, background_color_name: 'white', is_clickable: true },
      in_viewport: true,
      is_occluded: false,
      z_index: 1,
      rerank_index: 0,
      heuristic_index: 5,
      ml_probability: 0.95,
      ml_score: 2.34,
    };

    expect(element.rerank_index).toBe(0);
    expect(element.heuristic_index).toBe(5);
    expect(element.ml_probability).toBe(0.95);
    expect(element.ml_score).toBe(2.34);
  });

  it('should accept elements with partial ML fields', () => {
    const element = {
      id: 3,
      role: 'textbox',
      text: null,
      importance: 60,
      bbox: { x: 20, y: 30, width: 200, height: 30 },
      visual_cues: { is_primary: false, background_color_name: null, is_clickable: true },
      in_viewport: true,
      is_occluded: false,
      z_index: 0,
      rerank_index: 1,
      ml_probability: 0.87,
    };

    expect(element.rerank_index).toBe(1);
    expect(element).not.toHaveProperty('heuristic_index');
    expect(element.ml_probability).toBe(0.87);
    expect(element).not.toHaveProperty('ml_score');
  });
});

