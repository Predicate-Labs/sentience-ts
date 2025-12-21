/**
 * Day 2 Example: Verify extension bridge is loaded
 */

import { SentienceBrowser } from '../src/index';

async function main() {
  const browser = new SentienceBrowser(undefined, undefined, false);
  
  try {
    await browser.start();
    
    // Browser.start() already navigates to example.com, but we can navigate elsewhere if needed
    // The extension should already be loaded at this point
    
    // Check if extension API is available
    const bridgeOk = await browser.getPage().evaluate(
      () => {
        const win = window as any;
        return typeof win.sentience !== 'undefined' && 
               typeof win.sentience.snapshot === 'function';
      }
    );
    
    console.log(`bridge_ok=${bridgeOk}`);
    
    if (bridgeOk) {
      console.log('✅ Extension loaded successfully!');
      // Try a quick snapshot to verify it works
      try {
        const result = await browser.getPage().evaluate(
          () => (window as any).sentience.snapshot({ limit: 1 })
        );
        if (result.status === 'success') {
          console.log(`✅ Snapshot test: Found ${result.elements?.length || 0} elements`);
        } else {
          console.log(`⚠️  Snapshot returned: ${result.status}`);
        }
      } catch (e: any) {
        console.log(`⚠️  Snapshot test failed: ${e.message}`);
      }
    } else {
      console.log('❌ Extension not loaded');
      // Debug info
      const debugInfo = await browser.getPage().evaluate(() => {
        const win = window as any;
        return {
          sentience_defined: typeof win.sentience !== 'undefined',
          registry_defined: typeof win.sentience_registry !== 'undefined',
          snapshot_defined: typeof win.sentience?.snapshot !== 'undefined'
        };
      });
      console.log(`Debug info: ${JSON.stringify(debugInfo, null, 2)}`);
    }
  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
    console.error(e.stack);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

