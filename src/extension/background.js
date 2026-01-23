import init, { analyze_page_with_options, analyze_page, prune_for_api } from "./pkg/sentience_core.js";

let wasmReady = !1, wasmInitPromise = null;

async function initWASM() {
    if (!wasmReady) return wasmInitPromise || (wasmInitPromise = (async () => {
        try {
            globalThis.js_click_element = () => {}, await init(), wasmReady = !0;
        } catch (error) {
            throw error;
        }
    })(), wasmInitPromise);
}

async function handleScreenshotCapture(_tabId, options = {}) {
    try {
        const {format: format = "png", quality: quality = 90} = options;
        return await chrome.tabs.captureVisibleTab(null, {
            format: format,
            quality: quality
        });
    } catch (error) {
        throw new Error(`Failed to capture screenshot: ${error.message}`);
    }
}

async function handleSnapshotProcessing(rawData, options = {}) {
    const startTime = performance.now();
    try {
        if (!Array.isArray(rawData)) throw new Error("rawData must be an array");
        if (rawData.length > 1e4 && (rawData = rawData.slice(0, 1e4)), await initWASM(), 
        !wasmReady) throw new Error("WASM module not initialized");
        let analyzedElements, prunedRawData;
        try {
            const wasmPromise = new Promise((resolve, reject) => {
                try {
                    let result;
                    result = options.limit || options.filter ? analyze_page_with_options(rawData, options) : analyze_page(rawData), 
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            });
            analyzedElements = await Promise.race([ wasmPromise, new Promise((_, reject) => setTimeout(() => reject(new Error("WASM processing timeout (>18s)")), 18e3)) ]);
        } catch (e) {
            const errorMsg = e.message || "Unknown WASM error";
            throw new Error(`WASM analyze_page failed: ${errorMsg}`);
        }
        try {
            prunedRawData = prune_for_api(rawData);
        } catch (e) {
            prunedRawData = rawData;
        }
        performance.now();
        return {
            elements: analyzedElements,
            raw_elements: prunedRawData
        };
    } catch (error) {
        performance.now();
        throw error;
    }
}

initWASM().catch(err => {}), chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        return "captureScreenshot" === request.action ? (handleScreenshotCapture(sender.tab.id, request.options).then(screenshot => {
            sendResponse({
                success: !0,
                screenshot: screenshot
            });
        }).catch(error => {
            sendResponse({
                success: !1,
                error: error.message || "Screenshot capture failed"
            });
        }), !0) : "processSnapshot" === request.action ? (handleSnapshotProcessing(request.rawData, request.options).then(result => {
            sendResponse({
                success: !0,
                result: result
            });
        }).catch(error => {
            sendResponse({
                success: !1,
                error: error.message || "Snapshot processing failed"
            });
        }), !0) : (sendResponse({
            success: !1,
            error: "Unknown action"
        }), !1);
    } catch (error) {
        try {
            sendResponse({
                success: !1,
                error: `Fatal error: ${error.message || "Unknown error"}`
            });
        } catch (e) {}
        return !1;
    }
}), self.addEventListener("error", event => {
    event.preventDefault();
}), self.addEventListener("unhandledrejection", event => {
    event.preventDefault();
});