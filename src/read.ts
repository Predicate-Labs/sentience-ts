/**
 * Read page content - supports raw HTML, text, and markdown formats
 */

import { ZodTypeAny } from 'zod';
import { SentienceBrowser } from './browser';
import TurndownService from 'turndown';
import { BrowserEvaluator } from './utils/browser-evaluator';
import { LLMProvider } from './llm-provider';
import type { ExtractResult } from './types';
import { zodToJsonSchema } from './utils/zod';

export interface ReadOptions {
  format?: 'raw' | 'text' | 'markdown';
  enhanceMarkdown?: boolean;
}

export interface ReadResult {
  status: 'success' | 'error';
  url: string;
  format: 'raw' | 'text' | 'markdown';
  content: string;
  length: number;
  error?: string;
}

function extractJsonPayload(text: string): Record<string, any> {
  const fenced = text.match(/```json\s*(\{[\s\S]*?\})\s*```/i);
  if (fenced && fenced[1]) {
    return JSON.parse(fenced[1]);
  }
  const inline = text.match(/(\{[\s\S]*\})/);
  if (inline && inline[1]) {
    return JSON.parse(inline[1]);
  }
  return JSON.parse(text);
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
  if (!page) {
    throw new Error('Browser not started. Call start() first.');
  }
  const format = options.format || 'raw'; // Default to 'raw' for Turndown compatibility
  const enhanceMarkdown = options.enhanceMarkdown !== false; // Default to true

  if (format === 'markdown' && enhanceMarkdown) {
    // Get raw HTML from the extension first
    const rawHtmlResult = (await BrowserEvaluator.evaluate(
      page,
      opts => (window as any).sentience.read(opts),
      { format: 'raw' }
    )) as ReadResult;

    if (rawHtmlResult.status === 'success') {
      const htmlContent = rawHtmlResult.content;
      try {
        const turndownService = new TurndownService({
          headingStyle: 'atx',
          hr: '---',
          bulletListMarker: '-',
          codeBlockStyle: 'fenced',
          emDelimiter: '*',
        });

        // Add custom rules for better markdown
        turndownService.addRule('strikethrough', {
          filter: node => ['s', 'del', 'strike'].includes(node.nodeName.toLowerCase()),
          replacement: function (content) {
            return '~~' + content + '~~';
          },
        });

        // Optionally strip certain tags entirely
        turndownService.remove(['script', 'style', 'noscript', 'iframe'] as any);

        const markdownContent = turndownService.turndown(htmlContent);
        return {
          status: 'success',
          url: rawHtmlResult.url,
          format: 'markdown',
          content: markdownContent,
          length: markdownContent.length,
        };
      } catch (e: any) {
        console.warn(
          `Turndown conversion failed: ${e.message}, falling back to extension's markdown.`
        );
        // Fallback to extension's markdown if Turndown fails
      }
    } else {
      console.warn(
        `Failed to get raw HTML from extension: ${rawHtmlResult.error}, falling back to extension's markdown.`
      );
      // Fallback to extension's markdown if getting raw HTML fails
    }
  }

  // If not enhanced markdown, or fallback, call extension with requested format
  const result = (await BrowserEvaluator.evaluate(
    page,
    opts => (window as any).sentience.read(opts),
    { format }
  )) as ReadResult;

  return result;
}

/**
 * Extract structured data from the current page using read() markdown + LLM.
 */
export async function extract(
  browser: SentienceBrowser,
  llm: LLMProvider,
  query: string,
  schema?: ZodTypeAny,
  maxChars: number = 12000
): Promise<ExtractResult> {
  const result = await read(browser, { format: 'markdown', enhanceMarkdown: true });
  if (result.status !== 'success') {
    return { ok: false, error: result.error ?? 'read failed' };
  }

  const content = result.content.slice(0, maxChars);
  const schemaDesc = schema ? JSON.stringify(zodToJsonSchema(schema)) : '';
  const system = 'You extract structured data from markdown content. Return only JSON. No prose.';
  const user = `QUERY:\n${query}\n\nSCHEMA:\n${schemaDesc}\n\nCONTENT:\n${content}`;
  const response = await llm.generate(system, user);
  const raw = response.content.trim();

  if (!schema) {
    return { ok: true, data: { text: raw }, raw };
  }

  try {
    const payload = extractJsonPayload(raw);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.message, raw };
    }
    return { ok: true, data: parsed.data, raw };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err), raw };
  }
}
