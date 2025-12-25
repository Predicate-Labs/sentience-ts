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
 */
function handleSnapshotRequest(data) {
    const startTime = performance.now();

    chrome.runtime.sendMessage(
        {
            action: 'processSnapshot',
            rawData: data.rawData,
            options: data.options
        },
        (response) => {
            const duration = performance.now() - startTime;

            if (response?.success) {
                console.log(`[Sentience Bridge] ✓ WASM processing complete in ${duration.toFixed(1)}ms`);
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
}

console.log('[Sentience Bridge] Ready - Extension ID:', chrome.runtime.id);
