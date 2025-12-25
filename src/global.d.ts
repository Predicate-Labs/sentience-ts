/**
 * Type definitions for Sentience Chrome Extension API
 *
 * This file defines the global window.sentience API that is injected
 * by the Sentience Chrome Extension into every page.
 *
 * These types allow TypeScript code to call window.sentience methods
 * without using 'as any' casts.
 */

/**
 * Sentience Chrome Extension API
 *
 * The actual return types match the SDK's types.ts definitions,
 * but we use 'any' here to avoid conflicts between browser context
 * and Node.js context types.
 */
interface SentienceAPI {
  /**
   * Take a snapshot of the current page
   *
   * Extracts interactive elements with semantic understanding,
   * scores them by importance, and returns structured data.
   *
   * @param options Snapshot configuration options
   * @returns Promise resolving to snapshot data
   *
   * @example
   * ```typescript
   * // Basic snapshot
   * const result = await window.sentience.snapshot();
   * console.log(result.elements); // Top 50 elements
   *
   * // With options
   * const result = await window.sentience.snapshot({
   *   limit: 100,
   *   screenshot: true,
   *   filter: { min_area: 50 }
   * });
   * ```
   */
  snapshot(options?: any): Promise<any>;

  /**
   * Click an element by its ID
   *
   * @param id Element ID from snapshot
   * @returns true if click succeeded, false otherwise
   */
  click(id: number): boolean;

  /**
   * Get readable text from the page
   *
   * @param options Read options
   * @returns Extracted text content
   */
  read(options?: any): any;

  /**
   * Internal: WASM module reference (may not be exposed)
   * @internal
   */
  _wasmModule?: any;
}

/**
 * Extend the global Window interface
 */
declare global {
  interface Window {
    /**
     * Sentience Chrome Extension API
     *
     * This API is injected by the Sentience extension and provides
     * programmatic access to semantic web page analysis.
     */
    sentience: SentienceAPI;

    /**
     * Internal: Element registry for click tracking
     * @internal
     */
    sentience_registry: HTMLElement[];
  }
}

// This export makes this a module (required for declaration merging)
export {};
