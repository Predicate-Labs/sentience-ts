/**
 * Example: Semantic waitFor using query DSL
 * Demonstrates waiting for elements using semantic selectors
 */

import { SentienceBrowser, snapshot, find, waitFor, click } from '../src/index';

async function main() {
  // Get API key from environment variable (optional - uses free tier if not set)
  const apiKey = process.env.SENTIENCE_API_KEY as string | undefined;

  const browser = new SentienceBrowser(apiKey, undefined, false);
  
  try {
    await browser.start();
    
    // Navigate to example.com
    await browser.getPage().goto('https://example.com', { waitUntil: 'domcontentloaded' });
    
    console.log('=== Semantic waitFor Demo ===\n');
    
    // Example 1: Wait for element by role
    console.log('1. Waiting for link element (role=link)');
    let waitResult = await waitFor(browser, 'role=link', 5000);
    if (waitResult.found) {
      console.log(`   ✅ Found after ${waitResult.duration_ms}ms`);
      console.log(`   Element: '${waitResult.element?.text}' (id: ${waitResult.element?.id})`);
    } else {
      console.log(`   ❌ Not found (timeout: ${waitResult.timeout})`);
    }
    console.log();
    
    // Example 2: Wait for element by role and text
    console.log('2. Waiting for link with specific text');
    waitResult = await waitFor(browser, 'role=link text~"Example"', 5000);
    if (waitResult.found) {
      console.log(`   ✅ Found after ${waitResult.duration_ms}ms`);
      console.log(`   Element text: '${waitResult.element?.text}'`);
    } else {
      console.log('   ❌ Not found');
    }
    console.log();
    
    // Example 3: Wait for clickable element
    console.log('3. Waiting for clickable element');
    waitResult = await waitFor(browser, 'clickable=true', 5000);
    if (waitResult.found) {
      console.log(`   ✅ Found clickable element after ${waitResult.duration_ms}ms`);
      console.log(`   Role: ${waitResult.element?.role}`);
      console.log(`   Text: '${waitResult.element?.text}'`);
      console.log(`   Is clickable: ${waitResult.element?.visual_cues.is_clickable}`);
    } else {
      console.log('   ❌ Not found');
    }
    console.log();
    
    // Example 4: Wait for element with importance threshold
    console.log('4. Waiting for important element (importance > 100)');
    waitResult = await waitFor(browser, 'importance>100', 5000);
    if (waitResult.found) {
      console.log(`   ✅ Found important element after ${waitResult.duration_ms}ms`);
      console.log(`   Importance: ${waitResult.element?.importance}`);
      console.log(`   Role: ${waitResult.element?.role}`);
    } else {
      console.log('   ❌ Not found');
    }
    console.log();
    
    // Example 5: Wait and then click
    console.log('5. Wait for element, then click it');
    waitResult = await waitFor(browser, 'role=link', 5000);
    if (waitResult.found && waitResult.element) {
      console.log('   ✅ Found element, clicking...');
      const clickResult = await click(browser, waitResult.element.id);
      console.log(`   Click result: success=${clickResult.success}, outcome=${clickResult.outcome}`);
      if (clickResult.url_changed) {
        console.log(`   ✅ Navigation occurred: ${browser.getPage().url()}`);
      }
    } else {
      console.log('   ❌ Element not found, cannot click');
    }
    console.log();
    
    // Example 6: Using local extension (fast polling)
    console.log('6. Using local extension with auto-optimized interval');
    console.log('   When useApi=false, interval auto-adjusts to 250ms (fast)');
    waitResult = await waitFor(browser, 'role=link', 5000, undefined, false);
    if (waitResult.found) {
      console.log(`   ✅ Found after ${waitResult.duration_ms}ms`);
      console.log('   (Used local extension, polled every 250ms)');
    }
    console.log();
    
    // Example 7: Using remote API (slower polling)
    console.log('7. Using remote API with auto-optimized interval');
    console.log('   When useApi=true, interval auto-adjusts to 1500ms (network-friendly)');
    if (apiKey) {
      waitResult = await waitFor(browser, 'role=link', 5000, undefined, true);
      if (waitResult.found) {
        console.log(`   ✅ Found after ${waitResult.duration_ms}ms`);
        console.log('   (Used remote API, polled every 1500ms)');
      }
    } else {
      console.log('   ⚠️  Skipped (no API key set)');
    }
    console.log();
    
    // Example 8: Custom interval override
    console.log('8. Custom interval override (manual control)');
    console.log('   You can still specify custom interval if needed');
    waitResult = await waitFor(browser, 'role=link', 5000, 500, false);
    if (waitResult.found) {
      console.log(`   ✅ Found after ${waitResult.duration_ms}ms`);
      console.log('   (Custom interval: 500ms)');
    }
    console.log();
    
    // Example 9: Wait for visible element (not occluded)
    console.log('9. Waiting for visible element (not occluded)');
    waitResult = await waitFor(browser, 'role=link visible=true', 5000);
    if (waitResult.found) {
      console.log(`   ✅ Found visible element after ${waitResult.duration_ms}ms`);
      console.log(`   Is occluded: ${waitResult.element?.is_occluded}`);
      console.log(`   In viewport: ${waitResult.element?.in_viewport}`);
    }
    console.log();
    
    console.log('✅ Semantic waitFor demo complete!');
    console.log('\nNote: waitFor uses the semantic query DSL to find elements.');
    console.log('This is more robust than CSS selectors because it understands');
    console.log('the semantic meaning of elements (role, text, clickability, etc.).');
  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
    console.error(e.stack);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

