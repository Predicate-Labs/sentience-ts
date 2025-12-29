/**
 * Text Search Demo - Using findTextRect() to locate elements by visible text
 *
 * This example demonstrates how to:
 * 1. Find text on a webpage and get exact pixel coordinates
 * 2. Use case-sensitive and whole-word matching options
 * 3. Click on found text using clickRect()
 * 4. Handle multiple matches and filter by viewport visibility
 */

import { SentienceBrowser, findTextRect, clickRect } from '../src';

async function main() {
  const browser = new SentienceBrowser();
  await browser.start();

  const page = browser.getPage();

  // Navigate to a search page
  await page.goto('https://www.google.com');
  await page.waitForLoadState('networkidle');

  console.log('\n' + '='.repeat(60));
  console.log('Text Search Demo');
  console.log('='.repeat(60) + '\n');

  // Example 1: Simple text search
  console.log('Example 1: Finding "Google Search" button');
  console.log('-'.repeat(60));
  let result = await findTextRect(page, 'Google Search');

  if (result.status === 'success' && result.results) {
    console.log(`✓ Found ${result.matches} match(es) for '${result.query}'`);
    for (let i = 0; i < Math.min(3, result.results.length); i++) {
      const match = result.results[i];
      console.log(`\nMatch ${i + 1}:`);
      console.log(`  Text: '${match.text}'`);
      console.log(`  Position: (${match.rect.x.toFixed(1)}, ${match.rect.y.toFixed(1)})`);
      console.log(`  Size: ${match.rect.width.toFixed(1)}x${match.rect.height.toFixed(1)} pixels`);
      console.log(`  In viewport: ${match.in_viewport}`);
      console.log(
        `  Context: ...${match.context.before}[${match.text}]${match.context.after}...`
      );
    }
  } else {
    console.log(`✗ Search failed: ${result.error}`);
  }

  // Example 2: Find and click search box (using simple string syntax)
  console.log('\n\nExample 2: Finding and clicking the search box');
  console.log('-'.repeat(60));
  result = await findTextRect(page, {
    text: 'Search',
    maxResults: 5
  });

  if (result.status === 'success' && result.results) {
    // Find the first visible match
    for (const match of result.results) {
      if (match.in_viewport) {
        console.log(`✓ Found visible match: '${match.text}'`);
        console.log(`  Clicking at (${match.rect.x.toFixed(1)}, ${match.rect.y.toFixed(1)})`);

        // Click in the center of the text
        const clickResult = await clickRect(browser, {
          x: match.rect.x,
          y: match.rect.y,
          w: match.rect.width,
          h: match.rect.height
        });

        if (clickResult.success) {
          console.log(`  ✓ Click successful!`);
        }
        break;
      }
    }
  }

  // Example 3: Case-sensitive search
  console.log('\n\nExample 3: Case-sensitive search for "GOOGLE"');
  console.log('-'.repeat(60));
  const resultInsensitive = await findTextRect(page, {
    text: 'GOOGLE',
    caseSensitive: false
  });
  const resultSensitive = await findTextRect(page, {
    text: 'GOOGLE',
    caseSensitive: true
  });

  console.log(`Case-insensitive search: ${resultInsensitive.matches || 0} matches`);
  console.log(`Case-sensitive search: ${resultSensitive.matches || 0} matches`);

  // Example 4: Whole word search
  console.log('\n\nExample 4: Whole word search');
  console.log('-'.repeat(60));
  const resultPartial = await findTextRect(page, {
    text: 'Search',
    wholeWord: false
  });
  const resultWhole = await findTextRect(page, {
    text: 'Search',
    wholeWord: true
  });

  console.log(`Partial word match: ${resultPartial.matches || 0} matches`);
  console.log(`Whole word only: ${resultWhole.matches || 0} matches`);

  // Example 5: Get viewport information
  console.log('\n\nExample 5: Viewport and scroll information');
  console.log('-'.repeat(60));
  result = await findTextRect(page, 'Google');
  if (result.status === 'success' && result.viewport) {
    console.log(`Viewport size: ${result.viewport.width}x${result.viewport.height}`);
    if ('scroll_x' in result.viewport && 'scroll_y' in result.viewport) {
      console.log(`Scroll position: (${result.viewport.scroll_x}, ${result.viewport.scroll_y})`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Demo complete!');
  console.log('='.repeat(60) + '\n');

  await browser.close();
}

main().catch(console.error);
