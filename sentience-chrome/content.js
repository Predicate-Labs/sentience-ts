// content.js - ISOLATED WORLD
console.log('[Sentience] Bridge loaded.');

// 1. Pass Extension ID to Main World (So WASM knows where to load from)
document.documentElement.dataset.sentienceExtensionId = chrome.runtime.id;

// 2. Proxy for Screenshots (The only thing Isolated World needs to do)
window.addEventListener('message', (event) => {
    // Security check: only accept messages from same window
    if (event.source !== window || event.data.type !== 'SENTIENCE_SCREENSHOT_REQUEST') return;

    chrome.runtime.sendMessage(
        { action: 'captureScreenshot', options: event.data.options },
        (response) => {
            window.postMessage({
                type: 'SENTIENCE_SCREENSHOT_RESULT',
                requestId: event.data.requestId,
                screenshot: response?.success ? response.screenshot : null
            }, '*');
        }
    );
});