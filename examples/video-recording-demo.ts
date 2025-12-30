/**
 * Video Recording Demo - Record browser sessions with SentienceBrowser
 *
 * This example demonstrates how to use the video recording feature
 * to capture browser automation sessions.
 */

import { SentienceBrowser } from '../src/browser';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  // Create output directory for videos
  const videoDir = path.join(process.cwd(), 'recordings');
  if (!fs.existsSync(videoDir)) {
    fs.mkdirSync(videoDir, { recursive: true });
  }

  console.log('\n' + '='.repeat(60));
  console.log('Video Recording Demo');
  console.log('='.repeat(60) + '\n');

  // Create browser with video recording enabled
  const browser = new SentienceBrowser(
    undefined,  // apiKey
    undefined,  // apiUrl
    false,      // headless - set to false so you can see the recording
    undefined,  // proxy
    undefined,  // userDataDir
    undefined,  // storageState
    videoDir    // recordVideoDir - enables video recording
  );

  await browser.start();
  console.log('🎥 Video recording enabled');
  console.log(`📁 Videos will be saved to: ${path.resolve(videoDir)}\n`);

  try {
    const page = browser.getPage();

    // Navigate to example.com
    console.log('Navigating to example.com...');
    await page.goto('https://example.com');
    await page.waitForLoadState('networkidle');

    // Perform some actions
    console.log('Taking screenshot...');
    await page.screenshot({ path: 'example_screenshot.png' });

    console.log('Scrolling page...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    console.log('\n✅ Recording complete!');
    console.log('Video will be saved when browser closes...\n');
  } finally {
    // Video is automatically saved when browser closes
    const videoPath = await browser.close();
    console.log('='.repeat(60));
    console.log(`Video saved to: ${videoPath}`);
    console.log(`Check ${path.resolve(videoDir)} for the recorded video (.webm)`);
    console.log('='.repeat(60) + '\n');
  }
}

// Run the demo
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
