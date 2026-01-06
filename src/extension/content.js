!function() {
    "use strict";
    window, window.top;
    document.documentElement.dataset.sentienceExtensionId = chrome.runtime.id, window.addEventListener("message", event => {
        var data;
        if (event.source === window) switch (event.data.type) {
          case "SENTIENCE_SCREENSHOT_REQUEST":
            data = event.data, chrome.runtime.sendMessage({
                action: "captureScreenshot",
                options: data.options
            }, response => {
                window.postMessage({
                    type: "SENTIENCE_SCREENSHOT_RESULT",
                    requestId: data.requestId,
                    screenshot: response?.success ? response.screenshot : null,
                    error: response?.error
                }, "*");
            });
            break;

          case "SENTIENCE_SNAPSHOT_REQUEST":
            !function(data) {
                const startTime = performance.now();
                let responded = !1;
                const timeoutId = setTimeout(() => {
                    if (!responded) {
                        responded = !0;
                        const duration = performance.now() - startTime;
                        window.postMessage({
                            type: "SENTIENCE_SNAPSHOT_RESULT",
                            requestId: data.requestId,
                            error: "WASM processing timeout - background script may be unresponsive",
                            duration: duration
                        }, "*");
                    }
                }, 2e4);
                try {
                    chrome.runtime.sendMessage({
                        action: "processSnapshot",
                        rawData: data.rawData,
                        options: data.options
                    }, response => {
                        if (responded) return;
                        responded = !0, clearTimeout(timeoutId);
                        const duration = performance.now() - startTime;
                        chrome.runtime.lastError ? window.postMessage({
                            type: "SENTIENCE_SNAPSHOT_RESULT",
                            requestId: data.requestId,
                            error: `Chrome runtime error: ${chrome.runtime.lastError.message}`,
                            duration: duration
                        }, "*") : response?.success ? window.postMessage({
                            type: "SENTIENCE_SNAPSHOT_RESULT",
                            requestId: data.requestId,
                            elements: response.result.elements,
                            raw_elements: response.result.raw_elements,
                            duration: duration
                        }, "*") : window.postMessage({
                            type: "SENTIENCE_SNAPSHOT_RESULT",
                            requestId: data.requestId,
                            error: response?.error || "Processing failed",
                            duration: duration
                        }, "*");
                    });
                } catch (error) {
                    if (!responded) {
                        responded = !0, clearTimeout(timeoutId);
                        const duration = performance.now() - startTime;
                        window.postMessage({
                            type: "SENTIENCE_SNAPSHOT_RESULT",
                            requestId: data.requestId,
                            error: `Failed to send message: ${error.message}`,
                            duration: duration
                        }, "*");
                    }
                }
            }(event.data);
            break;

          case "SENTIENCE_SHOW_OVERLAY":
            !function(data) {
                const {elements: elements, targetElementId: targetElementId} = data;
                if (!elements || !Array.isArray(elements)) return;
                removeOverlay();
                const host = document.createElement("div");
                host.id = OVERLAY_HOST_ID, host.style.cssText = "\n        position: fixed !important;\n        top: 0 !important;\n        left: 0 !important;\n        width: 100vw !important;\n        height: 100vh !important;\n        pointer-events: none !important;\n        z-index: 2147483647 !important;\n        margin: 0 !important;\n        padding: 0 !important;\n    ", 
                document.body.appendChild(host);
                const shadow = host.attachShadow({
                    mode: "closed"
                }), maxImportance = Math.max(...elements.map(e => e.importance || 0), 1);
                elements.forEach(element => {
                    const bbox = element.bbox;
                    if (!bbox) return;
                    const isTarget = element.id === targetElementId, isPrimary = element.visual_cues?.is_primary || !1, importance = element.importance || 0;
                    let color;
                    color = isTarget ? "#FF0000" : isPrimary ? "#0066FF" : "#00FF00";
                    const importanceRatio = maxImportance > 0 ? importance / maxImportance : .5, borderOpacity = isTarget ? 1 : isPrimary ? .9 : Math.max(.4, .5 + .5 * importanceRatio), fillOpacity = .2 * borderOpacity, borderWidth = isTarget ? 2 : isPrimary ? 1.5 : Math.max(.5, Math.round(2 * importanceRatio)), hexOpacity = Math.round(255 * fillOpacity).toString(16).padStart(2, "0"), box = document.createElement("div");
                    if (box.style.cssText = `\n            position: absolute;\n            left: ${bbox.x}px;\n            top: ${bbox.y}px;\n            width: ${bbox.width}px;\n            height: ${bbox.height}px;\n            border: ${borderWidth}px solid ${color};\n            background-color: ${color}${hexOpacity};\n            box-sizing: border-box;\n            opacity: ${borderOpacity};\n            pointer-events: none;\n        `, 
                    importance > 0 || isPrimary) {
                        const badge = document.createElement("span");
                        badge.textContent = isPrimary ? `⭐${importance}` : `${importance}`, badge.style.cssText = `\n                position: absolute;\n                top: -18px;\n                left: 0;\n                background: ${color};\n                color: white;\n                font-size: 11px;\n                font-weight: bold;\n                padding: 2px 6px;\n                font-family: Arial, sans-serif;\n                border-radius: 3px;\n                opacity: 0.95;\n                white-space: nowrap;\n                pointer-events: none;\n            `, 
                        box.appendChild(badge);
                    }
                    if (isTarget) {
                        const targetIndicator = document.createElement("span");
                        targetIndicator.textContent = "🎯", targetIndicator.style.cssText = "\n                position: absolute;\n                top: -18px;\n                right: 0;\n                font-size: 16px;\n                pointer-events: none;\n            ", 
                        box.appendChild(targetIndicator);
                    }
                    shadow.appendChild(box);
                }), overlayTimeout = setTimeout(() => {
                    removeOverlay();
                }, 5e3);
            }(event.data);
            break;

          case "SENTIENCE_CLEAR_OVERLAY":
            removeOverlay();
        }
    });
    const OVERLAY_HOST_ID = "sentience-overlay-host";
    let overlayTimeout = null;
    function removeOverlay() {
        const existing = document.getElementById(OVERLAY_HOST_ID);
        existing && existing.remove(), overlayTimeout && (clearTimeout(overlayTimeout), 
        overlayTimeout = null);
    }
}();