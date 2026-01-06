!function() {
    "use strict";
    function getAllElements(root = document) {
        const elements = [], filter = {
            acceptNode: node => [ "SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "HEAD" ].includes(node.tagName) || node.parentNode && "SVG" === node.parentNode.tagName && "SVG" !== node.tagName ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
        }, walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, filter);
        for (;walker.nextNode(); ) {
            const node = walker.currentNode;
            node.isConnected && (elements.push(node), node.shadowRoot && elements.push(...getAllElements(node.shadowRoot)));
        }
        return elements;
    }
    const DEFAULT_INFERENCE_CONFIG = {
        allowedTags: [ "label", "span", "div" ],
        allowedRoles: [],
        allowedClassPatterns: [],
        maxParentDepth: 2,
        maxSiblingDistance: 1,
        requireSameContainer: !0,
        containerTags: [ "form", "fieldset", "div" ],
        methods: {
            explicitLabel: !0,
            ariaLabelledby: !0,
            parentTraversal: !0,
            siblingProximity: !0
        }
    };
    function isInferenceSource(el, config) {
        if (!el || !el.tagName) return !1;
        const tag = el.tagName.toLowerCase(), role = el.getAttribute ? el.getAttribute("role") : "", className = ((el.className || "") + "").toLowerCase();
        if (config.allowedTags.includes(tag)) return !0;
        if (config.allowedRoles.length > 0 && role && config.allowedRoles.includes(role)) return !0;
        if (config.allowedClassPatterns.length > 0) for (const pattern of config.allowedClassPatterns) if (className.includes(pattern.toLowerCase())) return !0;
        return !1;
    }
    function isInSameValidContainer(element, candidate, limits) {
        if (!element || !candidate) return !1;
        if (limits.requireSameContainer) {
            const commonParent = function(el1, el2) {
                if (!el1 || !el2) return null;
                const doc = "undefined" != typeof global && global.document || "undefined" != typeof window && window.document || "undefined" != typeof document && document || null, parents1 = [];
                let current = el1;
                for (;current && (parents1.push(current), current.parentElement) && (!doc || current !== doc.body && current !== doc.documentElement); ) current = current.parentElement;
                for (current = el2; current; ) {
                    if (-1 !== parents1.indexOf(current)) return current;
                    if (!current.parentElement) break;
                    if (doc && (current === doc.body || current === doc.documentElement)) break;
                    current = current.parentElement;
                }
                return null;
            }(element, candidate);
            if (!commonParent) return !1;
            if (!function(el, validTags) {
                if (!el || !el.tagName) return !1;
                const tag = el.tagName.toLowerCase();
                let className = "";
                try {
                    className = (el.className || "") + "";
                } catch (e) {
                    className = "";
                }
                return validTags.includes(tag) || className.toLowerCase().includes("form") || className.toLowerCase().includes("field");
            }(commonParent, limits.containerTags)) return !1;
        }
        return !0;
    }
    function getInferredLabel(el, options = {}) {
        if (!el) return null;
        const {enableInference: enableInference = !0, inferenceConfig: inferenceConfig = {}} = options;
        if (!enableInference) return null;
        const ariaLabel = el.getAttribute ? el.getAttribute("aria-label") : null, hasAriaLabel = ariaLabel && ariaLabel.trim(), hasInputValue = "INPUT" === el.tagName && (el.value || el.placeholder), hasImgAlt = "IMG" === el.tagName && el.alt;
        let innerTextValue = "";
        try {
            innerTextValue = el.innerText || "";
        } catch (e) {
            innerTextValue = "";
        }
        const hasInnerText = "INPUT" !== el.tagName && "IMG" !== el.tagName && innerTextValue && innerTextValue.trim();
        if (hasAriaLabel || hasInputValue || hasImgAlt || hasInnerText) return null;
        const config = function(userConfig = {}) {
            return {
                ...DEFAULT_INFERENCE_CONFIG,
                ...userConfig,
                methods: {
                    ...DEFAULT_INFERENCE_CONFIG.methods,
                    ...userConfig.methods || {}
                }
            };
        }(inferenceConfig);
        if (config.methods.explicitLabel && el.labels && el.labels.length > 0) {
            const label = el.labels[0];
            if (isInferenceSource(label, config)) {
                const text = (label.innerText || "").trim();
                if (text) return {
                    text: text,
                    source: "explicit_label"
                };
            }
        }
        if (config.methods.ariaLabelledby && el.hasAttribute && el.hasAttribute("aria-labelledby")) {
            const labelIdsAttr = el.getAttribute("aria-labelledby");
            if (labelIdsAttr) {
                const labelIds = labelIdsAttr.split(/\s+/).filter(id => id.trim()), labelTexts = [], doc = (() => "undefined" != typeof global && global.document ? global.document : "undefined" != typeof window && window.document ? window.document : "undefined" != typeof document ? document : null)();
                if (doc && doc.getElementById) for (const labelId of labelIds) {
                    if (!labelId.trim()) continue;
                    let labelEl = null;
                    try {
                        labelEl = doc.getElementById(labelId);
                    } catch (e) {
                        continue;
                    }
                    if (labelEl) {
                        let text = "";
                        try {
                            if (text = (labelEl.innerText || "").trim(), !text && labelEl.textContent && (text = labelEl.textContent.trim()), 
                            !text && labelEl.getAttribute) {
                                const ariaLabel = labelEl.getAttribute("aria-label");
                                ariaLabel && (text = ariaLabel.trim());
                            }
                        } catch (e) {
                            continue;
                        }
                        text && labelTexts.push(text);
                    }
                } else ;
                if (labelTexts.length > 0) return {
                    text: labelTexts.join(" "),
                    source: "aria_labelledby"
                };
            }
        }
        if (config.methods.parentTraversal) {
            let parent = el.parentElement, depth = 0;
            for (;parent && depth < config.maxParentDepth; ) {
                if (isInferenceSource(parent, config)) {
                    const text = (parent.innerText || "").trim();
                    if (text) return {
                        text: text,
                        source: "parent_label"
                    };
                }
                parent = parent.parentElement, depth++;
            }
        }
        if (config.methods.siblingProximity) {
            const prev = el.previousElementSibling;
            if (prev && isInferenceSource(prev, config) && isInSameValidContainer(el, prev, {
                requireSameContainer: config.requireSameContainer,
                containerTags: config.containerTags
            })) {
                const text = (prev.innerText || "").trim();
                if (text) return {
                    text: text,
                    source: "sibling_label"
                };
            }
        }
        return null;
    }
    function getText(el) {
        return el.getAttribute("aria-label") ? el.getAttribute("aria-label") : "INPUT" === el.tagName ? el.value || el.placeholder || "" : "IMG" === el.tagName ? el.alt || "" : (el.innerText || "").replace(/\s+/g, " ").trim().substring(0, 100);
    }
    function getClassName(el) {
        if (!el || !el.className) return "";
        if ("string" == typeof el.className) return el.className;
        if ("object" == typeof el.className) {
            if ("baseVal" in el.className && "string" == typeof el.className.baseVal) return el.className.baseVal;
            if ("animVal" in el.className && "string" == typeof el.className.animVal) return el.className.animVal;
            try {
                return String(el.className);
            } catch (e) {
                return "";
            }
        }
        return "";
    }
    function toSafeString(value) {
        if (null == value) return null;
        if ("string" == typeof value) return value;
        if ("object" == typeof value) {
            if ("baseVal" in value && "string" == typeof value.baseVal) return value.baseVal;
            if ("animVal" in value && "string" == typeof value.animVal) return value.animVal;
            try {
                return String(value);
            } catch (e) {
                return null;
            }
        }
        try {
            return String(value);
        } catch (e) {
            return null;
        }
    }
    function getSVGColor(el) {
        if (!el || "SVG" !== el.tagName) return null;
        const style = window.getComputedStyle(el), fill = style.fill;
        if (fill && "none" !== fill && "transparent" !== fill && "rgba(0, 0, 0, 0)" !== fill) {
            const rgbaMatch = fill.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (rgbaMatch) {
                if ((rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1) >= .9) return `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
            } else if (fill.startsWith("rgb(")) return fill;
        }
        const stroke = style.stroke;
        if (stroke && "none" !== stroke && "transparent" !== stroke && "rgba(0, 0, 0, 0)" !== stroke) {
            const rgbaMatch = stroke.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (rgbaMatch) {
                if ((rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1) >= .9) return `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
            } else if (stroke.startsWith("rgb(")) return stroke;
        }
        return null;
    }
    function getRawHTML(root) {
        const sourceRoot = root || document.body, clone = sourceRoot.cloneNode(!0);
        [ "nav", "footer", "header", "script", "style", "noscript", "iframe", "svg" ].forEach(tag => {
            clone.querySelectorAll(tag).forEach(el => {
                el.parentNode && el.parentNode.removeChild(el);
            });
        });
        const invisibleSelectors = [], walker = document.createTreeWalker(sourceRoot, NodeFilter.SHOW_ELEMENT, null, !1);
        let node;
        for (;node = walker.nextNode(); ) {
            const tag = node.tagName.toLowerCase();
            if ("head" === tag || "title" === tag) continue;
            const style = window.getComputedStyle(node);
            if ("none" === style.display || "hidden" === style.visibility || 0 === node.offsetWidth && 0 === node.offsetHeight) {
                let selector = tag;
                if (node.id) selector = `#${node.id}`; else if (node.className && "string" == typeof node.className) {
                    const classes = node.className.trim().split(/\s+/).filter(c => c);
                    classes.length > 0 && (selector = `${tag}.${classes.join(".")}`);
                }
                invisibleSelectors.push(selector);
            }
        }
        invisibleSelectors.forEach(selector => {
            try {
                clone.querySelectorAll(selector).forEach(el => {
                    el.parentNode && el.parentNode.removeChild(el);
                });
            } catch (e) {}
        });
        clone.querySelectorAll("a[href]").forEach(link => {
            const href = link.getAttribute("href");
            if (href && !href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("#")) try {
                link.setAttribute("href", new URL(href, document.baseURI).href);
            } catch (e) {}
        });
        return clone.querySelectorAll("img[src]").forEach(img => {
            const src = img.getAttribute("src");
            if (src && !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:")) try {
                img.setAttribute("src", new URL(src, document.baseURI).href);
            } catch (e) {}
        }), clone.innerHTML;
    }
    function cleanElement(obj) {
        if (Array.isArray(obj)) return obj.map(cleanElement);
        if (null !== obj && "object" == typeof obj) {
            const cleaned = {};
            for (const [key, value] of Object.entries(obj)) if (null != value) if ("object" == typeof value) {
                const deepClean = cleanElement(value);
                Object.keys(deepClean).length > 0 && (cleaned[key] = deepClean);
            } else cleaned[key] = value;
            return cleaned;
        }
        return obj;
    }
    async function snapshot(options = {}) {
        try {
            !1 !== options.waitForStability && await async function(options = {}) {
                const {minNodeCount: minNodeCount = 500, quietPeriod: quietPeriod = 200, maxWait: maxWait = 5e3} = options, startTime = Date.now();
                return new Promise(resolve => {
                    if (document.querySelectorAll("*").length >= minNodeCount) {
                        let lastChange = Date.now();
                        const observer = new MutationObserver(() => {
                            lastChange = Date.now();
                        });
                        observer.observe(document.body, {
                            childList: !0,
                            subtree: !0,
                            attributes: !1
                        });
                        const checkStable = () => {
                            const timeSinceLastChange = Date.now() - lastChange, totalWait = Date.now() - startTime;
                            timeSinceLastChange >= quietPeriod || totalWait >= maxWait ? (observer.disconnect(), 
                            resolve()) : setTimeout(checkStable, 50);
                        };
                        checkStable();
                    } else {
                        const observer = new MutationObserver(() => {
                            const currentCount = document.querySelectorAll("*").length, totalWait = Date.now() - startTime;
                            if (currentCount >= minNodeCount) {
                                observer.disconnect();
                                let lastChange = Date.now();
                                const quietObserver = new MutationObserver(() => {
                                    lastChange = Date.now();
                                });
                                quietObserver.observe(document.body, {
                                    childList: !0,
                                    subtree: !0,
                                    attributes: !1
                                });
                                const checkQuiet = () => {
                                    const timeSinceLastChange = Date.now() - lastChange, totalWait = Date.now() - startTime;
                                    timeSinceLastChange >= quietPeriod || totalWait >= maxWait ? (quietObserver.disconnect(), 
                                    resolve()) : setTimeout(checkQuiet, 50);
                                };
                                checkQuiet();
                            } else totalWait >= maxWait && (observer.disconnect(), resolve());
                        });
                        observer.observe(document.body, {
                            childList: !0,
                            subtree: !0,
                            attributes: !1
                        }), setTimeout(() => {
                            observer.disconnect(), resolve();
                        }, maxWait);
                    }
                });
            }(options.waitForStability || {});
            const rawData = [];
            window.sentience_registry = [];
            getAllElements().forEach((el, idx) => {
                if (!el.getBoundingClientRect) return;
                const rect = el.getBoundingClientRect();
                if (rect.width < 5 || rect.height < 5) return;
                window.sentience_registry[idx] = el;
                const semanticText = function(el, options = {}) {
                    if (!el) return {
                        text: "",
                        source: null
                    };
                    const explicitAriaLabel = el.getAttribute ? el.getAttribute("aria-label") : null;
                    if (explicitAriaLabel && explicitAriaLabel.trim()) return {
                        text: explicitAriaLabel.trim(),
                        source: "explicit_aria_label"
                    };
                    if ("INPUT" === el.tagName) {
                        const value = (el.value || el.placeholder || "").trim();
                        if (value) return {
                            text: value,
                            source: "input_value"
                        };
                    }
                    if ("IMG" === el.tagName) {
                        const alt = (el.alt || "").trim();
                        if (alt) return {
                            text: alt,
                            source: "img_alt"
                        };
                    }
                    const innerText = (el.innerText || "").trim();
                    if (innerText) return {
                        text: innerText.substring(0, 100),
                        source: "inner_text"
                    };
                    const inferred = getInferredLabel(el, {
                        enableInference: !1 !== options.enableInference,
                        inferenceConfig: options.inferenceConfig
                    });
                    return inferred || {
                        text: "",
                        source: null
                    };
                }(el, {
                    enableInference: !1 !== options.enableInference,
                    inferenceConfig: options.inferenceConfig
                }), textVal = semanticText.text || getText(el), inferredRole = function(el, options = {}) {
                    const {enableInference: enableInference = !0} = options;
                    if (!enableInference) return null;
                    if (!function(el) {
                        if (!el || !el.tagName) return !1;
                        const tag = el.tagName.toLowerCase(), role = el.getAttribute ? el.getAttribute("role") : null, hasTabIndex = !!el.hasAttribute && el.hasAttribute("tabindex"), hasHref = "A" === el.tagName && !!el.hasAttribute && el.hasAttribute("href");
                        return [ "button", "input", "textarea", "select", "option", "details", "summary", "a" ].includes(tag) ? !("a" === tag && !hasHref) : !(!role || ![ "button", "link", "tab", "menuitem", "checkbox", "radio", "switch", "slider", "combobox", "textbox", "searchbox", "spinbutton" ].includes(role.toLowerCase())) || (!!hasTabIndex || (!!(el.onclick || el.onkeydown || el.onkeypress || el.onkeyup) || !(!el.getAttribute || !(el.getAttribute("onclick") || el.getAttribute("onkeydown") || el.getAttribute("onkeypress") || el.getAttribute("onkeyup")))));
                    }(el)) return null;
                    const hasAriaLabel = el.getAttribute ? el.getAttribute("aria-label") : null, hasExplicitRole = el.getAttribute ? el.getAttribute("role") : null;
                    if (hasAriaLabel || hasExplicitRole) return null;
                    const tag = el.tagName.toLowerCase();
                    return [ "button", "a", "input", "textarea", "select", "option" ].includes(tag) ? null : el.onclick || el.getAttribute && el.getAttribute("onclick") || el.onkeydown || el.onkeypress || el.onkeyup || el.getAttribute && (el.getAttribute("onkeydown") || el.getAttribute("onkeypress") || el.getAttribute("onkeyup")) || el.hasAttribute && el.hasAttribute("tabindex") && ("div" === tag || "span" === tag) ? "button" : null;
                }(el, {
                    enableInference: !1 !== options.enableInference,
                    inferenceConfig: options.inferenceConfig
                }), inView = function(rect) {
                    return rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
                }(rect), style = window.getComputedStyle(el), occluded = !!inView && function(el, rect, style) {
                    const zIndex = parseInt(style.zIndex, 10);
                    if ("static" === style.position && (isNaN(zIndex) || zIndex <= 10)) return !1;
                    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
                    if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) return !1;
                    const topEl = document.elementFromPoint(cx, cy);
                    return !!topEl && !(el === topEl || el.contains(topEl) || topEl.contains(el));
                }(el, rect, style), effectiveBgColor = function(el) {
                    if (!el) return null;
                    if ("SVG" === el.tagName) {
                        const svgColor = getSVGColor(el);
                        if (svgColor) return svgColor;
                    }
                    let current = el, depth = 0;
                    for (;current && depth < 10; ) {
                        const style = window.getComputedStyle(current);
                        if ("SVG" === current.tagName) {
                            const svgColor = getSVGColor(current);
                            if (svgColor) return svgColor;
                        }
                        const bgColor = style.backgroundColor;
                        if (bgColor && "transparent" !== bgColor && "rgba(0, 0, 0, 0)" !== bgColor) {
                            const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                            if (!rgbaMatch) return bgColor.startsWith("rgb("), bgColor;
                            if ((rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1) >= .9) return `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
                        }
                        current = current.parentElement, depth++;
                    }
                    return null;
                }(el);
                rawData.push({
                    id: idx,
                    tag: el.tagName.toLowerCase(),
                    rect: {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    },
                    styles: {
                        display: toSafeString(style.display),
                        visibility: toSafeString(style.visibility),
                        opacity: toSafeString(style.opacity),
                        z_index: toSafeString(style.zIndex || "auto"),
                        position: toSafeString(style.position),
                        bg_color: toSafeString(effectiveBgColor || style.backgroundColor),
                        color: toSafeString(style.color),
                        cursor: toSafeString(style.cursor),
                        font_weight: toSafeString(style.fontWeight),
                        font_size: toSafeString(style.fontSize)
                    },
                    attributes: {
                        role: toSafeString(el.getAttribute("role")),
                        type_: toSafeString(el.getAttribute("type")),
                        aria_label: "explicit_aria_label" === semanticText?.source ? semanticText.text : toSafeString(el.getAttribute("aria-label")),
                        inferred_label: semanticText?.source && ![ "explicit_aria_label", "input_value", "img_alt", "inner_text" ].includes(semanticText.source) ? toSafeString(semanticText.text) : null,
                        label_source: semanticText?.source || null,
                        inferred_role: inferredRole ? toSafeString(inferredRole) : null,
                        href: toSafeString(el.href || el.getAttribute("href") || null),
                        class: toSafeString(getClassName(el)),
                        value: void 0 !== el.value ? toSafeString(el.value) : toSafeString(el.getAttribute("value")),
                        checked: void 0 !== el.checked ? String(el.checked) : null
                    },
                    text: toSafeString(textVal),
                    in_viewport: inView,
                    is_occluded: occluded
                });
            });
            const allRawElements = [ ...rawData ];
            let totalIframeElements = 0;
            if (!1 !== options.collectIframes) try {
                const iframeSnapshots = await async function(options = {}) {
                    const iframeData = new Map, iframes = Array.from(document.querySelectorAll("iframe"));
                    if (0 === iframes.length) return iframeData;
                    const iframePromises = iframes.map((iframe, idx) => {
                        const src = iframe.src || "";
                        return src.includes("doubleclick") || src.includes("googleadservices") || src.includes("ads system") ? Promise.resolve(null) : new Promise(resolve => {
                            const requestId = `iframe-${idx}-${Date.now()}`, timeout = setTimeout(() => {
                                resolve(null);
                            }, 5e3), listener = event => {
                                "SENTIENCE_IFRAME_SNAPSHOT_RESPONSE" === event.data?.type && event.data, "SENTIENCE_IFRAME_SNAPSHOT_RESPONSE" === event.data?.type && event.data?.requestId === requestId && (clearTimeout(timeout), 
                                window.removeEventListener("message", listener), event.data.error ? resolve(null) : (event.data.snapshot, 
                                resolve({
                                    iframe: iframe,
                                    data: event.data.snapshot,
                                    error: null
                                })));
                            };
                            window.addEventListener("message", listener);
                            try {
                                iframe.contentWindow ? iframe.contentWindow.postMessage({
                                    type: "SENTIENCE_IFRAME_SNAPSHOT_REQUEST",
                                    requestId: requestId,
                                    options: {
                                        ...options,
                                        collectIframes: !0
                                    }
                                }, "*") : (clearTimeout(timeout), window.removeEventListener("message", listener), 
                                resolve(null));
                            } catch (error) {
                                clearTimeout(timeout), window.removeEventListener("message", listener), resolve(null);
                            }
                        });
                    });
                    return (await Promise.all(iframePromises)).forEach((result, idx) => {
                        result && result.data && !result.error ? iframeData.set(iframes[idx], result.data) : result && result.error;
                    }), iframeData;
                }(options);
                iframeSnapshots.size > 0 && iframeSnapshots.forEach((iframeSnapshot, iframeEl) => {
                    if (iframeSnapshot && iframeSnapshot.raw_elements) {
                        iframeSnapshot.raw_elements.length;
                        const iframeRect = iframeEl.getBoundingClientRect(), offset = {
                            x: iframeRect.x,
                            y: iframeRect.y
                        }, iframeSrc = iframeEl.src || iframeEl.getAttribute("src") || "";
                        let isSameOrigin = !1;
                        try {
                            isSameOrigin = null !== iframeEl.contentWindow;
                        } catch (e) {
                            isSameOrigin = !1;
                        }
                        const adjustedElements = iframeSnapshot.raw_elements.map(el => {
                            const adjusted = {
                                ...el
                            };
                            return adjusted.rect && (adjusted.rect = {
                                ...adjusted.rect,
                                x: adjusted.rect.x + offset.x,
                                y: adjusted.rect.y + offset.y
                            }), adjusted.iframe_context = {
                                src: iframeSrc,
                                is_same_origin: isSameOrigin
                            }, adjusted;
                        });
                        allRawElements.push(...adjustedElements), totalIframeElements += adjustedElements.length;
                    }
                });
            } catch (error) {}
            const processed = await function(rawData, options) {
                return new Promise((resolve, reject) => {
                    const requestId = Math.random().toString(36).substring(7);
                    let resolved = !1;
                    const timeout = setTimeout(() => {
                        resolved || (resolved = !0, window.removeEventListener("message", listener), reject(new Error("WASM processing timeout - extension may be unresponsive. Try reloading the extension.")));
                    }, 25e3), listener = e => {
                        if ("SENTIENCE_SNAPSHOT_RESULT" === e.data.type && e.data.requestId === requestId) {
                            if (resolved) return;
                            resolved = !0, clearTimeout(timeout), window.removeEventListener("message", listener), 
                            e.data.error ? reject(new Error(e.data.error)) : resolve({
                                elements: e.data.elements,
                                raw_elements: e.data.raw_elements,
                                duration: e.data.duration
                            });
                        }
                    };
                    window.addEventListener("message", listener);
                    try {
                        window.postMessage({
                            type: "SENTIENCE_SNAPSHOT_REQUEST",
                            requestId: requestId,
                            rawData: rawData,
                            options: options
                        }, "*");
                    } catch (error) {
                        resolved || (resolved = !0, clearTimeout(timeout), window.removeEventListener("message", listener), 
                        reject(new Error(`Failed to send snapshot request: ${error.message}`)));
                    }
                });
            }(allRawElements, options);
            if (!processed || !processed.elements) throw new Error("WASM processing returned invalid result");
            let screenshot = null;
            options.screenshot && (screenshot = await function(options) {
                return new Promise(resolve => {
                    const requestId = Math.random().toString(36).substring(7), listener = e => {
                        "SENTIENCE_SCREENSHOT_RESULT" === e.data.type && e.data.requestId === requestId && (window.removeEventListener("message", listener), 
                        resolve(e.data.screenshot));
                    };
                    window.addEventListener("message", listener), window.postMessage({
                        type: "SENTIENCE_SCREENSHOT_REQUEST",
                        requestId: requestId,
                        options: options
                    }, "*"), setTimeout(() => {
                        window.removeEventListener("message", listener), resolve(null);
                    }, 1e4);
                });
            }(options.screenshot));
            const cleanedElements = cleanElement(processed.elements), cleanedRawElements = cleanElement(processed.raw_elements);
            cleanedElements.length, cleanedRawElements.length;
            return {
                status: "success",
                url: window.location.href,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                elements: cleanedElements,
                raw_elements: cleanedRawElements,
                screenshot: screenshot
            };
        } catch (error) {
            return {
                status: "error",
                error: error.message || "Unknown error",
                stack: error.stack
            };
        }
    }
    function read(options = {}) {
        const format = options.format || "raw";
        let content;
        return content = "raw" === format ? getRawHTML(document.body) : "markdown" === format ? function(root) {
            const rawHTML = getRawHTML(root), tempDiv = document.createElement("div");
            tempDiv.innerHTML = rawHTML;
            let markdown = "", insideLink = !1;
            return function walk(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
                    return void (text.trim() && (markdown += text));
                }
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                const tag = node.tagName.toLowerCase();
                if ("h1" === tag && (markdown += "\n# "), "h2" === tag && (markdown += "\n## "), 
                "h3" === tag && (markdown += "\n### "), "li" === tag && (markdown += "\n- "), insideLink || "p" !== tag && "div" !== tag && "br" !== tag || (markdown += "\n"), 
                "strong" !== tag && "b" !== tag || (markdown += "**"), "em" !== tag && "i" !== tag || (markdown += "_"), 
                "a" === tag && (markdown += "[", insideLink = !0), node.shadowRoot ? Array.from(node.shadowRoot.childNodes).forEach(walk) : node.childNodes.forEach(walk), 
                "a" === tag) {
                    const href = node.getAttribute("href");
                    markdown += href ? `](${href})` : "]", insideLink = !1;
                }
                "strong" !== tag && "b" !== tag || (markdown += "**"), "em" !== tag && "i" !== tag || (markdown += "_"), 
                insideLink || "h1" !== tag && "h2" !== tag && "h3" !== tag && "p" !== tag && "div" !== tag || (markdown += "\n");
            }(tempDiv), markdown.replace(/\n{3,}/g, "\n\n").trim();
        }(document.body) : function(root) {
            let text = "";
            return function walk(node) {
                if (node.nodeType !== Node.TEXT_NODE) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const tag = node.tagName.toLowerCase();
                        if ([ "nav", "footer", "header", "script", "style", "noscript", "iframe", "svg" ].includes(tag)) return;
                        const style = window.getComputedStyle(node);
                        if ("none" === style.display || "hidden" === style.visibility) return;
                        const isBlock = "block" === style.display || "flex" === style.display || "P" === node.tagName || "DIV" === node.tagName;
                        isBlock && (text += " "), node.shadowRoot ? Array.from(node.shadowRoot.childNodes).forEach(walk) : node.childNodes.forEach(walk), 
                        isBlock && (text += "\n");
                    }
                } else text += node.textContent;
            }(root || document.body), text.replace(/\n{3,}/g, "\n\n").trim();
        }(document.body), {
            status: "success",
            url: window.location.href,
            format: format,
            content: content,
            length: content.length
        };
    }
    function findTextRect(options = {}) {
        const {text: text, containerElement: containerElement = document.body, caseSensitive: caseSensitive = !1, wholeWord: wholeWord = !1, maxResults: maxResults = 10} = options;
        if (!text || 0 === text.trim().length) return {
            status: "error",
            error: "Text parameter is required"
        };
        const results = [], searchText = caseSensitive ? text : text.toLowerCase();
        function findInTextNode(textNode) {
            const nodeText = textNode.nodeValue, searchableText = caseSensitive ? nodeText : nodeText.toLowerCase();
            let startIndex = 0;
            for (;startIndex < nodeText.length && results.length < maxResults; ) {
                const foundIndex = searchableText.indexOf(searchText, startIndex);
                if (-1 === foundIndex) break;
                if (wholeWord) {
                    const before = foundIndex > 0 ? nodeText[foundIndex - 1] : " ", after = foundIndex + text.length < nodeText.length ? nodeText[foundIndex + text.length] : " ";
                    if (!/\s/.test(before) || !/\s/.test(after)) {
                        startIndex = foundIndex + 1;
                        continue;
                    }
                }
                try {
                    const range = document.createRange();
                    range.setStart(textNode, foundIndex), range.setEnd(textNode, foundIndex + text.length);
                    const rect = range.getBoundingClientRect();
                    rect.width > 0 && rect.height > 0 && results.push({
                        text: nodeText.substring(foundIndex, foundIndex + text.length),
                        rect: {
                            x: rect.left + window.scrollX,
                            y: rect.top + window.scrollY,
                            width: rect.width,
                            height: rect.height,
                            left: rect.left + window.scrollX,
                            top: rect.top + window.scrollY,
                            right: rect.right + window.scrollX,
                            bottom: rect.bottom + window.scrollY
                        },
                        viewport_rect: {
                            x: rect.left,
                            y: rect.top,
                            width: rect.width,
                            height: rect.height
                        },
                        context: {
                            before: nodeText.substring(Math.max(0, foundIndex - 20), foundIndex),
                            after: nodeText.substring(foundIndex + text.length, Math.min(nodeText.length, foundIndex + text.length + 20))
                        },
                        in_viewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth
                    });
                } catch (e) {}
                startIndex = foundIndex + 1;
            }
        }
        const walker = document.createTreeWalker(containerElement, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tagName = parent.tagName.toLowerCase();
                if ("script" === tagName || "style" === tagName || "noscript" === tagName) return NodeFilter.FILTER_REJECT;
                if (!node.nodeValue || 0 === node.nodeValue.trim().length) return NodeFilter.FILTER_REJECT;
                const computedStyle = window.getComputedStyle(parent);
                return "none" === computedStyle.display || "hidden" === computedStyle.visibility || "0" === computedStyle.opacity ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        });
        let currentNode;
        for (;(currentNode = walker.nextNode()) && results.length < maxResults; ) findInTextNode(currentNode);
        return {
            status: "success",
            query: text,
            case_sensitive: caseSensitive,
            whole_word: wholeWord,
            matches: results.length,
            results: results,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                scroll_x: window.scrollX,
                scroll_y: window.scrollY
            }
        };
    }
    function click(id) {
        const el = window.sentience_registry[id];
        return !!el && (el.click(), el.focus(), !0);
    }
    function startRecording(options = {}) {
        const {highlightColor: highlightColor = "#ff0000", successColor: successColor = "#00ff00", autoDisableTimeout: autoDisableTimeout = 18e5, keyboardShortcut: keyboardShortcut = "Ctrl+Shift+I"} = options;
        if (!window.sentience_registry || 0 === window.sentience_registry.length) return alert("Registry empty. Run `await window.sentience.snapshot()` first!"), 
        () => {};
        window.sentience_registry_map = new Map, window.sentience_registry.forEach((el, idx) => {
            el && window.sentience_registry_map.set(el, idx);
        });
        let highlightBox = document.getElementById("sentience-highlight-box");
        highlightBox || (highlightBox = document.createElement("div"), highlightBox.id = "sentience-highlight-box", 
        highlightBox.style.cssText = `\n            position: fixed;\n            pointer-events: none;\n            z-index: 2147483647;\n            border: 2px solid ${highlightColor};\n            background: rgba(255, 0, 0, 0.1);\n            display: none;\n            transition: all 0.1s ease;\n            box-sizing: border-box;\n        `, 
        document.body.appendChild(highlightBox));
        let recordingIndicator = document.getElementById("sentience-recording-indicator");
        recordingIndicator || (recordingIndicator = document.createElement("div"), recordingIndicator.id = "sentience-recording-indicator", 
        recordingIndicator.style.cssText = `\n            position: fixed;\n            top: 0;\n            left: 0;\n            right: 0;\n            height: 3px;\n            background: ${highlightColor};\n            z-index: 2147483646;\n            pointer-events: none;\n        `, 
        document.body.appendChild(recordingIndicator)), recordingIndicator.style.display = "block";
        const mouseOverHandler = e => {
            const el = e.target;
            if (!el || el === highlightBox || el === recordingIndicator) return;
            const rect = el.getBoundingClientRect();
            highlightBox.style.display = "block", highlightBox.style.top = rect.top + window.scrollY + "px", 
            highlightBox.style.left = rect.left + window.scrollX + "px", highlightBox.style.width = rect.width + "px", 
            highlightBox.style.height = rect.height + "px";
        }, clickHandler = e => {
            e.preventDefault(), e.stopPropagation();
            const el = e.target;
            if (!el || el === highlightBox || el === recordingIndicator) return;
            const sentienceId = window.sentience_registry_map.get(el);
            if (void 0 === sentienceId) return void alert("Element not in registry. Run `await window.sentience.snapshot()` first!");
            const rawData = function(el) {
                const style = window.getComputedStyle(el), rect = el.getBoundingClientRect();
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
                        role: el.getAttribute("role") || null,
                        type: el.getAttribute("type") || null,
                        ariaLabel: el.getAttribute("aria-label") || null,
                        id: el.id || null,
                        className: el.className || null
                    }
                };
            }(el), selector = function(el) {
                if (!el || !el.tagName) return "";
                if (el.id) return `#${el.id}`;
                for (const attr of el.attributes) if (attr.name.startsWith("data-") || "aria-label" === attr.name) {
                    const value = attr.value ? attr.value.replace(/"/g, '\\"') : "";
                    return `${el.tagName.toLowerCase()}[${attr.name}="${value}"]`;
                }
                const path = [];
                let current = el;
                for (;current && current !== document.body && current !== document.documentElement; ) {
                    let selector = current.tagName.toLowerCase();
                    if (current.id) {
                        selector = `#${current.id}`, path.unshift(selector);
                        break;
                    }
                    if (current.className && "string" == typeof current.className) {
                        const classes = current.className.trim().split(/\s+/).filter(c => c);
                        classes.length > 0 && (selector += `.${classes[0]}`);
                    }
                    if (current.parentElement) {
                        const sameTagSiblings = Array.from(current.parentElement.children).filter(s => s.tagName === current.tagName), index = sameTagSiblings.indexOf(current);
                        (index > 0 || sameTagSiblings.length > 1) && (selector += `:nth-of-type(${index + 1})`);
                    }
                    path.unshift(selector), current = current.parentElement;
                }
                return path.join(" > ") || el.tagName.toLowerCase();
            }(el), role = el.getAttribute("role") || el.tagName.toLowerCase(), text = getText(el), snippet = {
                task: `Interact with ${text.substring(0, 20)}${text.length > 20 ? "..." : ""}`,
                url: window.location.href,
                timestamp: (new Date).toISOString(),
                target_criteria: {
                    id: sentienceId,
                    selector: selector,
                    role: role,
                    text: text.substring(0, 50)
                },
                debug_snapshot: rawData
            }, jsonString = JSON.stringify(snippet, null, 2);
            navigator.clipboard.writeText(jsonString).then(() => {
                highlightBox.style.border = `2px solid ${successColor}`, highlightBox.style.background = "rgba(0, 255, 0, 0.2)", 
                setTimeout(() => {
                    highlightBox.style.border = `2px solid ${highlightColor}`, highlightBox.style.background = "rgba(255, 0, 0, 0.1)";
                }, 500);
            }).catch(err => {
                alert("Failed to copy to clipboard. Check console for JSON.");
            });
        };
        let timeoutId = null;
        const stopRecording = () => {
            document.removeEventListener("mouseover", mouseOverHandler, !0), document.removeEventListener("click", clickHandler, !0), 
            document.removeEventListener("keydown", keyboardHandler, !0), timeoutId && (clearTimeout(timeoutId), 
            timeoutId = null), highlightBox && (highlightBox.style.display = "none"), recordingIndicator && (recordingIndicator.style.display = "none"), 
            window.sentience_registry_map && window.sentience_registry_map.clear(), window.sentience_stopRecording === stopRecording && delete window.sentience_stopRecording;
        }, keyboardHandler = e => {
            (e.ctrlKey || e.metaKey) && e.shiftKey && "I" === e.key && (e.preventDefault(), 
            stopRecording());
        };
        return document.addEventListener("mouseover", mouseOverHandler, !0), document.addEventListener("click", clickHandler, !0), 
        document.addEventListener("keydown", keyboardHandler, !0), autoDisableTimeout > 0 && (timeoutId = setTimeout(() => {
            stopRecording();
        }, autoDisableTimeout)), window.sentience_stopRecording = stopRecording, stopRecording;
    }
    function showOverlay(elements, targetElementId = null) {
        elements && Array.isArray(elements) && window.postMessage({
            type: "SENTIENCE_SHOW_OVERLAY",
            elements: elements,
            targetElementId: targetElementId,
            timestamp: Date.now()
        }, "*");
    }
    function clearOverlay() {
        window.postMessage({
            type: "SENTIENCE_CLEAR_OVERLAY"
        }, "*");
    }
    (async () => {
        const getExtensionId = () => document.documentElement.dataset.sentienceExtensionId;
        let extId = getExtensionId();
        extId || await new Promise(resolve => {
            const check = setInterval(() => {
                extId = getExtensionId(), extId && (clearInterval(check), resolve());
            }, 50);
            setTimeout(() => resolve(), 5e3);
        }), extId && (window.sentience_registry = [], window.sentience = {
            snapshot: snapshot,
            read: read,
            findTextRect: findTextRect,
            click: click,
            startRecording: startRecording,
            showOverlay: showOverlay,
            clearOverlay: clearOverlay
        }, window.sentience_iframe_handler_setup || (window.addEventListener("message", async event => {
            if ("SENTIENCE_IFRAME_SNAPSHOT_REQUEST" === event.data?.type) {
                const {requestId: requestId, options: options} = event.data;
                try {
                    const snapshotOptions = {
                        ...options,
                        collectIframes: !0,
                        waitForStability: (options.waitForStability, !1)
                    }, snapshot = await window.sentience.snapshot(snapshotOptions);
                    event.source && event.source.postMessage && event.source.postMessage({
                        type: "SENTIENCE_IFRAME_SNAPSHOT_RESPONSE",
                        requestId: requestId,
                        snapshot: snapshot,
                        error: null
                    }, "*");
                } catch (error) {
                    event.source && event.source.postMessage && event.source.postMessage({
                        type: "SENTIENCE_IFRAME_SNAPSHOT_RESPONSE",
                        requestId: requestId,
                        snapshot: null,
                        error: error.message
                    }, "*");
                }
            }
        }), window.sentience_iframe_handler_setup = !0));
    })();
}();