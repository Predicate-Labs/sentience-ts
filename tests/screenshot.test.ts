/**
 * Tests for screenshot functionality
 */

import { SentienceBrowser, screenshot } from '../src';
import { createTestBrowser } from './test-utils';

describe('screenshot', () => {
  it('should capture PNG screenshot', async () => {
    const browser = await createTestBrowser();
    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle');

      const dataUrl = await screenshot(browser, { format: 'png' });

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);

      // Decode and verify it's valid base64
      const base64Data = dataUrl.split(',')[1];
      const imageData = Buffer.from(base64Data, 'base64');
      expect(imageData.length).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  });

  it('should capture JPEG screenshot', async () => {
    const browser = await createTestBrowser();
    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle');

      const dataUrl = await screenshot(browser, { format: 'jpeg', quality: 80 });

      expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);

      // Decode and verify it's valid base64
      const base64Data = dataUrl.split(',')[1];
      const imageData = Buffer.from(base64Data, 'base64');
      expect(imageData.length).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  });

  it('should use PNG as default format', async () => {
    const browser = await createTestBrowser();
    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle');

      const dataUrl = await screenshot(browser);

      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    } finally {
      await browser.close();
    }
  });

  it('should validate JPEG quality', async () => {
    const browser = await createTestBrowser();
    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle');

      // Valid quality
      await screenshot(browser, { format: 'jpeg', quality: 50 }); // Should not throw

      // Invalid quality - too low
      await expect(
        screenshot(browser, { format: 'jpeg', quality: 0 })
      ).rejects.toThrow('Quality must be between 1 and 100');

      // Invalid quality - too high
      await expect(
        screenshot(browser, { format: 'jpeg', quality: 101 })
      ).rejects.toThrow('Quality must be between 1 and 100');
    } finally {
      await browser.close();
    }
  });
});

