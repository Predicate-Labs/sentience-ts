/**
 * Utility functions for Sentience SDK
 */

import { BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Save current browser storage state (cookies + localStorage) to a file.
 * 
 * This is useful for capturing a logged-in session to reuse later.
 * 
 * @param context - Playwright BrowserContext
 * @param filePath - Path to save the storage state JSON file
 * 
 * @example
 * ```typescript
 * import { SentienceBrowser, saveStorageState } from 'sentience-ts';
 * 
 * const browser = new SentienceBrowser();
 * await browser.start();
 * 
 * // User logs in manually or via agent
 * await browser.getPage().goto('https://example.com');
 * // ... login happens ...
 * 
 * // Save session for later
 * await saveStorageState(browser.getContext(), 'auth.json');
 * ```
 */
export async function saveStorageState(
  context: BrowserContext,
  filePath: string
): Promise<void> {
  const storageState = await context.storageState();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(storageState, null, 2));
  console.log(`✅ [Sentience] Saved storage state to ${filePath}`);
}

