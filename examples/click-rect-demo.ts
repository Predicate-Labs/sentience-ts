/**
 * Example: Using clickRect for coordinate-based clicking with visual feedback
 */

import { SentienceBrowser, snapshot, find, clickRect, BBox } from '../src/index';

async function main() {
  // Get API key from environment variable (optional - uses free tier if not set)
  const apiKey = process.env.SENTIENCE_API_KEY as string | undefined;

  const browser = new SentienceBrowser(apiKey, undefined, false);
  
  try {
    await browser.start();
    
    // Navigate to example.com
    await browser.getPage().goto('https://example.com');
    await browser.getPage().waitForLoadState('networkidle');
    
    console.log('=== clickRect Demo ===\n');
    
    // Example 1: Click using rect object
    console.log('1. Clicking at specific coordinates (100, 100) with size 50x30');
    console.log('   (You should see a red border highlight for 2 seconds)');
    let result = await clickRect(browser, { x: 100, y: 100, w: 50, h: 30 });
    console.log(`   Result: success=${result.success}, outcome=${result.outcome}`);
    console.log(`   Duration: ${result.duration_ms}ms\n`);
    
    // Wait a bit
    await browser.getPage().waitForTimeout(1000);
    
    // Example 2: Click using element's bbox
    console.log('2. Clicking using element\'s bounding box');
    const snap = await snapshot(browser);
    const link = find(snap, 'role=link');
    
    if (link) {
      console.log(`   Found link: '${link.text}' at (${link.bbox.x}, ${link.bbox.y})`);
      console.log('   Clicking at center of element\'s bbox...');
      result = await clickRect(browser, {
        x: link.bbox.x,
        y: link.bbox.y,
        w: link.bbox.width,
        h: link.bbox.height
      });
      console.log(`   Result: success=${result.success}, outcome=${result.outcome}`);
      console.log(`   URL changed: ${result.url_changed}\n`);
      
      // Navigate back if needed
      if (result.url_changed) {
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');
      }
    }
    
    // Example 3: Click without highlight (for headless/CI)
    console.log('3. Clicking without visual highlight');
    result = await clickRect(browser, { x: 200, y: 200, w: 40, h: 20 }, false);
    console.log(`   Result: success=${result.success}\n`);
    
    // Example 4: Custom highlight duration
    console.log('4. Clicking with custom highlight duration (3 seconds)');
    result = await clickRect(browser, { x: 300, y: 300, w: 60, h: 40 }, true, 3.0);
    console.log(`   Result: success=${result.success}`);
    console.log('   (Red border should stay visible for 3 seconds)\n');
    
    // Example 5: Click with snapshot capture
    console.log('5. Clicking and capturing snapshot after action');
    result = await clickRect(
      browser, 
      { x: 150, y: 150, w: 50, h: 30 }, 
      true, 
      2.0, 
      true
    );
    if (result.snapshot_after) {
      console.log(`   Snapshot captured: ${result.snapshot_after.elements.length} elements found`);
      console.log(`   URL: ${result.snapshot_after.url}\n`);
    }
    
    // Example 6: Using BBox object
    console.log('6. Clicking using BBox object');
    const bbox: BBox = { x: 250, y: 250, width: 45, height: 25 };
    result = await clickRect(browser, bbox);
    console.log(`   Result: success=${result.success}\n`);
    
    console.log('✅ clickRect demo complete!');
    console.log('\nNote: clickRect uses Playwright\'s native mouse.click() for realistic');
    console.log('event simulation, triggering hover, focus, mousedown, mouseup sequences.');
  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
    console.error(e.stack);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);



