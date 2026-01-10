// Sentience Chrome Extension - Background Service Worker
// Auto-generated from modular source
import init, { analyze_page_with_options, analyze_page, prune_for_api } from '../pkg/sentience_core.js';

// background.js - Service Worker with WASM (CSP-Immune!)
// This runs in an isolated environment, completely immune to page CSP policies


console.log('[Sentience Background] Initializing...');

// Global WASM initialization state
let wasmReady = false;
let wasmInitPromise = null;

/**
 * Initialize WASM module - called once on service worker startup
 * Uses static imports (not dynamic import()) which is required for Service Workers
 */
async function initWASM() {
  if (wasmReady) return;
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    try {
      console.log('[Sentience Background] Loading WASM module...');

      // Define the js_click_element function that WASM expects
      // In Service Workers, use 'globalThis' instead of 'window'
      // In background context, we can't actually click, so we log a warning
      globalThis.js_click_element = () => {
        console.warn('[Sentience Background] js_click_element called in background (ignored)');
      };

      // Initialize WASM - this calls the init() function from the static import
      // The init() function handles fetching and instantiating the .wasm file
      await init();

      wasmReady = true;
      console.log('[Sentience Background] ✓ WASM ready!');
      console.log(
        '[Sentience Background] Available functions: analyze_page, analyze_page_with_options, prune_for_api'
      );
    } catch (error) {
      console.error('[Sentience Background] WASM initialization failed:', error);
      throw error;
    }
  })();

  return wasmInitPromise;
}

// Initialize WASM on service worker startup
initWASM().catch((err) => {
  console.error('[Sentience Background] Failed to initialize WASM:', err);
});

/**
 * Message handler for all extension communication
 * Includes global error handling to prevent extension crashes
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Global error handler to prevent extension crashes
  try {
    // Handle screenshot requests (existing functionality)
    if (request.action === 'captureScreenshot') {
      handleScreenshotCapture(sender.tab.id, request.options)
        .then((screenshot) => {
          sendResponse({ success: true, screenshot });
        })
        .catch((error) => {
          console.error('[Sentience Background] Screenshot capture failed:', error);
          sendResponse({
            success: false,
            error: error.message || 'Screenshot capture failed',
          });
        });
      return true; // Async response
    }

    // Handle WASM processing requests (NEW!)
    if (request.action === 'processSnapshot') {
      handleSnapshotProcessing(request.rawData, request.options)
        .then((result) => {
          sendResponse({ success: true, result });
        })
        .catch((error) => {
          console.error('[Sentience Background] Snapshot processing failed:', error);
          sendResponse({
            success: false,
            error: error.message || 'Snapshot processing failed',
          });
        });
      return true; // Async response
    }

    // Unknown action
    console.warn('[Sentience Background] Unknown action:', request.action);
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
  } catch (error) {
    // Catch any synchronous errors that might crash the extension
    console.error('[Sentience Background] Fatal error in message handler:', error);
    try {
      sendResponse({
        success: false,
        error: `Fatal error: ${error.message || 'Unknown error'}`,
      });
    } catch (e) {
      // If sendResponse already called, ignore
    }
    return false;
  }
});

/**
 * Handle screenshot capture (existing functionality)
 */
async function handleScreenshotCapture(_tabId, options = {}) {
  try {
    const { format = 'png', quality = 90 } = options;

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format,
      quality,
    });

    console.log(
      `[Sentience Background] Screenshot captured: ${format}, size: ${dataUrl.length} bytes`
    );
    return dataUrl;
  } catch (error) {
    console.error('[Sentience Background] Screenshot error:', error);
    throw new Error(`Failed to capture screenshot: ${error.message}`);
  }
}

/**
 * Handle snapshot processing with WASM (NEW!)
 * This is where the magic happens - completely CSP-immune!
 * Includes safeguards to prevent crashes and hangs.
 *
 * @param {Array} rawData - Raw element data from injected_api.js
 * @param {Object} options - Snapshot options (limit, filter, etc.)
 * @returns {Promise<Object>} Processed snapshot result
 */
async function handleSnapshotProcessing(rawData, options = {}) {
  const MAX_ELEMENTS = 10000; // Safety limit to prevent hangs
  const startTime = performance.now();

  try {
    // Safety check: limit element count to prevent hangs
    if (!Array.isArray(rawData)) {
      throw new Error('rawData must be an array');
    }

    if (rawData.length > MAX_ELEMENTS) {
      console.warn(
        `[Sentience Background] ⚠️ Large dataset: ${rawData.length} elements. Limiting to ${MAX_ELEMENTS} to prevent hangs.`
      );
      rawData = rawData.slice(0, MAX_ELEMENTS);
    }

    // Ensure WASM is initialized
    await initWASM();
    if (!wasmReady) {
      throw new Error('WASM module not initialized');
    }

    console.log(
      `[Sentience Background] Processing ${rawData.length} elements with options:`,
      options
    );

    // Run WASM processing using the imported functions directly
    // Wrap in try-catch with timeout protection
    let analyzedElements;
    try {
      // Use a timeout wrapper to prevent infinite hangs
      const wasmPromise = new Promise((resolve, reject) => {
        try {
          let result;
          if (options.limit || options.filter) {
            result = analyze_page_with_options(rawData, options);
          } else {
            result = analyze_page(rawData);
          }
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });

      // Add timeout protection (18 seconds - less than content.js timeout)
      analyzedElements = await Promise.race([
        wasmPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('WASM processing timeout (>18s)')), 18000)
        ),
      ]);
    } catch (e) {
      const errorMsg = e.message || 'Unknown WASM error';
      console.error(`[Sentience Background] WASM analyze_page failed: ${errorMsg}`, e);
      throw new Error(`WASM analyze_page failed: ${errorMsg}`);
    }

    // Prune elements for API (prevents 413 errors on large sites)
    let prunedRawData;
    try {
      prunedRawData = prune_for_api(rawData);
    } catch (e) {
      console.warn('[Sentience Background] prune_for_api failed, using original data:', e);
      prunedRawData = rawData;
    }

    const duration = performance.now() - startTime;
    console.log(
      `[Sentience Background] ✓ Processed: ${analyzedElements.length} analyzed, ${prunedRawData.length} pruned (${duration.toFixed(1)}ms)`
    );

    return {
      elements: analyzedElements,
      raw_elements: prunedRawData,
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[Sentience Background] Processing error after ${duration.toFixed(1)}ms:`, error);
    throw error;
  }
}

console.log('[Sentience Background] Service worker ready');

// Global error handlers to prevent extension crashes
self.addEventListener('error', (event) => {
  console.error('[Sentience Background] Global error caught:', event.error);
  event.preventDefault(); // Prevent extension crash
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[Sentience Background] Unhandled promise rejection:', event.reason);
  event.preventDefault(); // Prevent extension crash
});
