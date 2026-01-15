/**
 * Verification primitives for agent assertion loops.
 *
 * This module provides assertion predicates and outcome types for runtime verification
 * in agent loops. Assertions evaluate against the current browser state (snapshot/url)
 * and record results into the trace.
 *
 * Key concepts:
 * - AssertOutcome: Result of evaluating an assertion
 * - AssertContext: Context provided to assertion predicates (snapshot, url, stepId)
 * - Predicate: Callable that takes context and returns outcome
 *
 * @example
 * ```typescript
 * import { urlMatches, exists, AssertContext } from './verification';
 *
 * // Create predicates
 * const onSearchPage = urlMatches(/\/s\?k=/);
 * const resultsLoaded = exists("text~'Results'");
 *
 * // Evaluate against context
 * const ctx: AssertContext = { snapshot, url: "https://example.com/s?k=shoes" };
 * const outcome = onSearchPage(ctx);
 * console.log(outcome.passed); // true
 * ```
 */

import { Snapshot, QuerySelector } from './types';
import { query } from './query';

/**
 * Convert QuerySelector to string for display/logging.
 */
function selectorToString(selector: QuerySelector): string {
  return typeof selector === 'string' ? selector : JSON.stringify(selector);
}

/**
 * Result of evaluating an assertion predicate.
 */
export interface AssertOutcome {
  /** Whether the assertion passed */
  passed: boolean;
  /** Human-readable explanation (especially useful when failed) */
  reason: string;
  /** Additional structured data for debugging/display */
  details: Record<string, any>;
}

/**
 * Context provided to assertion predicates.
 *
 * Provides access to current browser state without requiring
 * the predicate to know about browser internals.
 */
export interface AssertContext {
  /** Current page snapshot (may be null if not taken) */
  snapshot: Snapshot | null;
  /** Current page URL */
  url: string | null;
  /** Current step identifier (for trace correlation) */
  stepId: string | null;
}

/**
 * Type alias for assertion predicates.
 * A predicate takes context and returns an outcome.
 */
export type Predicate = (ctx: AssertContext) => AssertOutcome;

/**
 * Create a predicate that checks if current URL matches a regex pattern.
 *
 * @param pattern - Regular expression pattern or string to match against URL
 * @returns Predicate function that evaluates URL matching
 *
 * @example
 * ```typescript
 * const pred = urlMatches(/\/search\?q=/);
 * const ctx = { snapshot: null, url: "https://example.com/search?q=shoes", stepId: null };
 * const outcome = pred(ctx);
 * console.log(outcome.passed); // true
 * ```
 */
export function urlMatches(pattern: string | RegExp): Predicate {
  const rx = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  return (ctx: AssertContext): AssertOutcome => {
    const url = ctx.url || '';
    const ok = rx.test(url);
    return {
      passed: ok,
      reason: ok ? '' : `url did not match pattern: ${pattern}`,
      details: { pattern: String(pattern), url: url.substring(0, 200) },
    };
  };
}

/**
 * Create a predicate that checks if current URL contains a substring.
 *
 * @param substring - String to search for in URL
 * @returns Predicate function that evaluates URL containment
 *
 * @example
 * ```typescript
 * const pred = urlContains("/cart");
 * const ctx = { snapshot: null, url: "https://example.com/cart/checkout", stepId: null };
 * const outcome = pred(ctx);
 * console.log(outcome.passed); // true
 * ```
 */
export function urlContains(substring: string): Predicate {
  return (ctx: AssertContext): AssertOutcome => {
    const url = ctx.url || '';
    const ok = url.includes(substring);
    return {
      passed: ok,
      reason: ok ? '' : `url does not contain: ${substring}`,
      details: { substring, url: url.substring(0, 200) },
    };
  };
}

/**
 * Create a predicate that checks if elements matching selector exist.
 *
 * Uses the SDK's query engine to find matching elements.
 *
 * @param selector - Semantic selector string (e.g., "role=button text~'Sign in'")
 * @returns Predicate function that evaluates element existence
 *
 * @example
 * ```typescript
 * const pred = exists("text~'Results'");
 * // Will check if snapshot contains elements with "Results" in text
 * ```
 */
export function exists(selector: QuerySelector): Predicate {
  const selectorStr = selectorToString(selector);
  return (ctx: AssertContext): AssertOutcome => {
    const snap = ctx.snapshot;
    if (!snap) {
      return {
        passed: false,
        reason: 'no snapshot available',
        details: { selector: selectorStr },
      };
    }

    const matches = query(snap, selector);
    const ok = matches.length > 0;
    return {
      passed: ok,
      reason: ok ? '' : `no elements matched selector: ${selectorStr}`,
      details: { selector: selectorStr, matched: matches.length },
    };
  };
}

/**
 * Create a predicate that checks that NO elements match the selector.
 *
 * Useful for asserting that error messages, loading spinners, etc. are gone.
 *
 * @param selector - Semantic selector string
 * @returns Predicate function that evaluates element non-existence
 *
 * @example
 * ```typescript
 * const pred = notExists("text~'Loading'");
 * // Will pass if no elements contain "Loading" text
 * ```
 */
export function notExists(selector: QuerySelector): Predicate {
  const selectorStr = selectorToString(selector);
  return (ctx: AssertContext): AssertOutcome => {
    const snap = ctx.snapshot;
    if (!snap) {
      return {
        passed: false,
        reason: 'no snapshot available',
        details: { selector: selectorStr },
      };
    }

    const matches = query(snap, selector);
    const ok = matches.length === 0;
    return {
      passed: ok,
      reason: ok ? '' : `found ${matches.length} elements matching: ${selectorStr}`,
      details: { selector: selectorStr, matched: matches.length },
    };
  };
}

/**
 * Create a predicate that checks the number of matching elements.
 *
 * @param selector - Semantic selector string
 * @param options - Count constraints
 * @returns Predicate function that evaluates element count
 *
 * @example
 * ```typescript
 * const pred = elementCount("role=button", { minCount: 1, maxCount: 5 });
 * // Will pass if 1-5 buttons found
 * ```
 */
export function elementCount(
  selector: QuerySelector,
  options: { minCount?: number; maxCount?: number } = {}
): Predicate {
  const { minCount = 0, maxCount } = options;
  const selectorStr = selectorToString(selector);

  return (ctx: AssertContext): AssertOutcome => {
    const snap = ctx.snapshot;
    if (!snap) {
      return {
        passed: false,
        reason: 'no snapshot available',
        details: { selector: selectorStr, minCount, maxCount },
      };
    }

    const matches = query(snap, selector);
    const count = matches.length;

    let ok = count >= minCount;
    if (maxCount !== undefined) {
      ok = ok && count <= maxCount;
    }

    let reason = '';
    if (!ok) {
      if (maxCount !== undefined) {
        reason = `expected ${minCount}-${maxCount} elements, found ${count}`;
      } else {
        reason = `expected at least ${minCount} elements, found ${count}`;
      }
    }

    return {
      passed: ok,
      reason,
      details: {
        selector: selectorStr,
        matched: count,
        minCount,
        maxCount,
      },
    };
  };
}

/**
 * Create a predicate that passes only if ALL sub-predicates pass.
 *
 * @param predicates - Predicate functions to combine with AND logic
 * @returns Combined predicate
 *
 * @example
 * ```typescript
 * const pred = allOf(urlContains("/cart"), exists("text~'Checkout'"));
 * // Will pass only if both conditions are true
 * ```
 */
export function allOf(...predicates: Predicate[]): Predicate {
  return (ctx: AssertContext): AssertOutcome => {
    const failedReasons: string[] = [];
    const allDetails: Record<string, any>[] = [];

    for (const p of predicates) {
      const outcome = p(ctx);
      allDetails.push(outcome.details);
      if (!outcome.passed) {
        failedReasons.push(outcome.reason);
      }
    }

    const ok = failedReasons.length === 0;
    return {
      passed: ok,
      reason: failedReasons.join('; '),
      details: { subPredicates: allDetails, failedCount: failedReasons.length },
    };
  };
}

/**
 * Create a predicate that passes if ANY sub-predicate passes.
 *
 * @param predicates - Predicate functions to combine with OR logic
 * @returns Combined predicate
 *
 * @example
 * ```typescript
 * const pred = anyOf(exists("text~'Success'"), exists("text~'Complete'"));
 * // Will pass if either condition is true
 * ```
 */
export function anyOf(...predicates: Predicate[]): Predicate {
  return (ctx: AssertContext): AssertOutcome => {
    const allReasons: string[] = [];
    const allDetails: Record<string, any>[] = [];

    for (let i = 0; i < predicates.length; i++) {
      const outcome = predicates[i](ctx);
      allDetails.push(outcome.details);
      if (outcome.passed) {
        return {
          passed: true,
          reason: '',
          details: { subPredicates: allDetails, matchedAtIndex: i },
        };
      }
      allReasons.push(outcome.reason);
    }

    return {
      passed: false,
      reason: `none of ${predicates.length} predicates passed: ${allReasons.join('; ')}`,
      details: { subPredicates: allDetails },
    };
  };
}

/**
 * Create a predicate from a custom function.
 *
 * @param checkFn - Function that takes AssertContext and returns boolean
 * @param label - Label for debugging/display
 * @returns Predicate wrapping the custom function
 *
 * @example
 * ```typescript
 * const pred = custom(
 *   (ctx) => ctx.snapshot !== null && ctx.snapshot.elements.length > 10,
 *   "has_many_elements"
 * );
 * ```
 */
export function custom(
  checkFn: (ctx: AssertContext) => boolean,
  label: string = 'custom'
): Predicate {
  return (ctx: AssertContext): AssertOutcome => {
    try {
      const ok = checkFn(ctx);
      return {
        passed: ok,
        reason: ok ? '' : `custom check '${label}' returned false`,
        details: { label },
      };
    } catch (e) {
      return {
        passed: false,
        reason: `custom check '${label}' raised exception: ${e}`,
        details: { label, error: String(e) },
      };
    }
  };
}

// ============================================================================
// v1 state-aware predicates (deterministic, schema-driven)
// ============================================================================

export function isEnabled(selector: QuerySelector): Predicate {
  const selectorStr = selectorToString(selector);
  return (ctx: AssertContext): AssertOutcome => {
    const snap = ctx.snapshot;
    if (!snap) {
      return { passed: false, reason: 'no snapshot available', details: { selector: selectorStr } };
    }

    const matches = query(snap, selector);
    if (matches.length === 0) {
      return {
        passed: false,
        reason: `no elements matched selector: ${selectorStr}`,
        details: { selector: selectorStr, matched: 0 },
      };
    }

    const ok = matches.some(m => m.disabled !== true);
    return {
      passed: ok,
      reason: ok ? '' : `all matched elements are disabled: ${selectorStr}`,
      details: { selector: selectorStr, matched: matches.length },
    };
  };
}

export function isDisabled(selector: QuerySelector): Predicate {
  const selectorStr = selectorToString(selector);
  return (ctx: AssertContext): AssertOutcome => {
    const snap = ctx.snapshot;
    if (!snap) {
      return { passed: false, reason: 'no snapshot available', details: { selector: selectorStr } };
    }
    const matches = query(snap, selector);
    const ok = matches.some(m => m.disabled === true);
    return {
      passed: ok,
      reason: ok ? '' : `no matched elements are disabled: ${selectorStr}`,
      details: { selector: selectorStr, matched: matches.length },
    };
  };
}

export function isChecked(selector: QuerySelector): Predicate {
  const selectorStr = selectorToString(selector);
  return (ctx: AssertContext): AssertOutcome => {
    const snap = ctx.snapshot;
    if (!snap) {
      return { passed: false, reason: 'no snapshot available', details: { selector: selectorStr } };
    }
    const matches = query(snap, selector);
    const ok = matches.some(m => m.checked === true);
    return {
      passed: ok,
      reason: ok ? '' : `no matched elements are checked: ${selectorStr}`,
      details: { selector: selectorStr, matched: matches.length },
    };
  };
}

export function isUnchecked(selector: QuerySelector): Predicate {
  const selectorStr = selectorToString(selector);
  return (ctx: AssertContext): AssertOutcome => {
    const snap = ctx.snapshot;
    if (!snap) {
      return { passed: false, reason: 'no snapshot available', details: { selector: selectorStr } };
    }
    const matches = query(snap, selector);
    const ok = matches.some(m => m.checked !== true);
    return {
      passed: ok,
      reason: ok ? '' : `all matched elements are checked: ${selectorStr}`,
      details: { selector: selectorStr, matched: matches.length },
    };
  };
}

export function valueEquals(selector: QuerySelector, expected: string): Predicate {
  const selectorStr = selectorToString(selector);
  return (ctx: AssertContext): AssertOutcome => {
    const snap = ctx.snapshot;
    if (!snap) {
      return { passed: false, reason: 'no snapshot available', details: { selector: selectorStr } };
    }
    const matches = query(snap, selector);
    const ok = matches.some(m => (m.value ?? '') === expected);
    return {
      passed: ok,
      reason: ok ? '' : `no matched elements had value == '${expected}'`,
      details: { selector: selectorStr, expected, matched: matches.length },
    };
  };
}

export function valueContains(selector: QuerySelector, substring: string): Predicate {
  const selectorStr = selectorToString(selector);
  return (ctx: AssertContext): AssertOutcome => {
    const snap = ctx.snapshot;
    if (!snap) {
      return { passed: false, reason: 'no snapshot available', details: { selector: selectorStr } };
    }
    const matches = query(snap, selector);
    const ok = matches.some(m => (m.value ?? '').toLowerCase().includes(substring.toLowerCase()));
    return {
      passed: ok,
      reason: ok ? '' : `no matched elements had value containing '${substring}'`,
      details: { selector: selectorStr, substring, matched: matches.length },
    };
  };
}

export function isExpanded(selector: QuerySelector): Predicate {
  const selectorStr = selectorToString(selector);
  return (ctx: AssertContext): AssertOutcome => {
    const snap = ctx.snapshot;
    if (!snap) {
      return { passed: false, reason: 'no snapshot available', details: { selector: selectorStr } };
    }
    const matches = query(snap, selector);
    const ok = matches.some(m => m.expanded === true);
    return {
      passed: ok,
      reason: ok ? '' : `no matched elements are expanded: ${selectorStr}`,
      details: { selector: selectorStr, matched: matches.length },
    };
  };
}

export function isCollapsed(selector: QuerySelector): Predicate {
  const selectorStr = selectorToString(selector);
  return (ctx: AssertContext): AssertOutcome => {
    const snap = ctx.snapshot;
    if (!snap) {
      return { passed: false, reason: 'no snapshot available', details: { selector: selectorStr } };
    }
    const matches = query(snap, selector);
    const ok = matches.some(m => m.expanded !== true);
    return {
      passed: ok,
      reason: ok ? '' : `all matched elements are expanded: ${selectorStr}`,
      details: { selector: selectorStr, matched: matches.length },
    };
  };
}
