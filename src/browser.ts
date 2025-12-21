/**
 * Playwright browser harness with extension loading
 */

import { chromium, BrowserContext, Page, Browser } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export class SentienceBrowser {
  private context: BrowserContext | null = null;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private extensionPath: string | null = null;

  constructor(
    private licenseKey?: string,
    private headless: boolean = false
  ) {}

  async start(): Promise<void> {
    // Get extension source path (relative to project root)
    // Handle both ts-node (src/) and compiled (dist/src/) cases
    let repoRoot: string;
    if (__dirname.includes('dist')) {
      // Compiled: dist/src/ -> go up 3 levels to project root (Sentience/)
      repoRoot = path.resolve(__dirname, '../../..');
    } else {
      // ts-node: src/ -> go up 2 levels to project root (Sentience/)
      repoRoot = path.resolve(__dirname, '../..');
    }
    const extensionSource = path.join(repoRoot, 'sentience-chrome');

    if (!fs.existsSync(extensionSource)) {
      throw new Error(
        `Extension not found at ${extensionSource}. ` +
        'Make sure sentience-chrome directory exists.'
      );
    }

    // Create temporary extension bundle
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentience-ext-'));
    this.extensionPath = tempDir; // tempDir is already a string

    // Copy extension files
    const filesToCopy = [
      'manifest.json',
      'content.js',
      'background.js',
      'injected_api.js',
    ];

    for (const file of filesToCopy) {
      const src = path.join(extensionSource, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(tempDir, file));
      }
    }

    // Copy pkg directory (WASM)
    const pkgSource = path.join(extensionSource, 'pkg');
    if (fs.existsSync(pkgSource)) {
      const pkgDest = path.join(tempDir, 'pkg');
      fs.mkdirSync(pkgDest, { recursive: true });
      this.copyDirectory(pkgSource, pkgDest);
    }

    // Launch browser
    this.browser = await chromium.launch({
      headless: this.headless,
      args: [
        `--load-extension=${tempDir}`,
        `--disable-extensions-except=${tempDir}`,
      ],
    });

    // Create context
    this.context = await this.browser.newContext({
      // Persistent context not needed for basic usage
    });

    // Create page
    this.page = await this.context.newPage();

    // Navigate to a real page so extension can inject
    // Extension content scripts only run on actual pages (not about:blank)
    // Use a simple page that loads quickly
    await this.page.goto('https://example.com', { waitUntil: 'domcontentloaded' });

    // Give extension time to initialize (WASM loading is async)
    await this.page.waitForTimeout(1000);

    // Wait for extension to load
    if (!(await this.waitForExtension())) {
      // Extension might need more time, try waiting a bit longer
      await this.page.waitForTimeout(2000);
      if (!(await this.waitForExtension())) {
        throw new Error(
          'Extension failed to load after navigation. Make sure:\n' +
          '1. Extension is built (cd sentience-chrome && ./build.sh)\n' +
          '2. All files are present (manifest.json, content.js, injected_api.js, pkg/)\n' +
          '3. Check browser console for errors\n' +
          `4. Extension path: ${tempDir}`
        );
      }
    }
  }

  private copyDirectory(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private async waitForExtension(timeout: number = 15000): Promise<boolean> {
    if (!this.page) return false;

    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const result = await this.page.evaluate(() => {
          // Check if sentience API exists
          if (typeof (window as any).sentience === 'undefined') {
            return { ready: false, reason: 'window.sentience not defined' };
          }
          // Check if snapshot function exists
          if (typeof (window as any).sentience.snapshot !== 'function') {
            return { ready: false, reason: 'snapshot function not available' };
          }
          // Check if WASM module is loaded
          if ((window as any).sentience_registry === undefined) {
            return { ready: false, reason: 'registry not initialized' };
          }
          return { ready: true };
        });

        if (result && (result as any).ready) {
          return true;
        }
      } catch (e) {
        // Continue waiting on errors
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return false;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not started. Call start() first.');
    }
    return this.page;
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    if (this.extensionPath && fs.existsSync(this.extensionPath)) {
      fs.rmSync(this.extensionPath, { recursive: true, force: true });
    }
  }
}

