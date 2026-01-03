/**
 * Browser Protocol Interfaces for Testability
 *
 * These interfaces allow classes to depend on abstractions rather than concrete implementations,
 * making them easier to test with mocks.
 */

import { Page } from 'playwright';
import { Snapshot } from '../types';
import { SnapshotOptions } from '../snapshot';

/**
 * Interface for browser operations
 * Allows mocking SentienceBrowser for testing
 */
export interface IBrowser {
  /**
   * Navigate to a URL
   */
  goto(url: string): Promise<void>;

  /**
   * Take a snapshot of the current page
   */
  snapshot(options?: SnapshotOptions): Promise<Snapshot>;

  /**
   * Get the underlying Playwright Page object
   */
  getPage(): Page | null;

  /**
   * Get the browser context
   */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  getContext(): any | null;

  /**
   * Get API key if configured
   */
  getApiKey(): string | undefined;

  /**
   * Get API URL if configured
   */
  getApiUrl(): string | undefined;
}

/**
 * Interface for page operations
 * Allows mocking Playwright Page for testing
 */
export interface IPage {
  /**
   * Evaluate JavaScript in the page context
   */

  evaluate<T>(script: string | ((...args: any[]) => T), ...args: any[]): Promise<T>;

  /**
   * Get current page URL
   */
  url(): string;

  /**
   * Navigate to a URL
   */
  goto(url: string, options?: any): Promise<any>;

  /**
   * Wait for a function to return truthy value
   */
  waitForFunction(fn: () => boolean | Promise<boolean>, options?: any): Promise<void>;

  /**
   * Wait for timeout
   */
  waitForTimeout(ms: number): Promise<void>;

  /**
   * Get page mouse
   */
  mouse: {
    click(x: number, y: number): Promise<void>;
  };

  /**
   * Get page keyboard
   */
  keyboard: {
    type(text: string): Promise<void>;
    press(key: string): Promise<void>;
  };
}
