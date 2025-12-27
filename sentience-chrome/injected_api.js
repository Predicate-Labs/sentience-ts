// injected_api.js - MAIN WORLD (NO WASM! CSP-Resistant!)
// This script ONLY collects raw DOM data and sends it to background for processing
(async () => {
    // console.log('[SentienceAPI] Initializing (CSP-Resistant Mode)...');

    // Wait for Extension ID from content.js
    const getExtensionId = () => document.documentElement.dataset.sentienceExtensionId;
    let extId = getExtensionId();

    if (!extId) {
        await new Promise(resolve => {
            const check = setInterval(() => {
                extId = getExtensionId();
                if (extId) { clearInterval(check); resolve(); }
            }, 50);
            setTimeout(() => resolve(), 5000); // Max 5s wait
        });
    }

    if (!extId) {
        console.error('[SentienceAPI] Failed to get extension ID');
        return;
    }

    // console.log('[SentienceAPI] Extension ID:', extId);

    // Registry for click actions (still needed for click() function)
    window.sentience_registry = [];

    // --- HELPER: Deep Walker with Native Filter ---
    function getAllElements(root = document) {
        const elements = [];
        const filter = {
            acceptNode: function(node) {
                // Skip metadata and script/style tags
                if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HEAD'].includes(node.tagName)) {
                    return NodeFilter.FILTER_REJECT;
                }
                // Skip deep SVG children
                if (node.parentNode && node.parentNode.tagName === 'SVG' && node.tagName !== 'SVG') {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        };

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, filter);
        while(walker.nextNode()) {
            const node = walker.currentNode;
            if (node.isConnected) {
                elements.push(node);
                if (node.shadowRoot) elements.push(...getAllElements(node.shadowRoot));
            }
        }
        return elements;
    }

    // --- HELPER: Smart Text Extractor ---
    function getText(el) {
        if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
        if (el.tagName === 'INPUT') return el.value || el.placeholder || '';
        if (el.tagName === 'IMG') return el.alt || '';
        return (el.innerText || '').replace(/\s+/g, ' ').trim().substring(0, 100);
    }

    // --- HELPER: Safe Class Name Extractor (Handles SVGAnimatedString) ---
    function getClassName(el) {
        if (!el || !el.className) return '';
        
        // Handle string (HTML elements)
        if (typeof el.className === 'string') return el.className;
        
        // Handle SVGAnimatedString (SVG elements)
        if (typeof el.className === 'object') {
            if ('baseVal' in el.className && typeof el.className.baseVal === 'string') {
                return el.className.baseVal;
            }
            if ('animVal' in el.className && typeof el.className.animVal === 'string') {
                return el.className.animVal;
            }
            // Fallback: convert to string
            try {
                return String(el.className);
            } catch (e) {
                return '';
            }
        }
        
        return '';
    }

    // --- HELPER: Paranoid String Converter (Handles SVGAnimatedString) ---
    function toSafeString(value) {
        if (value === null || value === undefined) return null;
        
        // 1. If it's already a primitive string, return it
        if (typeof value === 'string') return value;
        
        // 2. Handle SVG objects (SVGAnimatedString, SVGAnimatedNumber, etc.)
        if (typeof value === 'object') {
            // Try extracting baseVal (standard SVG property)
            if ('baseVal' in value && typeof value.baseVal === 'string') {
                return value.baseVal;
            }
            // Try animVal as fallback
            if ('animVal' in value && typeof value.animVal === 'string') {
                return value.animVal;
            }
            // Fallback: Force to string (prevents WASM crash even if data is less useful)
            // This prevents the "Invalid Type" crash, even if the data is "[object SVGAnimatedString]"
            try {
                return String(value);
            } catch (e) {
                return null;
            }
        }
        
        // 3. Last resort cast for primitives
        try {
            return String(value);
        } catch (e) {
            return null;
        }
    }

    // --- HELPER: Viewport Check ---
    function isInViewport(rect) {
        return (
            rect.top < window.innerHeight && rect.bottom > 0 &&
            rect.left < window.innerWidth && rect.right > 0
        );
    }

    // --- HELPER: Occlusion Check ---
    function isOccluded(el, rect) {
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;

        if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) return false;

        const topEl = document.elementFromPoint(cx, cy);
        if (!topEl) return false;

        return !(el === topEl || el.contains(topEl) || topEl.contains(el));
    }

    // --- HELPER: Screenshot Bridge ---
    function captureScreenshot(options) {
        return new Promise(resolve => {
            const requestId = Math.random().toString(36).substring(7);
            const listener = (e) => {
                if (e.data.type === 'SENTIENCE_SCREENSHOT_RESULT' && e.data.requestId === requestId) {
                    window.removeEventListener('message', listener);
                    resolve(e.data.screenshot);
                }
            };
            window.addEventListener('message', listener);
            window.postMessage({ type: 'SENTIENCE_SCREENSHOT_REQUEST', requestId, options }, '*');
            setTimeout(() => {
                window.removeEventListener('message', listener);
                resolve(null);
            }, 10000); // 10s timeout
        });
    }

    // --- HELPER: Snapshot Processing Bridge (NEW!) ---
    function processSnapshotInBackground(rawData, options) {
        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(7);
            const TIMEOUT_MS = 25000; // 25 seconds (longer than content.js timeout)
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    window.removeEventListener('message', listener);
                    reject(new Error('WASM processing timeout - extension may be unresponsive. Try reloading the extension.'));
                }
            }, TIMEOUT_MS);

            const listener = (e) => {
                if (e.data.type === 'SENTIENCE_SNAPSHOT_RESULT' && e.data.requestId === requestId) {
                    if (resolved) return; // Already handled
                    resolved = true;
                    clearTimeout(timeout);
                    window.removeEventListener('message', listener);

                    if (e.data.error) {
                        reject(new Error(e.data.error));
                    } else {
                        resolve({
                            elements: e.data.elements,
                            raw_elements: e.data.raw_elements,
                            duration: e.data.duration
                        });
                    }
                }
            };

            window.addEventListener('message', listener);
            
            try {
                window.postMessage({
                    type: 'SENTIENCE_SNAPSHOT_REQUEST',
                    requestId,
                    rawData,
                    options
                }, '*');
            } catch (error) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    window.removeEventListener('message', listener);
                    reject(new Error(`Failed to send snapshot request: ${error.message}`));
                }
            }
        });
    }

    // --- HELPER: Raw HTML Extractor (unchanged) ---
    function getRawHTML(root) {
        const sourceRoot = root || document.body;
        const clone = sourceRoot.cloneNode(true);

        const unwantedTags = ['nav', 'footer', 'header', 'script', 'style', 'noscript', 'iframe', 'svg'];
        unwantedTags.forEach(tag => {
            const elements = clone.querySelectorAll(tag);
            elements.forEach(el => {
                if (el.parentNode) el.parentNode.removeChild(el);
            });
        });

        // Remove invisible elements
        const invisibleSelectors = [];
        const walker = document.createTreeWalker(sourceRoot, NodeFilter.SHOW_ELEMENT, null, false);
        let node;
        while (node = walker.nextNode()) {
            const tag = node.tagName.toLowerCase();
            if (tag === 'head' || tag === 'title') continue;

            const style = window.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' ||
                (node.offsetWidth === 0 && node.offsetHeight === 0)) {
                let selector = tag;
                if (node.id) {
                    selector = `#${node.id}`;
                } else if (node.className && typeof node.className === 'string') {
                    const classes = node.className.trim().split(/\s+/).filter(c => c);
                    if (classes.length > 0) {
                        selector = `${tag}.${classes.join('.')}`;
                    }
                }
                invisibleSelectors.push(selector);
            }
        }

        invisibleSelectors.forEach(selector => {
            try {
                const elements = clone.querySelectorAll(selector);
                elements.forEach(el => {
                    if (el.parentNode) el.parentNode.removeChild(el);
                });
            } catch (e) {
                // Invalid selector, skip
            }
        });

        // Resolve relative URLs
        const links = clone.querySelectorAll('a[href]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('#')) {
                try {
                    link.setAttribute('href', new URL(href, document.baseURI).href);
                } catch (e) {}
            }
        });

        const images = clone.querySelectorAll('img[src]');
        images.forEach(img => {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
                try {
                    img.setAttribute('src', new URL(src, document.baseURI).href);
                } catch (e) {}
            }
        });

        return clone.innerHTML;
    }

    // --- HELPER: Markdown Converter (unchanged) ---
    function convertToMarkdown(root) {
        const rawHTML = getRawHTML(root);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rawHTML;

        let markdown = '';
        let insideLink = false;

        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
                if (text.trim()) markdown += text;
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const tag = node.tagName.toLowerCase();

            // Prefix
            if (tag === 'h1') markdown += '\n# ';
            if (tag === 'h2') markdown += '\n## ';
            if (tag === 'h3') markdown += '\n### ';
            if (tag === 'li') markdown += '\n- ';
            if (!insideLink && (tag === 'p' || tag === 'div' || tag === 'br')) markdown += '\n';
            if (tag === 'strong' || tag === 'b') markdown += '**';
            if (tag === 'em' || tag === 'i') markdown += '_';
            if (tag === 'a') {
                markdown += '[';
                insideLink = true;
            }

            // Children
            if (node.shadowRoot) {
                Array.from(node.shadowRoot.childNodes).forEach(walk);
            } else {
                node.childNodes.forEach(walk);
            }

            // Suffix
            if (tag === 'a') {
                const href = node.getAttribute('href');
                if (href) markdown += `](${href})`;
                else markdown += ']';
                insideLink = false;
            }
            if (tag === 'strong' || tag === 'b') markdown += '**';
            if (tag === 'em' || tag === 'i') markdown += '_';
            if (!insideLink && (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'p' || tag === 'div')) markdown += '\n';
        }

        walk(tempDiv);
        return markdown.replace(/\n{3,}/g, '\n\n').trim();
    }

    // --- HELPER: Text Extractor (unchanged) ---
    function convertToText(root) {
        let text = '';
        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
                return;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toLowerCase();
                if (['nav', 'footer', 'header', 'script', 'style', 'noscript', 'iframe', 'svg'].includes(tag)) return;

                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden') return;

                const isBlock = style.display === 'block' || style.display === 'flex' || node.tagName === 'P' || node.tagName === 'DIV';
                if (isBlock) text += ' ';

                if (node.shadowRoot) {
                    Array.from(node.shadowRoot.childNodes).forEach(walk);
                } else {
                    node.childNodes.forEach(walk);
                }

                if (isBlock) text += '\n';
            }
        }
        walk(root || document.body);
        return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    // --- HELPER: Clean null/undefined fields ---
    function cleanElement(obj) {
        if (Array.isArray(obj)) {
            return obj.map(cleanElement);
        }
        if (obj !== null && typeof obj === 'object') {
            const cleaned = {};
            for (const [key, value] of Object.entries(obj)) {
                if (value !== null && value !== undefined) {
                    if (typeof value === 'object') {
                        const deepClean = cleanElement(value);
                        if (Object.keys(deepClean).length > 0) {
                            cleaned[key] = deepClean;
                        }
                    } else {
                        cleaned[key] = value;
                    }
                }
            }
            return cleaned;
        }
        return obj;
    }

    // --- HELPER: Extract Raw Element Data (for Golden Set) ---
    function extractRawElementData(el) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        
        return {
            tag: el.tagName,
            rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            },
            styles: {
                cursor: style.cursor || null,
                backgroundColor: style.backgroundColor || null,
                color: style.color || null,
                fontWeight: style.fontWeight || null,
                fontSize: style.fontSize || null,
                display: style.display || null,
                position: style.position || null,
                zIndex: style.zIndex || null,
                opacity: style.opacity || null,
                visibility: style.visibility || null
            },
            attributes: {
                role: el.getAttribute('role') || null,
                type: el.getAttribute('type') || null,
                ariaLabel: el.getAttribute('aria-label') || null,
                id: el.id || null,
                className: el.className || null
            }
        };
    }

    // --- HELPER: Generate Unique CSS Selector (for Golden Set) ---
    function getUniqueSelector(el) {
        if (!el || !el.tagName) return '';
        
        // If element has a unique ID, use it
        if (el.id) {
            return `#${el.id}`;
        }
        
        // Try data attributes or aria-label for uniqueness
        for (const attr of el.attributes) {
            if (attr.name.startsWith('data-') || attr.name === 'aria-label') {
                const value = attr.value ? attr.value.replace(/"/g, '\\"') : '';
                return `${el.tagName.toLowerCase()}[${attr.name}="${value}"]`;
            }
        }
        
        // Build path with classes and nth-child for uniqueness
        const path = [];
        let current = el;
        
        while (current && current !== document.body && current !== document.documentElement) {
            let selector = current.tagName.toLowerCase();
            
            // If current element has ID, use it and stop
            if (current.id) {
                selector = `#${current.id}`;
                path.unshift(selector);
                break;
            }
            
            // Add class if available
            if (current.className && typeof current.className === 'string') {
                const classes = current.className.trim().split(/\s+/).filter(c => c);
                if (classes.length > 0) {
                    // Use first class for simplicity
                    selector += `.${classes[0]}`;
                }
            }
            
            // Add nth-of-type if needed for uniqueness
            if (current.parentElement) {
                const siblings = Array.from(current.parentElement.children);
                const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);
                const index = sameTagSiblings.indexOf(current);
                if (index > 0 || sameTagSiblings.length > 1) {
                    selector += `:nth-of-type(${index + 1})`;
                }
            }
            
            path.unshift(selector);
            current = current.parentElement;
        }
        
        return path.join(' > ') || el.tagName.toLowerCase();
    }

    // --- GLOBAL API ---
    window.sentience = {
        // 1. Geometry snapshot (NEW ARCHITECTURE - No WASM in Main World!)
        snapshot: async (options = {}) => {
            try {
                // Step 1: Collect raw DOM data (Main World - CSP can't block this!)
                const rawData = [];
                window.sentience_registry = [];

                const nodes = getAllElements();

                nodes.forEach((el, idx) => {
                    if (!el.getBoundingClientRect) return;
                    const rect = el.getBoundingClientRect();
                    if (rect.width < 5 || rect.height < 5) return;

                    window.sentience_registry[idx] = el;

                    const textVal = getText(el);
                    const inView = isInViewport(rect);
                    const occluded = inView ? isOccluded(el, rect) : false;

                    const style = window.getComputedStyle(el);
                    rawData.push({
                        id: idx,
                        tag: el.tagName.toLowerCase(),
                        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                        styles: {
                            display: toSafeString(style.display),
                            visibility: toSafeString(style.visibility),
                            opacity: toSafeString(style.opacity),
                            z_index: toSafeString(style.zIndex || "auto"),
                            bg_color: toSafeString(style.backgroundColor),
                            color: toSafeString(style.color),
                            cursor: toSafeString(style.cursor),
                            font_weight: toSafeString(style.fontWeight),
                            font_size: toSafeString(style.fontSize)
                        },
                        attributes: {
                            role: toSafeString(el.getAttribute('role')),
                            type_: toSafeString(el.getAttribute('type')),
                            aria_label: toSafeString(el.getAttribute('aria-label')),
                            href: toSafeString(el.href || el.getAttribute('href') || null),
                            class: toSafeString(getClassName(el))
                        },
                        text: toSafeString(textVal),
                        in_viewport: inView,
                        is_occluded: occluded
                    });
                });

                console.log(`[SentienceAPI] Collected ${rawData.length} elements, sending to background for WASM processing...`);

                // Step 2: Send to background worker for WASM processing (CSP-immune!)
                const processed = await processSnapshotInBackground(rawData, options);

                // Step 3: Capture screenshot if requested
                let screenshot = null;
                if (options.screenshot) {
                    screenshot = await captureScreenshot(options.screenshot);
                }

                // Step 4: Clean and return
                const cleanedElements = cleanElement(processed.elements);
                const cleanedRawElements = cleanElement(processed.raw_elements);

                console.log(`[SentienceAPI] ✓ Complete: ${cleanedElements.length} elements, ${cleanedRawElements.length} raw (WASM took ${processed.duration?.toFixed(1)}ms)`);

                return {
                    status: "success",
                    url: window.location.href,
                    elements: cleanedElements,
                    raw_elements: cleanedRawElements,
                    screenshot: screenshot
                };
            } catch (error) {
                console.error('[SentienceAPI] snapshot() failed:', error);
                return {
                    status: "error",
                    error: error.message || 'Unknown error'
                };
            }
        },

        // 2. Read Content (unchanged)
        read: (options = {}) => {
            const format = options.format || 'raw';
            let content;

            if (format === 'raw') {
                content = getRawHTML(document.body);
            } else if (format === 'markdown') {
                content = convertToMarkdown(document.body);
            } else {
                content = convertToText(document.body);
            }

            return {
                status: "success",
                url: window.location.href,
                format: format,
                content: content,
                length: content.length
            };
        },

        // 3. Click Action (unchanged)
        click: (id) => {
            const el = window.sentience_registry[id];
            if (el) {
                el.click();
                el.focus();
                return true;
            }
            return false;
        },

        // 4. Inspector Mode: Start Recording for Golden Set Collection
        startRecording: (options = {}) => {
            const {
                highlightColor = '#ff0000',
                successColor = '#00ff00',
                autoDisableTimeout = 30 * 60 * 1000, // 30 minutes default
                keyboardShortcut = 'Ctrl+Shift+I'
            } = options;
            
            console.log("🔴 [Sentience] Recording Mode STARTED. Click an element to copy its Ground Truth JSON.");
            console.log(`   Press ${keyboardShortcut} or call stopRecording() to stop.`);
            
            // Validate registry is populated
            if (!window.sentience_registry || window.sentience_registry.length === 0) {
                console.warn("⚠️ Registry empty. Call `await window.sentience.snapshot()` first to populate registry.");
                alert("Registry empty. Run `await window.sentience.snapshot()` first!");
                return () => {}; // Return no-op cleanup function
            }
            
            // Create reverse mapping for O(1) lookup (fixes registry lookup bug)
            window.sentience_registry_map = new Map();
            window.sentience_registry.forEach((el, idx) => {
                if (el) window.sentience_registry_map.set(el, idx);
            });
            
            // Create highlight box overlay
            let highlightBox = document.getElementById('sentience-highlight-box');
            if (!highlightBox) {
                highlightBox = document.createElement('div');
                highlightBox.id = 'sentience-highlight-box';
                highlightBox.style.cssText = `
                    position: fixed;
                    pointer-events: none;
                    z-index: 2147483647;
                    border: 2px solid ${highlightColor};
                    background: rgba(255, 0, 0, 0.1);
                    display: none;
                    transition: all 0.1s ease;
                    box-sizing: border-box;
                `;
                document.body.appendChild(highlightBox);
            }
            
            // Create visual indicator (red border on page when recording)
            let recordingIndicator = document.getElementById('sentience-recording-indicator');
            if (!recordingIndicator) {
                recordingIndicator = document.createElement('div');
                recordingIndicator.id = 'sentience-recording-indicator';
                recordingIndicator.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: ${highlightColor};
                    z-index: 2147483646;
                    pointer-events: none;
                `;
                document.body.appendChild(recordingIndicator);
            }
            recordingIndicator.style.display = 'block';
            
            // Hover handler (visual feedback)
            const mouseOverHandler = (e) => {
                const el = e.target;
                if (!el || el === highlightBox || el === recordingIndicator) return;
                
                const rect = el.getBoundingClientRect();
                highlightBox.style.display = 'block';
                highlightBox.style.top = (rect.top + window.scrollY) + 'px';
                highlightBox.style.left = (rect.left + window.scrollX) + 'px';
                highlightBox.style.width = rect.width + 'px';
                highlightBox.style.height = rect.height + 'px';
            };
            
            // Click handler (capture ground truth data)
            const clickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const el = e.target;
                if (!el || el === highlightBox || el === recordingIndicator) return;
                
                // Use Map for reliable O(1) lookup
                const sentienceId = window.sentience_registry_map.get(el);
                if (sentienceId === undefined) {
                    console.warn("⚠️ Element not found in Sentience Registry. Did you run snapshot() first?");
                    alert("Element not in registry. Run `await window.sentience.snapshot()` first!");
                    return;
                }
                
                // Extract raw data (ground truth + raw signals, NOT model outputs)
                const rawData = extractRawElementData(el);
                const selector = getUniqueSelector(el);
                const role = el.getAttribute('role') || el.tagName.toLowerCase();
                const text = getText(el);
                
                // Build golden set JSON (ground truth + raw signals only)
                const snippet = {
                    task: `Interact with ${text.substring(0, 20)}${text.length > 20 ? '...' : ''}`,
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    target_criteria: {
                        id: sentienceId,
                        selector: selector,
                        role: role,
                        text: text.substring(0, 50)
                    },
                    debug_snapshot: rawData
                };
                
                // Copy to clipboard
                const jsonString = JSON.stringify(snippet, null, 2);
                navigator.clipboard.writeText(jsonString).then(() => {
                    console.log("✅ Copied Ground Truth to clipboard:", snippet);
                    
                    // Flash green to indicate success
                    highlightBox.style.border = `2px solid ${successColor}`;
                    highlightBox.style.background = 'rgba(0, 255, 0, 0.2)';
                    setTimeout(() => {
                        highlightBox.style.border = `2px solid ${highlightColor}`;
                        highlightBox.style.background = 'rgba(255, 0, 0, 0.1)';
                    }, 500);
                }).catch(err => {
                    console.error("❌ Failed to copy to clipboard:", err);
                    alert("Failed to copy to clipboard. Check console for JSON.");
                });
            };
            
            // Auto-disable timeout
            let timeoutId = null;
            
            // Cleanup function to stop recording (defined before use)
            const stopRecording = () => {
                document.removeEventListener('mouseover', mouseOverHandler, true);
                document.removeEventListener('click', clickHandler, true);
                document.removeEventListener('keydown', keyboardHandler, true);
                
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                
                if (highlightBox) {
                    highlightBox.style.display = 'none';
                }
                
                if (recordingIndicator) {
                    recordingIndicator.style.display = 'none';
                }
                
                // Clean up registry map (optional, but good practice)
                if (window.sentience_registry_map) {
                    window.sentience_registry_map.clear();
                }
                
                // Remove global reference
                if (window.sentience_stopRecording === stopRecording) {
                    delete window.sentience_stopRecording;
                }
                
                console.log("⚪ [Sentience] Recording Mode STOPPED.");
            };
            
            // Keyboard shortcut handler (defined after stopRecording)
            const keyboardHandler = (e) => {
                // Ctrl+Shift+I or Cmd+Shift+I
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
                    e.preventDefault();
                    stopRecording();
                }
            };
            
            // Attach event listeners (use capture phase to intercept early)
            document.addEventListener('mouseover', mouseOverHandler, true);
            document.addEventListener('click', clickHandler, true);
            document.addEventListener('keydown', keyboardHandler, true);
            
            // Set up auto-disable timeout
            if (autoDisableTimeout > 0) {
                timeoutId = setTimeout(() => {
                    console.log("⏰ [Sentience] Recording Mode auto-disabled after timeout.");
                    stopRecording();
                }, autoDisableTimeout);
            }
            
            // Store stop function globally for keyboard shortcut access
            window.sentience_stopRecording = stopRecording;
            
            return stopRecording;
        }
    };

    // console.log('[SentienceAPI] ✓ Ready! (CSP-Resistant - WASM runs in background)');
})();
