// background.js - Service Worker with WASM (CSP-Immune!)
// This runs in an isolated environment, completely immune to page CSP policies

// ✅ STATIC IMPORTS at top level - Required for Service Workers!
// Dynamic import() is FORBIDDEN in ServiceWorkerGlobalScope
import init, { analyze_page, analyze_page_with_options, prune_for_api } from './pkg/sentience_core.js';

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
            globalThis.js_click_element = (_id) => {
                console.warn('[Sentience Background] js_click_element called in background (ignored)');
            };

            // Initialize WASM - this calls the init() function from the static import
            // The init() function handles fetching and instantiating the .wasm file
            await init();

            wasmReady = true;
            console.log('[Sentience Background] ✓ WASM ready!');
            console.log('[Sentience Background] Available functions: analyze_page, analyze_page_with_options, prune_for_api');
        } catch (error) {
            console.error('[Sentience Background] WASM initialization failed:', error);
            throw error;
        }
    })();

    return wasmInitPromise;
}

// Initialize WASM on service worker startup
initWASM().catch(err => {
    console.error('[Sentience Background] Failed to initialize WASM:', err);
});

/**
 * Message handler for all extension communication
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle screenshot requests (existing functionality)
    if (request.action === 'captureScreenshot') {
        handleScreenshotCapture(sender.tab.id, request.options)
            .then(screenshot => {
                sendResponse({ success: true, screenshot });
            })
            .catch(error => {
                console.error('[Sentience Background] Screenshot capture failed:', error);
                sendResponse({
                    success: false,
                    error: error.message || 'Screenshot capture failed'
                });
            });
        return true; // Async response
    }

    // Handle WASM processing requests (NEW!)
    if (request.action === 'processSnapshot') {
        handleSnapshotProcessing(request.rawData, request.options)
            .then(result => {
                sendResponse({ success: true, result });
            })
            .catch(error => {
                console.error('[Sentience Background] Snapshot processing failed:', error);
                sendResponse({
                    success: false,
                    error: error.message || 'Snapshot processing failed'
                });
            });
        return true; // Async response
    }

    // Unknown action
    console.warn('[Sentience Background] Unknown action:', request.action);
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
});

/**
 * Handle screenshot capture (existing functionality)
 */
async function handleScreenshotCapture(_tabId, options = {}) {
    try {
        const {
            format = 'png',
            quality = 90
        } = options;

        const dataUrl = await chrome.tabs.captureVisibleTab(null, {
            format: format,
            quality: quality
        });

        console.log(`[Sentience Background] Screenshot captured: ${format}, size: ${dataUrl.length} bytes`);
        return dataUrl;
    } catch (error) {
        console.error('[Sentience Background] Screenshot error:', error);
        throw new Error(`Failed to capture screenshot: ${error.message}`);
    }
}

/**
 * Handle snapshot processing with WASM (NEW!)
 * This is where the magic happens - completely CSP-immune!
 *
 * @param {Array} rawData - Raw element data from injected_api.js
 * @param {Object} options - Snapshot options (limit, filter, etc.)
 * @returns {Promise<Object>} Processed snapshot result
 */
async function handleSnapshotProcessing(rawData, options = {}) {
    try {
        // Ensure WASM is initialized
        await initWASM();
        if (!wasmReady) {
            throw new Error('WASM module not initialized');
        }

        console.log(`[Sentience Background] Processing ${rawData.length} elements with options:`, options);

        // Run WASM processing using the imported functions directly
        let analyzedElements;
        try {
            if (options.limit || options.filter) {
                analyzedElements = analyze_page_with_options(rawData, options);
            } else {
                analyzedElements = analyze_page(rawData);
            }
        } catch (e) {
            throw new Error(`WASM analyze_page failed: ${e.message}`);
        }

        // Prune elements for API (prevents 413 errors on large sites)
        let prunedRawData;
        try {
            prunedRawData = prune_for_api(rawData);
        } catch (e) {
            console.warn('[Sentience Background] prune_for_api failed, using original data:', e);
            prunedRawData = rawData;
        }

        console.log(`[Sentience Background] ✓ Processed: ${analyzedElements.length} analyzed, ${prunedRawData.length} pruned`);

        return {
            elements: analyzedElements,
            raw_elements: prunedRawData
        };
    } catch (error) {
        console.error('[Sentience Background] Processing error:', error);
        throw error;
    }
}

console.log('[Sentience Background] Service worker ready');
