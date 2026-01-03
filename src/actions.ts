/**
 * Actions v1 - click, type, press
 */

import { SentienceBrowser } from './browser';
import { ActionResult, Snapshot, BBox } from './types';
import { snapshot } from './snapshot';
import { BrowserEvaluator } from './utils/browser-evaluator';

export interface ClickRect {
  x: number;
  y: number;
  w?: number;
  width?: number;
  h?: number;
  height?: number;
}

/**
 * Highlight a rectangle with a red border overlay
 */
async function highlightRect(
  browser: SentienceBrowser,
  rect: ClickRect,
  durationSec: number = 2.0
): Promise<void> {
  const page = browser.getPage();
  const highlightId = `sentience_highlight_${Date.now()}`;

  // Combine all arguments into a single object for Playwright
  const args = {
    rect: {
      x: rect.x,
      y: rect.y,
      w: rect.w || rect.width || 0,
      h: rect.h || rect.height || 0,
    },
    highlightId,
    durationSec,
  };

  await BrowserEvaluator.evaluate(
    page,
    (args: { rect: { x: number; y: number; w: number; h: number }; highlightId: string; durationSec: number }) => {
      const { rect, highlightId, durationSec } = args;
      // Create overlay div
      const overlay = document.createElement('div');
      overlay.id = highlightId;
      overlay.style.position = 'fixed';
      overlay.style.left = `${rect.x}px`;
      overlay.style.top = `${rect.y}px`;
      overlay.style.width = `${rect.w}px`;
      overlay.style.height = `${rect.h}px`;
      overlay.style.border = '3px solid red';
      overlay.style.borderRadius = '2px';
      overlay.style.boxSizing = 'border-box';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '999999';
      overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
      overlay.style.transition = 'opacity 0.3s ease-out';

      document.body.appendChild(overlay);

      // Remove after duration
      setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        }, 300); // Wait for fade-out transition
      }, durationSec * 1000);
    },
    args
  );
}

/**
 * Click an element by its ID
 * 
 * Uses a hybrid approach: gets element bounding box from snapshot and calculates center,
 * then uses Playwright's native mouse.click() for realistic event simulation.
 * Falls back to JavaScript click if element not found in snapshot.
 * 
 * @param browser - SentienceBrowser instance
 * @param elementId - Element ID from snapshot
 * @param useMouse - Use mouse simulation (default: true). If false, uses JavaScript click.
 * @param takeSnapshot - Take snapshot after action (default: false)
 * @returns ActionResult with success status, outcome, duration, and optional snapshot
 * 
 * @example
 * ```typescript
 * const snap = await snapshot(browser);
 * const button = find(snap, 'role=button');
 * if (button) {
 *   const result = await click(browser, button.id);
 *   console.log(`Click ${result.success ? 'succeeded' : 'failed'}`);
 * }
 * ```
 */
export async function click(
  browser: SentienceBrowser,
  elementId: number,
  useMouse: boolean = true,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  const startTime = Date.now();
  const urlBefore = page.url();

  let success: boolean;

  if (useMouse) {
    // Hybrid approach: Get element bbox from snapshot, calculate center, use mouse.click()
    try {
      const snap = await snapshot(browser);
      const element = snap.elements.find((el) => el.id === elementId);

      if (element) {
        // Calculate center of element bbox
        const centerX = element.bbox.x + element.bbox.width / 2;
        const centerY = element.bbox.y + element.bbox.height / 2;
        // Use Playwright's native mouse click for realistic simulation
        await page.mouse.click(centerX, centerY);
        success = true;
      } else {
        // Fallback to JS click if element not found in snapshot
        success = await BrowserEvaluator.evaluateWithNavigationFallback(
          page,
          (id) => (window as any).sentience.click(id),
          elementId,
          true // Assume success if navigation destroyed context
        );
      }
    } catch (error) {
      // Fallback to JS click on error
      success = await BrowserEvaluator.evaluateWithNavigationFallback(
        page,
        (id) => (window as any).sentience.click(id),
        elementId,
        true // Assume success if navigation destroyed context
      );
    }
  } else {
    // Legacy JS-based click
    success = await BrowserEvaluator.evaluateWithNavigationFallback(
      page,
      (id) => (window as any).sentience.click(id),
      elementId,
      true // Assume success if navigation destroyed context
    );
  }

  // Wait a bit for navigation/DOM updates
  try {
    await page.waitForTimeout(500);
  } catch (error) {
    // Navigation might have happened, context destroyed
  }

  const durationMs = Date.now() - startTime;

  // Check if URL changed (handle navigation gracefully)
  let urlAfter: string;
  let urlChanged: boolean;
  try {
    urlAfter = page.url();
    urlChanged = urlBefore !== urlAfter;
  } catch (error) {
    // Context destroyed due to navigation - assume URL changed
    urlAfter = urlBefore;
    urlChanged = true;
  }

  // Determine outcome
  let outcome: 'navigated' | 'dom_updated' | 'no_change' | 'error' | undefined;
  if (urlChanged) {
    outcome = 'navigated';
  } else if (success) {
    outcome = 'dom_updated';
  } else {
    outcome = 'error';
  }

  // Optional snapshot after
  let snapshotAfter: Snapshot | undefined;
  if (takeSnapshot) {
    try {
      snapshotAfter = await snapshot(browser);
    } catch (error) {
      // Navigation might have destroyed context
    }
  }

  return {
    success,
    duration_ms: durationMs,
    outcome,
    url_changed: urlChanged,
    snapshot_after: snapshotAfter,
    error: success
      ? undefined
      : { code: 'click_failed', reason: 'Element not found or not clickable' },
  };
}

/**
 * Type text into an input element
 * 
 * Focuses the element first, then types the text using Playwright's keyboard simulation.
 * 
 * @param browser - SentienceBrowser instance
 * @param elementId - Element ID from snapshot (must be a text input element)
 * @param text - Text to type
 * @param takeSnapshot - Take snapshot after action (default: false)
 * @returns ActionResult with success status, outcome, duration, and optional snapshot
 * 
 * @example
 * ```typescript
 * const snap = await snapshot(browser);
 * const searchBox = find(snap, 'role=searchbox');
 * if (searchBox) {
 *   await typeText(browser, searchBox.id, 'Hello World');
 * }
 * ```
 */
export async function typeText(
  browser: SentienceBrowser,
  elementId: number,
  text: string,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  const startTime = Date.now();
  const urlBefore = page.url();

  // Focus element first
  const focused = await BrowserEvaluator.evaluate(
    page,
    (id) => {
      const el = (window as any).sentience_registry[id];
      if (el) {
        el.focus();
        return true;
      }
      return false;
    },
    elementId
  );

  if (!focused) {
    return {
      success: false,
      duration_ms: Date.now() - startTime,
      outcome: 'error',
      error: { code: 'focus_failed', reason: 'Element not found' },
    };
  }

  // Type using Playwright keyboard
  await page.keyboard.type(text);

  const durationMs = Date.now() - startTime;
  const urlAfter = page.url();
  const urlChanged = urlBefore !== urlAfter;

  const outcome = urlChanged ? 'navigated' : 'dom_updated';

  let snapshotAfter: Snapshot | undefined;
  if (takeSnapshot) {
    snapshotAfter = await snapshot(browser);
  }

  return {
    success: true,
    duration_ms: durationMs,
    outcome,
    url_changed: urlChanged,
    snapshot_after: snapshotAfter,
  };
}

/**
 * Press a keyboard key
 * 
 * Simulates pressing a key using Playwright's keyboard API.
 * Common keys: 'Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', etc.
 * 
 * @param browser - SentienceBrowser instance
 * @param key - Key to press (e.g., 'Enter', 'Escape', 'Tab')
 * @param takeSnapshot - Take snapshot after action (default: false)
 * @returns ActionResult with success status, outcome, duration, and optional snapshot
 * 
 * @example
 * ```typescript
 * // Press Enter after typing
 * await typeText(browser, elementId, 'search query');
 * await press(browser, 'Enter');
 * ```
 */
export async function press(
  browser: SentienceBrowser,
  key: string,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  const startTime = Date.now();
  const urlBefore = page.url();

  // Press key using Playwright
  await page.keyboard.press(key);

  // Wait a bit for navigation/DOM updates
  await page.waitForTimeout(500);

  const durationMs = Date.now() - startTime;
  const urlAfter = page.url();
  const urlChanged = urlBefore !== urlAfter;

  const outcome = urlChanged ? 'navigated' : 'dom_updated';

  let snapshotAfter: Snapshot | undefined;
  if (takeSnapshot) {
    snapshotAfter = await snapshot(browser);
  }

  return {
    success: true,
    duration_ms: durationMs,
    outcome,
    url_changed: urlChanged,
    snapshot_after: snapshotAfter,
  };
}

/**
 * Click at the center of a rectangle using Playwright's native mouse simulation.
 * This uses a hybrid approach: calculates center coordinates and uses mouse.click()
 * for realistic event simulation (triggers hover, focus, mousedown, mouseup).
 *
 * @param browser - SentienceBrowser instance
 * @param rect - Rectangle with x, y, w (or width), h (or height) keys, or BBox object
 * @param highlight - Whether to show a red border highlight when clicking (default: true)
 * @param highlightDuration - How long to show the highlight in seconds (default: 2.0)
 * @param takeSnapshot - Whether to take snapshot after action
 * @returns ActionResult
 *
 * @example
 * ```typescript
 * // Click using rect object
 * await clickRect(browser, { x: 100, y: 200, w: 50, h: 30 });
 *
 * // Click using BBox from element
 * const snap = await snapshot(browser);
 * const element = find(snap, "role=button");
 * if (element) {
 *   await clickRect(browser, {
 *     x: element.bbox.x,
 *     y: element.bbox.y,
 *     w: element.bbox.width,
 *     h: element.bbox.height
 *   });
 * }
 *
 * // Without highlight
 * await clickRect(browser, { x: 100, y: 200, w: 50, h: 30 }, false);
 *
 * // Custom highlight duration
 * await clickRect(browser, { x: 100, y: 200, w: 50, h: 30 }, true, 3.0);
 * ```
 */
export async function clickRect(
  browser: SentienceBrowser,
  rect: ClickRect | BBox,
  highlight: boolean = true,
  highlightDuration: number = 2.0,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  const startTime = Date.now();
  const urlBefore = page.url();

  // Handle BBox object or ClickRect dict
  let x: number, y: number, w: number, h: number;

  if ('width' in rect && 'height' in rect && !('w' in rect) && !('h' in rect)) {
    // BBox object (width and height are required in BBox)
    const bbox = rect as BBox;
    x = bbox.x;
    y = bbox.y;
    w = bbox.width;
    h = bbox.height;
  } else {
    // ClickRect dict
    const clickRect = rect as ClickRect;
    x = clickRect.x;
    y = clickRect.y;
    w = clickRect.w || clickRect.width || 0;
    h = clickRect.h || clickRect.height || 0;
  }

  if (w <= 0 || h <= 0) {
    return {
      success: false,
      duration_ms: 0,
      outcome: 'error',
      error: {
        code: 'invalid_rect',
        reason: 'Rectangle width and height must be positive',
      },
    };
  }

  // Calculate center of rectangle
  const centerX = x + w / 2;
  const centerY = y + h / 2;

  // Show highlight before clicking (if enabled)
  if (highlight) {
    await highlightRect(browser, { x, y, w, h }, highlightDuration);
    // Small delay to ensure highlight is visible
    await page.waitForTimeout(50);
  }

  // Use Playwright's native mouse click for realistic simulation
  let success: boolean;
  let errorMsg: string | undefined;
  try {
    await page.mouse.click(centerX, centerY);
    success = true;
  } catch (error) {
    success = false;
    errorMsg = error instanceof Error ? error.message : String(error);
  }

  // Wait a bit for navigation/DOM updates
  await page.waitForTimeout(500);

  const durationMs = Date.now() - startTime;
  const urlAfter = page.url();
  const urlChanged = urlBefore !== urlAfter;

  // Determine outcome
  let outcome: 'navigated' | 'dom_updated' | 'no_change' | 'error' | undefined;
  if (urlChanged) {
    outcome = 'navigated';
  } else if (success) {
    outcome = 'dom_updated';
  } else {
    outcome = 'error';
  }

  // Optional snapshot after
  let snapshotAfter: Snapshot | undefined;
  if (takeSnapshot) {
    snapshotAfter = await snapshot(browser);
  }

  return {
    success,
    duration_ms: durationMs,
    outcome,
    url_changed: urlChanged,
    snapshot_after: snapshotAfter,
    error: success
      ? undefined
      : { code: 'click_failed', reason: errorMsg || 'Click failed' },
  };
}

