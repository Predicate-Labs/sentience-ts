// content.js - ISOLATED WORLD (Bridge between Main World and Background)
console.log('[Sentience Bridge] Loaded.');

// 1. Pass Extension ID to Main World (So API knows where to find resources)
document.documentElement.dataset.sentienceExtensionId = chrome.runtime.id;

// 2. Message Router - Handles all communication between page and background
window.addEventListener('message', (event) => {
    // Security check: only accept messages from same window
    if (event.source !== window) return;

    // Route different message types
    switch (event.data.type) {
        case 'SENTIENCE_SCREENSHOT_REQUEST':
            handleScreenshotRequest(event.data);
            break;

        case 'SENTIENCE_SNAPSHOT_REQUEST':
            handleSnapshotRequest(event.data);
            break;

        default:
            // Ignore unknown message types
            break;
    }
});

/**
 * Handle screenshot requests (existing functionality)
 */
function handleScreenshotRequest(data) {
    chrome.runtime.sendMessage(
        { action: 'captureScreenshot', options: data.options },
        (response) => {
            window.postMessage({
                type: 'SENTIENCE_SCREENSHOT_RESULT',
                requestId: data.requestId,
                screenshot: response?.success ? response.screenshot : null,
                error: response?.error
            }, '*');
        }
    );
}

/**
 * Handle snapshot processing requests (NEW!)
 * Sends raw DOM data to background worker for WASM processing
 * Includes timeout protection to prevent extension crashes
 */
function handleSnapshotRequest(data) {
    const startTime = performance.now();
    const TIMEOUT_MS = 20000; // 20 seconds (longer than injected_api timeout)
    let responded = false;

    // Timeout protection: if background doesn't respond, send error
    const timeoutId = setTimeout(() => {
        if (!responded) {
            responded = true;
            const duration = performance.now() - startTime;
            console.error(`[Sentience Bridge] ⚠️ WASM processing timeout after ${duration.toFixed(1)}ms`);
            window.postMessage({
                type: 'SENTIENCE_SNAPSHOT_RESULT',
                requestId: data.requestId,
                error: 'WASM processing timeout - background script may be unresponsive',
                duration: duration
            }, '*');
        }
    }, TIMEOUT_MS);

    try {
        chrome.runtime.sendMessage(
            {
                action: 'processSnapshot',
                rawData: data.rawData,
                options: data.options
            },
            (response) => {
                if (responded) return; // Already responded via timeout
                responded = true;
                clearTimeout(timeoutId);
                
                const duration = performance.now() - startTime;

                // Handle Chrome extension errors (e.g., background script crashed)
                if (chrome.runtime.lastError) {
                    console.error('[Sentience Bridge] Chrome runtime error:', chrome.runtime.lastError.message);
                    window.postMessage({
                        type: 'SENTIENCE_SNAPSHOT_RESULT',
                        requestId: data.requestId,
                        error: `Chrome runtime error: ${chrome.runtime.lastError.message}`,
                        duration: duration
                    }, '*');
                    return;
                }

                if (response?.success) {
                    // console.log(`[Sentience Bridge] ✓ WASM processing complete in ${duration.toFixed(1)}ms`);
                    window.postMessage({
                        type: 'SENTIENCE_SNAPSHOT_RESULT',
                        requestId: data.requestId,
                        elements: response.result.elements,
                        raw_elements: response.result.raw_elements,
                        duration: duration
                    }, '*');
                } else {
                    console.error('[Sentience Bridge] WASM processing failed:', response?.error);
                    window.postMessage({
                        type: 'SENTIENCE_SNAPSHOT_RESULT',
                        requestId: data.requestId,
                        error: response?.error || 'Processing failed',
                        duration: duration
                    }, '*');
                }
            }
        );
    } catch (error) {
        if (!responded) {
            responded = true;
            clearTimeout(timeoutId);
            const duration = performance.now() - startTime;
            console.error('[Sentience Bridge] Exception sending message:', error);
            window.postMessage({
                type: 'SENTIENCE_SNAPSHOT_RESULT',
                requestId: data.requestId,
                error: `Failed to send message: ${error.message}`,
                duration: duration
            }, '*');
        }
    }
}

// console.log('[Sentience Bridge] Ready - Extension ID:', chrome.runtime.id);
