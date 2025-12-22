/**
 * Read page content - enhanced markdown conversion
 */

import { SentienceBrowser } from './browser';
import TurndownService from 'turndown';

export interface ReadOptions {
  format?: 'text' | 'markdown';
  enhance_markdown?: boolean;
}

export interface ReadResult {
  status: 'success' | 'error';
  url: string;
  format: 'text' | 'markdown';
  content: string;
  length: number;
  error?: string;
}

/**
 * Read page content as text or markdown
 *
 * @param browser - SentienceBrowser instance
 * @param options - Read options
 * @returns ReadResult with page content
 */
export async function read(
  browser: SentienceBrowser,
  options: ReadOptions = {}
): Promise<ReadResult> {
  const page = browser.getPage();
  const format = options.format || 'text';
  const enhanceMarkdown = options.enhance_markdown !== false; // Default to true

  // Get basic content from extension
  const result = (await page.evaluate(
    (opts) => {
      return (window as any).sentience.read(opts);
    },
    { format }
  )) as ReadResult;

  // Enhance markdown if requested and format is markdown
  if (format === 'markdown' && enhanceMarkdown && result.status === 'success') {
    try {
      // Get full HTML from page
      const htmlContent = await page.evaluate(
        () => document.documentElement.outerHTML
      );

      // Use turndown for better conversion
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

      const enhancedMarkdown = turndownService.turndown(htmlContent);
      result.content = enhancedMarkdown;
      result.length = enhancedMarkdown.length;
    } catch (e) {
      // If enhancement fails, use extension's result
      result.error = `Markdown enhancement failed: ${e}`;
    }
  }

  return result;
}

