/**
 * Tests for actions (click, type, press, clickRect)
 */

import { SentienceBrowser, click, typeText, press, clickRect, snapshot, find, BBox } from '../src';
import { createTestBrowser } from './test-utils';

describe('Actions', () => {
  describe('click', () => {
    it('should click an element by ID', async () => {
      const browser = await createTestBrowser();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        const snap = await snapshot(browser);
        const link = find(snap, 'role=link');

        if (link) {
          const result = await click(browser, link.id);
          expect(result.success).toBe(true);
          expect(result.duration_ms).toBeGreaterThan(0);
          expect(['navigated', 'dom_updated']).toContain(result.outcome);
        }
      } finally {
        await browser.close();
      }
    }, 60000);

    it('should use hybrid approach (mouse.click at center)', async () => {
      const browser = await createTestBrowser();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        const snap = await snapshot(browser);
        const link = find(snap, 'role=link');

        if (link) {
          // Test hybrid approach (mouse.click at center)
          const result = await click(browser, link.id, true);
          expect(result.success).toBe(true);
          expect(result.duration_ms).toBeGreaterThan(0);
          // Navigation may happen, which is expected for links
          expect(['navigated', 'dom_updated']).toContain(result.outcome);
        }
      } finally {
        await browser.close();
      }
    }, 60000);

    it('should use JS-based approach (legacy)', async () => {
      const browser = await createTestBrowser();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        const snap = await snapshot(browser);
        const link = find(snap, 'role=link');

        if (link) {
          // Test JS-based click (legacy approach)
          const result = await click(browser, link.id, false);
          expect(result.success).toBe(true);
          expect(result.duration_ms).toBeGreaterThan(0);
          // Navigation may happen, which is expected for links
          expect(['navigated', 'dom_updated']).toContain(result.outcome);
        }
      } finally {
        await browser.close();
      }
    }, 60000);
  });

  describe('typeText', () => {
    it('should type text into an element', async () => {
      const browser = await createTestBrowser();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        const snap = await snapshot(browser);
        const textbox = find(snap, 'role=textbox');

        if (textbox) {
          const result = await typeText(browser, textbox.id, 'hello');
          expect(result.success).toBe(true);
          expect(result.duration_ms).toBeGreaterThan(0);
        }
      } finally {
        await browser.close();
      }
    }, 60000);
  });

  describe('press', () => {
    it('should press a keyboard key', async () => {
      const browser = await createTestBrowser();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        const result = await press(browser, 'Enter');
        expect(result.success).toBe(true);
        expect(result.duration_ms).toBeGreaterThan(0);
      } finally {
        await browser.close();
      }
    }, 60000);
  });

  describe('clickRect', () => {
    it('should click at rectangle center using rect dict', async () => {
      const browser = await createTestBrowser();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        // Click at a specific rectangle (top-left area)
        const result = await clickRect(browser, { x: 100, y: 100, w: 50, h: 30 });
        expect(result.success).toBe(true);
        expect(result.duration_ms).toBeGreaterThan(0);
        expect(['navigated', 'dom_updated']).toContain(result.outcome);
      } finally {
        await browser.close();
      }
    }, 60000);

    it('should click using BBox object', async () => {
      const browser = await createTestBrowser();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        // Get an element and click its bbox
        const snap = await snapshot(browser);
        const link = find(snap, 'role=link');

        if (link) {
          const bbox: BBox = {
            x: link.bbox.x,
            y: link.bbox.y,
            width: link.bbox.width,
            height: link.bbox.height,
          };
          const result = await clickRect(browser, bbox);
          expect(result.success).toBe(true);
          expect(result.duration_ms).toBeGreaterThan(0);
        }
      } finally {
        await browser.close();
      }
    }, 60000);

    it('should click without highlight when disabled', async () => {
      const browser = await createTestBrowser();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        const result = await clickRect(browser, { x: 100, y: 100, w: 50, h: 30 }, false);
        expect(result.success).toBe(true);
        expect(result.duration_ms).toBeGreaterThan(0);
      } finally {
        await browser.close();
      }
    }, 60000);

    it('should handle invalid rectangle dimensions', async () => {
      const browser = await createTestBrowser();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        // Invalid: zero width
        const result1 = await clickRect(browser, { x: 100, y: 100, w: 0, h: 30 });
        expect(result1.success).toBe(false);
        expect(result1.error).toBeDefined();
        expect(result1.error?.code).toBe('invalid_rect');

        // Invalid: negative height
        const result2 = await clickRect(browser, { x: 100, y: 100, w: 50, h: -10 });
        expect(result2.success).toBe(false);
        expect(result2.error).toBeDefined();
        expect(result2.error?.code).toBe('invalid_rect');
      } finally {
        await browser.close();
      }
    }, 60000);

    it('should take snapshot after click when requested', async () => {
      const browser = await createTestBrowser();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        const result = await clickRect(browser, { x: 100, y: 100, w: 50, h: 30 }, true, 2.0, true);
        expect(result.success).toBe(true);
        expect(result.snapshot_after).toBeDefined();
        expect(result.snapshot_after?.status).toBe('success');
        expect(result.snapshot_after?.elements.length).toBeGreaterThan(0);
      } finally {
        await browser.close();
      }
    }, 60000);

    it('should accept width/height keys instead of w/h', async () => {
      const browser = await createTestBrowser();

      try {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');

        const result = await clickRect(browser, { x: 100, y: 100, width: 50, height: 30 });
        expect(result.success).toBe(true);
        expect(result.duration_ms).toBeGreaterThan(0);
      } finally {
        await browser.close();
      }
    }, 60000);
  });
});

