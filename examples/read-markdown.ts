/**
 * Example: Reading page content and converting to markdown
 *
 * This example shows how to use the read() function to get page content
 * and convert it to high-quality markdown using Turndown.
 */

import { SentienceBrowser, read } from '../src';
import TurndownService from 'turndown';

async function main() {
  // Initialize browser
  const browser = new SentienceBrowser();
  await browser.start();

  try {
    // Navigate to a page
    await browser.getPage().goto('https://example.com');
    await browser.getPage().waitForLoadState('networkidle');

    // Method 1: Get raw HTML (default) and convert with Turndown
    console.log('=== Method 1: Raw HTML + Turndown (Recommended) ===');
    const result = await read(browser); // format="raw" is default
    const htmlContent = result.content;

    // Convert to markdown using Turndown (better quality)
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

    const markdown = turndownService.turndown(htmlContent);
    console.log(`Markdown length: ${markdown.length} characters`);
    console.log(markdown.substring(0, 500)); // Print first 500 chars
    console.log('\n');

    // Method 2: Get high-quality markdown directly (uses Turndown internally)
    console.log('=== Method 2: Direct markdown (High-quality via Turndown) ===');
    const result2 = await read(browser, { format: 'markdown' });
    const highQualityMarkdown = result2.content;
    console.log(`Markdown length: ${highQualityMarkdown.length} characters`);
    console.log(highQualityMarkdown.substring(0, 500)); // Print first 500 chars
    console.log('\n');

    // Method 3: Get plain text
    console.log('=== Method 3: Plain text ===');
    const result3 = await read(browser, { format: 'text' });
    const textContent = result3.content;
    console.log(`Text length: ${textContent.length} characters`);
    console.log(textContent.substring(0, 500)); // Print first 500 chars
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

