/**
 * Example: Basic snapshot functionality
 */

import { SentienceBrowser, snapshot } from '../src/index';
import * as fs from 'fs';

async function main() {
  // Get API key from environment variable (optional - uses free tier if not set)
  const apiKey = process.env.SENTIENCE_API_KEY as string | undefined;

  const browser = new SentienceBrowser(apiKey, undefined, false);
  
  try {
    await browser.start();
    
    // Navigate to a test page
    await browser.getPage().goto('https://example.com');
    await browser.getPage().waitForLoadState('networkidle');
    
    // Take snapshot
    const snap = await snapshot(browser);
    
    console.log(`Status: ${snap.status}`);
    console.log(`URL: ${snap.url}`);
    console.log(`Elements found: ${snap.elements.length}`);
    
    // Show top 5 elements
    console.log('\nTop 5 elements:');
    snap.elements.slice(0, 5).forEach((el, i) => {
      console.log(`${i + 1}. [${el.role}] ${el.text || '(no text)'} (importance: ${el.importance})`);
    });
    
    // Save snapshot
    fs.writeFileSync('snapshot_example.json', JSON.stringify(snap, null, 2));
    console.log('\n✅ Snapshot saved to snapshot_example.json');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

