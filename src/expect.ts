/**
 * Expect/Assert functionality
 */

import { SentienceBrowser } from './browser';
import { Element, QuerySelector } from './types';
import { waitFor } from './wait';
import { query } from './query';
import { snapshot } from './snapshot';

export class Expectation {
  constructor(
    private browser: SentienceBrowser,
    private selector: QuerySelector
  ) {}

  async toBeVisible(timeout: number = 10000): Promise<Element> {
    const result = await waitFor(this.browser, this.selector, timeout);

    if (!result.found) {
      throw new Error(
        `Element not found: ${this.selector} (timeout: ${timeout}ms)`
      );
    }

    const element = result.element!;
    if (!element.in_viewport) {
      throw new Error(
        `Element found but not visible in viewport: ${this.selector}`
      );
    }

    return element;
  }

  async toExist(timeout: number = 10000): Promise<Element> {
    const result = await waitFor(this.browser, this.selector, timeout);

    if (!result.found) {
      throw new Error(
        `Element does not exist: ${this.selector} (timeout: ${timeout}ms)`
      );
    }

    return result.element!;
  }

  async toHaveText(expectedText: string, timeout: number = 10000): Promise<Element> {
    const result = await waitFor(this.browser, this.selector, timeout);

    if (!result.found) {
      throw new Error(
        `Element not found: ${this.selector} (timeout: ${timeout}ms)`
      );
    }

    const element = result.element!;
    if (!element.text || !element.text.includes(expectedText)) {
      throw new Error(
        `Element text mismatch. Expected '${expectedText}', got '${element.text}'`
      );
    }

    return element;
  }

  async toHaveCount(expectedCount: number, timeout: number = 10000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const snap = await snapshot(this.browser);
      const matches = query(snap, this.selector);

      if (matches.length === expectedCount) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // Final check
    const snap = await snapshot(this.browser);
    const matches = query(snap, this.selector);
    const actualCount = matches.length;

    throw new Error(
      `Element count mismatch. Expected ${expectedCount}, got ${actualCount}`
    );
  }
}

export function expect(browser: SentienceBrowser, selector: QuerySelector): Expectation {
  return new Expectation(browser, selector);
}



