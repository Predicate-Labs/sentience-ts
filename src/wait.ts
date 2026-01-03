/**
 * Wait functionality
 */

import { SentienceBrowser } from './browser';
import { WaitResult, Element, QuerySelector } from './types';
import { snapshot } from './snapshot';
import { find } from './query';

/**
 * Wait for an element matching a selector to appear on the page
 * 
 * Polls the page at regular intervals until the element is found or timeout is reached.
 * Automatically adjusts polling interval based on whether using local extension or remote API.
 * 
 * @param browser - SentienceBrowser instance
 * @param selector - Query selector (string DSL or object) to match elements
 * @param timeout - Maximum time to wait in milliseconds (default: 10000ms / 10 seconds)
 * @param interval - Polling interval in milliseconds. If undefined, auto-detects:
 *                   - 250ms for local extension (fast, no network latency)
 *                   - 1500ms for remote API (slower, network latency)
 * @param useApi - Force use of server-side API if true, local extension if false.
 *                 If undefined, uses API if apiKey is set, otherwise uses local extension.
 * @returns WaitResult with found status, element (if found), duration, and timeout flag
 * 
 * @example
 * ```typescript
 * // Wait for a button to appear
 * const result = await waitFor(browser, 'role=button', 5000);
 * if (result.found) {
 *   console.log(`Found element ${result.element!.id} after ${result.duration_ms}ms`);
 * }
 * 
 * // Wait with custom interval
 * const result2 = await waitFor(browser, 'text~Submit', 10000, 500);
 * ```
 */
export async function waitFor(
  browser: SentienceBrowser,
  selector: QuerySelector,
  timeout: number = 10000,
  interval?: number,
  useApi?: boolean
): Promise<WaitResult> {
  // Auto-detect optimal interval based on API usage
  if (interval === undefined) {
    // Determine if using API
    const willUseApi = useApi !== undefined
      ? useApi
      : (browser.getApiKey() !== undefined);
    if (willUseApi) {
      interval = 1500; // Longer interval for API calls (network latency)
    } else {
      interval = 250; // Shorter interval for local extension (fast)
    }
  }

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Take snapshot (may be local extension or remote API)
    const snap = await snapshot(browser, { use_api: useApi });

    // Try to find element
    const element = find(snap, selector);

    if (element) {
      const durationMs = Date.now() - startTime;
      return {
        found: true,
        element,
        duration_ms: durationMs,
        timeout: false,
      };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // Timeout
  const durationMs = Date.now() - startTime;
  return {
    found: false,
    element: undefined,
    duration_ms: durationMs,
    timeout: true,
  };
}

