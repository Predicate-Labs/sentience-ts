/**
 * Snapshot functionality - calls window.sentience.snapshot() or server-side API
 */

import { IBrowser } from './protocols/browser-protocol';
import { Snapshot } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { BrowserEvaluator } from './utils/browser-evaluator';

// Maximum payload size for API requests (10MB server limit)
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Structured error for server-side (gateway) snapshot failures.
 *
 * Keeps HTTP status/URL/response details available to callers for better logging/debugging.
 */
export class SnapshotGatewayError extends Error {
  public statusCode?: number;
  public url?: string;
  public requestId?: string;
  public responseText?: string;
  public cause?: unknown;

  constructor(
    message: string,
    opts?: {
      statusCode?: number;
      url?: string;
      requestId?: string;
      responseText?: string;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = 'SnapshotGatewayError';
    this.statusCode = opts?.statusCode;
    this.url = opts?.url;
    this.requestId = opts?.requestId;
    this.responseText = opts?.responseText;
    this.cause = opts?.cause;
  }

  static snip(s: string | undefined, n: number = 400): string | undefined {
    if (!s) return undefined;
    const t = String(s).replace(/\r/g, ' ').replace(/\n/g, ' ').trim();
    return t.slice(0, n);
  }
}

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
  show_grid?: boolean; // Show visual overlay highlighting detected grids
  grid_id?: number | null; // Optional grid ID to show specific grid (only used if show_grid=true)
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

  // Basic validation
  if (result.status !== 'success' && result.status !== 'error') {
    throw new Error(`Invalid snapshot status: ${result.status}`);
  }

  const snapshot = result as Snapshot;

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

  // Show grid overlay if requested
  if (options.show_grid) {
    const { getGridBounds } = await import('./utils/grid-utils');
    // Get all grids (don't filter by grid_id here - we want to show all but highlight the target)
    const grids = getGridBounds(snapshot, undefined);

    // Debug: Check if elements have layout data
    const elementsWithLayout = snapshot.elements.filter(e => e.layout?.grid_id != null).length;
    if (grids.length === 0 && elementsWithLayout === 0) {
      console.warn(
        '[SDK] No grids detected. Elements may not have layout data. ' +
          'Ensure you are using use_api: false or that the API returns layout data.'
      );
    }

    if (grids.length > 0) {
      // Pass grid_id as targetGridId to highlight it in red
      const targetGridId = options.grid_id ?? null;
      await BrowserEvaluator.evaluate(
        page,
        (args: any) => {
          if ((window as any).sentience && (window as any).sentience.showGrid) {
            (window as any).sentience.showGrid(args.grids, args.targetGridId);
          } else {
            console.warn(
              '[SDK] showGrid not available in extension. Make sure the extension is loaded.'
            );
          }
        },
        { grids, targetGridId }
      );
    } else {
      console.warn(
        `[SDK] No grids to display. Found ${elementsWithLayout} elements with layout data out of ${snapshot.elements.length} total elements.`
      );
    }
  }

  return snapshot;
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
  const gatewayUrl = `${apiUrl}/v1/snapshot`;

  // CRITICAL: Wait for extension injection to complete (CSP-resistant architecture)
  // Even for API mode, we need the extension to collect raw data locally
  try {
    await BrowserEvaluator.waitForCondition(
      page,
      () => typeof (window as any).sentience !== 'undefined',
      5000
    );
  } catch (_e) {
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
  const clientMetrics = rawResult?.diagnostics?.metrics;
  const diag = rawResult?.diagnostics;
  const clientDiagnostics =
    diag?.captcha || diag?.requires_vision || diag?.requires_vision_reason
      ? {
          captcha: diag?.captcha,
          requires_vision: diag?.requires_vision,
          requires_vision_reason: diag?.requires_vision_reason,
        }
      : undefined;
  const payload = {
    raw_elements: rawResult.raw_elements || [], // Raw data needed for server processing
    url: rawResult.url || '',
    viewport: rawResult.viewport,
    goal: options.goal, // Optional goal/task description
    options: {
      limit: options.limit,
      filter: options.filter,
    },
    client_metrics: clientMetrics || undefined,
    client_diagnostics: clientDiagnostics,
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
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers,
      body: payloadJson,
    });

    if (!response.ok) {
      let errorText: string | undefined = undefined;
      try {
        errorText = await response.text();
      } catch (_e) {
        errorText = undefined;
      }
      const requestId =
        response.headers.get('x-request-id') || response.headers.get('x-trace-id') || undefined;
      const bodySnip = SnapshotGatewayError.snip(errorText);

      const parts: string[] = [];
      parts.push(`status=${response.status}`);
      parts.push(`url=${gatewayUrl}`);
      if (requestId) parts.push(`request_id=${requestId}`);
      if (bodySnip) parts.push(`body=${bodySnip}`);

      throw new SnapshotGatewayError(
        `Server-side snapshot API failed: ${parts.join(' ')}. Try using use_api: false to use local extension instead.`,
        {
          statusCode: response.status,
          url: gatewayUrl,
          requestId,
          responseText: bodySnip,
        }
      );
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
      // Phase 2: Ordinal support - dominant group key from Gateway
      dominant_group_key: apiResult.dominant_group_key,
      // Phase 2: Runtime stability/debug info
      diagnostics: apiResult.diagnostics || rawResult.diagnostics,
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

    // Show grid overlay if requested
    if (options.show_grid) {
      const { getGridBounds } = await import('./utils/grid-utils');
      // Get all grids (don't filter by grid_id here - we want to show all but highlight the target)
      const grids = getGridBounds(snapshotData, undefined);
      if (grids.length > 0 && page) {
        // Pass grid_id as targetGridId to highlight it in red
        const targetGridId = options.grid_id ?? null;
        await BrowserEvaluator.evaluate(
          page,
          (args: any) => {
            if ((window as any).sentience && (window as any).sentience.showGrid) {
              (window as any).sentience.showGrid(args.grids, args.targetGridId);
            } else {
              console.warn('[SDK] showGrid not available in extension');
            }
          },
          { grids, targetGridId }
        );
      }
    }

    return snapshotData;
  } catch (e: any) {
    if (e instanceof SnapshotGatewayError) {
      throw e;
    }
    const errType = e instanceof Error ? e.name : typeof e;
    const errMsg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    throw new SnapshotGatewayError(
      `Server-side snapshot API failed: url=${gatewayUrl} err_type=${SnapshotGatewayError.snip(errType, 80)} err=${SnapshotGatewayError.snip(errMsg, 220)}. Try using use_api: false to use local extension instead.`,
      { url: gatewayUrl, cause: e }
    );
  }
}
