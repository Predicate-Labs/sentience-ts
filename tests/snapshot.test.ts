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
      await browser.getPage().waitForLoadState('networkidle');

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
      await browser.getPage().waitForLoadState('networkidle');

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
      await browser.getPage().waitForLoadState('networkidle');

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

