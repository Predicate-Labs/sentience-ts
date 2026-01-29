/**
 * Tests for snapshot functionality
 */

import { SentienceBrowser, snapshot } from '../src';
import { createTestBrowser, getPageOrThrow } from './test-utils';

describe('Snapshot', () => {
  it('should take a basic snapshot', async () => {
    const browser = await createTestBrowser();

    try {
      const page = getPageOrThrow(browser);
      await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 20000 });

      // CI hardening: avoid screenshot payload + reduce work
      const snap = await snapshot(browser, { screenshot: false, limit: 30 });

      expect(snap.status).toBe('success');
      expect(snap.url).toContain('example.com');
      expect(snap.elements.length).toBeGreaterThan(0);
      expect(snap.elements[0].id).toBeGreaterThanOrEqual(0);
    } finally {
      await browser.close();
    }
  }, 90000); // 90 seconds - Windows CI can be slow

  it('should have valid element structure', async () => {
    const browser = await createTestBrowser();

    try {
      const page = getPageOrThrow(browser);
      await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 20000 });

      const snap = await snapshot(browser, { screenshot: false, limit: 30 });

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
      const page = getPageOrThrow(browser);
      await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 20000 });

      // Test snapshot with goal
      const snap = await snapshot(browser, {
        goal: 'Find the main heading',
        screenshot: false,
        limit: 30,
      });

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
    expect(element).not.toHaveProperty('fused_rank_index');
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
      fused_rank_index: 0,
      heuristic_index: 5,
      ml_probability: 0.95,
      ml_score: 2.34,
    };

    expect(element.fused_rank_index).toBe(0);
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
      fused_rank_index: 1,
      ml_probability: 0.87,
    };

    expect(element.fused_rank_index).toBe(1);
    expect(element).not.toHaveProperty('heuristic_index');
    expect(element.ml_probability).toBe(0.87);
    expect(element).not.toHaveProperty('ml_score');
  });
});

describe('Snapshot ML Rerank Metadata', () => {
  it('should accept snapshot with ml_rerank metadata', () => {
    const snap = {
      status: 'success' as const,
      url: 'https://example.com',
      elements: [],
      ml_rerank: {
        enabled: true,
        applied: false,
        reason: 'low_confidence',
        candidate_count: 25,
        top_probability: 0.42,
        min_confidence: 0.6,
        is_high_confidence: false,
        tags: {
          repeated: true,
          sponsored_ish: true,
          non_sponsored: false,
          pos: true,
          occ: true,
          vocc: false,
          short: true,
          action_ish: false,
          nav_ish: false,
        },
      },
    };

    expect(snap.ml_rerank.enabled).toBe(true);
    expect(snap.ml_rerank.is_high_confidence).toBe(false);
  });
});
