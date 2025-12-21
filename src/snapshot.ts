/**
 * Snapshot functionality - calls window.sentience.snapshot() or server-side API
 */

import { SentienceBrowser } from './browser';
import { Snapshot } from './types';

export interface SnapshotOptions {
  screenshot?: boolean | { format: 'png' | 'jpeg'; quality?: number };
  limit?: number;
  filter?: {
    min_area?: number;
    allowed_roles?: string[];
    min_z_index?: number;
  };
  use_api?: boolean; // Force use of server-side API if True, local extension if False
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
  const result = await page.evaluate((opts) => {
    return (window as any).sentience.snapshot(opts);
  }, opts);

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

  // Step 1: Get raw data from local extension (always happens locally)
  const rawOpts: any = {};
  if (options.screenshot !== undefined) {
    rawOpts.screenshot = options.screenshot;
  }

  const rawResult = await page.evaluate((opts) => {
    return (window as any).sentience.snapshot(opts);
  }, rawOpts);

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

