/**
 * Tests for inspector functionality
 */

import { SentienceBrowser, inspect } from '../src';
import { createTestBrowser } from './test-utils';

describe('Inspector', () => {
  it('should start and stop', async () => {
    const browser = await createTestBrowser();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle', { timeout: 10000 });

      const inspector = inspect(browser);
      await inspector.start();

      const active = await browser.getPage().evaluate(
        () => (window as any).__sentience_inspector_active === true
      );
      expect(active).toBe(true);

      await inspector.stop();

      const inactive = await browser.getPage().evaluate(
        () => (window as any).__sentience_inspector_active === true
      );
      expect(inactive).toBe(false);
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow
});

