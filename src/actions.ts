/**
 * Actions v1 - click, type, press
 */

import { SentienceBrowser } from './browser';
import { ActionResult, Snapshot, BBox } from './types';
import { snapshot } from './snapshot';

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

  await page.evaluate(
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
        try {
          success = await page.evaluate((id) => {
            return (window as any).sentience.click(id);
          }, elementId);
        } catch (error) {
          // Navigation might have destroyed context, assume success if URL changed
          success = true;
        }
      }
    } catch (error) {
      // Fallback to JS click on error
      try {
        success = await page.evaluate((id) => {
          return (window as any).sentience.click(id);
        }, elementId);
      } catch (evalError) {
        // Navigation might have destroyed context, assume success
        success = true;
      }
    }
  } else {
    // Legacy JS-based click
    try {
      success = await page.evaluate((id) => {
        return (window as any).sentience.click(id);
      }, elementId);
    } catch (error) {
      // Navigation might have destroyed context, assume success
      success = true;
    }
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
  const focused = await page.evaluate((id) => {
    const el = (window as any).sentience_registry[id];
    if (el) {
      el.focus();
      return true;
    }
    return false;
  }, elementId);

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

