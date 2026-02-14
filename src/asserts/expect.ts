/**
 * Expectation builder for assertion DSL.
 *
 * This module provides the expect() builder that creates fluent assertions
 * which compile to existing Predicate objects.
 *
 * Key classes:
 * - ExpectBuilder: Fluent builder for element-based assertions
 * - EventuallyConfig: Configuration for .eventually() retry logic
 *
 * The expect() function is the main entry point. It returns a builder that
 * can be chained with matchers:
 *     expect(E({ role: "button" })).toExist()
 *     expect(E({ textContains: "Error" })).notToExist()
 *     expect.textPresent("Welcome")
 *
 * All builders compile to Predicate functions compatible with AgentRuntime.assert().
 */

import { Predicate, AssertOutcome, AssertContext } from '../verification';
import { ElementQuery, MultiQuery, MultiTextPredicate } from './query';

// Default values for .eventually()
const DEFAULT_TIMEOUT = 10000; // milliseconds
const DEFAULT_POLL = 200; // milliseconds
const DEFAULT_MAX_RETRIES = 3;

/**
 * Configuration for .eventually() retry logic.
 */
export interface EventuallyConfig {
  /** Max time to wait (milliseconds, default 10000) */
  timeout?: number;
  /** Interval between retries (milliseconds, default 200) */
  poll?: number;
  /** Max number of retry attempts (default 3) */
  maxRetries?: number;
  /**
   * Optional: increase snapshot `limit` across retries (additive schedule).
   *
   * This mirrors AgentRuntime's AssertionHandle.eventually() behavior.
   */
  snapshotLimitGrowth?: {
    startLimit?: number;
    step?: number;
    maxLimit?: number;
    applyOn?: 'only_on_fail' | 'all';
  };
}

/**
 * Convert query to a serializable object for debugging.
 */
function queryToDict(
  query: ElementQuery | MultiQuery | MultiTextPredicate
): Record<string, unknown> {
  if (query instanceof ElementQuery) {
    const result: Record<string, unknown> = {};
    if (query.role) result.role = query.role;
    if (query.name) result.name = query.name;
    if (query.text) result.text = query.text;
    if (query.textContains) result.textContains = query.textContains;
    if (query.hrefContains) result.hrefContains = query.hrefContains;
    if (query.inViewport !== undefined) result.inViewport = query.inViewport;
    if (query.occluded !== undefined) result.occluded = query.occluded;
    if (query.group) result.group = query.group;
    if (query.inDominantGroup !== undefined) result.inDominantGroup = query.inDominantGroup;
    if (query._groupIndex !== undefined) result.groupIndex = query._groupIndex;
    if (query._fromDominantList) result.fromDominantList = true;
    return result;
  } else if (query instanceof MultiQuery) {
    return { type: 'multi', limit: query.limit };
  } else if (
    typeof query === 'object' &&
    query !== null &&
    'checkType' in query &&
    'text' in query &&
    'multiQuery' in query
  ) {
    return { type: 'multi_text', text: query.text, checkType: query.checkType };
  }
  return { type: String(typeof query) };
}

/**
 * Fluent builder for element-based assertions.
 *
 * Created by expect(E(...)) or expect(inDominantList().nth(k)).
 *
 * Methods return Predicate functions that can be passed to runtime.assert().
 *
 * @example
 * expect(E({ role: "button" })).toExist()
 * expect(E({ textContains: "Error" })).notToExist()
 * expect(E({ role: "link" })).toBeVisible()
 */
export class ExpectBuilder {
  private _query: ElementQuery | MultiQuery | MultiTextPredicate;

  constructor(query: ElementQuery | MultiQuery | MultiTextPredicate) {
    this._query = query;
  }

  /**
   * Assert that at least one element matches the query.
   *
   * @returns Predicate function for use with runtime.assert()
   *
   * @example
   * await runtime.assert(
   *   expect(E({ role: "button", textContains: "Save" })).toExist(),
   *   "save_button_exists"
   * );
   */
  toExist(): Predicate {
    const query = this._query;

    return (ctx: AssertContext): AssertOutcome => {
      const snap = ctx.snapshot;
      if (!snap) {
        return {
          passed: false,
          reason: 'no snapshot available',
          details: { query: queryToDict(query) },
        };
      }

      if (query instanceof ElementQuery) {
        const matches = query.findAll(snap);
        const ok = matches.length > 0;
        return {
          passed: ok,
          reason: ok ? '' : `no elements matched query: ${JSON.stringify(queryToDict(query))}`,
          details: { query: queryToDict(query), matched: matches.length },
        };
      }

      return {
        passed: false,
        reason: 'toExist() requires ElementQuery',
        details: {},
      };
    };
  }

  /**
   * Assert that NO elements match the query.
   *
   * Useful for asserting absence of error messages, loading indicators, etc.
   *
   * @returns Predicate function for use with runtime.assert()
   *
   * @example
   * await runtime.assert(
   *   expect(E({ textContains: "Error" })).notToExist(),
   *   "no_error_message"
   * );
   */
  notToExist(): Predicate {
    const query = this._query;

    return (ctx: AssertContext): AssertOutcome => {
      const snap = ctx.snapshot;
      if (!snap) {
        return {
          passed: false,
          reason: 'no snapshot available',
          details: { query: queryToDict(query) },
        };
      }

      if (query instanceof ElementQuery) {
        const matches = query.findAll(snap);
        const ok = matches.length === 0;
        return {
          passed: ok,
          reason: ok
            ? ''
            : `found ${matches.length} elements matching: ${JSON.stringify(queryToDict(query))}`,
          details: { query: queryToDict(query), matched: matches.length },
        };
      }

      return {
        passed: false,
        reason: 'notToExist() requires ElementQuery',
        details: {},
      };
    };
  }

  /**
   * Assert that element exists AND is visible (in_viewport=true, is_occluded=false).
   *
   * @returns Predicate function for use with runtime.assert()
   *
   * @example
   * await runtime.assert(
   *   expect(E({ textContains: "Checkout" })).toBeVisible(),
   *   "checkout_button_visible"
   * );
   */
  toBeVisible(): Predicate {
    const query = this._query;

    return (ctx: AssertContext): AssertOutcome => {
      const snap = ctx.snapshot;
      if (!snap) {
        return {
          passed: false,
          reason: 'no snapshot available',
          details: { query: queryToDict(query) },
        };
      }

      if (query instanceof ElementQuery) {
        const matches = query.findAll(snap);
        if (matches.length === 0) {
          return {
            passed: false,
            reason: `no elements matched query: ${JSON.stringify(queryToDict(query))}`,
            details: { query: queryToDict(query), matched: 0 },
          };
        }

        // Check visibility of first match
        const el = matches[0];
        const isVisible = el.in_viewport && !el.is_occluded;
        return {
          passed: isVisible,
          reason: isVisible
            ? ''
            : `element found but not visible (in_viewport=${el.in_viewport}, is_occluded=${el.is_occluded})`,
          details: {
            query: queryToDict(query),
            elementId: el.id,
            inViewport: el.in_viewport,
            isOccluded: el.is_occluded,
          },
        };
      }

      return {
        passed: false,
        reason: 'toBeVisible() requires ElementQuery',
        details: {},
      };
    };
  }

  /**
   * Assert that element's text contains the specified substring.
   *
   * @param text - Substring to search for (case-insensitive)
   * @returns Predicate function for use with runtime.assert()
   *
   * @example
   * await runtime.assert(
   *   expect(inDominantList().nth(0)).toHaveTextContains("Show HN"),
   *   "first_item_is_show_hn"
   * );
   */
  toHaveTextContains(text: string): Predicate {
    const query = this._query;

    return (ctx: AssertContext): AssertOutcome => {
      const snap = ctx.snapshot;
      if (!snap) {
        return {
          passed: false,
          reason: 'no snapshot available',
          details: { query: queryToDict(query), expectedText: text },
        };
      }

      if (query instanceof ElementQuery) {
        const matches = query.findAll(snap);
        if (matches.length === 0) {
          return {
            passed: false,
            reason: `no elements matched query: ${JSON.stringify(queryToDict(query))}`,
            details: { query: queryToDict(query), matched: 0, expectedText: text },
          };
        }

        // Check text of first match
        const el = matches[0];
        const elText = el.text || '';
        const ok = elText.toLowerCase().includes(text.toLowerCase());
        return {
          passed: ok,
          reason: ok ? '' : `element text '${elText.substring(0, 100)}' does not contain '${text}'`,
          details: {
            query: queryToDict(query),
            elementId: el.id,
            elementText: elText.substring(0, 200),
            expectedText: text,
          },
        };
      }

      return {
        passed: false,
        reason: 'toHaveTextContains() requires ElementQuery',
        details: {},
      };
    };
  }
}

/**
 * Factory for creating ExpectBuilder instances and global assertions.
 *
 * This is the main entry point for the assertion DSL.
 *
 * @example
 * import { expect, E } from './asserts';
 *
 * // Element-based assertions
 * expect(E({ role: "button" })).toExist()
 * expect(E({ textContains: "Error" })).notToExist()
 *
 * // Global text assertions
 * expect.textPresent("Welcome back")
 * expect.noText("Error")
 */
class ExpectFactory {
  /**
   * Create an expectation builder for the given query.
   *
   * @param query - ElementQuery, MultiQuery, or MultiTextPredicate
   * @returns ExpectBuilder for chaining matchers
   *
   * @example
   * expect(E({ role: "button" })).toExist()
   * expect(inDominantList().nth(0)).toHaveTextContains("Show HN")
   */
  call(query: ElementQuery | MultiQuery | MultiTextPredicate): ExpectBuilder {
    return new ExpectBuilder(query);
  }

  /**
   * Global assertion: check if text is present anywhere on the page.
   *
   * Searches across all element text fields.
   *
   * @param text - Text to search for (case-insensitive substring)
   * @returns Predicate function for use with runtime.assert()
   *
   * @example
   * await runtime.assert(
   *   expect.textPresent("Welcome back"),
   *   "user_logged_in"
   * );
   */
  textPresent(text: string): Predicate {
    return (ctx: AssertContext): AssertOutcome => {
      const snap = ctx.snapshot;
      if (!snap) {
        return {
          passed: false,
          reason: 'no snapshot available',
          details: { searchText: text },
        };
      }

      // Search all element texts
      const textLower = text.toLowerCase();
      for (const el of snap.elements) {
        const elText = el.text || '';
        if (elText.toLowerCase().includes(textLower)) {
          return {
            passed: true,
            reason: '',
            details: { searchText: text, foundInElement: el.id },
          };
        }
      }

      return {
        passed: false,
        reason: `text '${text}' not found on page`,
        details: { searchText: text, elementsSearched: snap.elements.length },
      };
    };
  }

  /**
   * Global assertion: check that text is NOT present anywhere on the page.
   *
   * Searches across all element text fields.
   *
   * @param text - Text that should not be present (case-insensitive substring)
   * @returns Predicate function for use with runtime.assert()
   *
   * @example
   * await runtime.assert(
   *   expect.noText("Error"),
   *   "no_error_message"
   * );
   */
  noText(text: string): Predicate {
    return (ctx: AssertContext): AssertOutcome => {
      const snap = ctx.snapshot;
      if (!snap) {
        return {
          passed: false,
          reason: 'no snapshot available',
          details: { searchText: text },
        };
      }

      // Search all element texts
      const textLower = text.toLowerCase();
      for (const el of snap.elements) {
        const elText = el.text || '';
        if (elText.toLowerCase().includes(textLower)) {
          return {
            passed: false,
            reason: `text '${text}' found in element id=${el.id}`,
            details: {
              searchText: text,
              foundInElement: el.id,
              elementText: elText.substring(0, 200),
            },
          };
        }
      }

      return {
        passed: true,
        reason: '',
        details: { searchText: text, elementsSearched: snap.elements.length },
      };
    };
  }
}

// Create the singleton factory
const factoryInstance = new ExpectFactory();

/**
 * Main entry point for the assertion DSL.
 *
 * Use as a function to create element-based assertions:
 *   expect(E({ role: "button" })).toExist()
 *
 * Use static methods for global assertions:
 *   expect.textPresent("Welcome")
 *   expect.noText("Error")
 */
export const expect = Object.assign(
  (query: ElementQuery | MultiQuery | MultiTextPredicate) => factoryInstance.call(query),
  {
    textPresent: (text: string) => factoryInstance.textPresent(text),
    noText: (text: string) => factoryInstance.noText(text),
  }
);

/**
 * Wrapper that adds retry logic to a predicate.
 *
 * Created by withEventually(). Provides an async evaluate() method
 * that retries the predicate with fresh snapshots.
 *
 * Note: TypeScript uses milliseconds for timeout/poll.
 */
export class EventuallyWrapper {
  private _predicate: Predicate;
  private _config: {
    timeout: number;
    poll: number;
    maxRetries: number;
    snapshotLimitGrowth?: EventuallyConfig['snapshotLimitGrowth'];
  };

  constructor(predicate: Predicate, config: EventuallyConfig = {}) {
    this._predicate = predicate;
    this._config = {
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      poll: config.poll ?? DEFAULT_POLL,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      snapshotLimitGrowth: config.snapshotLimitGrowth,
    };
  }

  /**
   * Evaluate predicate with retry logic.
   *
   * @param ctx - Initial assertion context
   * @param snapshotFn - Async function to take fresh snapshots
   * @returns Promise resolving to AssertOutcome
   */
  async evaluate(
    ctx: AssertContext,
    snapshotFn: () => Promise<AssertContext['snapshot']>
  ): Promise<AssertOutcome> {
    const startTime = Date.now();
    let lastOutcome: AssertOutcome | null = null;
    let attempts = 0;

    const growth = this._config.snapshotLimitGrowth;
    const clampLimit = (n: number): number => {
      if (!Number.isFinite(n)) return 50;
      if (n < 1) return 1;
      if (n > 500) return 500;
      return Math.floor(n);
    };
    const growthApplyOn = growth?.applyOn ?? 'only_on_fail';
    const startLimit = clampLimit(growth?.startLimit ?? 50);
    const step = clampLimit(growth?.step ?? startLimit);
    const maxLimit = clampLimit(growth?.maxLimit ?? 500);
    const limitForAttempt = (attempt1: number): number => {
      const base = startLimit + step * Math.max(0, attempt1 - 1);
      return clampLimit(Math.min(maxLimit, base));
    };

    while (true) {
      // Check timeout (higher precedence than maxRetries)
      const elapsed = Date.now() - startTime;
      if (elapsed >= this._config.timeout) {
        if (lastOutcome) {
          lastOutcome.reason = `timeout after ${elapsed}ms: ${lastOutcome.reason}`;
          return lastOutcome;
        }
        return {
          passed: false,
          reason: `timeout after ${elapsed}ms`,
          details: { attempts },
        };
      }

      // Check max retries
      if (attempts >= this._config.maxRetries) {
        if (lastOutcome) {
          lastOutcome.reason = `max retries (${this._config.maxRetries}) exceeded: ${lastOutcome.reason}`;
          return lastOutcome;
        }
        return {
          passed: false,
          reason: `max retries (${this._config.maxRetries}) exceeded`,
          details: { attempts },
        };
      }

      // Take fresh snapshot if not first attempt
      if (attempts > 0) {
        try {
          // If snapshotFn supports kwargs (e.g. runtime.snapshot), pass adaptive limit.
          let freshSnapshot: AssertContext['snapshot'];
          const attempt1 = attempts + 1;
          if (growth) {
            const apply =
              growthApplyOn === 'all' || (growthApplyOn === 'only_on_fail' && lastOutcome);
            const snapLimit = apply ? limitForAttempt(attempt1) : startLimit;
            try {
              freshSnapshot = await (snapshotFn as any)({ limit: snapLimit });
            } catch {
              freshSnapshot = await snapshotFn();
            }
          } else {
            freshSnapshot = await snapshotFn();
          }
          ctx = {
            snapshot: freshSnapshot,
            url: freshSnapshot?.url ?? ctx.url,
            stepId: ctx.stepId,
          };
        } catch (e) {
          lastOutcome = {
            passed: false,
            reason: `failed to take snapshot: ${e}`,
            details: { attempts, error: String(e) },
          };
          attempts++;
          await this.sleep(this._config.poll);
          continue;
        }
      }

      // Evaluate predicate
      const outcome = this._predicate(ctx);
      if (outcome.passed) {
        outcome.details.attempts = attempts + 1;
        return outcome;
      }

      lastOutcome = outcome;
      attempts++;

      // Wait before next retry
      if (attempts < this._config.maxRetries) {
        // Check if we'd exceed timeout with the poll delay
        if (Date.now() - startTime + this._config.poll < this._config.timeout) {
          await this.sleep(this._config.poll);
        } else {
          // No point waiting, we'll timeout anyway
          lastOutcome.reason = `timeout after ${Date.now() - startTime}ms: ${lastOutcome.reason}`;
          return lastOutcome;
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Get the configured timeout in milliseconds */
  get timeout(): number {
    return this._config.timeout;
  }

  /** Get the configured poll interval in milliseconds */
  get poll(): number {
    return this._config.poll;
  }

  /** Get the configured max retries */
  get maxRetries(): number {
    return this._config.maxRetries;
  }
}

/**
 * Wrap a predicate with retry logic.
 *
 * This is the TypeScript API for .eventually(). Returns a wrapper
 * that provides an async evaluate() method for use with the runtime.
 *
 * @param predicate - Predicate to wrap
 * @param config - Retry configuration (timeout/poll in milliseconds)
 * @returns EventuallyWrapper with async evaluate() method
 *
 * @example
 * const wrapper = withEventually(
 *   expect(E({ role: "button" })).toExist(),
 *   { timeout: 5000, maxRetries: 10 }
 * );
 * const result = await wrapper.evaluate(ctx, runtime.snapshot);
 */
export function withEventually(predicate: Predicate, config?: EventuallyConfig): EventuallyWrapper {
  return new EventuallyWrapper(predicate, config);
}
