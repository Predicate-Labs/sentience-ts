/**
 * Test utilities for browser tests
 */

import { SentienceBrowser } from '../src';
import { Page } from 'playwright';

/**
 * Creates a browser instance and starts it with better error handling
 * Auto-detects headless mode based on CI environment (headless in CI, headed locally)
 */
export async function createTestBrowser(headless?: boolean): Promise<SentienceBrowser> {
  const browser = new SentienceBrowser(undefined, undefined, headless);
  try {
    await browser.start();
    return browser;
  } catch (e: any) {
    // Clean up browser on failure to prevent resource leaks
    try {
      await browser.close();
    } catch (closeError) {
      // Ignore cleanup errors
    }
    // Enhance error message but don't log here (Jest will handle it)
    const enhancedError = new Error(
      `Browser startup failed: ${e.message}\n` +
        'Make sure:\n' +
        '1. Playwright browsers are installed: npx playwright install chromium\n' +
        '2. Extension is built: cd sentience-chrome && ./build.sh'
    );
    enhancedError.stack = e.stack;
    throw enhancedError;
  }
}

/**
 * Gets the page from browser and throws if it's null
 * Helper function for tests to avoid repetitive null checks
 */
export function getPageOrThrow(browser: SentienceBrowser): Page {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser page is not available. Make sure browser.start() was called.');
  }
  return page;
}

/**
 * Checks if the Sentience extension is available in the browser
 * In CI, the extension may not be loaded, so tests that require it should skip
 */
export async function isExtensionAvailable(browser: SentienceBrowser): Promise<boolean> {
  const page = browser.getPage();
  if (!page) {
    return false;
  }

  try {
    // Try to check if window.sentience is defined
    const result = await page.evaluate(() => {
      return typeof (window as any).sentience !== 'undefined';
    });
    return result === true;
  } catch (e) {
    // If evaluation fails, extension is likely not available
    return false;
  }
}

/**
 * Skips a test if the extension is not available (common in CI)
 * Use this to wrap extension-dependent tests
 */
export function skipIfNoExtension(reason: string = 'Extension not available in CI'): void {
  const isCI = process.env.CI === 'true' || process.env.CI === '1' || process.env.CI === 'yes';
  if (isCI) {
    // In CI, we assume extension is not available unless explicitly loaded
    // Tests can still run if extension is manually loaded
    test.skip(reason);
  }
}

/**
 * Wrapper for snapshot() that gracefully handles missing extension in CI
 * Returns null if extension is not available (tests should skip gracefully)
 */
export async function snapshotOrSkip(
  browser: SentienceBrowser,
  options?: any
): Promise<any | null> {
  // Import snapshot dynamically to avoid circular dependencies
  const { snapshot } = await import('../src');
  try {
    return await snapshot(browser, options);
  } catch (e: any) {
    // If snapshot fails with extension error, return null to skip test
    if (
      e.extensionNotAvailable ||
      (e.message && e.message.includes('Sentience extension failed to inject'))
    ) {
      console.log('Skipping snapshot: Extension not available');
      return null;
    }
    // Re-throw other errors
    throw e;
  }
}
