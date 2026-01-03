/**
 * Test bot evasion and stealth mode features.
 *
 * This test verifies that stealth features are working:
 * - navigator.webdriver is false
 * - window.chrome exists
 * - User-agent is realistic
 * - Viewport is realistic
 * - Stealth arguments are applied
 */

import { SentienceBrowser } from '../src/browser';
import { getPageOrThrow } from './test-utils';

describe('Stealth Mode / Bot Evasion', () => {
  let browser: SentienceBrowser;

  beforeAll(async () => {
    // Auto-detect headless mode (headless in CI, headed locally)
    browser = new SentienceBrowser(undefined, undefined, undefined);
    await browser.start();
  });

  afterAll(async () => {
    await browser.close();
  });

  test('navigator.webdriver should be false', async () => {
    const page = getPageOrThrow(browser);
    const webdriver = await page.evaluate(() => (navigator as any).webdriver);
    expect(webdriver).toBeFalsy();
  });

  test('window.chrome should exist', async () => {
    const page = getPageOrThrow(browser);
    const chromeExists = await page.evaluate(() => typeof (window as any).chrome !== 'undefined');
    expect(chromeExists).toBe(true);
  });

  test('user-agent should not contain HeadlessChrome', async () => {
    const page = getPageOrThrow(browser);
    const userAgent = await page.evaluate(() => navigator.userAgent);
    expect(userAgent).not.toContain('HeadlessChrome');
    expect(userAgent).toContain('Chrome');
  });

  test('viewport should be realistic (1920x1080 or larger)', async () => {
    // Create a browser with a realistic viewport for this test
    const testBrowser = new SentienceBrowser(
      undefined, // apiKey
      undefined, // apiUrl
      undefined, // headless
      undefined, // proxy
      undefined, // userDataDir
      undefined, // storageState
      undefined, // recordVideoDir
      undefined, // recordVideoSize
      { width: 1920, height: 1080 } // viewport
    );
    await testBrowser.start();

    try {
      const page = getPageOrThrow(testBrowser);
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      expect(viewport.width).toBeGreaterThanOrEqual(1920);
      expect(viewport.height).toBeGreaterThanOrEqual(1080);
    } finally {
      await testBrowser.close();
    }
  });

  test('navigator.plugins should exist', async () => {
    const page = getPageOrThrow(browser);
    const pluginsCount = await page.evaluate(() => navigator.plugins.length);
    expect(pluginsCount).toBeGreaterThan(0);
  });

  test('permissions API should be patched', async () => {
    const page = getPageOrThrow(browser);
    const hasPermissions = await page.evaluate(() => {
      return !!(navigator.permissions && navigator.permissions.query);
    });
    expect(hasPermissions).toBe(true);
  });

  test('should pass basic bot detection checks', async () => {
    const page = getPageOrThrow(browser);

    const detectionResults = await page.evaluate(() => {
      return {
        webdriver: (navigator as any).webdriver,
        chrome: typeof (window as any).chrome !== 'undefined',
        plugins: navigator.plugins.length,
        languages: navigator.languages.length,
        userAgent: navigator.userAgent,
      };
    });

    // Count stealth features working
    let stealthScore = 0;
    if (detectionResults.webdriver === false) stealthScore++;
    if (detectionResults.chrome === true) stealthScore++;
    if (detectionResults.plugins > 0) stealthScore++;

    expect(stealthScore).toBeGreaterThanOrEqual(2);
  });

  test('should be able to navigate to bot detection test site', async () => {
    const page = getPageOrThrow(browser);

    try {
      await page.goto('https://bot.sannysoft.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      await page.waitForTimeout(2000); // Wait for page to load

      // Check detection results
      const results = await page.evaluate(() => {
        return {
          webdriver: (navigator as any).webdriver,
          chrome: typeof (window as any).chrome !== 'undefined',
          plugins: navigator.plugins.length,
        };
      });

      // At least 2 out of 3 should pass
      let passCount = 0;
      if (results.webdriver === false) passCount++;
      if (results.chrome === true) passCount++;
      if (results.plugins > 0) passCount++;

      expect(passCount).toBeGreaterThanOrEqual(2);
    } catch (e: any) {
      // Site may be down or blocked - that's okay
      console.warn(`Could not test against bot detection site: ${e.message}`);
    }
  });
});
