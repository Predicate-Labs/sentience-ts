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
  private userDataDir: string | null = null;
  private _apiKey?: string;
  private _apiUrl?: string;

  constructor(
    apiKey?: string,
    apiUrl?: string,
    headless?: boolean
  ) {
    this._apiKey = apiKey;
    // Note: headless parameter is accepted but ignored for extensions
    // Extensions REQUIRE --headless=new mode which is set in browser args
    // We keep the parameter for API compatibility
    if (headless !== undefined) {
      console.log('[Sentience] Note: headless parameter ignored for extensions (using --headless=new)');
    }
    // Only set apiUrl if apiKey is provided, otherwise undefined (free tier)
    // Default to https://api.sentienceapi.com if apiKey is provided but apiUrl is not
    if (apiKey) {
      this._apiUrl = apiUrl || 'https://api.sentienceapi.com';
    } else {
      this._apiUrl = undefined;
    }
  }

  async start(): Promise<void> {
    // Try to find extension in multiple locations:
    // 1. Embedded extension (src/extension/) - for production/CI
    // 2. Development mode (../sentience-chrome/) - for local development
    
    // Handle both ts-node (src/) and compiled (dist/src/) cases
    let sdkRoot: string;
    let repoRoot: string;
    if (__dirname.includes('dist')) {
      // Compiled: dist/src/ -> go up 2 levels to sdk-ts/
      sdkRoot = path.resolve(__dirname, '../..');
      // Go up 1 more level to project root (Sentience/)
      repoRoot = path.resolve(sdkRoot, '..');
    } else {
      // ts-node: src/ -> go up 1 level to sdk-ts/
      sdkRoot = path.resolve(__dirname, '..');
      // Go up 1 more level to project root (Sentience/)
      repoRoot = path.resolve(sdkRoot, '..');
    }
    
    // Check for embedded extension first (production/CI)
    const embeddedExtension = path.join(sdkRoot, 'src', 'extension');
    
    // Check for development extension (local development)
    const devExtension = path.join(repoRoot, 'sentience-chrome');
    
    // Prefer embedded extension, fall back to dev extension
    let extensionSource: string;
    if (fs.existsSync(embeddedExtension) && fs.existsSync(path.join(embeddedExtension, 'manifest.json'))) {
      extensionSource = embeddedExtension;
    } else if (fs.existsSync(devExtension) && fs.existsSync(path.join(devExtension, 'manifest.json'))) {
      extensionSource = devExtension;
    } else {
      throw new Error(
        `Extension not found. Checked:\n` +
        `  1. ${embeddedExtension}\n` +
        `  2. ${devExtension}\n` +
        'Make sure extension files are available. ' +
        'For development: cd ../sentience-chrome && ./build.sh'
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

    const missingFiles: string[] = [];
    for (const file of filesToCopy) {
      const src = path.join(extensionSource, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(tempDir, file));
      } else {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      throw new Error(
        `Missing required extension files: ${missingFiles.join(', ')}\n` +
        `Extension source: ${extensionSource}`
      );
    }

    // Copy pkg directory (WASM)
    const pkgSource = path.join(extensionSource, 'pkg');
    if (!fs.existsSync(pkgSource)) {
      throw new Error(
        `WASM package directory not found at ${pkgSource}\n` +
        'Make sure extension files are available. ' +
        'For development: cd ../sentience-chrome && ./build.sh'
      );
    }
    
    // Verify WASM files exist
    const wasmJs = path.join(pkgSource, 'sentience_core.js');
    const wasmBinary = path.join(pkgSource, 'sentience_core_bg.wasm');
    if (!fs.existsSync(wasmJs) || !fs.existsSync(wasmBinary)) {
      throw new Error(
        `WASM files not found. Expected:\n` +
        `  - ${wasmJs}\n` +
        `  - ${wasmBinary}\n` +
        'Make sure extension files are available. ' +
        'For development: cd ../sentience-chrome && ./build.sh'
      );
    }
    
    const pkgDest = path.join(tempDir, 'pkg');
    fs.mkdirSync(pkgDest, { recursive: true });
    this.copyDirectory(pkgSource, pkgDest);

    // Use launchPersistentContext for better extension support
    // Extensions load more reliably with persistent contexts
    const launchTimeout = 30000; // 30 seconds
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentience-profile-'));
    this.userDataDir = userDataDir;

    // Stealth arguments for bot evasion
    // IMPORTANT: Always use --headless=new for extensions (required even when headless=false in config)
    const stealthArgs = [
      `--load-extension=${tempDir}`,
      `--disable-extensions-except=${tempDir}`,
      '--headless=new', // Required for extensions to work
      '--disable-blink-features=AutomationControlled', // Hide automation indicators
      '--no-sandbox', // Required for some environments
      '--disable-infobars', // Hide "Chrome is being controlled" message
    ];

    // Realistic viewport and user-agent for better evasion
    const viewportConfig = { width: 1920, height: 1080 };
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    // Launch browser with extension
    // Note: We use bundled Chromium for reliable extension loading
    // headless: false in config, but --headless=new in args ensures extension compatibility
    try {
      this.context = await Promise.race([
        chromium.launchPersistentContext(userDataDir, {
          headless: false, // Must be false for extensions, but we pass --headless=new in args
          args: stealthArgs,
          viewport: viewportConfig,
          userAgent: userAgent,
          timeout: launchTimeout,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Browser launch timed out after ${launchTimeout}ms. Make sure Playwright browsers are installed: npx playwright install chromium`)), launchTimeout)
        ),
      ]);
    } catch (launchError: any) {
      // Clean up user data dir on failure
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw new Error(
        `Failed to launch browser: ${launchError.message}\n` +
        'Make sure Playwright browsers are installed: npx playwright install chromium'
      );
    }

    // Get first page or create new one
    const pages = this.context.pages();
    if (pages.length > 0) {
      this.page = pages[0];
    } else {
      this.page = await this.context.newPage();
    }
    
    // Store user data dir for cleanup
    this.userDataDir = userDataDir;

    // Apply basic stealth patches for bot evasion
    // Note: TypeScript doesn't have playwright-stealth equivalent, so we apply basic patches
    await this.page.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Override chrome runtime
      (window as any).chrome = {
        runtime: {},
      };
      
      // Override permissions
      const originalQuery = (window.navigator as any).permissions?.query;
      if (originalQuery) {
        (window.navigator as any).permissions.query = (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(parameters);
      }
      
      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });
    
    // Navigate to a real page so extension can inject
    // Extension content scripts only run on actual pages (not about:blank)
    // Use a simple page that loads quickly
    await this.page.goto('https://example.com', {
      waitUntil: 'domcontentloaded',
      timeout: 15000, // 15 second timeout for navigation
    });

    // Give extension time to initialize (WASM loading is async)
    // Content scripts run at document_idle, so we need to wait for that
    await this.page.waitForTimeout(3000);

    // Wait for extension to load
    if (!(await this.waitForExtension(25000))) {
      // Extension might need more time, try waiting a bit longer
      await this.page.waitForTimeout(3000);
      
      // Try to get more diagnostic info
      let diagnosticInfo = '';
      try {
        diagnosticInfo = await this.page.evaluate(() => {
          const info: any = {
            sentience_defined: typeof (window as any).sentience !== 'undefined',
            registry_defined: typeof (window as any).sentience_registry !== 'undefined',
            snapshot_defined: typeof (window as any).sentience?.snapshot === 'function',
            wasm_loaded: !!(window as any).sentience?._wasmModule,
            extension_id: document.documentElement.dataset.sentienceExtensionId || 'not set',
            url: window.location.href,
          };
          // Check console errors if possible
          if ((window as any).sentience) {
            info.sentience_keys = Object.keys((window as any).sentience);
          }
          return JSON.stringify(info, null, 2);
        });
      } catch (e) {
        diagnosticInfo = `Could not get diagnostic info: ${e}`;
      }
      
      if (!(await this.waitForExtension(15000))) {
        throw new Error(
          'Extension failed to load after navigation. Make sure:\n' +
          '1. Extension is built (cd sentience-chrome && ./build.sh)\n' +
          '2. All files are present (manifest.json, content.js, injected_api.js, pkg/)\n' +
          '3. Check browser console for errors (run with headless=false to see console)\n' +
          `4. Extension path: ${tempDir}\n` +
          `5. Diagnostic info: ${diagnosticInfo}`
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

  private async waitForExtension(timeout: number = 20000): Promise<boolean> {
    if (!this.page) return false;

    const start = Date.now();
    let lastError: string | null = null;

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
          // IMPORTANT: Check if WASM module is actually loaded (not null)
          const sentience = (window as any).sentience;
          if (sentience._wasmModule === null) {
            return { ready: false, reason: 'WASM module is null (still loading)' };
          }
          if (sentience._wasmModule === undefined) {
            return { ready: false, reason: 'WASM module not initialized' };
          }
          // Verify WASM module has required function
          if (sentience._wasmModule && !sentience._wasmModule.analyze_page) {
            return { ready: false, reason: 'WASM module missing analyze_page function' };
          }
          // Everything is ready
          return { ready: true };
        });

        if (result && (result as any).ready) {
          return true;
        }

        // Track the last error for debugging
        if (result && (result as any).reason) {
          lastError = (result as any).reason;
        }
      } catch (e: any) {
        lastError = `Evaluation error: ${e.message}`;
        // Continue waiting on errors
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Log the last error for debugging
    if (lastError) {
      console.warn(`Extension wait timeout. Last status: ${lastError}`);
    }

    return false;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not started. Call start() first.');
    }
    return this.page;
  }

  // Expose API configuration (read-only)
  getApiKey(): string | undefined {
    return this._apiKey;
  }

  getApiUrl(): string | undefined {
    return this._apiUrl;
  }

  async close(): Promise<void> {
    const cleanup: Promise<void>[] = [];
    
    // Close context first (this also closes the browser for persistent contexts)
    if (this.context) {
      cleanup.push(
        this.context.close().catch(() => {
          // Ignore errors during cleanup
        })
      );
      this.context = null;
    }
    
    // Close browser if it exists (for non-persistent contexts)
    if (this.browser) {
      cleanup.push(
        this.browser.close().catch(() => {
          // Ignore errors during cleanup
        })
      );
      this.browser = null;
    }
    
    // Wait for all cleanup to complete
    await Promise.all(cleanup);
    
    // Clean up extension directory
    if (this.extensionPath && fs.existsSync(this.extensionPath)) {
      try {
        fs.rmSync(this.extensionPath, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
      this.extensionPath = null;
    }
    
    // Clean up user data directory
    if (this.userDataDir && fs.existsSync(this.userDataDir)) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
      this.userDataDir = null;
    }
    
    this.page = null;
  }
}

