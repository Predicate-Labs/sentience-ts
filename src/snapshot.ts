/**
 * Snapshot functionality - calls window.sentience.snapshot() or server-side API
 */

import { SentienceBrowser } from './browser';
import { IBrowser } from './protocols/browser-protocol';
import { Snapshot } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserEvaluator } from './utils/browser-evaluator';

// Maximum payload size for API requests (10MB server limit)
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;

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
  goal?: string; // Optional goal/task description for the snapshot
  show_overlay?: boolean; // Show visual overlay highlighting elements in browser
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
}

export async function snapshot(
  browser: IBrowser,
  options: SnapshotOptions = {}
): Promise<Snapshot> {
  // Get API configuration
  const apiKey = browser.getApiKey();
  const apiUrl = browser.getApiUrl();

  // Determine if we should use server-side API
  const shouldUseApi = options.use_api !== undefined ? options.use_api : apiKey !== undefined;

  if (shouldUseApi && apiKey) {
    // Use server-side API (Pro/Enterprise tier)
    return snapshotViaApi(browser, options, apiKey, apiUrl!);
  } else {
    // Use local extension (Free tier)
    return snapshotViaExtension(browser, options);
  }
}

async function snapshotViaExtension(
  browser: IBrowser,
  options: SnapshotOptions
): Promise<Snapshot> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }

  // CRITICAL: Wait for extension injection to complete (CSP-resistant architecture)
  // The new architecture loads injected_api.js asynchronously, so window.sentience
  // may not be immediately available after page load
  try {
    await BrowserEvaluator.waitForCondition(
      page,
      () => typeof (window as any).sentience !== 'undefined',
      5000
    );
  } catch (e) {
    throw new Error(
      `Sentience extension failed to inject window.sentience API. ` +
        `Is the extension loaded? ${e instanceof Error ? e.message : String(e)}`
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

  // Call extension API
  const result = await BrowserEvaluator.evaluate(
    page,
    opts => (window as any).sentience.snapshot(opts),
    opts
  );

  // Extract screenshot format from data URL if not provided by extension
  if (result.screenshot && !result.screenshot_format) {
    const screenshotDataUrl = result.screenshot;
    if (screenshotDataUrl.startsWith('data:image/')) {
      // Extract format from "data:image/jpeg;base64,..." or "data:image/png;base64,..."
      const formatMatch = screenshotDataUrl.split(';')[0].split('/')[1];
      if (formatMatch === 'jpeg' || formatMatch === 'jpg') {
        result.screenshot_format = 'jpeg';
      } else if (formatMatch === 'png') {
        result.screenshot_format = 'png';
      }
    }
  }

  // Save trace if requested
  if (options.save_trace && result.raw_elements) {
    _saveTraceToFile(result.raw_elements, options.trace_path);
  }

  // Show visual overlay if requested
  if (options.show_overlay && result.raw_elements) {
    await BrowserEvaluator.evaluate(
      page,
      (elements: any[]) => {
        if ((window as any).sentience && (window as any).sentience.showOverlay) {
          (window as any).sentience.showOverlay(elements, null);
        }
      },
      result.raw_elements
    );
  }

  // Basic validation
  if (result.status !== 'success' && result.status !== 'error') {
    throw new Error(`Invalid snapshot status: ${result.status}`);
  }

  return result as Snapshot;
}

async function snapshotViaApi(
  browser: IBrowser,
  options: SnapshotOptions,
  apiKey: string,
  apiUrl: string
): Promise<Snapshot> {
  const page = browser.getPage();
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }

  // CRITICAL: Wait for extension injection to complete (CSP-resistant architecture)
  // Even for API mode, we need the extension to collect raw data locally
  try {
    await BrowserEvaluator.waitForCondition(
      page,
      () => typeof (window as any).sentience !== 'undefined',
      5000
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

  const rawResult = await BrowserEvaluator.evaluate(
    page,
    opts => (window as any).sentience.snapshot(opts),
    rawOpts
  );

  // Save trace if requested (save raw data before API processing)
  if (options.save_trace && rawResult.raw_elements) {
    _saveTraceToFile(rawResult.raw_elements, options.trace_path);
  }

  // Step 2: Send to server for smart ranking/filtering
  // Use raw_elements (raw data) instead of elements (processed data)
  // Server validates API key and applies proprietary ranking logic
  const payload = {
    raw_elements: rawResult.raw_elements || [], // Raw data needed for server processing
    url: rawResult.url || '',
    viewport: rawResult.viewport,
    goal: options.goal, // Optional goal/task description
    options: {
      limit: options.limit,
      filter: options.filter,
    },
  };

  // Check payload size before sending (server has 10MB limit)
  const payloadJson = JSON.stringify(payload);
  const payloadSize = new TextEncoder().encode(payloadJson).length;
  if (payloadSize > MAX_PAYLOAD_BYTES) {
    const sizeMB = (payloadSize / 1024 / 1024).toFixed(2);
    const limitMB = (MAX_PAYLOAD_BYTES / 1024 / 1024).toFixed(0);
    throw new Error(
      `Payload size (${sizeMB}MB) exceeds server limit (${limitMB}MB). ` +
        `Try reducing the number of elements on the page or filtering elements.`
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(`${apiUrl}/v1/snapshot`, {
      method: 'POST',
      headers,
      body: payloadJson,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const apiResult = await response.json();

    // Extract screenshot format from data URL if not provided by extension
    let screenshotFormat = rawResult.screenshot_format;
    if (rawResult.screenshot && !screenshotFormat) {
      const screenshotDataUrl = rawResult.screenshot;
      if (screenshotDataUrl.startsWith('data:image/')) {
        // Extract format from "data:image/jpeg;base64,..." or "data:image/png;base64,..."
        const formatMatch = screenshotDataUrl.split(';')[0].split('/')[1];
        if (formatMatch === 'jpeg' || formatMatch === 'jpg') {
          screenshotFormat = 'jpeg';
        } else if (formatMatch === 'png') {
          screenshotFormat = 'png';
        }
      }
    }

    // Merge API result with local data (screenshot, etc.)
    const snapshotData: Snapshot = {
      status: apiResult.status || 'success',
      timestamp: apiResult.timestamp,
      url: apiResult.url || rawResult.url || '',
      viewport: apiResult.viewport || rawResult.viewport,
      elements: apiResult.elements || [],
      screenshot: rawResult.screenshot, // Keep local screenshot
      screenshot_format: screenshotFormat,
      error: apiResult.error,
    };

    // Show visual overlay if requested (use API-ranked elements)
    if (options.show_overlay && apiResult.elements && page) {
      await BrowserEvaluator.evaluate(
        page,
        (elements: any[]) => {
          if ((window as any).sentience && (window as any).sentience.showOverlay) {
            (window as any).sentience.showOverlay(elements, null);
          }
        },
        apiResult.elements
      );
    }

    return snapshotData;
  } catch (e: any) {
    throw new Error(`API request failed: ${e.message}`);
  }
}
