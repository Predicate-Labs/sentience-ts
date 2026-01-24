/**
 * Actions v1 - click, type, press
 */

import { IBrowser } from './protocols/browser-protocol';
import { ActionResult, Snapshot, BBox } from './types';
import { snapshot, SnapshotOptions } from './snapshot';
import { BrowserEvaluator } from './utils/browser-evaluator';
import { CursorPolicy, buildHumanCursorPath } from './cursor-policy';

const cursorPosByPage: WeakMap<any, { x: number; y: number }> = new WeakMap();

async function humanMoveIfEnabled(
  page: any,
  target: { x: number; y: number },
  cursorPolicy?: CursorPolicy
): Promise<Record<string, any> | undefined> {
  if (!cursorPolicy || cursorPolicy.mode !== 'human') return undefined;

  const prev = cursorPosByPage.get(page);
  let from: { x: number; y: number };
  if (prev) {
    from = prev;
  } else {
    const vp = page.viewportSize ? page.viewportSize() : null;
    from = vp ? { x: vp.width / 2, y: vp.height / 2 } : { x: 0, y: 0 };
  }

  const meta = buildHumanCursorPath([from.x, from.y], [target.x, target.y], cursorPolicy);
  const pts = meta.path || [];
  const durationMs = meta.duration_ms || 0;
  const perStepMs = durationMs > 0 ? durationMs / Math.max(1, pts.length) : 0;
  for (const p of pts) {
    await page.mouse.move(p.x, p.y);
    if (perStepMs > 0) await page.waitForTimeout(perStepMs);
  }
  if (meta.pause_before_click_ms > 0) {
    await page.waitForTimeout(meta.pause_before_click_ms);
  }

  cursorPosByPage.set(page, { x: target.x, y: target.y });
  return meta as any;
}

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
  browser: IBrowser,
  rect: ClickRect,
  durationSec: number = 2.0
): Promise<void> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }
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
    (args: {
      rect: { x: number; y: number; w: number; h: number };
      highlightId: string;
      durationSec: number;
    }) => {
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
  browser: IBrowser,
  elementId: number,
  useMouse: boolean = true,
  takeSnapshot: boolean = false,
  cursorPolicy?: CursorPolicy
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }
  const startTime = Date.now();
  const urlBefore = page.url();

  let success: boolean;
  let cursorMeta: Record<string, any> | undefined;

  if (useMouse) {
    // Hybrid approach: Get element bbox from snapshot, calculate center, use mouse.click()
    try {
      const snap = await snapshot(browser);
      const element = snap.elements.find(el => el.id === elementId);

      if (element) {
        // Calculate center of element bbox
        const centerX = element.bbox.x + element.bbox.width / 2;
        const centerY = element.bbox.y + element.bbox.height / 2;
        cursorMeta = await humanMoveIfEnabled(page, { x: centerX, y: centerY }, cursorPolicy);
        // Use Playwright's native mouse click for realistic simulation
        await page.mouse.click(centerX, centerY);
        success = true;
        // Keep cursor position even when not in human mode (for future moves)
        cursorPosByPage.set(page, { x: centerX, y: centerY });
      } else {
        // Fallback to JS click if element not found in snapshot
        success = await BrowserEvaluator.evaluateWithNavigationFallback(
          page,
          id => (window as any).sentience.click(id),
          elementId,
          true // Assume success if navigation destroyed context
        );
      }
    } catch {
      // Fallback to JS click on error
      success = await BrowserEvaluator.evaluateWithNavigationFallback(
        page,
        id => (window as any).sentience.click(id),
        elementId,
        true // Assume success if navigation destroyed context
      );
    }
  } else {
    // Legacy JS-based click
    success = await BrowserEvaluator.evaluateWithNavigationFallback(
      page,
      id => (window as any).sentience.click(id),
      elementId,
      true // Assume success if navigation destroyed context
    );
  }

  // Wait a bit for navigation/DOM updates
  try {
    await page.waitForTimeout(500);
  } catch {
    // Navigation might have happened, context destroyed
  }

  const durationMs = Date.now() - startTime;

  // Check if URL changed (handle navigation gracefully)
  let urlAfter: string;
  let urlChanged: boolean;
  try {
    urlAfter = page.url();
    urlChanged = urlBefore !== urlAfter;
  } catch {
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
    } catch {
      // Navigation might have destroyed context
    }
  }

  return {
    success,
    duration_ms: durationMs,
    outcome,
    url_changed: urlChanged,
    snapshot_after: snapshotAfter,
    cursor: cursorMeta,
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
 * @param delayMs - Delay between keystrokes in milliseconds for human-like typing (default: 0)
 * @returns ActionResult with success status, outcome, duration, and optional snapshot
 *
 * @example
 * ```typescript
 * const snap = await snapshot(browser);
 * const searchBox = find(snap, 'role=searchbox');
 * if (searchBox) {
 *   // Type instantly (default behavior)
 *   await typeText(browser, searchBox.id, 'Hello World');
 *
 *   // Type with human-like delay (~10ms between keystrokes)
 *   await typeText(browser, searchBox.id, 'Hello World', false, 10);
 * }
 * ```
 */
export async function typeText(
  browser: IBrowser,
  elementId: number,
  text: string,
  takeSnapshot: boolean = false,
  delayMs: number = 0
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }
  const startTime = Date.now();
  const urlBefore = page.url();

  // Focus element first
  const focused = await BrowserEvaluator.evaluate(
    page,
    id => {
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

  // Type using Playwright keyboard with optional delay between keystrokes
  await page.keyboard.type(text, { delay: delayMs });

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
 * Clear the value of an input/textarea element (best-effort).
 */
export async function clear(
  browser: IBrowser,
  elementId: number,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) throw new Error('Browser not started. Call start() first.');

  const startTime = Date.now();
  const urlBefore = page.url();

  const ok = await BrowserEvaluator.evaluate(
    page,
    id => {
      const el = (window as any).sentience_registry?.[id];
      if (!el) return false;
      try {
        el.focus?.();
      } catch {
        /* ignore */
      }
      if ('value' in el) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    },
    elementId
  );

  if (!ok) {
    return {
      success: false,
      duration_ms: Date.now() - startTime,
      outcome: 'error',
      error: { code: 'clear_failed', reason: 'Element not found or not clearable' },
    };
  }

  try {
    await page.waitForTimeout(250);
  } catch {
    /* ignore */
  }

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
 * Ensure a checkbox/radio is checked (best-effort).
 */
export async function check(
  browser: IBrowser,
  elementId: number,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) throw new Error('Browser not started. Call start() first.');

  const startTime = Date.now();
  const urlBefore = page.url();

  const ok = await BrowserEvaluator.evaluate(
    page,
    id => {
      const el = (window as any).sentience_registry?.[id];
      if (!el) return false;
      try {
        el.focus?.();
      } catch {
        /* ignore */
      }
      if (!('checked' in el)) return false;
      if (el.checked === true) return true;
      try {
        el.click();
      } catch {
        return false;
      }
      return true;
    },
    elementId
  );

  if (!ok) {
    return {
      success: false,
      duration_ms: Date.now() - startTime,
      outcome: 'error',
      error: { code: 'check_failed', reason: 'Element not found or not checkable' },
    };
  }

  try {
    await page.waitForTimeout(250);
  } catch {
    /* ignore */
  }

  const durationMs = Date.now() - startTime;
  const urlAfter = page.url();
  const urlChanged = urlBefore !== urlAfter;
  const outcome = urlChanged ? 'navigated' : 'dom_updated';

  let snapshotAfter: Snapshot | undefined;
  if (takeSnapshot) snapshotAfter = await snapshot(browser);

  return {
    success: true,
    duration_ms: durationMs,
    outcome,
    url_changed: urlChanged,
    snapshot_after: snapshotAfter,
  };
}

/**
 * Ensure a checkbox/radio is unchecked (best-effort).
 */
export async function uncheck(
  browser: IBrowser,
  elementId: number,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) throw new Error('Browser not started. Call start() first.');

  const startTime = Date.now();
  const urlBefore = page.url();

  const ok = await BrowserEvaluator.evaluate(
    page,
    id => {
      const el = (window as any).sentience_registry?.[id];
      if (!el) return false;
      try {
        el.focus?.();
      } catch {
        /* ignore */
      }
      if (!('checked' in el)) return false;
      if (el.checked === false) return true;
      try {
        el.click();
      } catch {
        return false;
      }
      return true;
    },
    elementId
  );

  if (!ok) {
    return {
      success: false,
      duration_ms: Date.now() - startTime,
      outcome: 'error',
      error: { code: 'uncheck_failed', reason: 'Element not found or not uncheckable' },
    };
  }

  try {
    await page.waitForTimeout(250);
  } catch {
    /* ignore */
  }

  const durationMs = Date.now() - startTime;
  const urlAfter = page.url();
  const urlChanged = urlBefore !== urlAfter;
  const outcome = urlChanged ? 'navigated' : 'dom_updated';

  let snapshotAfter: Snapshot | undefined;
  if (takeSnapshot) snapshotAfter = await snapshot(browser);

  return {
    success: true,
    duration_ms: durationMs,
    outcome,
    url_changed: urlChanged,
    snapshot_after: snapshotAfter,
  };
}

/**
 * Select an option in a <select> element by matching option value or label (best-effort).
 */
export async function selectOption(
  browser: IBrowser,
  elementId: number,
  option: string,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) throw new Error('Browser not started. Call start() first.');

  const startTime = Date.now();
  const urlBefore = page.url();

  const ok = await BrowserEvaluator.evaluate(
    page,
    (args: { id: number; option: string }) => {
      const el = (window as any).sentience_registry?.[args.id];
      if (!el) return false;
      const tag = String(el.tagName || '').toUpperCase();
      if (tag !== 'SELECT') return false;
      const needle = String(args.option ?? '');
      const opts = Array.from((el.options as any[]) || []);
      let chosen: any = null;
      for (const o of opts) {
        const oo: any = o;
        if (String(oo.value) === needle || String(oo.text) === needle) {
          chosen = o;
          break;
        }
      }
      if (!chosen) {
        for (const o of opts) {
          const oo: any = o;
          if (String(oo.text || '').includes(needle)) {
            chosen = o;
            break;
          }
        }
      }
      if (!chosen) return false;
      el.value = chosen.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    { id: elementId, option }
  );

  if (!ok) {
    return {
      success: false,
      duration_ms: Date.now() - startTime,
      outcome: 'error',
      error: { code: 'select_failed', reason: 'Element not found or option not found' },
    };
  }

  try {
    await page.waitForTimeout(250);
  } catch {
    /* ignore */
  }

  const durationMs = Date.now() - startTime;
  const urlAfter = page.url();
  const urlChanged = urlBefore !== urlAfter;
  const outcome = urlChanged ? 'navigated' : 'dom_updated';

  let snapshotAfter: Snapshot | undefined;
  if (takeSnapshot) snapshotAfter = await snapshot(browser);

  return {
    success: true,
    duration_ms: durationMs,
    outcome,
    url_changed: urlChanged,
    snapshot_after: snapshotAfter,
  };
}

/**
 * Upload a local file via an <input type="file"> element (best-effort).
 */
export async function uploadFile(
  browser: IBrowser,
  elementId: number,
  filePath: string,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) throw new Error('Browser not started. Call start() first.');

  const startTime = Date.now();
  const urlBefore = page.url();

  let success = false;
  let errorMsg: string | undefined;
  try {
    // First try: grab the exact element handle from the sentience registry.
    try {
      const handle = await page.evaluateHandle(
        '(id) => (window.sentience_registry && window.sentience_registry[id]) || null',
        elementId
      );
      const el = (handle as any).asElement?.() ?? null;
      if (!el) throw new Error('Element not found');
      await el.setInputFiles(filePath);
      success = true;
    } catch {
      // Fallback: resolve a selector from the element's attributes and use page.setInputFiles().
      const attrs = await BrowserEvaluator.evaluate(
        page,
        id => {
          const el = (window as any).sentience_registry?.[id];
          if (!el) return null;
          const tag = String(el.tagName || '').toUpperCase();
          const type = String(el.type || '').toLowerCase();
          const idAttr = el.id ? String(el.id) : null;
          const nameAttr = el.name ? String(el.name) : null;
          return { tag, type, id: idAttr, name: nameAttr };
        },
        elementId
      );

      let selector: string | null = null;
      if (attrs && attrs.tag === 'INPUT' && attrs.type === 'file') {
        if (attrs.id) selector = `input#${attrs.id}`;
        else if (attrs.name) selector = `input[name="${String(attrs.name).replace(/"/g, '\\"')}"]`;
      }
      if (!selector) throw new Error('Element not found');
      await page.setInputFiles(selector, filePath);
      success = true;
    }
  } catch (e: any) {
    success = false;
    errorMsg = String(e?.message ?? e);
  }

  try {
    await page.waitForTimeout(250);
  } catch {
    /* ignore */
  }

  const durationMs = Date.now() - startTime;
  const urlAfter = page.url();
  const urlChanged = urlBefore !== urlAfter;
  const outcome = urlChanged ? 'navigated' : success ? 'dom_updated' : 'error';

  let snapshotAfter: Snapshot | undefined;
  if (takeSnapshot) {
    try {
      snapshotAfter = await snapshot(browser);
    } catch {
      /* ignore */
    }
  }

  return {
    success,
    duration_ms: durationMs,
    outcome,
    url_changed: urlChanged,
    snapshot_after: snapshotAfter,
    error: success ? undefined : { code: 'upload_failed', reason: errorMsg ?? 'upload failed' },
  };
}

/**
 * Submit a form (best-effort) by clicking a submit control or calling requestSubmit().
 */
export async function submit(
  browser: IBrowser,
  elementId: number,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) throw new Error('Browser not started. Call start() first.');

  const startTime = Date.now();
  const urlBefore = page.url();

  const ok = await BrowserEvaluator.evaluate(
    page,
    id => {
      const el = (window as any).sentience_registry?.[id];
      if (!el) return false;
      try {
        el.focus?.();
      } catch {
        /* ignore */
      }
      const tag = String(el.tagName || '').toUpperCase();
      if (tag === 'FORM') {
        if (typeof el.requestSubmit === 'function') {
          el.requestSubmit();
          return true;
        }
        try {
          el.submit();
          return true;
        } catch {
          return false;
        }
      }
      const form = el.form;
      if (form && typeof form.requestSubmit === 'function') {
        form.requestSubmit();
        return true;
      }
      try {
        el.click();
        return true;
      } catch {
        return false;
      }
    },
    elementId
  );

  if (!ok) {
    return {
      success: false,
      duration_ms: Date.now() - startTime,
      outcome: 'error',
      error: { code: 'submit_failed', reason: 'Element not found or not submittable' },
    };
  }

  try {
    await page.waitForTimeout(500);
  } catch {
    /* ignore */
  }

  const durationMs = Date.now() - startTime;
  const urlAfter = page.url();
  const urlChanged = urlBefore !== urlAfter;
  const outcome = urlChanged ? 'navigated' : 'dom_updated';

  let snapshotAfter: Snapshot | undefined;
  if (takeSnapshot) {
    try {
      snapshotAfter = await snapshot(browser);
    } catch {
      /* ignore */
    }
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
 * Navigate back in history (best-effort).
 */
export async function back(
  browser: IBrowser,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) throw new Error('Browser not started. Call start() first.');

  const startTime = Date.now();
  const urlBefore = page.url();

  let success = false;
  let errorMsg: string | undefined;
  try {
    await page.goBack();
    success = true;
  } catch (e: any) {
    success = false;
    errorMsg = String(e?.message ?? e);
  }

  try {
    await page.waitForTimeout(500);
  } catch {
    /* ignore */
  }

  const durationMs = Date.now() - startTime;
  let urlChanged = false;
  try {
    urlChanged = urlBefore !== page.url();
  } catch {
    urlChanged = true;
  }
  const outcome = urlChanged ? 'navigated' : success ? 'dom_updated' : 'error';

  let snapshotAfter: Snapshot | undefined;
  if (takeSnapshot) {
    try {
      snapshotAfter = await snapshot(browser);
    } catch {
      /* ignore */
    }
  }

  return {
    success,
    duration_ms: durationMs,
    outcome,
    url_changed: urlChanged,
    snapshot_after: snapshotAfter,
    error: success ? undefined : { code: 'back_failed', reason: errorMsg ?? 'back failed' },
  };
}

/**
 * Scroll an element into view
 *
 * Scrolls the page so that the specified element is visible in the viewport.
 * Uses the element registry to find the element and scrollIntoView() to scroll it.
 *
 * @param browser - SentienceBrowser instance
 * @param elementId - Element ID from snapshot to scroll into view
 * @param behavior - Scroll behavior: 'smooth' for animated scroll, 'instant' for immediate (default: 'smooth')
 * @param block - Vertical alignment: 'start', 'center', 'end', 'nearest' (default: 'center')
 * @param takeSnapshot - Take snapshot after action (default: false)
 * @returns ActionResult with success status, outcome, duration, and optional snapshot
 *
 * @example
 * ```typescript
 * const snap = await snapshot(browser);
 * const button = find(snap, 'role=button[name="Submit"]');
 * if (button) {
 *   // Scroll element into view with smooth animation
 *   await scrollTo(browser, button.id);
 *
 *   // Scroll instantly to top of viewport
 *   await scrollTo(browser, button.id, 'instant', 'start');
 * }
 * ```
 */
export async function scrollTo(
  browser: IBrowser,
  elementId: number,
  behavior: 'smooth' | 'instant' | 'auto' = 'smooth',
  block: 'start' | 'center' | 'end' | 'nearest' = 'center',
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }
  const startTime = Date.now();
  const urlBefore = page.url();

  // Scroll element into view using the element registry
  const scrolled = await BrowserEvaluator.evaluate(
    page,
    (args: { id: number; behavior: string; block: string }) => {
      const el = (window as any).sentience_registry[args.id];
      if (el && el.scrollIntoView) {
        el.scrollIntoView({
          behavior: args.behavior,
          block: args.block,
          inline: 'nearest',
        });
        return true;
      }
      return false;
    },
    { id: elementId, behavior, block }
  );

  if (!scrolled) {
    return {
      success: false,
      duration_ms: Date.now() - startTime,
      outcome: 'error',
      error: { code: 'scroll_failed', reason: 'Element not found or not scrollable' },
    };
  }

  // Wait a bit for scroll to complete (especially for smooth scrolling)
  await page.waitForTimeout(behavior === 'smooth' ? 500 : 100);

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
  browser: IBrowser,
  key: string,
  takeSnapshot: boolean = false
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }
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

function normalizeKeyToken(token: string): string {
  const lookup: Record<string, string> = {
    CMD: 'Meta',
    COMMAND: 'Meta',
    CTRL: 'Control',
    CONTROL: 'Control',
    ALT: 'Alt',
    OPTION: 'Alt',
    SHIFT: 'Shift',
    ESC: 'Escape',
    ESCAPE: 'Escape',
    ENTER: 'Enter',
    RETURN: 'Enter',
    TAB: 'Tab',
    SPACE: 'Space',
  };
  const upper = token.trim().toUpperCase();
  return lookup[upper] ?? token.trim();
}

function parseKeySequence(sequence: string): string[] {
  const parts: string[] = [];
  for (const rawPart of sequence.replace(/,/g, ' ').split(/\s+/)) {
    let raw = rawPart.trim();
    if (!raw) continue;
    if (raw.startsWith('{') && raw.endsWith('}')) {
      raw = raw.slice(1, -1);
    }
    if (raw.includes('+')) {
      const combo = raw
        .split('+')
        .filter(Boolean)
        .map(token => normalizeKeyToken(token))
        .join('+');
      parts.push(combo);
    } else {
      parts.push(normalizeKeyToken(raw));
    }
  }
  return parts;
}

/**
 * Send a sequence of key presses (e.g., "CMD+H", "CTRL+SHIFT+P").
 */
export async function sendKeys(
  browser: IBrowser,
  sequence: string,
  takeSnapshot: boolean = false,
  delayMs: number = 50
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }

  const startTime = Date.now();
  const urlBefore = page.url();

  const keys = parseKeySequence(sequence);
  if (keys.length === 0) {
    throw new Error('send_keys sequence is empty');
  }
  for (const key of keys) {
    await page.keyboard.press(key);
    if (delayMs > 0) {
      await page.waitForTimeout(delayMs);
    }
  }

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

function buildSearchUrl(query: string, engine: string): string {
  const q = encodeURIComponent(query).replace(/%20/g, '+');
  const key = engine.trim().toLowerCase();
  if (key === 'duckduckgo' || key === 'ddg') {
    return `https://duckduckgo.com/?q=${q}`;
  }
  if (key === 'google.com' || key === 'google') {
    return `https://www.google.com/search?q=${q}`;
  }
  if (key === 'bing') {
    return `https://www.bing.com/search?q=${q}`;
  }
  throw new Error(`unsupported search engine: ${engine}`);
}

/**
 * Navigate to a search results page for the given query.
 */
export async function search(
  browser: IBrowser,
  query: string,
  engine: string = 'duckduckgo',
  takeSnapshot: boolean = false,
  snapshotOptions: SnapshotOptions | undefined = undefined
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }
  if (!query.trim()) {
    throw new Error('search query is empty');
  }

  const startTime = Date.now();
  const urlBefore = page.url();
  const url = buildSearchUrl(query, engine);
  await browser.goto(url);
  await page.waitForLoadState('networkidle');

  const durationMs = Date.now() - startTime;
  const urlAfter = page.url();
  const urlChanged = urlBefore !== urlAfter;
  const outcome = urlChanged ? 'navigated' : 'dom_updated';

  let snapshotAfter: Snapshot | undefined;
  if (takeSnapshot) {
    snapshotAfter = await snapshot(browser, snapshotOptions);
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
  browser: IBrowser,
  rect: ClickRect | BBox,
  highlight: boolean = true,
  highlightDuration: number = 2.0,
  takeSnapshot: boolean = false,
  cursorPolicy?: CursorPolicy
): Promise<ActionResult> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }
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
    const clickRect = rect;
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
  let cursorMeta: Record<string, any> | undefined;

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
    cursorMeta = await humanMoveIfEnabled(page, { x: centerX, y: centerY }, cursorPolicy);
    await page.mouse.click(centerX, centerY);
    success = true;
    cursorPosByPage.set(page, { x: centerX, y: centerY });
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
    cursor: cursorMeta,
    error: success ? undefined : { code: 'click_failed', reason: errorMsg || 'Click failed' },
  };
}
