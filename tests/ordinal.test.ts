/**
 * Unit tests for ordinal intent detection and selection.
 *
 * Tests the detectOrdinalIntent, selectByOrdinal, and boostOrdinalElements functions.
 */

import { Element } from '../src/types';
import {
  OrdinalIntent,
  detectOrdinalIntent,
  selectByOrdinal,
  boostOrdinalElements,
} from '../src/ordinal';

// Helper to create test elements
function makeElement(
  id: number,
  text: string,
  groupKey?: string,
  groupIndex?: number,
  importance: number = 100
): Element {
  return {
    id,
    role: 'button',
    text,
    importance,
    bbox: { x: 0, y: id * 50, width: 100, height: 40 },
    visual_cues: { is_primary: false, background_color_name: null, is_clickable: true },
    in_viewport: true,
    is_occluded: false,
    z_index: 0,
    group_key: groupKey,
    group_index: groupIndex,
  };
}

describe('detectOrdinalIntent', () => {
  describe('ordinal words', () => {
    test('detects "first"', () => {
      const result = detectOrdinalIntent('Click the first result');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(1);
    });

    test('detects "second"', () => {
      const result = detectOrdinalIntent('Select the second item');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(2);
    });

    test('detects "third"', () => {
      const result = detectOrdinalIntent('Click the third option');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(3);
    });

    test('detects "fourth"', () => {
      const result = detectOrdinalIntent('Choose the fourth link');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(4);
    });

    test('detects "fifth"', () => {
      const result = detectOrdinalIntent('Click the fifth button');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(5);
    });

    test('detects "tenth"', () => {
      const result = detectOrdinalIntent('Select the tenth item');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(10);
    });
  });

  describe('ordinal suffixes', () => {
    test('detects "1st"', () => {
      const result = detectOrdinalIntent('Click the 1st result');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(1);
    });

    test('detects "2nd"', () => {
      const result = detectOrdinalIntent('Select the 2nd item');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(2);
    });

    test('detects "3rd"', () => {
      const result = detectOrdinalIntent('Click the 3rd option');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(3);
    });

    test('detects "4th"', () => {
      const result = detectOrdinalIntent('Choose the 4th link');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(4);
    });

    test('detects "21st"', () => {
      const result = detectOrdinalIntent('Select the 21st item');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(21);
    });

    test('detects "22nd"', () => {
      const result = detectOrdinalIntent('Click the 22nd result');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(22);
    });

    test('detects "33rd"', () => {
      const result = detectOrdinalIntent('Choose the 33rd option');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(33);
    });

    test('detects "100th"', () => {
      const result = detectOrdinalIntent('Select the 100th item');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(100);
    });
  });

  describe('hash numbers', () => {
    test('detects "#1"', () => {
      const result = detectOrdinalIntent('Click item #1');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(1);
    });

    test('detects "#3"', () => {
      const result = detectOrdinalIntent('Select result #3');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(3);
    });

    test('detects "#10"', () => {
      const result = detectOrdinalIntent('Choose option #10');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(10);
    });
  });

  describe('labeled numbers', () => {
    test('detects "item 5"', () => {
      const result = detectOrdinalIntent('Click item 5');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(5);
    });

    test('detects "result 3"', () => {
      const result = detectOrdinalIntent('Select result 3');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(3);
    });

    test('detects "option 2"', () => {
      const result = detectOrdinalIntent('Choose option 2');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(2);
    });

    test('detects "number 4"', () => {
      const result = detectOrdinalIntent('Click number 4');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(4);
    });

    test('detects "choice 1"', () => {
      const result = detectOrdinalIntent('Select choice 1');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(1);
    });
  });

  describe('top/first keywords', () => {
    test('detects "top"', () => {
      const result = detectOrdinalIntent('Click the top result');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('first');
    });

    test('detects "TOP" (case insensitive)', () => {
      const result = detectOrdinalIntent('Click the TOP result');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('first');
    });
  });

  describe('top K', () => {
    test('detects "top 3"', () => {
      const result = detectOrdinalIntent('Select the top 3 items');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('top_k');
      expect(result.k).toBe(3);
    });

    test('detects "top 5"', () => {
      const result = detectOrdinalIntent('View top 5 results');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('top_k');
      expect(result.k).toBe(5);
    });

    test('detects "top 10"', () => {
      const result = detectOrdinalIntent('Show top 10 products');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('top_k');
      expect(result.k).toBe(10);
    });
  });

  describe('last keywords', () => {
    test('detects "last"', () => {
      const result = detectOrdinalIntent('Click the last item');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('last');
    });

    test('detects "final"', () => {
      const result = detectOrdinalIntent('Select the final option');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('last');
    });

    test('detects "bottom"', () => {
      const result = detectOrdinalIntent('Click the bottom result');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('last');
    });
  });

  describe('next keywords', () => {
    test('detects "next"', () => {
      const result = detectOrdinalIntent('Click the next button');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('next');
    });

    test('detects "following"', () => {
      const result = detectOrdinalIntent('Go to the following item');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('next');
    });
  });

  describe('previous keywords', () => {
    test('detects "previous"', () => {
      const result = detectOrdinalIntent('Click the previous button');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('previous');
    });

    test('detects "preceding"', () => {
      const result = detectOrdinalIntent('Go to the preceding item');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('previous');
    });

    test('detects "prior"', () => {
      const result = detectOrdinalIntent('Select the prior option');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('previous');
    });
  });

  describe('no ordinal intent', () => {
    test('returns not detected for regular click', () => {
      const result = detectOrdinalIntent('Click the submit button');
      expect(result.detected).toBe(false);
      expect(result.kind).toBeUndefined();
    });

    test('returns not detected for search', () => {
      const result = detectOrdinalIntent('Search for laptops');
      expect(result.detected).toBe(false);
    });

    test('returns not detected for type', () => {
      const result = detectOrdinalIntent('Type hello in the input');
      expect(result.detected).toBe(false);
    });

    test('returns not detected for empty string', () => {
      const result = detectOrdinalIntent('');
      expect(result.detected).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    test('detects "FIRST"', () => {
      const result = detectOrdinalIntent('Click the FIRST result');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('nth');
      expect(result.n).toBe(1);
    });

    test('detects "LAST"', () => {
      const result = detectOrdinalIntent('Select the LAST item');
      expect(result.detected).toBe(true);
      expect(result.kind).toBe('last');
    });
  });
});

describe('selectByOrdinal', () => {
  const elements: Element[] = [
    makeElement(1, 'Item A', 'x100-w200-h40', 0),
    makeElement(2, 'Item B', 'x100-w200-h40', 1),
    makeElement(3, 'Item C', 'x100-w200-h40', 2),
    makeElement(4, 'Item D', 'x100-w200-h40', 3),
    makeElement(5, 'Item E', 'x100-w200-h40', 4),
    makeElement(6, 'Other', 'x500-w100-h30', 0), // Different group
  ];

  test('selects first element', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'first' };
    const result = selectByOrdinal(elements, 'x100-w200-h40', intent);
    expect(result).not.toBeNull();
    expect((result as Element).id).toBe(1);
    expect((result as Element).text).toBe('Item A');
  });

  test('selects nth element (2)', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'nth', n: 2 };
    const result = selectByOrdinal(elements, 'x100-w200-h40', intent);
    expect(result).not.toBeNull();
    expect((result as Element).id).toBe(2);
    expect((result as Element).text).toBe('Item B');
  });

  test('selects nth element (5)', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'nth', n: 5 };
    const result = selectByOrdinal(elements, 'x100-w200-h40', intent);
    expect(result).not.toBeNull();
    expect((result as Element).id).toBe(5);
    expect((result as Element).text).toBe('Item E');
  });

  test('selects last element', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'last' };
    const result = selectByOrdinal(elements, 'x100-w200-h40', intent);
    expect(result).not.toBeNull();
    expect((result as Element).id).toBe(5);
    expect((result as Element).text).toBe('Item E');
  });

  test('selects top k elements', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'top_k', k: 3 };
    const result = selectByOrdinal(elements, 'x100-w200-h40', intent);
    expect(Array.isArray(result)).toBe(true);
    expect((result as Element[]).length).toBe(3);
    expect((result as Element[]).map(e => e.id)).toEqual([1, 2, 3]);
  });

  test('returns null for out of bounds', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'nth', n: 100 };
    const result = selectByOrdinal(elements, 'x100-w200-h40', intent);
    expect(result).toBeNull();
  });

  test('handles null dominant group key', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'first' };
    const result = selectByOrdinal(elements, null, intent);
    // Should fall back to all elements sorted by group_index
    expect(result).not.toBeNull();
  });

  test('returns null when not detected', () => {
    const intent: OrdinalIntent = { detected: false };
    const result = selectByOrdinal(elements, 'x100-w200-h40', intent);
    expect(result).toBeNull();
  });
});

describe('boostOrdinalElements', () => {
  const elements: Element[] = [
    makeElement(1, 'Item A', 'x100-w200-h40', 0, 100),
    makeElement(2, 'Item B', 'x100-w200-h40', 1, 90),
    makeElement(3, 'Item C', 'x100-w200-h40', 2, 80),
    makeElement(4, 'Item D', 'x100-w200-h40', 3, 70),
    makeElement(5, 'Other', 'x500-w100-h30', 0, 200),
  ];

  test('boosts first element', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'first' };
    const result = boostOrdinalElements(elements, 'x100-w200-h40', intent, 10000);

    const boosted = result.find((e: Element) => e.id === 1)!;
    expect(boosted.importance).toBe(100 + 10000);

    const other = result.find((e: Element) => e.id === 2)!;
    expect(other.importance).toBe(90);
  });

  test('boosts nth element', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'nth', n: 3 };
    const result = boostOrdinalElements(elements, 'x100-w200-h40', intent, 5000);

    const boosted = result.find((e: Element) => e.id === 3)!;
    expect(boosted.importance).toBe(80 + 5000);
  });

  test('boosts last element', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'last' };
    const result = boostOrdinalElements(elements, 'x100-w200-h40', intent, 10000);

    const boosted = result.find((e: Element) => e.id === 4)!;
    expect(boosted.importance).toBe(70 + 10000);
  });

  test('boosts top k elements', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'top_k', k: 2 };
    const result = boostOrdinalElements(elements, 'x100-w200-h40', intent, 10000);

    const first = result.find((e: Element) => e.id === 1)!;
    const second = result.find((e: Element) => e.id === 2)!;
    const third = result.find((e: Element) => e.id === 3)!;

    expect(first.importance).toBe(100 + 10000);
    expect(second.importance).toBe(90 + 10000);
    expect(third.importance).toBe(80); // Not boosted
  });

  test('no boost when not detected', () => {
    const intent: OrdinalIntent = { detected: false };
    const result = boostOrdinalElements(elements, 'x100-w200-h40', intent);

    for (let i = 0; i < elements.length; i++) {
      expect(result[i].importance).toBe(elements[i].importance);
    }
  });

  test('returns copy without modifying original', () => {
    const intent: OrdinalIntent = { detected: true, kind: 'first' };
    const result = boostOrdinalElements(elements, 'x100-w200-h40', intent);

    expect(elements[0].importance).toBe(100); // Original unchanged
  });
});
