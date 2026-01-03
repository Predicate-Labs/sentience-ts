/**
 * ElementFilter - Consolidates element filtering logic
 *
 * This utility class extracts common element filtering patterns from agent.ts and query.ts
 * to reduce code duplication and improve maintainability.
 */

import { Snapshot, Element } from '../types';

export interface FilterOptions {
  maxElements?: number;
  minImportance?: number;
  maxImportance?: number;
  inViewportOnly?: boolean;
  clickableOnly?: boolean;
}

/**
 * ElementFilter provides static methods for filtering elements from snapshots
 */
export class ElementFilter {
  /**
   * Filter elements by importance score
   *
   * @param snapshot - Snapshot containing elements
   * @param maxElements - Maximum number of elements to return (default: 50)
   * @returns Filtered and sorted array of elements
   *
   * @example
   * ```typescript
   * const filtered = ElementFilter.filterByImportance(snap, 50);
   * ```
   */
  static filterByImportance(snapshot: Snapshot, maxElements: number = 50): Element[] {
    // Filter out REMOVED elements - they're not actionable and shouldn't be in LLM context
    const elements = snapshot.elements.filter(el => el.diff_status !== 'REMOVED');

    // Sort by importance (descending)
    elements.sort((a, b) => b.importance - a.importance);

    // Return top N elements
    return elements.slice(0, maxElements);
  }

  /**
   * Filter elements relevant to a goal using keyword matching
   * Applies goal-based keyword matching to boost relevant elements
   *
   * @param snapshot - Snapshot containing elements
   * @param goal - Goal/task description to match against
   * @param maxElements - Maximum number of elements to return (default: 50)
   * @returns Filtered and scored array of elements
   *
   * @example
   * ```typescript
   * const filtered = ElementFilter.filterByGoal(snap, "Click the search box", 50);
   * ```
   */
  static filterByGoal(snapshot: Snapshot, goal: string, maxElements: number = 50): Element[] {
    if (!goal) {
      return this.filterByImportance(snapshot, maxElements);
    }

    // Filter out REMOVED elements - they're not actionable and shouldn't be in LLM context
    const elements = snapshot.elements.filter(el => el.diff_status !== 'REMOVED');

    const goalLower = goal.toLowerCase();
    const keywords = this.extractKeywords(goalLower);

    // Score elements based on keyword matches
    const scoredElements: Array<[number, Element]> = [];

    for (const element of elements) {
      let score = element.importance; // Start with base importance

      // Boost score for keyword matches in text
      if (element.text) {
        const textLower = element.text.toLowerCase();
        for (const keyword of keywords) {
          if (textLower.includes(keyword)) {
            score += 0.5; // Boost for keyword match
          }
        }
      }

      // Boost score for keyword matches in role
      const roleLower = element.role.toLowerCase();
      for (const keyword of keywords) {
        if (roleLower.includes(keyword)) {
          score += 0.3; // Smaller boost for role match
        }
      }

      scoredElements.push([score, element]);
    }

    // Sort by score (descending)
    scoredElements.sort((a, b) => b[0] - a[0]);

    // Return top N elements
    return scoredElements.slice(0, maxElements).map(([_, element]) => element);
  }

  /**
   * Filter elements using multiple criteria
   *
   * @param snapshot - Snapshot containing elements
   * @param options - Filter options
   * @returns Filtered array of elements
   *
   * @example
   * ```typescript
   * const filtered = ElementFilter.filter(snap, {
   *   maxElements: 50,
   *   minImportance: 0.5,
   *   inViewportOnly: true,
   *   clickableOnly: false
   * });
   * ```
   */
  static filter(snapshot: Snapshot, options: FilterOptions = {}): Element[] {
    // Filter out REMOVED elements - they're not actionable and shouldn't be in LLM context
    let elements = snapshot.elements.filter(el => el.diff_status !== 'REMOVED');

    // Apply filters
    if (options.minImportance !== undefined) {
      elements = elements.filter(el => el.importance >= options.minImportance!);
    }

    if (options.maxImportance !== undefined) {
      elements = elements.filter(el => el.importance <= options.maxImportance!);
    }

    if (options.inViewportOnly) {
      elements = elements.filter(el => el.in_viewport);
    }

    if (options.clickableOnly) {
      elements = elements.filter(el => el.visual_cues.is_clickable);
    }

    // Sort by importance (descending)
    elements.sort((a, b) => b.importance - a.importance);

    // Apply max elements limit
    if (options.maxElements !== undefined) {
      elements = elements.slice(0, options.maxElements);
    }

    return elements;
  }

  /**
   * Extract keywords from a goal string
   * Removes common stop words and returns meaningful keywords
   *
   * @param goal - Goal string to extract keywords from
   * @returns Array of keywords
   *
   * @private
   */
  private static extractKeywords(goal: string): string[] {
    // Common stop words to filter out
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'as',
      'is',
      'was',
      'are',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'should',
      'could',
      'may',
      'might',
      'must',
      'can',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
    ]);

    // Split by whitespace and punctuation, filter out stop words and short words
    const words = goal
      .toLowerCase()
      .split(/[\s,.;:!?()[\]{}'"]+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Remove duplicates
    return Array.from(new Set(words));
  }
}
