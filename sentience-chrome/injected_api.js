// injected_api.js - MAIN WORLD
(async () => {
    // 1. Get Extension ID (Wait for content.js to set it)
    const getExtensionId = () => document.documentElement.dataset.sentienceExtensionId;
    let extId = getExtensionId();
    
    // Safety poller for async loading race conditions
    if (!extId) {
        await new Promise(resolve => {
            const check = setInterval(() => {
                extId = getExtensionId();
                if (extId) { clearInterval(check); resolve(); }
            }, 50);
        });
    }

    const EXT_URL = `chrome-extension://${extId}/`;
    console.log('[SentienceAPI.com] Initializing from:', EXT_URL);

    window.sentience_registry = [];
    let wasmModule = null;

    // --- HELPER: Deep Walker with Native Filter ---
    function getAllElements(root = document) {
        const elements = [];
        // FILTER: Skip Script, Style, Comments, Metadata tags during traversal
        // This prevents collecting them in the first place, saving memory and CPU
        const filter = {
            acceptNode: function(node) {
                // Skip metadata and script/style tags
                if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HEAD'].includes(node.tagName)) {
                    return NodeFilter.FILTER_REJECT;
                }
                // Skip deep SVG children (keep root <svg> only, unless you need path data)
                // This reduces noise from complex SVG graphics while preserving icon containers
                if (node.parentNode && node.parentNode.tagName === 'SVG' && node.tagName !== 'SVG') {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        };
        
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, filter);
        while(walker.nextNode()) {
            const node = walker.currentNode;
            // Pre-check: Don't even process empty/detached nodes
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
    // Fixes the SVGAnimatedString error by ensuring we always get a primitive string
    function getClassName(el) {
        if (typeof el.className === 'string') return el.className;
        // Handle SVGAnimatedString (has baseVal and animVal)
        if (el.className && typeof el.className.baseVal === 'string') return el.className.baseVal;
        return '';
    }

    // --- HELPER: Viewport Check (NEW) ---
    function isInViewport(rect) {
        return (
            rect.top < window.innerHeight && rect.bottom > 0 &&
            rect.left < window.innerWidth && rect.right > 0
        );
    }

    // --- HELPER: Occlusion Check (NEW) ---
    function isOccluded(el, rect) {
        // Fast center-point check
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        
        // If point is off-screen, elementFromPoint returns null, assume NOT occluded for safety
        if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) return false;

        const topEl = document.elementFromPoint(cx, cy);
        if (!topEl) return false;
        
        // It's visible if the top element is us, or contains us, or we contain it
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
        });
    }

    // --- HELPER: Get Raw HTML for Turndown/External Processing ---
    // Returns cleaned HTML that can be processed by Turndown or other Node.js libraries
    function getRawHTML(root) {
        const sourceRoot = root || document.body;
        const clone = sourceRoot.cloneNode(true);
        
        // Remove unwanted elements by tag name (simple and reliable)
        const unwantedTags = ['nav', 'footer', 'header', 'script', 'style', 'noscript', 'iframe', 'svg'];
        unwantedTags.forEach(tag => {
            const elements = clone.querySelectorAll(tag);
            elements.forEach(el => {
                if (el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
        });

        // Remove invisible elements from original DOM and find matching ones in clone
        // We'll use a simple approach: mark elements in original, then remove from clone
        const invisibleSelectors = [];
        const walker = document.createTreeWalker(
            sourceRoot,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            const tag = node.tagName.toLowerCase();
            if (tag === 'head' || tag === 'title') continue;
            
            const style = window.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden' ||
                (node.offsetWidth === 0 && node.offsetHeight === 0)) {
                // Build a selector for this element
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

        // Remove invisible elements from clone (if we can find them)
        invisibleSelectors.forEach(selector => {
            try {
                const elements = clone.querySelectorAll(selector);
                elements.forEach(el => {
                    if (el.parentNode) {
                        el.parentNode.removeChild(el);
                    }
                });
            } catch (e) {
                // Invalid selector, skip
            }
        });

        // Resolve relative URLs in links and images
        const links = clone.querySelectorAll('a[href]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('#')) {
                try {
                    link.setAttribute('href', new URL(href, document.baseURI).href);
                } catch (e) {
                    // Keep original href if URL parsing fails
                }
            }
        });

        const images = clone.querySelectorAll('img[src]');
        images.forEach(img => {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
                try {
                    img.setAttribute('src', new URL(src, document.baseURI).href);
                } catch (e) {
                    // Keep original src if URL parsing fails
                }
            }
        });

        return clone.innerHTML;
    }

    // --- HELPER: Simple Markdown Converter (Lightweight) ---
    // Uses getRawHTML() and then converts to markdown for consistency
    function convertToMarkdown(root) {
        // Get cleaned HTML first
        const rawHTML = getRawHTML(root);
        
        // Create a temporary container to parse the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rawHTML;
        
        let markdown = '';
        let insideLink = false; // Track if we're inside an <a> tag

        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                // Keep minimal whitespace to prevent words merging
                // Strip newlines inside text nodes to prevent broken links
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
            // IMPORTANT: Don't add newlines for block elements when inside a link
            if (!insideLink && (tag === 'p' || tag === 'div' || tag === 'br')) markdown += '\n';
            if (tag === 'strong' || tag === 'b') markdown += '**';
            if (tag === 'em' || tag === 'i') markdown += '_';
            if (tag === 'a') {
                markdown += '[';
                insideLink = true; // Mark that we're entering a link
            }

            // Children
            if (node.shadowRoot) {
                Array.from(node.shadowRoot.childNodes).forEach(walk);
            } else {
                node.childNodes.forEach(walk);
            }

            // Suffix
            if (tag === 'a') {
                // Get absolute URL from href attribute (already resolved in getRawHTML)
                const href = node.getAttribute('href');
                if (href) markdown += `](${href})`;
                else markdown += ']';
                insideLink = false; // Mark that we're exiting the link
            }
            if (tag === 'strong' || tag === 'b') markdown += '**';
            if (tag === 'em' || tag === 'i') markdown += '_';
            // IMPORTANT: Don't add newlines for block elements when inside a link (suffix section too)
            if (!insideLink && (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'p' || tag === 'div')) markdown += '\n';
        }

        walk(tempDiv);
        
        // Cleanup: remove excessive newlines
        return markdown.replace(/\n{3,}/g, '\n\n').trim();
    }

    // --- HELPER: Raw Text Extractor ---
    function convertToText(root) {
        let text = '';
        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
                return;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toLowerCase();
                // Skip nav/footer/header/script/style/noscript/iframe/svg
                if (['nav', 'footer', 'header', 'script', 'style', 'noscript', 'iframe', 'svg'].includes(tag)) return;

                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden') return;
                
                // Block level elements get a newline
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

    // Load WASM
    try {
        const wasmUrl = EXT_URL + 'pkg/sentience_core.js';
        const module = await import(wasmUrl);
        const imports = {
            env: {
                js_click_element: (id) => {
                    const el = window.sentience_registry[id];
                    if (el) { el.click(); el.focus(); }
                }
            }
        };
        await module.default(undefined, imports);
        wasmModule = module;
        
        // Verify functions are available
        if (!wasmModule.analyze_page) {
            console.error('[SentienceAPI.com] available');
        } else {
            console.log('[SentienceAPI.com] ✓ Ready!');
            console.log('[SentienceAPI.com] Available functions:', Object.keys(wasmModule).filter(k => k.startsWith('analyze')));
        }
    } catch (e) {
        console.error('[SentienceAPI.com] Extension Load Failed:', e);
    }

    // REMOVED: Headless detection - no longer needed (license system removed)

    // --- GLOBAL API ---
    window.sentience = {
        // 1. Geometry snapshot (existing)
        snapshot: async (options = {}) => {
            if (!wasmModule) return { error: "WASM not ready" };

            const rawData = [];
            // Remove textMap as we include text in rawData
            window.sentience_registry = [];
            
            const nodes = getAllElements();
            
            nodes.forEach((el, idx) => {
                if (!el.getBoundingClientRect) return;
                const rect = el.getBoundingClientRect();
                if (rect.width < 5 || rect.height < 5) return;

                window.sentience_registry[idx] = el;
                
                // Calculate properties for Fat Payload
                const textVal = getText(el);
                const inView = isInViewport(rect);
                // Only check occlusion if visible (Optimization)
                const occluded = inView ? isOccluded(el, rect) : false;

                const style = window.getComputedStyle(el);
                rawData.push({
                    id: idx,
                    tag: el.tagName.toLowerCase(),
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    styles: {
                        display: style.display,
                        visibility: style.visibility,
                        opacity: style.opacity,
                        z_index: String(style.zIndex || "auto"),  // Force string conversion
                        bg_color: style.backgroundColor,
                        color: style.color,
                        cursor: style.cursor,
                        font_weight: String(style.fontWeight),  // Force string conversion
                        font_size: style.fontSize
                    },
                    attributes: {
                        role: el.getAttribute('role'),
                        type_: el.getAttribute('type'),
                        aria_label: el.getAttribute('aria-label'),
                        // Convert SVGAnimatedString to string for SVG elements
                        href: el.href?.baseVal || el.href || null,
                        class: getClassName(el) || null
                    },
                    // Pass to WASM
                    text: textVal || null,
                    in_viewport: inView,
                    is_occluded: occluded
                });
            });

            let result;
            try {
                if (options.limit || options.filter) {
                    result = wasmModule.analyze_page_with_options(rawData, options);
                } else {
                    result = wasmModule.analyze_page(rawData);
                }
            } catch (e) {
                return { status: "error", error: e.message };
            }

            // Hydration step removed
            // Capture Screenshot
            let screenshot = null;
            if (options.screenshot) {
                screenshot = await captureScreenshot(options.screenshot);
            }

            // C. Clean up null/undefined fields to save tokens
            const cleanElement = (obj) => {
                if (Array.isArray(obj)) {
                    return obj.map(cleanElement);
                }
                if (obj !== null && typeof obj === 'object') {
                    const cleaned = {};
                    for (const [key, value] of Object.entries(obj)) {
                        // Explicitly skip null AND undefined
                        if (value !== null && value !== undefined) {
                            // Recursively clean objects
                            if (typeof value === 'object') {
                                const deepClean = cleanElement(value);
                                // Only keep object if it's not empty (optional optimization)
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
            };

            const cleanedElements = cleanElement(result);

            // DEBUG: Check rawData before pruning
            // console.log(`[DEBUG] rawData length BEFORE pruning: ${rawData.length}`);
            // Prune raw elements using WASM before sending to API
            // This prevents 413 errors on large sites (Amazon: 5000+ -> ~200-400)
            const prunedRawData = wasmModule.prune_for_api(rawData);
            
            // Clean up null/undefined fields in raw_elements as well
            const cleanedRawElements = cleanElement(prunedRawData);

            return {
                status: "success",
                url: window.location.href,
                elements: cleanedElements,
                raw_elements: cleanedRawElements,  // Send cleaned pruned data to prevent 413 errors
                screenshot: screenshot
            };
        },
        // 2. Read Content (New)
        read: (options = {}) => {
            const format = options.format || 'raw'; // 'raw', 'text', or 'markdown'
            let content;
            
            if (format === 'raw') {
                // Return raw HTML suitable for Turndown or other Node.js libraries
                content = getRawHTML(document.body);
            } else if (format === 'markdown') {
                // Return lightweight markdown conversion
                content = convertToMarkdown(document.body);
            } else {
                // Default to text
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

        // 3. Action
        click: (id) => {
            const el = window.sentience_registry[id];
            if (el) { el.click(); el.focus(); return true; }
            return false;
        }
    };
})();