// injected_api.js - MAIN WORLD (NO WASM! CSP-Resistant!)
// This script ONLY collects raw DOM data and sends it to background for processing
(async () => {
    console.log('[SentienceAPI] Initializing (CSP-Resistant Mode)...');

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

    console.log('[SentienceAPI] Extension ID:', extId);

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

    // --- HELPER: Safe Class Name Extractor ---
    function getClassName(el) {
        if (typeof el.className === 'string') return el.className;
        if (el.className && typeof el.className.baseVal === 'string') return el.className.baseVal;
        return '';
    }

    // --- HELPER: Safe String Converter ---
    function toSafeString(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return value;
        if (value && typeof value === 'object' && 'baseVal' in value) {
            return typeof value.baseVal === 'string' ? value.baseVal : null;
        }
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
            const timeout = setTimeout(() => {
                window.removeEventListener('message', listener);
                reject(new Error('WASM processing timeout'));
            }, 15000); // 15s timeout

            const listener = (e) => {
                if (e.data.type === 'SENTIENCE_SNAPSHOT_RESULT' && e.data.requestId === requestId) {
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
            window.postMessage({
                type: 'SENTIENCE_SNAPSHOT_REQUEST',
                requestId,
                rawData,
                options
            }, '*');
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
                            href: toSafeString(el.href),
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
        }
    };

    console.log('[SentienceAPI] ✓ Ready! (CSP-Resistant - WASM runs in background)');
})();
