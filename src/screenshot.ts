/**
 * Screenshot functionality - standalone screenshot capture
 */

import { SentienceBrowser } from './browser';

export interface ScreenshotOptions {
  format?: 'png' | 'jpeg';
  quality?: number; // 1-100, only used for JPEG
}

/**
 * Capture screenshot of current page
 *
 * @param browser - SentienceBrowser instance
 * @param options - Screenshot options
 * @returns Base64-encoded screenshot data URL (e.g., "data:image/png;base64,...")
 */
export async function screenshot(
  browser: SentienceBrowser,
  options: ScreenshotOptions = {}
): Promise<string> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }
  const format = options.format || 'png';
  const quality = options.quality;

  if (format === 'jpeg' && quality !== undefined) {
    if (quality < 1 || quality > 100) {
      throw new Error('Quality must be between 1 and 100 for JPEG format');
    }
  }

  // Use Playwright's screenshot with base64 encoding
  const screenshotOptions: any = {
    type: format,
    encoding: 'base64',
  };

  if (format === 'jpeg' && quality !== undefined) {
    screenshotOptions.quality = quality;
  }

  // Capture screenshot
  const base64Data = await page.screenshot(screenshotOptions);

  // Return as data URL
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${base64Data}`;
}
