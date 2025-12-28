// content.js - ISOLATED WORLD (Bridge between Main World and Background)
console.log('[Sentience Bridge] Loaded.');

// Detect if we're in a child frame (for iframe support)
const isChildFrame = window !== window.top;
if (isChildFrame) {
    console.log('[Sentience Bridge] Running in child frame:', window.location.href);
}

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

        case 'SENTIENCE_SHOW_OVERLAY':
            handleShowOverlay(event.data);
            break;

        case 'SENTIENCE_CLEAR_OVERLAY':
            handleClearOverlay();
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

// ============================================================================
// Visual Overlay - Shadow DOM Implementation
// ============================================================================

const OVERLAY_HOST_ID = 'sentience-overlay-host';
let overlayTimeout = null;

/**
 * Show visual overlay highlighting elements using Shadow DOM
 * @param {Object} data - Message data with elements and targetElementId
 */
function handleShowOverlay(data) {
    const { elements, targetElementId } = data;

    if (!elements || !Array.isArray(elements)) {
        console.warn('[Sentience Bridge] showOverlay: elements must be an array');
        return;
    }

    removeOverlay();

    // Create host with Shadow DOM for CSS isolation
    const host = document.createElement('div');
    host.id = OVERLAY_HOST_ID;
    host.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        margin: 0 !important;
        padding: 0 !important;
    `;
    document.body.appendChild(host);

    // Attach shadow root (closed mode for security and CSS isolation)
    const shadow = host.attachShadow({ mode: 'closed' });

    // Calculate max importance for scaling
    const maxImportance = Math.max(...elements.map(e => e.importance || 0), 1);

    elements.forEach((element) => {
        const bbox = element.bbox;
        if (!bbox) return;

        const isTarget = element.id === targetElementId;
        const isPrimary = element.visual_cues?.is_primary || false;
        const importance = element.importance || 0;

        // Color: Red (target), Blue (primary), Green (regular)
        let color;
        if (isTarget) color = '#FF0000';
        else if (isPrimary) color = '#0066FF';
        else color = '#00FF00';

        // Scale opacity and border width based on importance
        const importanceRatio = maxImportance > 0 ? importance / maxImportance : 0.5;
        const borderOpacity = isTarget ? 1.0 : (isPrimary ? 0.9 : Math.max(0.4, 0.5 + importanceRatio * 0.5));
        const fillOpacity = borderOpacity * 0.2;
        const borderWidth = isTarget ? 2 : (isPrimary ? 1.5 : Math.max(0.5, Math.round(importanceRatio * 2)));

        // Convert fill opacity to hex for background-color
        const hexOpacity = Math.round(fillOpacity * 255).toString(16).padStart(2, '0');

        // Create box with semi-transparent fill
        const box = document.createElement('div');
        box.style.cssText = `
            position: absolute;
            left: ${bbox.x}px;
            top: ${bbox.y}px;
            width: ${bbox.width}px;
            height: ${bbox.height}px;
            border: ${borderWidth}px solid ${color};
            background-color: ${color}${hexOpacity};
            box-sizing: border-box;
            opacity: ${borderOpacity};
            pointer-events: none;
        `;

        // Add badge showing importance score
        if (importance > 0 || isPrimary) {
            const badge = document.createElement('span');
            badge.textContent = isPrimary ? `⭐${importance}` : `${importance}`;
            badge.style.cssText = `
                position: absolute;
                top: -18px;
                left: 0;
                background: ${color};
                color: white;
                font-size: 11px;
                font-weight: bold;
                padding: 2px 6px;
                font-family: Arial, sans-serif;
                border-radius: 3px;
                opacity: 0.95;
                white-space: nowrap;
                pointer-events: none;
            `;
            box.appendChild(badge);
        }

        // Add target emoji for target element
        if (isTarget) {
            const targetIndicator = document.createElement('span');
            targetIndicator.textContent = '🎯';
            targetIndicator.style.cssText = `
                position: absolute;
                top: -18px;
                right: 0;
                font-size: 16px;
                pointer-events: none;
            `;
            box.appendChild(targetIndicator);
        }

        shadow.appendChild(box);
    });

    console.log(`[Sentience Bridge] Overlay shown for ${elements.length} elements`);

    // Auto-remove after 5 seconds
    overlayTimeout = setTimeout(() => {
        removeOverlay();
        console.log('[Sentience Bridge] Overlay auto-cleared after 5 seconds');
    }, 5000);
}

/**
 * Clear overlay manually
 */
function handleClearOverlay() {
    removeOverlay();
    console.log('[Sentience Bridge] Overlay cleared manually');
}

/**
 * Remove overlay from DOM
 */
function removeOverlay() {
    const existing = document.getElementById(OVERLAY_HOST_ID);
    if (existing) {
        existing.remove();
    }

    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
        overlayTimeout = null;
    }
}

// console.log('[Sentience Bridge] Ready - Extension ID:', chrome.runtime.id);
