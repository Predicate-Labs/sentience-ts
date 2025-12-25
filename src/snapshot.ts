/**
 * Snapshot functionality - calls window.sentience.snapshot() or server-side API
 */

import { SentienceBrowser } from './browser';
import { Snapshot } from './types';
import * as fs from 'fs';
import * as path from 'path';

export interface SnapshotOptions {
  screenshot?: boolean | { format: 'png' | 'jpeg'; quality?: number };
  limit?: number;
  filter?: {
    min_area?: number;
    allowed_roles?: string[];
    min_z_index?: number;
  };
  use_api?: boolean; // Force use of server-side API if True, local extension if False
  save_trace?: boolean; // Save raw_elements to JSON for benchmarking/training
  trace_path?: string; // Path to save trace file (default: "trace_{timestamp}.json")
}

/**
 * Save raw_elements to a JSON file for benchmarking/training
 *
 * @param rawElements Raw elements data from snapshot
 * @param tracePath Path to save trace file. If undefined, uses "trace_{timestamp}.json"
 */
function _saveTraceToFile(rawElements: any[], tracePath?: string): void {
  // Default filename if none provided
  const filename = tracePath || `trace_${Date.now()}.json`;

  // Ensure directory exists
  const dir = path.dirname(filename);
  if (dir !== '.') {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Save the raw elements to JSON
  fs.writeFileSync(filename, JSON.stringify(rawElements, null, 2));

  console.log(`[SDK] Trace saved to: ${filename}`);
}

export async function snapshot(
  browser: SentienceBrowser,
  options: SnapshotOptions = {}
): Promise<Snapshot> {
  // Get API configuration
  const apiKey = browser.getApiKey();
  const apiUrl = browser.getApiUrl();
  
  // Determine if we should use server-side API
  const shouldUseApi = options.use_api !== undefined
    ? options.use_api
    : (apiKey !== undefined);

  if (shouldUseApi && apiKey) {
    // Use server-side API (Pro/Enterprise tier)
    return snapshotViaApi(browser, options, apiKey, apiUrl!);
  } else {
    // Use local extension (Free tier)
    return snapshotViaExtension(browser, options);
  }
}

async function snapshotViaExtension(
  browser: SentienceBrowser,
  options: SnapshotOptions
): Promise<Snapshot> {
  const page = browser.getPage();

  // CRITICAL: Wait for extension injection to complete (CSP-resistant architecture)
  // The new architecture loads injected_api.js asynchronously, so window.sentience
  // may not be immediately available after page load
  try {
    await page.waitForFunction(
      () => typeof window.sentience !== 'undefined',
      { timeout: 5000 }
    );
  } catch (e) {
    // Gather diagnostics if wait fails
    const diag = await page.evaluate(() => ({
      sentience_defined: typeof window.sentience !== 'undefined',
      extension_id: document.documentElement.dataset.sentienceExtensionId || 'not set',
      url: window.location.href
    })).catch(() => ({ error: 'Could not gather diagnostics' }));

    throw new Error(
      `Sentience extension failed to inject window.sentience API. ` +
      `Is the extension loaded? Diagnostics: ${JSON.stringify(diag)}`
    );
  }

  // Build options object
  const opts: any = {};
  if (options.screenshot !== undefined) {
    opts.screenshot = options.screenshot;
  }
  if (options.limit !== undefined) {
    opts.limit = options.limit;
  }
  if (options.filter !== undefined) {
    opts.filter = options.filter;
  }

  // Call extension API (no 'as any' needed - types defined in global.d.ts)
  const result = await page.evaluate((opts) => {
    return window.sentience.snapshot(opts);
  }, opts);

  // Save trace if requested
  if (options.save_trace && result.raw_elements) {
    _saveTraceToFile(result.raw_elements, options.trace_path);
  }

  // Basic validation
  if (result.status !== 'success' && result.status !== 'error') {
    throw new Error(`Invalid snapshot status: ${result.status}`);
  }

  return result as Snapshot;
}

async function snapshotViaApi(
  browser: SentienceBrowser,
  options: SnapshotOptions,
  apiKey: string,
  apiUrl: string
): Promise<Snapshot> {
  const page = browser.getPage();

  // CRITICAL: Wait for extension injection to complete (CSP-resistant architecture)
  // Even for API mode, we need the extension to collect raw data locally
  try {
    await page.waitForFunction(
      () => typeof (window as any).sentience !== 'undefined',
      { timeout: 5000 }
    );
  } catch (e) {
    throw new Error(
      'Sentience extension failed to inject. Cannot collect raw data for API processing.'
    );
  }

  // Step 1: Get raw data from local extension (always happens locally)
  const rawOpts: any = {};
  if (options.screenshot !== undefined) {
    rawOpts.screenshot = options.screenshot;
  }

  const rawResult = await page.evaluate((opts) => {
    return (window as any).sentience.snapshot(opts);
  }, rawOpts);

  // Save trace if requested (save raw data before API processing)
  if (options.save_trace && rawResult.raw_elements) {
    _saveTraceToFile(rawResult.raw_elements, options.trace_path);
  }

  // Step 2: Send to server for smart ranking/filtering
  // Use raw_elements (raw data) instead of elements (processed data)
  // Server validates API key and applies proprietary ranking logic
  const payload = {
    raw_elements: rawResult.raw_elements || [],  // Raw data needed for server processing
    url: rawResult.url || '',
    viewport: rawResult.viewport,
    options: {
      limit: options.limit,
      filter: options.filter,
    },
  };

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(`${apiUrl}/v1/snapshot`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const apiResult = await response.json();

    // Merge API result with local data (screenshot, etc.)
    const snapshotData: Snapshot = {
      status: apiResult.status || 'success',
      timestamp: apiResult.timestamp,
      url: apiResult.url || rawResult.url || '',
      viewport: apiResult.viewport || rawResult.viewport,
      elements: apiResult.elements || [],
      screenshot: rawResult.screenshot, // Keep local screenshot
      screenshot_format: rawResult.screenshot_format,
      error: apiResult.error,
    };

    return snapshotData;
  } catch (e: any) {
    throw new Error(`API request failed: ${e.message}`);
  }
}

