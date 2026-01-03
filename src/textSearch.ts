/**
 * Text search utilities - find text and get pixel coordinates
 */

import { Page } from 'playwright';
import { FindTextRectOptions, TextRectSearchResult } from './types';

/**
 * Find all occurrences of text on the page and get their exact pixel coordinates.
 *
 * This function searches for text in all visible text nodes on the page and returns
 * the bounding rectangles for each match. Useful for:
 * - Finding specific UI elements by their text content
 * - Locating buttons, links, or labels without element IDs
 * - Getting exact coordinates for click automation
 * - Highlighting search results visually
 *
 * @param page - Playwright Page instance
 * @param options - Search options
 * @returns TextRectSearchResult with all matches and their coordinates
 *
 * @example
 * // Find "Sign In" button
 * const result = await findTextRect(page, { text: "Sign In" });
 * if (result.status === "success" && result.results) {
 *   const firstMatch = result.results[0];
 *   console.log(`Found at: (${firstMatch.rect.x}, ${firstMatch.rect.y})`);
 *   console.log(`Size: ${firstMatch.rect.width}x${firstMatch.rect.height}`);
 *   console.log(`In viewport: ${firstMatch.in_viewport}`);
 * }
 *
 * @example
 * // Case-sensitive search
 * const result = await findTextRect(page, {
 *   text: "LOGIN",
 *   caseSensitive: true
 * });
 *
 * @example
 * // Whole word only
 * const result = await findTextRect(page, {
 *   text: "log",
 *   wholeWord: true  // Won't match "login"
 * });
 *
 * @example
 * // Find all matches and click the first visible one
 * const result = await findTextRect(page, {
 *   text: "Buy Now",
 *   maxResults: 5
 * });
 * if (result.status === "success" && result.results) {
 *   for (const match of result.results) {
 *     if (match.in_viewport) {
 *       // Use clickRect from actions module
 *       await page.mouse.click(
 *         match.rect.x + match.rect.width / 2,
 *         match.rect.y + match.rect.height / 2
 *       );
 *       break;
 *     }
 *   }
 * }
 */
export async function findTextRect(
  page: Page,
  options: FindTextRectOptions | string
): Promise<TextRectSearchResult> {
  // Support simple string input for convenience
  const opts: FindTextRectOptions = typeof options === 'string' ? { text: options } : options;

  const { text, caseSensitive = false, wholeWord = false, maxResults = 10 } = opts;

  if (!text || text.trim().length === 0) {
    return {
      status: 'error',
      error: 'Text parameter is required and cannot be empty',
    };
  }

  // Limit max_results to prevent performance issues
  const limitedMaxResults = Math.min(maxResults, 100);

  // CRITICAL: Wait for extension injection to complete (CSP-resistant architecture)
  // The new architecture loads injected_api.js asynchronously, so window.sentience
  // may not be immediately available after page load
  try {
    await page.waitForFunction(() => typeof (window as any).sentience !== 'undefined', {
      timeout: 5000,
    });
  } catch (e) {
    // Gather diagnostics if wait fails
    const diag = await page
      .evaluate(() => ({
        sentience_defined: typeof (window as any).sentience !== 'undefined',
        extension_id: document.documentElement.dataset.sentienceExtensionId || 'not set',
        url: window.location.href,
      }))
      .catch(() => ({ error: 'Could not gather diagnostics' }));

    throw new Error(
      `Sentience extension failed to inject window.sentience API. ` +
        `Is the extension loaded? Diagnostics: ${JSON.stringify(diag)}`
    );
  }

  // Verify findTextRect method exists (for older extension versions that don't have it)
  const hasFindTextRect = await page.evaluate(
    () => typeof (window as any).sentience.findTextRect !== 'undefined'
  );
  if (!hasFindTextRect) {
    throw new Error(
      'window.sentience.findTextRect is not available. ' +
        'Please update the Sentience extension to the latest version.'
    );
  }

  // Call the extension's findTextRect method
  const result = await page.evaluate(
    evalOptions => {
      return (window as any).sentience.findTextRect(evalOptions);
    },
    {
      text,
      caseSensitive,
      wholeWord,
      maxResults: limitedMaxResults,
    }
  );

  return result as TextRectSearchResult;
}
