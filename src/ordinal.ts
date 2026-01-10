/**
 * Phase 3: Ordinal Intent Detection for Semantic Search
 *
 * This module provides functions to detect ordinal intent in natural language goals
 * and select elements based on their position within groups.
 *
 * Ordinal operators supported:
 * - Position-based: "first", "second", "third", "1st", "2nd", "3rd", etc.
 * - Relative: "top", "bottom", "last", "next", "previous"
 * - Numeric: "#1", "#2", "number 1", "item 3"
 *
 * @example
 * ```typescript
 * import { detectOrdinalIntent, selectByOrdinal } from 'sentience';
 *
 * const intent = detectOrdinalIntent("click the first search result");
 * // { detected: true, kind: 'nth', n: 1 }
 *
 * const element = selectByOrdinal(elements, "x5-w2-h1", intent);
 * ```
 */

import { Element } from './types';

export type OrdinalKind = 'first' | 'last' | 'nth' | 'top_k' | 'next' | 'previous';

export interface OrdinalIntent {
  /** Whether ordinal intent was detected */
  detected: boolean;
  /** Type of ordinal intent */
  kind?: OrdinalKind;
  /** For "nth" kind: 1-indexed position (1=first, 2=second) */
  n?: number;
  /** For "top_k" kind: number of items */
  k?: number;
}

/** Ordinal word to number mapping */
const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  '1st': 1,
  '2nd': 2,
  '3rd': 3,
  '4th': 4,
  '5th': 5,
  '6th': 6,
  '7th': 7,
  '8th': 8,
  '9th': 9,
  '10th': 10,
};

interface PatternDef {
  pattern: RegExp;
  type: string;
}

/** Patterns for detecting ordinal intent */
const ORDINAL_PATTERNS: PatternDef[] = [
  // "first", "second", etc.
  {
    pattern: /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i,
    type: 'ordinal_word',
  },
  // "1st", "2nd", "3rd", etc.
  { pattern: /\b(\d+)(st|nd|rd|th)\b/i, type: 'ordinal_suffix' },
  // "#1", "#2", etc.
  { pattern: /#(\d+)\b/, type: 'hash_number' },
  // "number 1", "item 3", "result 5"
  { pattern: /\b(?:number|item|result|option|choice)\s*(\d+)\b/i, type: 'labeled_number' },
  // "top" (implies first/best)
  { pattern: /\btop\b(?!\s*\d)/i, type: 'top' },
  // "top 3", "top 5"
  { pattern: /\btop\s+(\d+)\b/i, type: 'top_k' },
  // "last", "final", "bottom"
  { pattern: /\b(last|final|bottom)\b/i, type: 'last' },
  // "next", "following"
  { pattern: /\b(next|following)\b/i, type: 'next' },
  // "previous", "preceding", "prior"
  { pattern: /\b(previous|preceding|prior)\b/i, type: 'previous' },
];

/**
 * Detect ordinal intent from a goal string.
 *
 * @param goal - Natural language goal (e.g., "click the first search result")
 * @returns OrdinalIntent with detected=true if ordinal intent found
 *
 * @example
 * ```typescript
 * detectOrdinalIntent("click the first item")
 * // { detected: true, kind: 'nth', n: 1 }
 *
 * detectOrdinalIntent("select the 3rd option")
 * // { detected: true, kind: 'nth', n: 3 }
 *
 * detectOrdinalIntent("show top 5 results")
 * // { detected: true, kind: 'top_k', k: 5 }
 *
 * detectOrdinalIntent("find the submit button")
 * // { detected: false }
 * ```
 */
export function detectOrdinalIntent(goal: string): OrdinalIntent {
  const goalLower = goal.toLowerCase();

  for (const { pattern, type } of ORDINAL_PATTERNS) {
    const match = goalLower.match(pattern);
    if (match) {
      switch (type) {
        case 'ordinal_word': {
          const word = match[1].toLowerCase();
          const n = ORDINAL_WORDS[word];
          if (n) {
            return { detected: true, kind: 'nth', n };
          }
          break;
        }

        case 'ordinal_suffix': {
          const n = parseInt(match[1], 10);
          return { detected: true, kind: 'nth', n };
        }

        case 'hash_number': {
          const n = parseInt(match[1], 10);
          return { detected: true, kind: 'nth', n };
        }

        case 'labeled_number': {
          const n = parseInt(match[1], 10);
          return { detected: true, kind: 'nth', n };
        }

        case 'top':
          // "top" without a number means "first/best"
          return { detected: true, kind: 'first' };

        case 'top_k': {
          const k = parseInt(match[1], 10);
          return { detected: true, kind: 'top_k', k };
        }

        case 'last':
          return { detected: true, kind: 'last' };

        case 'next':
          return { detected: true, kind: 'next' };

        case 'previous':
          return { detected: true, kind: 'previous' };
      }
    }
  }

  return { detected: false };
}

/**
 * Select element(s) from a list based on ordinal intent.
 *
 * Uses the dominantGroupKey to filter to the "main content" group,
 * then selects by group_index based on the ordinal intent.
 *
 * @param elements - List of elements with group_key and group_index populated
 * @param dominantGroupKey - The most common group key (main content group)
 * @param intent - Detected ordinal intent
 * @param currentElementId - Current element ID (for next/previous navigation)
 * @returns Single Element for nth/first/last, array of Elements for top_k, or null
 *
 * @example
 * ```typescript
 * const intent = { detected: true, kind: 'nth', n: 1 };
 * const element = selectByOrdinal(elements, "x5-w2-h1", intent);
 * // Returns element with group_key="x5-w2-h1" and group_index=0
 * ```
 */
export function selectByOrdinal(
  elements: Element[],
  dominantGroupKey: string | null | undefined,
  intent: OrdinalIntent,
  currentElementId?: number
): Element | Element[] | null {
  if (!intent.detected) {
    return null;
  }

  // Filter to dominant group if available
  let groupElements: Element[];
  if (dominantGroupKey) {
    groupElements = elements.filter(e => e.group_key === dominantGroupKey);
  } else {
    // Fallback: use all elements with group_index
    groupElements = elements.filter(e => e.group_index !== undefined);
  }

  if (groupElements.length === 0) {
    return null;
  }

  // Sort by group_index to ensure correct ordering
  groupElements.sort((a, b) => (a.group_index ?? 0) - (b.group_index ?? 0));

  switch (intent.kind) {
    case 'first':
      return groupElements[0] ?? null;

    case 'nth':
      if (intent.n !== undefined) {
        // Nth element (1-indexed, so n=2 means group_index=1)
        const targetIndex = intent.n - 1;
        if (targetIndex >= 0 && targetIndex < groupElements.length) {
          return groupElements[targetIndex];
        }
      }
      return null;

    case 'last':
      return groupElements[groupElements.length - 1] ?? null;

    case 'top_k':
      if (intent.k !== undefined) {
        return groupElements.slice(0, intent.k);
      }
      return null;

    case 'next':
      if (currentElementId !== undefined) {
        for (let i = 0; i < groupElements.length; i++) {
          if (groupElements[i].id === currentElementId && i + 1 < groupElements.length) {
            return groupElements[i + 1];
          }
        }
      }
      return null;

    case 'previous':
      if (currentElementId !== undefined) {
        for (let i = 0; i < groupElements.length; i++) {
          if (groupElements[i].id === currentElementId && i > 0) {
            return groupElements[i - 1];
          }
        }
      }
      return null;

    default:
      return null;
  }
}

/**
 * Boost the importance of elements matching ordinal intent.
 *
 * This is useful for integrating ordinal selection with existing
 * importance-based ranking. Elements matching the ordinal intent
 * get a significant importance boost.
 *
 * @param elements - List of elements (not modified)
 * @param dominantGroupKey - The most common group key
 * @param intent - Detected ordinal intent
 * @param boostFactor - Amount to add to importance (default: 10000)
 * @returns A new array with copies of elements, with boosted importance for matches
 */
export function boostOrdinalElements(
  elements: Element[],
  dominantGroupKey: string | null | undefined,
  intent: OrdinalIntent,
  boostFactor: number = 10000
): Element[] {
  if (!intent.detected || !dominantGroupKey) {
    return elements.map(e => ({ ...e }));
  }

  const target = selectByOrdinal(elements, dominantGroupKey, intent);

  if (target === null) {
    return elements.map(e => ({ ...e }));
  }

  // Handle single element or array
  const targetIds = new Set(Array.isArray(target) ? target.map(e => e.id) : [target.id]);

  // Create copies and boost matching elements
  return elements.map(elem => {
    const copy = { ...elem };
    if (targetIds.has(copy.id)) {
      copy.importance = (copy.importance ?? 0) + boostFactor;
    }
    return copy;
  });
}
