/**
 * Example: Using Residential Proxy with Sentience SDK
 *
 * This example demonstrates how to configure a residential proxy
 * for use with the Sentience SDK when running from datacenters.
 *
 * Requirements:
 * - Residential proxy connection string (e.g., from Bright Data, Oxylabs, etc.)
 * - Sentience API key (optional, for server-side snapshots)
 *
 * Usage:
 *   SENTIENCE_PROXY=http://user:pass@proxy.com:8000 ts-node examples/proxy-example.ts
 *   or
 *   ts-node examples/proxy-example.ts --proxy http://user:pass@proxy.com:8000
 */

import { SentienceBrowser } from '../src/browser';
import { snapshot } from '../src/snapshot';

async function main() {
  // Get proxy from command line argument or environment variable
  const proxyArg = process.argv.find(arg => arg.startsWith('--proxy='));
  const proxy = proxyArg 
    ? proxyArg.split('=')[1] 
    : process.env.SENTIENCE_PROXY;

  if (!proxy) {
    console.error('❌ Error: Proxy not provided');
    console.error('   Usage: ts-node examples/proxy-example.ts --proxy=http://user:pass@proxy.com:8000');
    console.error('   Or set SENTIENCE_PROXY environment variable');
    process.exit(1);
  }

  console.log('🌐 Starting browser with residential proxy...\n');
  console.log(`   Proxy: ${proxy.replace(/:[^:@]+@/, ':****@')}\n`); // Mask password in logs

  // Create browser with proxy
  const browser = new SentienceBrowser(undefined, undefined, false, proxy);
  
  try {
    await browser.start();
    console.log('✅ Browser started with proxy\n');

    // Navigate to a page that shows your IP
    console.log('📍 Navigating to IP check service...');
    try {
      await browser.getPage().goto('https://api.ipify.org?format=json', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      const ipInfo = await browser.getPage().evaluate(() => document.body.textContent);
      console.log(`   Your IP (via proxy): ${ipInfo}\n`);
    } catch (error: any) {
      console.warn(`   ⚠️  Could not check IP: ${error.message}`);
      console.warn('   This is normal if the proxy uses self-signed certificates.\n');
    }

    // Take a snapshot
    console.log('📸 Taking snapshot...');
    const snap = await snapshot(browser);
    console.log(`   ✅ Captured ${snap.elements.length} elements\n`);

    // Navigate to another site
    console.log('📍 Navigating to example.com...');
    await browser.getPage().goto('https://example.com');
    await browser.getPage().waitForLoadState('domcontentloaded');
    
    const snap2 = await snapshot(browser);
    console.log(`   ✅ Captured ${snap2.elements.length} elements\n`);

    console.log('✅ Proxy example complete!');
    console.log('\n💡 Note: WebRTC leak protection is automatically enabled when using proxies.');
    console.log('   This prevents your real IP from being exposed via WebRTC.');

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

