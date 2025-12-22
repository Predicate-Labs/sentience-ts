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
  private headless: boolean;

  constructor(
    apiKey?: string,
    apiUrl?: string,
    headless?: boolean
  ) {
    this._apiKey = apiKey;
    
    // Determine headless mode
    if (headless === undefined) {
      // Default to true in CI, false locally
      const ci = process.env.CI?.toLowerCase();
      this.headless = ci === 'true' || ci === '1' || ci === 'yes';
    } else {
      this.headless = headless;
    }

    // Configure API URL
    if (apiKey) {
      this._apiUrl = apiUrl || 'https://api.sentienceapi.com';
    } else {
      this._apiUrl = undefined;
    }
  }

  async start(): Promise<void> {
    // 1. Resolve Extension Path
    // Handle: src/extension (local dev), dist/extension (prod), or ../sentience-chrome (monorepo)
    let extensionSource = '';
    
    const candidates = [
        // Production / Installed Package
        path.resolve(__dirname, '../extension'),
        path.resolve(__dirname, 'extension'),
        // Local Monorepo Dev
        path.resolve(__dirname, '../../sentience-chrome'),
        path.resolve(__dirname, '../../../sentience-chrome'),
        // CI Artifact
        path.resolve(process.cwd(), 'extension')
    ];

    for (const loc of candidates) {
      if (fs.existsSync(path.join(loc, 'manifest.json'))) {
        extensionSource = loc;
        break;
      }
    }

    if (!extensionSource) {
        throw new Error(
            `Sentience extension not found. Checked:\n${candidates.map(c => `- ${c}`).join('\n')}\n` +
            'Ensure the extension is built/downloaded.'
        );
    }

    // 2. Setup Temp Profile (Avoids locking issues)
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentience-ts-'));
    this.extensionPath = path.join(this.userDataDir, 'extension');
    
    // Copy extension to temp dir
    this._copyRecursive(extensionSource, this.extensionPath);

    // 3. Build Args
    const args = [
      `--disable-extensions-except=${this.extensionPath}`,
      `--load-extension=${this.extensionPath}`,
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
    ];

    // CRITICAL: Headless Extensions Support
    // headless: true -> NO extensions.
    // headless: false + args: '--headless=new' -> YES extensions.
    if (this.headless) {
        args.push('--headless=new');
    }

    // 4. Launch Browser
    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false, // Must be false here, handled via args above
      args: args,
      viewport: { width: 1920, height: 1080 },
      // Clean User-Agent to avoid "HeadlessChrome" detection
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    this.page = this.context.pages()[0] || await this.context.newPage();

    // 5. Apply Stealth (Basic)
    await this.page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    // Inject API Key if present
    if (this._apiKey) {
        await this.page.addInitScript((key) => {
            (window as any).__SENTIENCE_API_KEY__ = key;
        }, this._apiKey);
    }

    // Wait for extension background pages to spin up
    await new Promise(r => setTimeout(r, 500));
  }

  async goto(url: string): Promise<void> {
    const page = this.getPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    if (!(await this.waitForExtension(15000))) {
       // Gather Debug Info
       const diag = await page.evaluate(() => ({
         sentience_global: typeof (window as any).sentience !== 'undefined',
         wasm_ready: (window as any).sentience && (window as any).sentience._wasmModule !== null,
         ext_id: document.documentElement.dataset.sentienceExtensionId || 'not set',
         url: window.location.href
       })).catch(e => ({ error: String(e) }));

       throw new Error(
        'Extension failed to load after navigation.\n' +
        `Path: ${this.extensionPath}\n` +
        `Diagnostics: ${JSON.stringify(diag, null, 2)}`
      );
    }
  }

  private async waitForExtension(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const ready = await this.page!.evaluate(() => {
          // Check for API AND Wasm Module (set by injected_api.js)
          const s = (window as any).sentience;
          return s && s._wasmModule !== null; // Strict check for null (it's initialized as null)
        });
        if (ready) return true;
      } catch (e) {
        // Context invalid errors expected during navigation
      }
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not started. Call start() first.');
    }
    return this.page;
  }

  // Helper for recursive copy (fs.cp is Node 16.7+)
  private _copyRecursive(src: string, dest: string) {
    if (fs.statSync(src).isDirectory()) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest);
      fs.readdirSync(src).forEach(child => {
        this._copyRecursive(path.join(src, child), path.join(dest, child));
      });
    } else {
      fs.copyFileSync(src, dest);
    }
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
  }
}