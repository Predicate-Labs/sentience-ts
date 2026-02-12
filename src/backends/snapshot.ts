/**
 * Backend-agnostic snapshot for browser-use integration.
 *
 * Takes Sentience snapshots using BrowserBackend protocol,
 * enabling element grounding with browser-use or other frameworks.
 *
 * Usage with browser-use:
 *   import { BrowserUseAdapter } from './backends/browser-use-adapter';
 *   import { snapshot, CachedSnapshot } from './backends/snapshot';
 *
 *   const adapter = new BrowserUseAdapter(session);
 *   const backend = await adapter.createBackend();
 *
 *   // Take snapshot
 *   const snap = await snapshot(backend);
 *   console.log(`Found ${snap.elements.length} elements`);
 *
 *   // With caching (reuse if fresh)
 *   const cache = new CachedSnapshot(backend, 2000);
 *   const snap1 = await cache.get();  // Fresh snapshot
 *   const snap2 = await cache.get();  // Returns cached if < 2s old
 *   cache.invalidate();  // Force refresh on next get()
 */

import type { Snapshot } from '../types';
import type { BrowserBackend } from './protocol';

/**
 * Error thrown when Sentience extension is not loaded.
 */
export class ExtensionNotLoadedError extends Error {
  constructor(
    message: string,
    public timeoutMs?: number,
    public diagnostics?: ExtensionDiagnostics
  ) {
    super(message);
    this.name = 'ExtensionNotLoadedError';
  }

  static fromTimeout(
    timeoutMs: number,
    diagnostics?: ExtensionDiagnostics
  ): ExtensionNotLoadedError {
    let message = `Sentience extension not loaded after ${timeoutMs}ms. `;
    message += 'Make sure to launch browser with --load-extension=<path-to-sentience-extension>';

    if (diagnostics) {
      message += `\n\nDiagnostics:\n${JSON.stringify(diagnostics, null, 2)}`;
    }

    return new ExtensionNotLoadedError(message, timeoutMs, diagnostics);
  }
}

/**
 * Error thrown when snapshot operation fails.
 */
export class SnapshotError extends Error {
  constructor(
    message: string,
    public url?: string
  ) {
    super(message);
    this.name = 'SnapshotError';
  }

  static fromNullResult(url?: string): SnapshotError {
    let message = 'window.sentience.snapshot() returned null.';
    if (url) {
      message += ` URL: ${url}`;
    }
    return new SnapshotError(message, url);
  }
}

/**
 * Extension diagnostics for debugging.
 */
export interface ExtensionDiagnostics {
  sentienceDefined?: boolean;
  sentienceSnapshot?: boolean;
  url?: string;
  extensionId?: string | null;
  hasContentScript?: boolean;
  error?: string;
}

/**
 * Options for snapshot operations.
 */
export interface SnapshotOptions {
  /** Maximum number of elements to return (default: 50) */
  limit?: number;
  /** Whether to capture screenshot (default: false) */
  screenshot?: boolean | ScreenshotOptions;
  /** Filter options for elements */
  filter?: SnapshotFilter;
  /** Show visual overlay on page */
  showOverlay?: boolean;
  /** Show visual overlay highlighting detected grids */
  showGrid?: boolean;
  /** Optional grid ID to show specific grid (only used if showGrid=true) */
  gridId?: number | null;
  /** Use server-side API (Pro/Enterprise tier) */
  useApi?: boolean;
  /** Gateway snapshot timeout (milliseconds) */
  gatewayTimeoutMs?: number;
  /** Canonical API key for server-side processing */
  predicateApiKey?: string;
  /** Backward-compatible API key alias */
  sentienceApiKey?: string;
  /** Goal/task description for ordinal support and gateway reranking */
  goal?: string;
}

/**
 * Screenshot options.
 */
export interface ScreenshotOptions {
  format?: 'png' | 'jpeg';
  quality?: number;
}

/**
 * Filter options for snapshot.
 */
export interface SnapshotFilter {
  clickable?: boolean;
  visible?: boolean;
  inViewport?: boolean;
}

/**
 * Snapshot cache with staleness detection.
 *
 * Caches snapshots and returns cached version if still fresh.
 * Useful for reducing redundant snapshot calls in action loops.
 *
 * Usage:
 *   const cache = new CachedSnapshot(backend, 2000);
 *
 *   // First call takes fresh snapshot
 *   const snap1 = await cache.get();
 *
 *   // Second call returns cached if < 2s old
 *   const snap2 = await cache.get();
 *
 *   // Invalidate after actions that change DOM
 *   await click(backend, element.bbox);
 *   cache.invalidate();
 *
 *   // Next get() will take fresh snapshot
 *   const snap3 = await cache.get();
 */
export class CachedSnapshot {
  private backend: BrowserBackend;
  private maxAgeMs: number;
  private defaultOptions?: SnapshotOptions;
  private cached: Snapshot | null = null;
  private cachedAt: number = 0;
  private cachedUrl: string | null = null;

  /**
   * Initialize cached snapshot.
   *
   * @param backend - BrowserBackend implementation
   * @param maxAgeMs - Maximum cache age in milliseconds (default: 2000)
   * @param options - Default snapshot options
   */
  constructor(backend: BrowserBackend, maxAgeMs: number = 2000, options?: SnapshotOptions) {
    this.backend = backend;
    this.maxAgeMs = maxAgeMs;
    this.defaultOptions = options;
  }

  /**
   * Get snapshot, using cache if fresh.
   *
   * @param options - Override default options for this call
   * @param forceRefresh - If true, always take fresh snapshot
   * @returns Snapshot (cached or fresh)
   */
  async get(options?: SnapshotOptions, forceRefresh: boolean = false): Promise<Snapshot> {
    // Check if we need to refresh
    if (forceRefresh || this.isStale()) {
      this.cached = await snapshot(this.backend, options || this.defaultOptions);
      this.cachedAt = Date.now();
      this.cachedUrl = this.cached.url;
    }

    return this.cached!;
  }

  /**
   * Invalidate cache, forcing refresh on next get().
   *
   * Call this after actions that modify the DOM.
   */
  invalidate(): void {
    this.cached = null;
    this.cachedAt = 0;
    this.cachedUrl = null;
  }

  /**
   * Check if cache is stale and needs refresh.
   */
  private isStale(): boolean {
    if (this.cached === null) {
      return true;
    }

    // Check age
    const ageMs = Date.now() - this.cachedAt;
    if (ageMs > this.maxAgeMs) {
      return true;
    }

    return false;
  }

  /**
   * Check if a cached snapshot exists.
   */
  get isCached(): boolean {
    return this.cached !== null;
  }

  /**
   * Get age of cached snapshot in milliseconds.
   */
  get ageMs(): number {
    if (this.cached === null) {
      return Infinity;
    }
    return Date.now() - this.cachedAt;
  }
}

/**
 * Take a Sentience snapshot using the backend protocol.
 *
 * Requires:
 * - Sentience extension loaded in browser (via --load-extension)
 * - Extension injected window.sentience API
 *
 * @param backend - BrowserBackend implementation (CDPBackend, PlaywrightBackend, etc.)
 * @param options - Snapshot options (limit, filter, screenshot, etc.)
 * @returns Snapshot with elements, viewport, and optional screenshot
 *
 * @example
 *   import { BrowserUseAdapter } from './backends/browser-use-adapter';
 *   import { snapshot } from './backends/snapshot';
 *
 *   const adapter = new BrowserUseAdapter(session);
 *   const backend = await adapter.createBackend();
 *
 *   // Basic snapshot (uses local extension)
 *   const snap = await snapshot(backend);
 *
 *   // With options
 *   const snap = await snapshot(backend, {
 *     limit: 100,
 *     screenshot: true
 *   });
 */
export async function snapshot(
  backend: BrowserBackend,
  options?: SnapshotOptions
): Promise<Snapshot> {
  const opts = options || {};

  // Use local extension (Free tier)
  return await snapshotViaExtension(backend, opts);
}

/**
 * Wait for Sentience extension to inject window.sentience API.
 *
 * @param backend - BrowserBackend implementation
 * @param timeoutMs - Maximum wait time
 * @throws ExtensionNotLoadedError if extension not injected within timeout
 */
async function waitForExtension(backend: BrowserBackend, timeoutMs: number = 5000): Promise<void> {
  const startTime = Date.now();
  let pollCount = 0;

  while (true) {
    const elapsed = Date.now() - startTime;
    pollCount++;

    if (elapsed >= timeoutMs) {
      // Gather diagnostics
      let diagnostics: ExtensionDiagnostics | undefined;
      try {
        const diagDict = (await backend.eval(`
          (() => ({
            sentienceDefined: typeof window.sentience !== 'undefined',
            sentienceSnapshot: typeof window.sentience?.snapshot === 'function',
            url: window.location.href,
            extensionId: document.documentElement.dataset.sentienceExtensionId || null,
            hasContentScript: !!document.documentElement.dataset.sentienceExtensionId
          }))()
        `)) as ExtensionDiagnostics;
        diagnostics = diagDict;
      } catch (e) {
        diagnostics = {
          error: `Could not gather diagnostics: ${e instanceof Error ? e.message : String(e)}`,
        };
      }

      throw ExtensionNotLoadedError.fromTimeout(timeoutMs, diagnostics);
    }

    // Check if extension is ready
    try {
      const ready = await backend.eval(
        "typeof window.sentience !== 'undefined' && " +
          "typeof window.sentience.snapshot === 'function'"
      );
      if (ready) {
        return;
      }
    } catch {
      // Keep polling
    }

    await sleep(100);
  }
}

/**
 * Take snapshot using local extension (Free tier).
 */
async function snapshotViaExtension(
  backend: BrowserBackend,
  options: SnapshotOptions
): Promise<Snapshot> {
  // Wait for extension injection
  await waitForExtension(backend, 5000);

  // Build options dict for extension API
  const extOptions = buildExtensionOptions(options);

  // Call extension's snapshot function
  const result = (await backend.eval(`
    (() => {
      const options = ${JSON.stringify(extOptions)};
      return window.sentience.snapshot(options);
    })()
  `)) as Snapshot | null;

  if (result === null) {
    // Try to get URL for better error message
    let url: string | undefined;
    try {
      url = (await backend.eval('window.location.href')) as string;
    } catch {
      // Ignore
    }
    throw SnapshotError.fromNullResult(url);
  }

  // Show overlay if requested
  if (options.showOverlay) {
    const rawElements = (result as unknown as Record<string, unknown>).raw_elements;
    if (rawElements) {
      await backend.eval(`
        (() => {
          if (window.sentience && window.sentience.showOverlay) {
            window.sentience.showOverlay(${JSON.stringify(rawElements)}, null);
          }
        })()
      `);
    }
  }

  // Show grid overlay if requested
  if (options.showGrid) {
    const { getGridBounds } = await import('../utils/grid-utils');
    // Get all grids (don't filter by gridId here - we want to show all but highlight the target)
    const grids = getGridBounds(result, undefined);
    if (grids.length > 0) {
      // Pass gridId as targetGridId to highlight it in red
      const targetGridId = options.gridId ?? null;
      await backend.eval(`
        (() => {
          if (window.sentience && window.sentience.showGrid) {
            window.sentience.showGrid(${JSON.stringify(grids)}, ${targetGridId !== null ? targetGridId : 'null'});
          } else {
            console.warn('[SDK] showGrid not available in extension');
          }
        })()
      `);
    }
  }

  return result;
}

/**
 * Build options dict for extension API call.
 */
function buildExtensionOptions(options: SnapshotOptions): Record<string, unknown> {
  const extOptions: Record<string, unknown> = {};

  // Screenshot config
  if (options.screenshot !== false && options.screenshot !== undefined) {
    extOptions.screenshot = options.screenshot;
  }

  // Limit (only if not default)
  if (options.limit !== undefined && options.limit !== 50) {
    extOptions.limit = options.limit;
  }

  // Filter
  if (options.filter !== undefined) {
    extOptions.filter = options.filter;
  }

  return extOptions;
}

/**
 * Helper sleep function.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
