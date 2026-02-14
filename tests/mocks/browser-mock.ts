/**
 * Mock implementations for testing
 *
 * Provides mock implementations of IBrowser and IPage interfaces
 * for unit testing without requiring real browser instances
 */

import { IBrowser, IPage } from '../../src/protocols/browser-protocol';
import { Snapshot } from '../../src/types';
import { Page } from 'playwright';

/**
 * Mock implementation of IPage interface
 */
export class MockPage implements IPage {
  private _url: string = 'https://example.com';
  private _scrollTop: number = 0;
  public evaluateCalls: Array<{ script: string | Function; args: any[] }> = [];
  public gotoCalls: Array<{ url: string; options?: any }> = [];
  public waitForFunctionCalls: Array<{ fn: () => boolean | Promise<boolean>; options?: any }> = [];
  public waitForTimeoutCalls: number[] = [];
  public mouseClickCalls: Array<{ x: number; y: number }> = [];
  public mouseWheelCalls: Array<{ dx: number; dy: number }> = [];
  public keyboardTypeCalls: string[] = [];
  public keyboardPressCalls: string[] = [];
  public screenshotCalls: Array<{ options?: any }> = [];

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

    if (
      typeof script === 'string' &&
      (script.includes('scrollTop') || script.includes('scrollY'))
    ) {
      return this._scrollTop as any as T;
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
    wheel: async (dx: number, dy: number): Promise<void> => {
      this.mouseWheelCalls.push({ dx, dy });
      this._scrollTop += dy;
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

  // Playwright Page API (subset): used by vision fallback in AgentRuntime eventually()
  async screenshot(options?: any): Promise<Buffer> {
    this.screenshotCalls.push({ options });
    return Buffer.from('mock-png');
  }
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

  async snapshot(options?: any): Promise<Snapshot> {
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
