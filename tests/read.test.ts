/**
 * Tests for read functionality
 */

import { SentienceBrowser, read } from '../src';
import { createTestBrowser } from './test-utils';

describe('read', () => {
  it('should read page as text', async () => {
    const browser = await createTestBrowser();
    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle', { timeout: 10000 });

      const result = await read(browser, { format: 'text' });

      expect(result.status).toBe('success');
      expect(result.format).toBe('text');
      expect(result.content).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      // Browser may normalize URL with trailing slash
      expect(result.url).toMatch(/^https:\/\/example\.com\/?$/);
    } finally {
      await browser.close();
    }
  });

  it('should read page as markdown', async () => {
    const browser = await createTestBrowser();
    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle', { timeout: 10000 });

      const result = await read(browser, { format: 'markdown' });

      expect(result.status).toBe('success');
      expect(result.format).toBe('markdown');
      expect(result.content).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      // Browser may normalize URL with trailing slash
      expect(result.url).toMatch(/^https:\/\/example\.com\/?$/);
    } finally {
      await browser.close();
    }
  });

  it('should enhance markdown by default', async () => {
    const browser = await createTestBrowser();
    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle', { timeout: 10000 });

      // Test with enhancement (default)
      const resultEnhanced = await read(browser, {
        format: 'markdown',
        enhanceMarkdown: true,
      });

      expect(resultEnhanced.status).toBe('success');
      expect(resultEnhanced.format).toBe('markdown');
      expect(resultEnhanced.content.length).toBeGreaterThan(0);

      // Test without enhancement
      const resultBasic = await read(browser, {
        format: 'markdown',
        enhanceMarkdown: false,
      });

      expect(resultBasic.status).toBe('success');
      expect(resultBasic.format).toBe('markdown');
      expect(resultBasic.content.length).toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  });
});
