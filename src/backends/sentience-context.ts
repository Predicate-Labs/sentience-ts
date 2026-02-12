/**
 * SentienceContext: Token-Slasher Context Middleware for browser-use.
 *
 * This module provides a compact, ranked DOM context block for browser-use agents,
 * reducing tokens and improving reliability by using Sentience snapshots.
 *
 * Example usage:
 *   import { SentienceContext } from 'sentience/backends';
 *
 *   const ctx = new SentienceContext({ showOverlay: true });
 *   const state = await ctx.build(browserSession, { goal: "Click the first Show HN post" });
 *   if (state) {
 *     agent.addContext(state.promptBlock);  // or however browser-use injects state
 *   }
 */

import type { Element, Snapshot } from '../types';
import type { BrowserBackend } from './protocol';
import { BrowserUseAdapter } from './browser-use-adapter';
import { snapshot, SnapshotOptions } from './snapshot';

/**
 * Configuration for element selection strategy.
 *
 * The selector uses a 3-way merge to pick elements for the LLM context:
 * 1. Top N by importance score (most actionable elements)
 * 2. Top N from dominant group (for ordinal tasks like "click 3rd item")
 * 3. Top N by position (elements at top of page, lowest doc_y)
 *
 * Elements are deduplicated across all three sources.
 */
export interface TopElementSelector {
  /** Number of top elements to select by importance score (descending). Default: 60 */
  byImportance?: number;
  /** Number of top elements to select from the dominant group (for ordinal tasks). Default: 15 */
  fromDominantGroup?: number;
  /** Number of top elements to select by position (lowest doc_y = top of page). Default: 10 */
  byPosition?: number;
}

/**
 * Sentience context state with snapshot and formatted prompt block.
 */
export interface SentienceContextState {
  url: string;
  snapshot: Snapshot;
  promptBlock: string;
}

/**
 * Options for SentienceContext initialization.
 */
export interface SentienceContextOptions {
  /** Canonical API key for gateway mode */
  predicateApiKey?: string;
  /** Backward-compatible API key alias */
  sentienceApiKey?: string;
  /** Force API vs extension mode (auto-detected if undefined) */
  useApi?: boolean;
  /** Maximum elements to fetch from snapshot. Default: 60 */
  maxElements?: number;
  /** Show visual overlay highlighting elements in browser. Default: false */
  showOverlay?: boolean;
  /** Configuration for element selection strategy */
  topElementSelector?: TopElementSelector;
}

/**
 * Options for the build() method.
 */
export interface BuildOptions {
  /** Optional goal/task description (passed to gateway for reranking) */
  goal?: string;
  /** Maximum time to wait for extension injection in milliseconds. Default: 5000 */
  waitForExtensionMs?: number;
  /** Number of retry attempts on snapshot failure. Default: 2 */
  retries?: number;
  /** Delay between retries in milliseconds. Default: 1000 */
  retryDelayMs?: number;
}

/** Interactive roles that should be included in the context */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'slider',
  'tab',
  'menuitem',
  'option',
  'switch',
  'cell',
  'a',
  'input',
  'select',
  'textarea',
]);

/**
 * Token-Slasher Context Middleware for browser-use.
 *
 * Creates a compact, ranked DOM context block using Sentience snapshots,
 * reducing tokens and improving reliability for LLM-based browser agents.
 *
 * Example:
 *   import { SentienceContext } from 'sentience/backends';
 *
 *   const ctx = new SentienceContext({ showOverlay: true });
 *   const state = await ctx.build(browserSession, { goal: "Click the first Show HN post" });
 *   if (state) {
 *     agent.addContext(state.promptBlock);
 *   }
 */
export class SentienceContext {
  private _apiKey: string | undefined;
  private _useApi: boolean | undefined;
  private _maxElements: number;
  private _showOverlay: boolean;
  private _selector: Required<TopElementSelector>;

  constructor(options: SentienceContextOptions = {}) {
    this._apiKey = options.predicateApiKey ?? options.sentienceApiKey;
    this._useApi = options.useApi;
    this._maxElements = options.maxElements ?? 60;
    this._showOverlay = options.showOverlay ?? false;
    this._selector = {
      byImportance: options.topElementSelector?.byImportance ?? 60,
      fromDominantGroup: options.topElementSelector?.fromDominantGroup ?? 15,
      byPosition: options.topElementSelector?.byPosition ?? 10,
    };
  }

  /**
   * Build context state from browser session.
   *
   * Takes a snapshot using the Sentience extension and formats it for LLM consumption.
   * Returns null if snapshot fails (extension not loaded, timeout, etc.).
   *
   * @param browserSession - Browser-use BrowserSession instance (or any object with getOrCreateCdpSession)
   * @param options - Build options
   * @returns SentienceContextState with snapshot and formatted prompt, or null if failed
   */
  async build(
    browserSession: unknown,
    options: BuildOptions = {}
  ): Promise<SentienceContextState | null> {
    const { goal, waitForExtensionMs = 5000, retries = 2, retryDelayMs = 1000 } = options;

    try {
      // Create adapter and backend
      const adapter = new BrowserUseAdapter(browserSession);
      const backend = await adapter.createBackend();

      // Wait for extension to inject (poll until ready or timeout)
      await this._waitForExtension(backend, waitForExtensionMs);

      // Build snapshot options
      const snapshotOptions: SnapshotOptions = {
        limit: this._maxElements,
        showOverlay: this._showOverlay,
        goal,
      };

      // Set API options
      if (this._apiKey) {
        snapshotOptions.predicateApiKey = this._apiKey;
      }
      if (this._useApi !== undefined) {
        snapshotOptions.useApi = this._useApi;
      } else if (this._apiKey) {
        snapshotOptions.useApi = true;
      }

      // Take snapshot with retry logic
      let snap: Snapshot | null = null;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          snap = await snapshot(backend, snapshotOptions);
          break; // Success
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          if (attempt < retries - 1) {
            console.debug(
              `Sentience snapshot attempt ${attempt + 1} failed: ${lastError.message}, retrying...`
            );
            await this._sleep(retryDelayMs);
          } else {
            console.warn(
              `Sentience snapshot failed after ${retries} attempts: ${lastError.message}`
            );
            return null;
          }
        }
      }

      if (!snap) {
        console.warn('Sentience snapshot returned null');
        return null;
      }

      // Get URL from snapshot
      const url = snap.url || '';

      // Format for LLM
      const formatted = this._formatSnapshotForLLM(snap);

      // Build prompt block
      const promptBlock =
        'Elements: ID|role|text|imp|is_primary|docYq|ord|DG|href\n' +
        'Rules: ordinal→DG=1 then ord asc; otherwise imp desc. ' +
        'Use click(ID)/input_text(ID,...).\n' +
        formatted;

      console.info(`SentienceContext snapshot: ${snap.elements.length} elements URL=${url}`);

      return { url, snapshot: snap, promptBlock };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.warn(`Sentience snapshot skipped: ${error.message}`);
      return null;
    }
  }

  /**
   * Format Sentience snapshot for LLM consumption.
   *
   * Creates an ultra-compact inventory of interactive elements optimized
   * for minimal token usage. Uses 3-way selection: by importance,
   * from dominant group, and by position.
   *
   * @param snap - Sentience Snapshot object
   * @returns Formatted string with format: ID|role|text|imp|is_primary|docYq|ord|DG|href
   */
  private _formatSnapshotForLLM(snap: Snapshot): string {
    // Filter to interactive elements only
    const interactiveElements: Element[] = snap.elements.filter(el => {
      const role = (el.role || '').toLowerCase();
      return INTERACTIVE_ROLES.has(role);
    });

    // Sort by importance (descending) for importance-based selection
    interactiveElements.sort((a, b) => (b.importance || 0) - (a.importance || 0));

    // Get top N by importance (track by ID for deduplication)
    const selectedIds = new Set<number>();
    const selectedElements: Element[] = [];

    for (const el of interactiveElements.slice(0, this._selector.byImportance)) {
      if (!selectedIds.has(el.id)) {
        selectedIds.add(el.id);
        selectedElements.push(el);
      }
    }

    // Get top elements from dominant group (for ordinal tasks)
    // Prefer in_dominant_group field (uses fuzzy matching from gateway)
    let dominantGroupElements = interactiveElements.filter(el => el.in_dominant_group === true);

    // Fallback to exact group_key match if in_dominant_group not populated
    if (dominantGroupElements.length === 0 && snap.dominant_group_key) {
      dominantGroupElements = interactiveElements.filter(
        el => el.group_key === snap.dominant_group_key
      );
    }

    // Sort by group_index for ordinal ordering
    dominantGroupElements.sort((a, b) => (a.group_index ?? 999) - (b.group_index ?? 999));

    for (const el of dominantGroupElements.slice(0, this._selector.fromDominantGroup)) {
      if (!selectedIds.has(el.id)) {
        selectedIds.add(el.id);
        selectedElements.push(el);
      }
    }

    // Get top elements by position (lowest doc_y = top of page)
    const getYPosition = (el: Element): number => {
      if (el.doc_y !== undefined) return el.doc_y;
      if (el.bbox) return el.bbox.y;
      return Infinity;
    };

    const elementsByPosition = [...interactiveElements].sort((a, b) => {
      const yDiff = getYPosition(a) - getYPosition(b);
      if (yDiff !== 0) return yDiff;
      // Tie-breaker: higher importance first
      return (b.importance || 0) - (a.importance || 0);
    });

    for (const el of elementsByPosition.slice(0, this._selector.byPosition)) {
      if (!selectedIds.has(el.id)) {
        selectedIds.add(el.id);
        selectedElements.push(el);
      }
    }

    // Compute local rank_in_group for dominant group elements
    const rankInGroupMap = new Map<number, number>();

    // Get all dominant group elements for rank computation
    let dgElementsForRank = interactiveElements.filter(el => el.in_dominant_group === true);
    if (dgElementsForRank.length === 0 && snap.dominant_group_key) {
      dgElementsForRank = interactiveElements.filter(
        el => el.group_key === snap.dominant_group_key
      );
    }

    // Sort by (doc_y, bbox.y, bbox.x, -importance)
    dgElementsForRank.sort((a, b) => {
      const docYA = a.doc_y ?? Infinity;
      const docYB = b.doc_y ?? Infinity;
      if (docYA !== docYB) return docYA - docYB;

      const bboxYA = a.bbox?.y ?? Infinity;
      const bboxYB = b.bbox?.y ?? Infinity;
      if (bboxYA !== bboxYB) return bboxYA - bboxYB;

      const bboxXA = a.bbox?.x ?? Infinity;
      const bboxXB = b.bbox?.x ?? Infinity;
      if (bboxXA !== bboxXB) return bboxXA - bboxXB;

      return (b.importance || 0) - (a.importance || 0);
    });

    dgElementsForRank.forEach((el, rank) => {
      rankInGroupMap.set(el.id, rank);
    });

    // Format lines
    const lines: string[] = [];
    for (const el of selectedElements) {
      // Get role (override to "link" if element has href)
      let role = el.role || '';
      if (el.href) {
        role = 'link';
      } else if (!role) {
        // Generic fallback for interactive elements without explicit role
        role = 'element';
      }

      // Get name/text (truncate aggressively, normalize whitespace)
      let name = el.text || '';
      // Remove newlines and normalize whitespace
      name = name.replace(/\s+/g, ' ').trim();
      if (name.length > 30) {
        name = name.slice(0, 27) + '...';
      }

      // Extract fields
      const importance = el.importance || 0;
      const docY = el.doc_y || 0;

      // is_primary: from visual_cues.is_primary (boolean)
      const isPrimary = el.visual_cues?.is_primary || false;
      const isPrimaryFlag = isPrimary ? '1' : '0';

      // docYq: bucketed doc_y (round to nearest 200 for smaller numbers)
      const docYq = docY ? Math.round(docY / 200) : 0;

      // Determine if in dominant group
      let inDg = el.in_dominant_group;
      if (inDg === undefined && snap.dominant_group_key) {
        // Fallback for older gateway versions
        inDg = el.group_key === snap.dominant_group_key;
      }

      // ord_val: rank_in_group if in dominant group
      let ordVal: string | number = '-';
      if (inDg && rankInGroupMap.has(el.id)) {
        ordVal = rankInGroupMap.get(el.id)!;
      }

      // DG: 1 if dominant group, else 0
      const dgFlag = inDg ? '1' : '0';

      // href: short token (domain or last path segment, or blank)
      const href = this._compressHref(el.href);

      // Ultra-compact format: ID|role|text|imp|is_primary|docYq|ord|DG|href
      const line = `${el.id}|${role}|${name}|${importance}|${isPrimaryFlag}|${docYq}|${ordVal}|${dgFlag}|${href}`;
      lines.push(line);
    }

    console.debug(
      `Formatted ${lines.length} elements (top ${this._selector.byImportance} by importance + top ${this._selector.fromDominantGroup} from dominant group + top ${this._selector.byPosition} by position)`
    );

    return lines.join('\n');
  }

  /**
   * Wait for Sentience extension to be ready in the browser.
   *
   * Polls window.sentience until it's defined or timeout is reached.
   *
   * @param backend - Browser backend with eval() method
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @param pollIntervalMs - Interval between polls in milliseconds
   * @returns true if extension is ready, false if timeout
   */
  private async _waitForExtension(
    backend: BrowserBackend,
    timeoutMs: number = 5000,
    pollIntervalMs: number = 100
  ): Promise<boolean> {
    let elapsedMs = 0;

    while (elapsedMs < timeoutMs) {
      try {
        const result = await backend.eval("typeof window.sentience !== 'undefined'");
        if (result === true) {
          console.debug(`Sentience extension ready after ${elapsedMs}ms`);
          return true;
        }
      } catch {
        // Extension not ready yet, continue polling
      }

      await this._sleep(pollIntervalMs);
      elapsedMs += pollIntervalMs;
    }

    console.warn(`Sentience extension not ready after ${timeoutMs}ms timeout`);
    return false;
  }

  /**
   * Compress href into a short token for minimal tokens.
   *
   * @param href - Full URL or undefined
   * @returns Short token (domain second-level or last path segment)
   */
  private _compressHref(href: string | undefined): string {
    if (!href) {
      return '';
    }

    try {
      // Check if it's a full URL
      if (href.startsWith('http://') || href.startsWith('https://')) {
        const url = new URL(href);
        if (url.hostname) {
          // Extract second-level domain (e.g., "github" from "github.com")
          const parts = url.hostname.split('.');
          if (parts.length >= 2) {
            return parts[parts.length - 2].slice(0, 10);
          }
          return url.hostname.slice(0, 10);
        }
      }

      // Handle relative URLs - use last path segment
      const segments = href.split('/').filter(s => s);
      if (segments.length > 0) {
        return segments[segments.length - 1].slice(0, 10);
      }

      return 'item';
    } catch {
      return 'item';
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Expose selector for testing
  get selector(): Required<TopElementSelector> {
    return this._selector;
  }
}

/**
 * Predicate rebrand alias for SentienceContext.
 * Kept as a runtime alias to avoid breaking existing integrations.
 */
export const PredicateContext = SentienceContext;
