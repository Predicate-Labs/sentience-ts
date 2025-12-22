/**
 * Read page content - supports raw HTML, text, and markdown formats
 */

import { SentienceBrowser } from './browser';
import TurndownService from 'turndown';

export interface ReadOptions {
  format?: 'raw' | 'text' | 'markdown';
}

export interface ReadResult {
  status: 'success' | 'error';
  url: string;
  format: 'raw' | 'text' | 'markdown';
  content: string;
  length: number;
  error?: string;
}

/**
 * Read page content as raw HTML, text, or markdown
 *
 * @param browser - SentienceBrowser instance
 * @param options - Read options
 * @returns ReadResult with page content
 *
 * @example
 * // Get raw HTML (default)
 * const result = await read(browser);
 * const htmlContent = result.content;
 *
 * @example
 * // Get high-quality markdown (uses Turndown internally)
 * const result = await read(browser, { format: 'markdown' });
 * const markdown = result.content;
 *
 * @example
 * // Get plain text
 * const result = await read(browser, { format: 'text' });
 * const text = result.content;
 */
export async function read(
  browser: SentienceBrowser,
  options: ReadOptions = {}
): Promise<ReadResult> {
  const page = browser.getPage();
  const format = options.format || 'raw'; // Default to 'raw' for Turndown compatibility

  // For markdown format, get raw HTML first, then convert with Turndown
  if (format === 'markdown') {
    // Get raw HTML from extension
    const rawResult = (await page.evaluate(
      (opts) => {
        return (window as any).sentience.read(opts);
      },
      { format: 'raw' }
    )) as ReadResult;

    if (rawResult.status !== 'success') {
      return rawResult;
    }

    // Convert to markdown using Turndown
    try {
      const turndownService = new TurndownService({
        headingStyle: 'atx', // Use # for headings
        bulletListMarker: '-', // Use - for lists
        codeBlockStyle: 'fenced', // Use ``` for code blocks
      });

      // Add custom rules for better conversion
      turndownService.addRule('strikethrough', {
        filter: ['del', 's', 'strike'] as any,
        replacement: (content: string) => `~~${content}~~`,
      });

      // Strip unwanted tags
      turndownService.remove(['script', 'style', 'nav', 'footer', 'header', 'noscript']);

      const htmlContent = rawResult.content;
      const markdownContent = turndownService.turndown(htmlContent);

      // Return result with markdown content
      return {
        status: 'success',
        url: rawResult.url,
        format: 'markdown',
        content: markdownContent,
        length: markdownContent.length,
      };
    } catch (e) {
      // If conversion fails, return error
      return {
        status: 'error',
        url: rawResult.url,
        format: 'markdown',
        content: '',
        length: 0,
        error: `Markdown conversion failed: ${e}`,
      };
    }
  } else {
    // For "raw" or "text", call extension directly
    const result = (await page.evaluate(
      (opts) => {
        return (window as any).sentience.read(opts);
      },
      { format }
    )) as ReadResult;

    return result;
  }
}
