/**
 * Test utilities for browser tests
 */

import { SentienceBrowser } from '../src';

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
