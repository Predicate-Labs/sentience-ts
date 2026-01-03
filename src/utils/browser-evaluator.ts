/**
 * BrowserEvaluator - Common browser evaluation patterns with standardized error handling
 * 
 * This utility class extracts common page.evaluate() patterns to reduce code duplication
 * and provide consistent error handling across snapshot, actions, wait, and read modules.
 */

import { Page } from 'playwright';

export interface EvaluationOptions {
  timeout?: number;
  retries?: number;
  onError?: (error: Error) => void;
}

/**
 * BrowserEvaluator provides static methods for common browser evaluation patterns
 */
export class BrowserEvaluator {
  /**
   * Execute a browser evaluation script with standardized error handling
   * 
   * @param page - Playwright Page instance
   * @param script - Function to execute in browser context
   * @param args - Arguments to pass to the script
   * @param options - Evaluation options (timeout, retries, error handler)
   * @returns Promise resolving to the evaluation result
   * 
   * @example
   * ```typescript
   * const result = await BrowserEvaluator.evaluate(
   *   page,
   *   (opts) => (window as any).sentience.snapshot(opts),
   *   { limit: 50 }
   * );
   * ```
   */
  static async evaluate<T>(
    page: Page,
    script: (args: any) => T | Promise<T>,
    args?: any,
    options: EvaluationOptions = {}
  ): Promise<T> {
    const { timeout, retries = 0, onError } = options;
    
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (timeout) {
          return await Promise.race([
            page.evaluate(script, args),
            new Promise<T>((_, reject) => 
              setTimeout(() => reject(new Error(`Evaluation timeout after ${timeout}ms`)), timeout)
            )
          ]);
        }
        return await page.evaluate(script, args);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Call custom error handler if provided
        if (onError) {
          onError(lastError);
        }
        
        // If this was the last retry, throw the error
        if (attempt === retries) {
          throw new Error(`Browser evaluation failed after ${retries + 1} attempt(s): ${lastError.message}`);
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    }
    
    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Browser evaluation failed');
  }

  /**
   * Execute a browser evaluation with navigation-aware error handling
   * Navigation may destroy the context, so we handle that gracefully
   * 
   * @param page - Playwright Page instance
   * @param script - Function to execute in browser context
   * @param args - Arguments to pass to the script
   * @param fallbackValue - Value to return if evaluation fails due to navigation
   * @returns Promise resolving to the evaluation result or fallback value
   * 
   * @example
   * ```typescript
   * const success = await BrowserEvaluator.evaluateWithNavigationFallback(
   *   page,
   *   (id) => (window as any).sentience.click(id),
   *   elementId,
   *   true // Assume success if navigation destroyed context
   * );
   * ```
   */
  static async evaluateWithNavigationFallback<T>(
    page: Page,
    script: (args: any) => T | Promise<T>,
    args?: any,
    fallbackValue?: T
  ): Promise<T> {
    try {
      return await page.evaluate(script, args);
    } catch (error) {
      // Navigation might have destroyed context, return fallback if provided
      if (fallbackValue !== undefined) {
        return fallbackValue;
      }
      // Otherwise rethrow
      throw error;
    }
  }

  /**
   * Wait for a condition in the browser context with timeout
   * 
   * @param page - Playwright Page instance
   * @param condition - Function that returns a truthy value when condition is met
   * @param timeout - Maximum time to wait in milliseconds
   * @returns Promise resolving when condition is met
   * 
   * @example
   * ```typescript
   * await BrowserEvaluator.waitForCondition(
   *   page,
   *   () => typeof (window as any).sentience !== 'undefined',
   *   5000
   * );
   * ```
   */
  static async waitForCondition(
    page: Page,
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000
  ): Promise<void> {
    try {
      await page.waitForFunction(condition, { timeout });
    } catch (error) {
      // Gather diagnostics if wait fails
      const diag = await this.evaluateWithNavigationFallback(
        page,
        () => ({
          sentience_defined: typeof (window as any).sentience !== 'undefined',
          extension_id: document.documentElement.dataset.sentienceExtensionId || 'not set',
          url: window.location.href
        }),
        undefined,
        { error: 'Could not gather diagnostics' }
      );
      
      throw new Error(
        `Condition wait failed after ${timeout}ms. ` +
        `Diagnostics: ${JSON.stringify(diag)}`
      );
    }
  }
}

