/**
 * Day 5-6 Example: Wait for element and click
 */

import { SentienceBrowser, snapshot, find, waitFor, click, expect } from '../src/index';

async function main() {
  const browser = new SentienceBrowser(undefined, false);
  
  try {
    await browser.start();
    
    // Navigate to example.com
    await browser.getPage().goto('https://example.com');
    await browser.getPage().waitForLoadState('networkidle');
    
    // Take initial snapshot
    const snap = await snapshot(browser);
    
    // Find a link
    const link = find(snap, 'role=link');
    
    if (link) {
      console.log(`Found link: ${link.text} (id: ${link.id})`);
      
      // Click it
      const result = await click(browser, link.id);
      console.log(`Click result: success=${result.success}, outcome=${result.outcome}`);
      
      // Wait for navigation
      await browser.getPage().waitForLoadState('networkidle');
      console.log(`New URL: ${browser.getPage().url()}`);
    } else {
      console.log('No link found');
    }
    
    // Example: Wait for element using waitFor
    console.log('\n=== Wait Example ===');
    await browser.getPage().goto('https://example.com');
    await browser.getPage().waitForLoadState('networkidle');
    
    const waitResult = await waitFor(browser, 'role=link', 5000);
    if (waitResult.found) {
      console.log(`✅ Found element after ${waitResult.duration_ms}ms`);
    } else {
      console.log(`❌ Element not found (timeout: ${waitResult.timeout})`);
    }
    
    // Example: Expect assertion
    console.log('\n=== Expect Example ===');
    try {
      const element = await expect(browser, 'role=link').toExist(5000);
      console.log(`✅ Element exists: ${element.text}`);
    } catch (e: any) {
      console.log(`❌ Assertion failed: ${e.message}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

