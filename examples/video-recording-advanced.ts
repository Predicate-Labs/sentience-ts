/**
 * Advanced Video Recording Demo
 *
 * Demonstrates advanced video recording features:
 * - Custom resolution (1080p)
 * - Custom output filename
 * - Multiple recordings in one session
 */

import { SentienceBrowser } from '../src/browser';
import * as path from 'path';
import * as fs from 'fs';

async function recordWithCustomSettings() {
  console.log('\n' + '='.repeat(60));
  console.log('Advanced Video Recording Demo');
  console.log('='.repeat(60) + '\n');

  const videoDir = path.join(process.cwd(), 'recordings');

  // Example 1: Custom Resolution (1080p)
  console.log('📹 Example 1: Recording in 1080p (Full HD)\n');

  const browser1 = new SentienceBrowser(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    videoDir,
    { width: 1920, height: 1080 }  // 1080p resolution
  );

  await browser1.start();
  console.log('   Resolution: 1920x1080');

  const page1 = browser1.getPage();
  await page1.goto('https://example.com');
  await page1.waitForTimeout(2000);

  // Close with custom filename
  const video1 = await browser1.close(path.join(videoDir, 'example_1080p.webm'));
  console.log(`   ✅ Saved: ${video1}\n`);

  // Example 2: Custom Filename with Timestamp
  console.log('📹 Example 2: Recording with timestamp filename\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const customFilename = `recording_${timestamp}.webm`;

  const browser2 = new SentienceBrowser(
    undefined, undefined, false, undefined, undefined, undefined,
    videoDir
  );

  await browser2.start();

  const page2 = browser2.getPage();
  await page2.goto('https://example.com');
  await page2.click('text=More information');
  await page2.waitForTimeout(2000);

  const video2 = await browser2.close(path.join(videoDir, customFilename));
  console.log(`   ✅ Saved: ${video2}\n`);

  // Example 3: Organized by Project
  console.log('📹 Example 3: Organized directory structure\n');

  const projectDir = path.join(videoDir, 'my_project', 'tutorials');
  const browser3 = new SentienceBrowser(
    undefined, undefined, false, undefined, undefined, undefined,
    projectDir
  );

  await browser3.start();
  console.log(`   Saving to: ${projectDir}`);

  const page3 = browser3.getPage();
  await page3.goto('https://example.com');
  await page3.waitForTimeout(2000);

  const video3 = await browser3.close(path.join(projectDir, 'tutorial_01.webm'));
  console.log(`   ✅ Saved: ${video3}\n`);

  console.log('='.repeat(60));
  console.log('All recordings completed!');
  console.log(`Check ${path.resolve(videoDir)} for all videos`);
  console.log('='.repeat(60) + '\n');
}

// Run the demo
recordWithCustomSettings().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
