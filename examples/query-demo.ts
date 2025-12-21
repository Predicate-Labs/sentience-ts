/**
 * Day 4 Example: Query engine demonstration
 */

import { SentienceBrowser, snapshot, query, find } from '../src/index';

async function main() {
  const browser = new SentienceBrowser(undefined, false);
  
  try {
    await browser.start();
    
    // Navigate to a page with links
    await browser.getPage().goto('https://example.com');
    await browser.getPage().waitForLoadState('networkidle');
    
    const snap = await snapshot(browser);
    
    // Query examples
    console.log('=== Query Examples ===\n');
    
    // Find all buttons
    const buttons = query(snap, 'role=button');
    console.log(`Found ${buttons.length} buttons`);
    
    // Find all links
    const links = query(snap, 'role=link');
    console.log(`Found ${links.length} links`);
    
    // Find clickable elements
    const clickables = query(snap, 'clickable=true');
    console.log(`Found ${clickables.length} clickable elements`);
    
    // Find element with text containing "More"
    const moreLink = find(snap, "text~'More'");
    if (moreLink) {
      console.log(`\nFound 'More' link: ${moreLink.text} (id: ${moreLink.id})`);
    } else {
      console.log('\nNo "More" link found');
    }
    
    // Complex query: clickable links
    const clickableLinks = query(snap, 'role=link clickable=true');
    console.log(`\nFound ${clickableLinks.length} clickable links`);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

