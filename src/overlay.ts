/**
 * Visual overlay utilities - show/clear element highlights in browser
 */

import { SentienceBrowser } from './browser';
import { Element, Snapshot } from './types';

/**
 * Display visual overlay highlighting elements in the browser
 *
 * This function shows a Shadow DOM overlay with color-coded borders around
 * detected elements. Useful for debugging, learning, and validating element detection.
 *
 * @param browser - SentienceBrowser instance
 * @param elements - Can be:
 *   - List of Element objects (from snapshot.elements)
 *   - List of raw element objects (from snapshot result or API response)
 *   - Snapshot object (will use snapshot.elements)
 * @param targetElementId - Optional ID of element to highlight in red (default: null)
 *
 * Color Coding:
 *   - Red: Target element (when targetElementId is specified)
 *   - Blue: Primary elements (is_primary=true)
 *   - Green: Regular interactive elements
 *
 * Visual Indicators:
 *   - Border thickness and opacity scale with importance score
 *   - Semi-transparent fill for better visibility
 *   - Importance badges showing scores
 *   - Star icon for primary elements
 *   - Target emoji for the target element
 *
 * Auto-clear: Overlay automatically disappears after 5 seconds
 *
 * @example
 * // Show overlay from snapshot
 * const snap = await snapshot(browser);
 * await showOverlay(browser, snap);
 *
 * @example
 * // Show overlay with custom elements
 * const elements = [{id: 1, bbox: {x: 100, y: 100, width: 200, height: 50}, ...}];
 * await showOverlay(browser, elements);
 *
 * @example
 * // Show overlay with target element highlighted in red
 * await showOverlay(browser, snap, 42);
 *
 * @example
 * // Clear overlay manually before 5 seconds
 * await clearOverlay(browser);
 */
export async function showOverlay(
  browser: SentienceBrowser,
  elements: Element[] | any[] | Snapshot,
  targetElementId: number | null = null
): Promise<void> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }

  // Handle different input types
  let elementsList: any[];
  if ('elements' in elements && Array.isArray(elements.elements)) {
    // It's a Snapshot object
    elementsList = elements.elements;
  } else if (Array.isArray(elements)) {
    // It's already an array
    elementsList = elements;
  } else {
    throw new Error('elements must be a Snapshot object or array of elements');
  }

  // Call extension API
  await page.evaluate(
    (args: { elements: any[]; targetId: number | null }) => {
      if ((window as any).sentience && (window as any).sentience.showOverlay) {
        (window as any).sentience.showOverlay(args.elements, args.targetId);
      } else {
        console.warn('[Sentience SDK] showOverlay not available - is extension loaded?');
      }
    },
    { elements: elementsList, targetId: targetElementId }
  );
}

/**
 * Clear the visual overlay manually (before 5-second auto-clear)
 *
 * @param browser - SentienceBrowser instance
 *
 * @example
 * await showOverlay(browser, snap);
 * // ... inspect overlay ...
 * await clearOverlay(browser);  // Remove immediately
 */
export async function clearOverlay(browser: SentienceBrowser): Promise<void> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }

  await page.evaluate(() => {
    if ((window as any).sentience && (window as any).sentience.clearOverlay) {
      (window as any).sentience.clearOverlay();
    }
  });
}
