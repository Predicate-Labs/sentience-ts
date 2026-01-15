/**
 * Tests for verification module - assertion predicates for agent loops.
 */

import {
  AssertContext,
  AssertOutcome,
  Predicate,
  urlMatches,
  urlContains,
  exists,
  notExists,
  elementCount,
  allOf,
  anyOf,
  custom,
  isEnabled,
  isDisabled,
  isChecked,
  isUnchecked,
  valueEquals,
  valueContains,
  isExpanded,
  isCollapsed,
} from '../src/verification';
import { Snapshot, Element, BBox, Viewport, VisualCues } from '../src/types';

/**
 * Helper to create test elements.
 */
function makeElement(
  id: number,
  role: string = 'button',
  text?: string | null,
  importance: number = 100
): Element {
  return {
    id,
    role,
    text: text ?? undefined,
    importance,
    bbox: { x: 0, y: 0, width: 100, height: 50 } as BBox,
    visual_cues: {
      is_primary: false,
      is_clickable: true,
      background_color_name: null,
    } as VisualCues,
  } as Element;
}

/**
 * Helper to create test snapshots.
 */
function makeSnapshot(elements: Element[], url: string = 'https://example.com'): Snapshot {
  return {
    status: 'success',
    url,
    elements,
    viewport: { width: 1920, height: 1080 } as Viewport,
  } as Snapshot;
}

describe('urlMatches', () => {
  it('matches string pattern', () => {
    const pred = urlMatches('/search\\?q=');
    const ctx: AssertContext = {
      snapshot: null,
      url: 'https://example.com/search?q=shoes',
      stepId: null,
    };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
    expect(outcome.reason).toBe('');
  });

  it('matches regex pattern', () => {
    const pred = urlMatches(/\/search\?q=/);
    const ctx: AssertContext = {
      snapshot: null,
      url: 'https://example.com/search?q=shoes',
      stepId: null,
    };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
  });

  it('returns false when no match', () => {
    const pred = urlMatches('/cart');
    const ctx: AssertContext = {
      snapshot: null,
      url: 'https://example.com/search?q=shoes',
      stepId: null,
    };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('did not match');
  });

  it('handles null url', () => {
    const pred = urlMatches('/search');
    const ctx: AssertContext = { snapshot: null, url: null, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
  });

  it('includes pattern and url in details', () => {
    const pred = urlMatches('/test');
    const ctx: AssertContext = { snapshot: null, url: 'https://example.com/test', stepId: null };
    const outcome = pred(ctx);
    expect(outcome.details.pattern).toBe('/test');
    expect(outcome.details.url).toContain('example.com');
  });
});

describe('urlContains', () => {
  it('finds substring', () => {
    const pred = urlContains('/cart');
    const ctx: AssertContext = {
      snapshot: null,
      url: 'https://example.com/cart/checkout',
      stepId: null,
    };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
  });

  it('returns false when substring not found', () => {
    const pred = urlContains('/orders');
    const ctx: AssertContext = { snapshot: null, url: 'https://example.com/cart', stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('does not contain');
  });

  it('handles null url', () => {
    const pred = urlContains('/test');
    const ctx: AssertContext = { snapshot: null, url: null, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
  });
});

describe('exists', () => {
  it('finds element by role', () => {
    const elements = [makeElement(1, 'button', 'Click me')];
    const snap = makeSnapshot(elements);
    const pred = exists('role=button');
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
    expect(outcome.details.matched).toBe(1);
  });

  it('returns false when element not found', () => {
    const elements = [makeElement(1, 'button', 'Click me')];
    const snap = makeSnapshot(elements);
    const pred = exists('role=link');
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('no elements matched');
  });

  it('finds element by text', () => {
    const elements = [makeElement(1, 'button', 'Submit Form')];
    const snap = makeSnapshot(elements);
    const pred = exists("text~'Submit'");
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
  });

  it('handles null snapshot', () => {
    const pred = exists('role=button');
    const ctx: AssertContext = { snapshot: null, url: null, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('no snapshot available');
  });
});

describe('state-aware predicates', () => {
  it('isEnabled/isDisabled', () => {
    const el1 = { ...makeElement(1, 'button', 'Submit'), disabled: false } as Element;
    const el2 = { ...makeElement(2, 'button', 'Disabled'), disabled: true } as Element;
    const snap = makeSnapshot([el1, el2]);
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };

    expect(isEnabled('role=button')(ctx).passed).toBe(true);
    expect(isDisabled("text~'Disabled'")(ctx).passed).toBe(true);
  });

  it('isChecked/isUnchecked', () => {
    const el1 = { ...makeElement(1, 'checkbox', 'Opt in'), checked: true } as Element;
    const el2 = { ...makeElement(2, 'checkbox', 'Opt out'), checked: false } as Element;
    const snap = makeSnapshot([el1, el2]);
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };

    expect(isChecked("text~'Opt in'")(ctx).passed).toBe(true);
    expect(isUnchecked("text~'Opt out'")(ctx).passed).toBe(true);
  });

  it('valueEquals/valueContains', () => {
    const el = { ...makeElement(1, 'textbox', null), value: 'user@example.com' } as Element;
    const snap = makeSnapshot([el]);
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };

    expect(valueEquals('role=textbox', 'user@example.com')(ctx).passed).toBe(true);
    expect(valueContains('role=textbox', '@example.com')(ctx).passed).toBe(true);
  });

  it('isExpanded/isCollapsed', () => {
    const el1 = { ...makeElement(1, 'button', 'Menu'), expanded: true } as Element;
    const el2 = { ...makeElement(2, 'button', 'Details'), expanded: false } as Element;
    const snap = makeSnapshot([el1, el2]);
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };

    expect(isExpanded("text~'Menu'")(ctx).passed).toBe(true);
    expect(isCollapsed("text~'Details'")(ctx).passed).toBe(true);
  });
});

describe('notExists', () => {
  it('passes when element absent', () => {
    const elements = [makeElement(1, 'button')];
    const snap = makeSnapshot(elements);
    const pred = notExists("text~'Loading'");
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
  });

  it('fails when element present', () => {
    const elements = [makeElement(1, 'button', 'Loading...')];
    const snap = makeSnapshot(elements);
    const pred = notExists("text~'Loading'");
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('found 1 elements');
  });
});

describe('elementCount', () => {
  it('passes when min count satisfied', () => {
    const elements = [makeElement(0, 'button'), makeElement(1, 'button'), makeElement(2, 'button')];
    const snap = makeSnapshot(elements);
    const pred = elementCount('role=button', { minCount: 2 });
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
  });

  it('fails when min count not satisfied', () => {
    const elements = [makeElement(1, 'button')];
    const snap = makeSnapshot(elements);
    const pred = elementCount('role=button', { minCount: 5 });
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('expected at least 5');
  });

  it('passes when within min-max range', () => {
    const elements = [makeElement(0, 'button'), makeElement(1, 'button'), makeElement(2, 'button')];
    const snap = makeSnapshot(elements);
    const pred = elementCount('role=button', { minCount: 1, maxCount: 5 });
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
  });

  it('fails when max count exceeded', () => {
    const elements = Array.from({ length: 10 }, (_, i) => makeElement(i, 'button'));
    const snap = makeSnapshot(elements);
    const pred = elementCount('role=button', { minCount: 1, maxCount: 5 });
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('expected 1-5');
  });
});

describe('allOf', () => {
  it('passes when all predicates pass', () => {
    const elements = [makeElement(1, 'button', 'Checkout')];
    const snap = makeSnapshot(elements, 'https://example.com/cart');
    const pred = allOf(urlContains('/cart'), exists('role=button'));
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
    expect(outcome.details.failedCount).toBe(0);
  });

  it('fails when one predicate fails', () => {
    const elements = [makeElement(1, 'button')];
    const snap = makeSnapshot(elements, 'https://example.com/home');
    const pred = allOf(urlContains('/cart'), exists('role=button'));
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.details.failedCount).toBe(1);
  });

  it('fails when all predicates fail', () => {
    const elements = [makeElement(1, 'link')];
    const snap = makeSnapshot(elements, 'https://example.com/home');
    const pred = allOf(urlContains('/cart'), exists('role=button'));
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.details.failedCount).toBe(2);
  });
});

describe('anyOf', () => {
  it('passes when first predicate passes', () => {
    const elements = [makeElement(1, 'button', 'Success')];
    const snap = makeSnapshot(elements);
    const pred = anyOf(exists("text~'Success'"), exists("text~'Complete'"));
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
  });

  it('passes when second predicate passes', () => {
    const elements = [makeElement(1, 'button', 'Complete')];
    const snap = makeSnapshot(elements);
    const pred = anyOf(exists("text~'Success'"), exists("text~'Complete'"));
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
  });

  it('fails when no predicates pass', () => {
    const elements = [makeElement(1, 'button', 'Error')];
    const snap = makeSnapshot(elements);
    const pred = anyOf(exists("text~'Success'"), exists("text~'Complete'"));
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('none of 2 predicates passed');
  });
});

describe('custom', () => {
  it('passes when function returns true', () => {
    const pred = custom(ctx => ctx.url !== null, 'has_url');
    const ctx: AssertContext = { snapshot: null, url: 'https://example.com', stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
  });

  it('fails when function returns false', () => {
    const pred = custom(ctx => ctx.url === null, 'no_url');
    const ctx: AssertContext = { snapshot: null, url: 'https://example.com', stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('returned false');
  });

  it('can check snapshot data', () => {
    const elements = Array.from({ length: 15 }, (_, i) => makeElement(i, 'button'));
    const snap = makeSnapshot(elements);
    const pred = custom(
      ctx => ctx.snapshot !== null && ctx.snapshot.elements.length > 10,
      'has_many_elements'
    );
    const ctx: AssertContext = { snapshot: snap, url: snap.url, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(true);
  });

  it('handles exceptions gracefully', () => {
    const badCheck = (_ctx: AssertContext): boolean => {
      throw new Error('Something went wrong');
    };
    const pred = custom(badCheck, 'bad_check');
    const ctx: AssertContext = { snapshot: null, url: null, stepId: null };
    const outcome = pred(ctx);
    expect(outcome.passed).toBe(false);
    expect(outcome.reason).toContain('raised exception');
    expect(outcome.reason).toContain('Something went wrong');
  });
});
