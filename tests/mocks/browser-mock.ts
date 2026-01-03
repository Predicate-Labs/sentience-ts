/**
 * Mock implementations for testing
 *
 * Provides mock implementations of IBrowser and IPage interfaces
 * for unit testing without requiring real browser instances
 */

import { IBrowser, IPage } from '../../src/protocols/browser-protocol';
import { Snapshot, SnapshotOptions } from '../../src/types';
import { Page } from 'playwright';

/**
 * Mock implementation of IPage interface
 */
export class MockPage implements IPage {
  private _url: string = 'https://example.com';
  public evaluateCalls: Array<{ script: string | Function; args: any[] }> = [];
  public gotoCalls: Array<{ url: string; options?: any }> = [];
  public waitForFunctionCalls: Array<{ fn: () => boolean | Promise<boolean>; options?: any }> = [];
  public waitForTimeoutCalls: number[] = [];
  public mouseClickCalls: Array<{ x: number; y: number }> = [];
  public keyboardTypeCalls: string[] = [];
  public keyboardPressCalls: string[] = [];

  constructor(url?: string) {
    if (url) {
      this._url = url;
    }
  }

  async evaluate<T>(script: string | ((...args: any[]) => T), ...args: any[]): Promise<T> {
    this.evaluateCalls.push({ script, args });

    // Default mock behavior - return empty object for snapshot calls
    if (typeof script === 'function') {
      try {
        return script(...args) as T;
      } catch {
        return {} as T;
      }
    }

    // For string scripts, try to execute them (simplified)
    if (typeof script === 'string' && script.includes('snapshot')) {
      return {
        status: 'success',
        url: this._url,
        elements: [],
        timestamp: new Date().toISOString(),
      } as T;
    }

    return {} as T;
  }

  url(): string {
    return this._url;
  }

  async goto(url: string, options?: any): Promise<any> {
    this.gotoCalls.push({ url, options });
    this._url = url;
    return null;
  }

  async waitForFunction(fn: () => boolean | Promise<boolean>, options?: any): Promise<void> {
    this.waitForFunctionCalls.push({ fn, options });
    // Mock implementation - assume condition is met
    return Promise.resolve();
  }

  async waitForTimeout(ms: number): Promise<void> {
    this.waitForTimeoutCalls.push(ms);
    return Promise.resolve();
  }

  mouse = {
    click: async (x: number, y: number): Promise<void> => {
      this.mouseClickCalls.push({ x, y });
    },
  };

  keyboard = {
    type: async (text: string): Promise<void> => {
      this.keyboardTypeCalls.push(text);
    },
    press: async (key: string): Promise<void> => {
      this.keyboardPressCalls.push(key);
    },
  };
}

/**
 * Mock implementation of IBrowser interface
 */
export class MockBrowser implements IBrowser {
  private mockPage: MockPage;
  private _apiKey?: string;
  private _apiUrl?: string;

  constructor(apiKey?: string, apiUrl?: string) {
    this.mockPage = new MockPage();
    this._apiKey = apiKey;
    this._apiUrl = apiUrl;
  }

  async goto(url: string): Promise<void> {
    await this.mockPage.goto(url);
  }

  async snapshot(options?: SnapshotOptions): Promise<Snapshot> {
    // Mock snapshot - return empty snapshot
    return {
      status: 'success',
      url: this.mockPage.url(),
      elements: [],
      timestamp: new Date().toISOString(),
    };
  }

  getPage(): Page | null {
    return this.mockPage as any;
  }

  getContext(): any | null {
    return null;
  }

  getApiKey(): string | undefined {
    return this._apiKey;
  }

  getApiUrl(): string | undefined {
    return this._apiUrl;
  }

  /**
   * Get the mock page for test assertions
   */
  getMockPage(): MockPage {
    return this.mockPage;
  }
}
