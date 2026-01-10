// Sentience Chrome Extension - Injected API
// Auto-generated from modular source
(function () {
  'use strict';

  // utils.js - Helper Functions (CSP-Resistant)
  // All utility functions needed for DOM data collection

  // --- HELPER: Deep Walker with Native Filter ---
  function getAllElements(root = document) {
    const elements = [];
    const filter = {
      acceptNode(node) {
        // Skip metadata and script/style tags
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HEAD'].includes(node.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip deep SVG children
        if (node.parentNode && node.parentNode.tagName === 'SVG' && node.tagName !== 'SVG') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    };

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, filter);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.isConnected) {
        elements.push(node);
        if (node.shadowRoot) elements.push(...getAllElements(node.shadowRoot));
      }
    }
    return elements;
  }

  // ============================================================================
  // LABEL INFERENCE SYSTEM
  // ============================================================================

  // Default inference configuration (conservative - Stage 1 equivalent)
  const DEFAULT_INFERENCE_CONFIG = {
    // Allowed tag names that can be inference sources
    allowedTags: ['label', 'span', 'div'],

    // Allowed ARIA roles that can be inference sources
    allowedRoles: [],

    // Class name patterns (substring match, case-insensitive)
    allowedClassPatterns: [],

    // DOM tree traversal limits
    maxParentDepth: 2, // Max 2 levels up DOM tree
    maxSiblingDistance: 1, // Only immediate previous/next sibling

    // Container requirements (no distance-based checks)
    requireSameContainer: true, // Must share common parent
    containerTags: ['form', 'fieldset', 'div'],

    // Enable/disable specific inference methods
    methods: {
      explicitLabel: true, // el.labels API
      ariaLabelledby: true, // aria-labelledby attribute
      parentTraversal: true, // Check parent/grandparent
      siblingProximity: true, // Check preceding sibling (same container only)
    },
  };

  // Merge user config with defaults
  function mergeInferenceConfig(userConfig = {}) {
    return {
      ...DEFAULT_INFERENCE_CONFIG,
      ...userConfig,
      methods: {
        ...DEFAULT_INFERENCE_CONFIG.methods,
        ...(userConfig.methods || {}),
      },
    };
  }

  // Check if element matches inference source criteria
  function isInferenceSource(el, config) {
    if (!el || !el.tagName) return false;

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute ? el.getAttribute('role') : '';
    const className = ((el.className || '') + '').toLowerCase();

    // Check tag name
    if (config.allowedTags.includes(tag)) {
      return true;
    }

    // Check role
    if (config.allowedRoles.length > 0 && role && config.allowedRoles.includes(role)) {
      return true;
    }

    // Check class patterns
    if (config.allowedClassPatterns.length > 0) {
      for (const pattern of config.allowedClassPatterns) {
        if (className.includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  // Helper: Find common parent element
  function findCommonParent(el1, el2) {
    if (!el1 || !el2) return null;

    // Get document reference safely for stopping conditions
    // eslint-disable-next-line no-undef
    const doc =
      (typeof global !== 'undefined' && global.document) ||
      (typeof window !== 'undefined' && window.document) ||
      (typeof document !== 'undefined' && document) ||
      null;

    const parents1 = [];
    let current = el1;
    // Collect all parents (including el1 itself)
    while (current) {
      parents1.push(current);
      // Stop if no parent
      if (!current.parentElement) {
        break;
      }
      // Stop at body or documentElement if they exist
      if (doc && (current === doc.body || current === doc.documentElement)) {
        break;
      }
      current = current.parentElement;
    }

    // Check if el2 or any of its parents are in parents1
    current = el2;
    while (current) {
      // Use indexOf for more reliable comparison (handles object identity)
      if (parents1.indexOf(current) !== -1) {
        return current;
      }
      // Stop if no parent
      if (!current.parentElement) {
        break;
      }
      // Stop at body or documentElement if they exist
      if (doc && (current === doc.body || current === doc.documentElement)) {
        break;
      }
      current = current.parentElement;
    }

    return null;
  }

  // Helper: Check if element is a valid container
  function isValidContainer(el, validTags) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    // Handle both string and object className
    let className = '';
    try {
      className = (el.className || '') + '';
    } catch (e) {
      className = '';
    }
    return (
      validTags.includes(tag) ||
      className.toLowerCase().includes('form') ||
      className.toLowerCase().includes('field')
    );
  }

  // Helper: Check container requirements (no distance-based checks)
  function isInSameValidContainer(element, candidate, limits) {
    if (!element || !candidate) return false;

    // Check same container requirement
    if (limits.requireSameContainer) {
      const commonParent = findCommonParent(element, candidate);
      if (!commonParent) {
        return false;
      }
      // Check if common parent is a valid container
      if (!isValidContainer(commonParent, limits.containerTags)) {
        return false;
      }
    }

    return true;
  }

  // Main inference function
  function getInferredLabel(el, options = {}) {
    if (!el) return null;

    const {
      enableInference = true,
      inferenceConfig = {}, // User-provided config, merged with defaults
    } = options;

    if (!enableInference) return null;

    // OPTIMIZATION: If element already has text or aria-label, skip inference entirely
    // Check this BEFORE checking labels, so we don't infer if element already has text
    // Note: For INPUT elements, we check value/placeholder, not innerText
    // For IMG elements, we check alt, not innerText
    // For other elements, innerText is considered explicit text
    const ariaLabel = el.getAttribute ? el.getAttribute('aria-label') : null;
    const hasAriaLabel = ariaLabel && ariaLabel.trim();
    const hasInputValue = el.tagName === 'INPUT' && (el.value || el.placeholder);
    const hasImgAlt = el.tagName === 'IMG' && el.alt;
    // For non-input/img elements, check innerText - but only if it's not empty
    // Access innerText safely - it might be a getter or property
    let innerTextValue = '';
    try {
      innerTextValue = el.innerText || '';
    } catch (e) {
      // If innerText access fails, treat as empty
      innerTextValue = '';
    }
    const hasInnerText =
      el.tagName !== 'INPUT' && el.tagName !== 'IMG' && innerTextValue && innerTextValue.trim();

    if (hasAriaLabel || hasInputValue || hasImgAlt || hasInnerText) {
      return null;
    }

    // Merge config with defaults
    const config = mergeInferenceConfig(inferenceConfig);

    // Method 1: Explicit label association (el.labels API)
    if (config.methods.explicitLabel && el.labels && el.labels.length > 0) {
      const label = el.labels[0];
      if (isInferenceSource(label, config)) {
        const text = (label.innerText || '').trim();
        if (text) {
          return {
            text,
            source: 'explicit_label',
          };
        }
      }
    }

    // Method 2: aria-labelledby (supports space-separated list of IDs)
    // NOTE: aria-labelledby is an EXPLICIT reference, so it should work with ANY element
    // regardless of inference source criteria. The config only controls whether this method runs.
    if (config.methods.ariaLabelledby && el.hasAttribute && el.hasAttribute('aria-labelledby')) {
      const labelIdsAttr = el.getAttribute('aria-labelledby');
      if (labelIdsAttr) {
        // Split by whitespace to support multiple IDs (space-separated list)
        const labelIds = labelIdsAttr.split(/\s+/).filter((id) => id.trim());
        const labelTexts = [];

        // Helper function to get document.getElementById from available contexts
        const getDocument = () => {
          // eslint-disable-next-line no-undef
          if (typeof global !== 'undefined' && global.document) {
            // eslint-disable-next-line no-undef
            return global.document;
          }
          if (typeof window !== 'undefined' && window.document) {
            return window.document;
          }
          if (typeof document !== 'undefined') {
            return document;
          }
          return null;
        };

        const doc = getDocument();
        if (!doc || !doc.getElementById) ; else {
          // Process each ID in the space-separated list
          for (const labelId of labelIds) {
            if (!labelId.trim()) continue;

            let labelEl = null;
            try {
              labelEl = doc.getElementById(labelId);
            } catch (e) {
              // If getElementById fails, skip this ID
              continue;
            }

            // aria-labelledby is an explicit reference - use ANY element, not just those matching inference criteria
            // This follows ARIA spec: aria-labelledby can reference any element in the document
            if (labelEl) {
              // Extract text from the referenced element
              let text = '';
              try {
                // Try innerText first (preferred for visible text)
                text = (labelEl.innerText || '').trim();
                // Fallback to textContent if innerText is empty
                if (!text && labelEl.textContent) {
                  text = labelEl.textContent.trim();
                }
                // Fallback to aria-label if available
                if (!text && labelEl.getAttribute) {
                  const ariaLabel = labelEl.getAttribute('aria-label');
                  if (ariaLabel) {
                    text = ariaLabel.trim();
                  }
                }
              } catch (e) {
                // If text extraction fails, skip this element
                continue;
              }

              if (text) {
                labelTexts.push(text);
              }
            }
          }
        }

        // Combine multiple label texts (space-separated)
        if (labelTexts.length > 0) {
          return {
            text: labelTexts.join(' '),
            source: 'aria_labelledby',
          };
        }
      }
    }

    // Method 3: Parent/grandparent traversal
    if (config.methods.parentTraversal) {
      let parent = el.parentElement;
      let depth = 0;
      while (parent && depth < config.maxParentDepth) {
        if (isInferenceSource(parent, config)) {
          const text = (parent.innerText || '').trim();
          if (text) {
            return {
              text,
              source: 'parent_label',
            };
          }
        }
        parent = parent.parentElement;
        depth++;
      }
    }

    // Method 4: Preceding sibling (no distance-based checks, only DOM structure)
    if (config.methods.siblingProximity) {
      const prev = el.previousElementSibling;
      if (prev && isInferenceSource(prev, config)) {
        // Only check if they're in the same valid container (no pixel distance)
        if (
          isInSameValidContainer(el, prev, {
            requireSameContainer: config.requireSameContainer,
            containerTags: config.containerTags,
          })
        ) {
          const text = (prev.innerText || '').trim();
          if (text) {
            return {
              text,
              source: 'sibling_label',
            };
          }
        }
      }
    }

    return null;
  }

  // Helper: Check if element is interactable (should have role inferred)
  function isInteractableElement(el) {
    if (!el || !el.tagName) return false;

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute ? el.getAttribute('role') : null;
    const hasTabIndex = el.hasAttribute ? el.hasAttribute('tabindex') : false;
    const hasHref = el.tagName === 'A' && (el.hasAttribute ? el.hasAttribute('href') : false);

    // Native interactive elements
    const interactiveTags = [
      'button',
      'input',
      'textarea',
      'select',
      'option',
      'details',
      'summary',
      'a',
    ];
    if (interactiveTags.includes(tag)) {
      // For <a>, only if it has href
      if (tag === 'a' && !hasHref) return false;
      return true;
    }

    // Elements with explicit interactive roles
    const interactiveRoles = [
      'button',
      'link',
      'tab',
      'menuitem',
      'checkbox',
      'radio',
      'switch',
      'slider',
      'combobox',
      'textbox',
      'searchbox',
      'spinbutton',
    ];
    if (role && interactiveRoles.includes(role.toLowerCase())) {
      return true;
    }

    // Focusable elements (tabindex makes them interactive)
    if (hasTabIndex) {
      return true;
    }

    // Elements with event handlers (custom interactive elements)
    if (el.onclick || el.onkeydown || el.onkeypress || el.onkeyup) {
      return true;
    }

    // Check for inline event handlers via attributes
    if (el.getAttribute) {
      const hasInlineHandler =
        el.getAttribute('onclick') ||
        el.getAttribute('onkeydown') ||
        el.getAttribute('onkeypress') ||
        el.getAttribute('onkeyup');
      if (hasInlineHandler) {
        return true;
      }
    }

    return false;
  }

  // Helper: Infer ARIA role for interactable elements
  function getInferredRole(el, options = {}) {
    const {
      enableInference = true,
      // inferenceConfig reserved for future extensibility
    } = options;

    if (!enableInference) return null;

    // Only infer roles for interactable elements
    if (!isInteractableElement(el)) {
      return null;
    }

    // CRITICAL: Only infer if element has NO aria-label AND NO explicit role
    const hasAriaLabel = el.getAttribute ? el.getAttribute('aria-label') : null;
    const hasExplicitRole = el.getAttribute ? el.getAttribute('role') : null;

    if (hasAriaLabel || hasExplicitRole) {
      return null; // Skip inference if element already has aria-label or role
    }

    // If element is native semantic HTML, it already has a role
    const tag = el.tagName.toLowerCase();
    const semanticTags = ['button', 'a', 'input', 'textarea', 'select', 'option'];
    if (semanticTags.includes(tag)) {
      return null; // Native HTML already has role
    }

    // Infer role based on element behavior or context
    // Check for click handlers first (most common)
    if (el.onclick || (el.getAttribute && el.getAttribute('onclick'))) {
      return 'button';
    }

    // Check for keyboard handlers
    if (
      el.onkeydown ||
      el.onkeypress ||
      el.onkeyup ||
      (el.getAttribute &&
        (el.getAttribute('onkeydown') || el.getAttribute('onkeypress') || el.getAttribute('onkeyup')))
    ) {
      return 'button'; // Default to button for keyboard-interactive elements
    }

    // Focusable div/span likely needs a role
    if (el.hasAttribute && el.hasAttribute('tabindex') && (tag === 'div' || tag === 'span')) {
      return 'button'; // Default assumption for focusable elements
    }

    return null;
  }

  // --- HELPER: Smart Text Extractor ---
  function getText(el) {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.tagName === 'INPUT') return el.value || el.placeholder || '';
    if (el.tagName === 'IMG') return el.alt || '';
    return (el.innerText || '').replace(/\s+/g, ' ').trim().substring(0, 100);
  }

  // Enhanced semantic text extractor with inference support
  function getSemanticText(el, options = {}) {
    if (!el) {
      return {
        text: '',
        source: null,
      };
    }

    // First check explicit aria-label (highest priority)
    const explicitAriaLabel = el.getAttribute ? el.getAttribute('aria-label') : null;
    if (explicitAriaLabel && explicitAriaLabel.trim()) {
      return {
        text: explicitAriaLabel.trim(),
        source: 'explicit_aria_label',
      };
    }

    // Check for existing text (visible text, input value, etc.)
    // This matches the existing getText() logic
    if (el.tagName === 'INPUT') {
      const value = (el.value || el.placeholder || '').trim();
      if (value) {
        return {
          text: value,
          source: 'input_value',
        };
      }
    }

    if (el.tagName === 'IMG') {
      const alt = (el.alt || '').trim();
      if (alt) {
        return {
          text: alt,
          source: 'img_alt',
        };
      }
    }

    const innerText = (el.innerText || '').trim();
    if (innerText) {
      return {
        text: innerText.substring(0, 100), // Match existing getText() limit
        source: 'inner_text',
      };
    }

    // Only try inference if we have NO explicit text/label
    // Pass inferenceConfig from options to getInferredLabel
    const inferred = getInferredLabel(el, {
      enableInference: options.enableInference !== false,
      inferenceConfig: options.inferenceConfig, // Pass config through
    });
    if (inferred) {
      return inferred;
    }

    // Fallback: return empty with no source
    return {
      text: '',
      source: null,
    };
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

  // --- HELPER: Get SVG Fill/Stroke Color ---
  // For SVG elements, get the fill or stroke color (SVGs use fill/stroke, not backgroundColor)
  function getSVGColor(el) {
    if (!el || el.tagName !== 'SVG') return null;

    const style = window.getComputedStyle(el);

    // Try fill first (most common for SVG icons)
    const fill = style.fill;
    if (fill && fill !== 'none' && fill !== 'transparent' && fill !== 'rgba(0, 0, 0, 0)') {
      // Convert fill to rgb() format if needed
      const rgbaMatch = fill.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (rgbaMatch) {
        const alpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1.0;
        if (alpha >= 0.9) {
          return `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
        }
      } else if (fill.startsWith('rgb(')) {
        return fill;
      }
    }

    // Fallback to stroke if fill is not available
    const stroke = style.stroke;
    if (stroke && stroke !== 'none' && stroke !== 'transparent' && stroke !== 'rgba(0, 0, 0, 0)') {
      const rgbaMatch = stroke.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (rgbaMatch) {
        const alpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1.0;
        if (alpha >= 0.9) {
          return `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
        }
      } else if (stroke.startsWith('rgb(')) {
        return stroke;
      }
    }

    return null;
  }

  // --- HELPER: Get Effective Background Color ---
  // Traverses up the DOM tree to find the nearest non-transparent background color
  // For SVGs, also checks fill/stroke properties
  // This handles rgba(0,0,0,0) and transparent values that browsers commonly return
  function getEffectiveBackgroundColor(el) {
    if (!el) return null;

    // For SVG elements, use fill/stroke instead of backgroundColor
    if (el.tagName === 'SVG') {
      const svgColor = getSVGColor(el);
      if (svgColor) return svgColor;
    }

    let current = el;
    const maxDepth = 10; // Prevent infinite loops
    let depth = 0;

    while (current && depth < maxDepth) {
      const style = window.getComputedStyle(current);

      // For SVG elements in the tree, also check fill/stroke
      if (current.tagName === 'SVG') {
        const svgColor = getSVGColor(current);
        if (svgColor) return svgColor;
      }

      const bgColor = style.backgroundColor;

      if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
        // Check if it's rgba with alpha < 1 (semi-transparent)
        const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (rgbaMatch) {
          const alpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1.0;
          // If alpha is high enough (>= 0.9), consider it opaque enough
          if (alpha >= 0.9) {
            // Convert to rgb() format for Gateway compatibility
            return `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
          }
          // If semi-transparent, continue up the tree
        } else if (bgColor.startsWith('rgb(')) {
          // Already in rgb() format, use it
          return bgColor;
        } else {
          // Named color or other format, return as-is
          return bgColor;
        }
      }

      // Move up the DOM tree
      current = current.parentElement;
      depth++;
    }

    // Fallback: return null if nothing found
    return null;
  }

  // --- HELPER: Viewport Check ---
  function isInViewport(rect) {
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  // --- HELPER: Occlusion Check (Optimized to avoid layout thrashing) ---
  // Only checks occlusion for elements likely to be occluded (high z-index, positioned)
  // This avoids forced reflow for most elements, dramatically improving performance
  function isOccluded(el, rect, style) {
    // Fast path: Skip occlusion check for most elements
    // Only check for elements that are likely to be occluded (overlays, modals, tooltips)
    const zIndex = parseInt(style.zIndex, 10);
    const position = style.position;

    // Skip occlusion check for normal flow elements (vast majority)
    // Only check for positioned elements or high z-index (likely overlays)
    if (position === 'static' && (isNaN(zIndex) || zIndex <= 10)) {
      return false; // Assume not occluded for performance
    }

    // For positioned/high z-index elements, do the expensive check
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) return false;

    const topEl = document.elementFromPoint(cx, cy);
    if (!topEl) return false;

    return !(el === topEl || el.contains(topEl) || topEl.contains(el));
  }

  // --- HELPER: Screenshot Bridge ---
  function captureScreenshot(options) {
    return new Promise((resolve) => {
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
          reject(
            new Error(
              'WASM processing timeout - extension may be unresponsive. Try reloading the extension.'
            )
          );
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
              duration: e.data.duration,
            });
          }
        }
      };

      window.addEventListener('message', listener);

      try {
        window.postMessage(
          {
            type: 'SENTIENCE_SNAPSHOT_REQUEST',
            requestId,
            rawData,
            options,
          },
          '*'
        );
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
    unwantedTags.forEach((tag) => {
      const elements = clone.querySelectorAll(tag);
      elements.forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    });

    // Remove invisible elements
    const invisibleSelectors = [];
    const walker = document.createTreeWalker(sourceRoot, NodeFilter.SHOW_ELEMENT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'head' || tag === 'title') continue;

      const style = window.getComputedStyle(node);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        (node.offsetWidth === 0 && node.offsetHeight === 0)
      ) {
        let selector = tag;
        if (node.id) {
          selector = `#${node.id}`;
        } else if (node.className && typeof node.className === 'string') {
          const classes = node.className
            .trim()
            .split(/\s+/)
            .filter((c) => c);
          if (classes.length > 0) {
            selector = `${tag}.${classes.join('.')}`;
          }
        }
        invisibleSelectors.push(selector);
      }
    }

    invisibleSelectors.forEach((selector) => {
      try {
        const elements = clone.querySelectorAll(selector);
        elements.forEach((el) => {
          if (el.parentNode) el.parentNode.removeChild(el);
        });
      } catch (e) {
        // Invalid selector, skip
      }
    });

    // Resolve relative URLs
    const links = clone.querySelectorAll('a[href]');
    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (
        href &&
        !href.startsWith('http://') &&
        !href.startsWith('https://') &&
        !href.startsWith('#')
      ) {
        try {
          link.setAttribute('href', new URL(href, document.baseURI).href);
        } catch (e) {
          // Ignore invalid URLs
        }
      }
    });

    const images = clone.querySelectorAll('img[src]');
    images.forEach((img) => {
      const src = img.getAttribute('src');
      if (
        src &&
        !src.startsWith('http://') &&
        !src.startsWith('https://') &&
        !src.startsWith('data:')
      ) {
        try {
          img.setAttribute('src', new URL(src, document.baseURI).href);
        } catch (e) {
          // Ignore invalid URLs
        }
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
      if (
        !insideLink &&
        (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'p' || tag === 'div')
      )
        markdown += '\n';
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
        if (['nav', 'footer', 'header', 'script', 'style', 'noscript', 'iframe', 'svg'].includes(tag))
          return;

        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return;

        const isBlock =
          style.display === 'block' ||
          style.display === 'flex' ||
          node.tagName === 'P' ||
          node.tagName === 'DIV';
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
        height: Math.round(rect.height),
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
        visibility: style.visibility || null,
      },
      attributes: {
        role: el.getAttribute('role') || null,
        type: el.getAttribute('type') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        id: el.id || null,
        className: el.className || null,
      },
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
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter((c) => c);
        if (classes.length > 0) {
          // Use first class for simplicity
          selector += `.${classes[0]}`;
        }
      }

      // Add nth-of-type if needed for uniqueness
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children);
        const sameTagSiblings = siblings.filter((s) => s.tagName === current.tagName);
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

  // --- HELPER: Wait for DOM Stability (SPA Hydration) ---
  // Waits for the DOM to stabilize before taking a snapshot
  // Useful for React/Vue apps that render empty skeletons before hydration
  async function waitForStability(options = {}) {
    const {
      minNodeCount = 500,
      quietPeriod = 200, // milliseconds
      maxWait = 5000, // maximum wait time
    } = options;

    const startTime = Date.now();

    return new Promise((resolve) => {
      // Check if DOM already has enough nodes
      const nodeCount = document.querySelectorAll('*').length;
      if (nodeCount >= minNodeCount) {
        // DOM seems ready, but wait for quiet period to ensure stability
        let lastChange = Date.now();
        const observer = new MutationObserver(() => {
          lastChange = Date.now();
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: false,
        });

        const checkStable = () => {
          const timeSinceLastChange = Date.now() - lastChange;
          const totalWait = Date.now() - startTime;

          if (timeSinceLastChange >= quietPeriod) {
            observer.disconnect();
            resolve();
          } else if (totalWait >= maxWait) {
            observer.disconnect();
            console.warn('[SentienceAPI] DOM stability timeout - proceeding anyway');
            resolve();
          } else {
            setTimeout(checkStable, 50);
          }
        };

        checkStable();
      } else {
        // DOM doesn't have enough nodes yet, wait for them
        const observer = new MutationObserver(() => {
          const currentCount = document.querySelectorAll('*').length;
          const totalWait = Date.now() - startTime;

          if (currentCount >= minNodeCount) {
            observer.disconnect();
            // Now wait for quiet period
            let lastChange = Date.now();
            const quietObserver = new MutationObserver(() => {
              lastChange = Date.now();
            });

            quietObserver.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: false,
            });

            const checkQuiet = () => {
              const timeSinceLastChange = Date.now() - lastChange;
              const totalWait = Date.now() - startTime;

              if (timeSinceLastChange >= quietPeriod) {
                quietObserver.disconnect();
                resolve();
              } else if (totalWait >= maxWait) {
                quietObserver.disconnect();
                console.warn('[SentienceAPI] DOM stability timeout - proceeding anyway');
                resolve();
              } else {
                setTimeout(checkQuiet, 50);
              }
            };

            checkQuiet();
          } else if (totalWait >= maxWait) {
            observer.disconnect();
            console.warn('[SentienceAPI] DOM node count timeout - proceeding anyway');
            resolve();
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: false,
        });

        // Timeout fallback
        setTimeout(() => {
          observer.disconnect();
          console.warn('[SentienceAPI] DOM stability max wait reached - proceeding');
          resolve();
        }, maxWait);
      }
    });
  }

  // --- HELPER: Collect Iframe Snapshots (Frame Stitching) ---
  // Recursively collects snapshot data from all child iframes
  // This enables detection of elements inside iframes (e.g., Stripe forms)
  //
  // NOTE: Cross-origin iframes cannot be accessed due to browser security (Same-Origin Policy).
  // Only same-origin iframes will return snapshot data. Cross-origin iframes will be skipped
  // with a warning. For cross-origin iframes, users must manually switch frames using
  // Playwright's page.frame() API.
  async function collectIframeSnapshots(options = {}) {
    const iframeData = new Map(); // Map of iframe element -> snapshot data

    // Find all iframe elements in current document
    const iframes = Array.from(document.querySelectorAll('iframe'));

    if (iframes.length === 0) {
      return iframeData;
    }

    console.log(`[SentienceAPI] Found ${iframes.length} iframe(s), requesting snapshots...`);
    // Request snapshot from each iframe
    const iframePromises = iframes.map((iframe, idx) => {
      // OPTIMIZATION: Skip common ad domains to save time
      const src = iframe.src || '';
      if (
        src.includes('doubleclick') ||
        src.includes('googleadservices') ||
        src.includes('ads system')
      ) {
        console.log(`[SentienceAPI] Skipping ad iframe: ${src.substring(0, 30)}...`);
        return Promise.resolve(null);
      }

      return new Promise((resolve) => {
        const requestId = `iframe-${idx}-${Date.now()}`;

        // 1. EXTENDED TIMEOUT (Handle slow children)
        const timeout = setTimeout(() => {
          console.warn(`[SentienceAPI] ⚠️ Iframe ${idx} snapshot TIMEOUT (id: ${requestId})`);
          resolve(null);
        }, 5000); // Increased to 5s to handle slow processing

        // 2. ROBUST LISTENER with debugging
        const listener = (event) => {
          // Debug: Log all SENTIENCE_IFRAME_SNAPSHOT_RESPONSE messages to see what's happening
          if (event.data?.type === 'SENTIENCE_IFRAME_SNAPSHOT_RESPONSE') {
            // Only log if it's not our request (for debugging)
            if (event.data?.requestId !== requestId) ;
          }

          // Check if this is the response we're waiting for
          if (
            event.data?.type === 'SENTIENCE_IFRAME_SNAPSHOT_RESPONSE' &&
            event.data?.requestId === requestId
          ) {
            clearTimeout(timeout);
            window.removeEventListener('message', listener);

            if (event.data.error) {
              console.warn(`[SentienceAPI] Iframe ${idx} returned error:`, event.data.error);
              resolve(null);
            } else {
              const elementCount = event.data.snapshot?.raw_elements?.length || 0;
              console.log(
                `[SentienceAPI] ✓ Received ${elementCount} elements from Iframe ${idx} (id: ${requestId})`
              );
              resolve({
                iframe,
                data: event.data.snapshot,
                error: null,
              });
            }
          }
        };

        window.addEventListener('message', listener);

        // 3. SEND REQUEST with error handling
        try {
          if (iframe.contentWindow) {
            // console.log(`[SentienceAPI] Sending request to Iframe ${idx} (id: ${requestId})`);
            iframe.contentWindow.postMessage(
              {
                type: 'SENTIENCE_IFRAME_SNAPSHOT_REQUEST',
                requestId,
                options: {
                  ...options,
                  collectIframes: true, // Enable recursion for nested iframes
                },
              },
              '*'
            ); // Use '*' for cross-origin, but browser will enforce same-origin policy
          } else {
            console.warn(
              `[SentienceAPI] Iframe ${idx} contentWindow is inaccessible (Cross-Origin?)`
            );
            clearTimeout(timeout);
            window.removeEventListener('message', listener);
            resolve(null);
          }
        } catch (error) {
          console.error(`[SentienceAPI] Failed to postMessage to Iframe ${idx}:`, error);
          clearTimeout(timeout);
          window.removeEventListener('message', listener);
          resolve(null);
        }
      });
    });

    // Wait for all iframe responses
    const results = await Promise.all(iframePromises);

    // Store iframe data
    results.forEach((result, idx) => {
      if (result && result.data && !result.error) {
        iframeData.set(iframes[idx], result.data);
        console.log(`[SentienceAPI] ✓ Collected snapshot from iframe ${idx}`);
      } else if (result && result.error) {
        console.warn(`[SentienceAPI] Iframe ${idx} snapshot error:`, result.error);
      } else if (!result) {
        console.warn(`[SentienceAPI] Iframe ${idx} returned no data (timeout or error)`);
      }
    });

    return iframeData;
  }

  // --- HELPER: Handle Iframe Snapshot Request (for child frames) ---
  // When a parent frame requests snapshot, this handler responds with local snapshot
  // NOTE: Recursion is safe because querySelectorAll('iframe') only finds direct children.
  // Iframe A can ask Iframe B, but won't go back up to parent (no circular dependency risk).
  function setupIframeSnapshotHandler() {
    window.addEventListener('message', async (event) => {
      // Security: only respond to snapshot requests from parent frames
      if (event.data?.type === 'SENTIENCE_IFRAME_SNAPSHOT_REQUEST') {
        const { requestId, options } = event.data;

        try {
          // Generate snapshot for this iframe's content
          // Allow recursive collection - querySelectorAll('iframe') only finds direct children,
          // so Iframe A will ask Iframe B, but won't go back up to parent (safe recursion)
          // waitForStability: false makes performance better - i.e. don't wait for children frames
          const snapshotOptions = {
            ...options,
            collectIframes: true,
            waitForStability: options.waitForStability === false ? false : false,
          };
          const snapshot = await window.sentience.snapshot(snapshotOptions);

          // Send response back to parent
          if (event.source && event.source.postMessage) {
            event.source.postMessage(
              {
                type: 'SENTIENCE_IFRAME_SNAPSHOT_RESPONSE',
                requestId,
                snapshot,
                error: null,
              },
              '*'
            );
          }
        } catch (error) {
          // Send error response
          if (event.source && event.source.postMessage) {
            event.source.postMessage(
              {
                type: 'SENTIENCE_IFRAME_SNAPSHOT_RESPONSE',
                requestId,
                snapshot: null,
                error: error.message,
              },
              '*'
            );
          }
        }
      }
    });
  }

  // snapshot.js - Snapshot Method (Main DOM Collection Logic)

  // 1. Geometry snapshot (NEW ARCHITECTURE - No WASM in Main World!)
  async function snapshot(options = {}) {
    try {
      // Step 0: Wait for DOM stability if requested (for SPA hydration)
      if (options.waitForStability !== false) {
        await waitForStability(options.waitForStability || {});
      }

      // Step 1: Collect raw DOM data (Main World - CSP can't block this!)
      const rawData = [];
      window.sentience_registry = [];

      const nodes = getAllElements();

      nodes.forEach((el, idx) => {
        if (!el.getBoundingClientRect) return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 5 || rect.height < 5) return;

        window.sentience_registry[idx] = el;

        // Use getSemanticText for inference support (falls back to getText if no inference)
        const semanticText = getSemanticText(el, {
          enableInference: options.enableInference !== false, // Default: true
          inferenceConfig: options.inferenceConfig, // Pass configurable inference settings
        });
        const textVal = semanticText.text || getText(el); // Fallback to getText for backward compat

        // Infer role for interactable elements (only if no aria-label and no explicit role)
        const inferredRole = getInferredRole(el, {
          enableInference: options.enableInference !== false,
          inferenceConfig: options.inferenceConfig,
        });
        const inView = isInViewport(rect);

        // Get computed style once (needed for both occlusion check and data collection)
        const style = window.getComputedStyle(el);

        // Only check occlusion for elements likely to be occluded (optimized)
        // This avoids layout thrashing for the vast majority of elements
        const occluded = inView ? isOccluded(el, rect, style) : false;

        // Get effective background color (traverses DOM to find non-transparent color)
        const effectiveBgColor = getEffectiveBackgroundColor(el);

        rawData.push({
          id: idx,
          tag: el.tagName.toLowerCase(),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          styles: {
            display: toSafeString(style.display),
            visibility: toSafeString(style.visibility),
            opacity: toSafeString(style.opacity),
            z_index: toSafeString(style.zIndex || 'auto'),
            position: toSafeString(style.position),
            bg_color: toSafeString(effectiveBgColor || style.backgroundColor),
            color: toSafeString(style.color),
            cursor: toSafeString(style.cursor),
            font_weight: toSafeString(style.fontWeight),
            font_size: toSafeString(style.fontSize),
          },
          attributes: {
            role: toSafeString(el.getAttribute('role')),
            type_: toSafeString(el.getAttribute('type')),
            aria_label:
              semanticText?.source === 'explicit_aria_label'
                ? semanticText.text
                : toSafeString(el.getAttribute('aria-label')), // Keep original for backward compat
            inferred_label:
              semanticText?.source &&
              !['explicit_aria_label', 'input_value', 'img_alt', 'inner_text'].includes(
                semanticText.source
              )
                ? toSafeString(semanticText.text)
                : null,
            label_source: semanticText?.source || null, // Track source for gateway
            inferred_role: inferredRole ? toSafeString(inferredRole) : null, // Inferred role for interactable elements
            href: toSafeString(el.href || el.getAttribute('href') || null),
            class: toSafeString(getClassName(el)),
            // Capture dynamic input state (not just initial attributes)
            value:
              el.value !== undefined
                ? toSafeString(el.value)
                : toSafeString(el.getAttribute('value')),
            checked: el.checked !== undefined ? String(el.checked) : null,
          },
          text: toSafeString(textVal),
          in_viewport: inView,
          is_occluded: occluded,
          // Phase 1: Pass scroll position for doc_y computation in WASM
          scroll_y: window.scrollY,
        });
      });

      console.log(`[SentienceAPI] Collected ${rawData.length} elements from main frame`);

      // Step 1.5: Collect iframe snapshots and FLATTEN immediately
      // "Flatten Early" architecture: Merge iframe elements into main array before WASM
      // This allows WASM to process all elements uniformly (no recursion needed)
      const allRawElements = [...rawData]; // Start with main frame elements
      let totalIframeElements = 0;

      if (options.collectIframes !== false) {
        try {
          console.log(`[SentienceAPI] Starting iframe collection...`);
          const iframeSnapshots = await collectIframeSnapshots(options);
          console.log(
            `[SentienceAPI] Iframe collection complete. Received ${iframeSnapshots.size} snapshot(s)`
          );

          if (iframeSnapshots.size > 0) {
            // FLATTEN IMMEDIATELY: Don't nest them. Just append them with coordinate translation.
            iframeSnapshots.forEach((iframeSnapshot, iframeEl) => {
              // Debug: Log structure to verify data is correct
              // console.log(`[SentienceAPI] Processing iframe snapshot:`, iframeSnapshot);

              if (iframeSnapshot && iframeSnapshot.raw_elements) {
                const rawElementsCount = iframeSnapshot.raw_elements.length;
                console.log(
                  `[SentienceAPI] Processing ${rawElementsCount} elements from iframe (src: ${iframeEl.src || 'unknown'})`
                );
                // Get iframe's bounding rect (offset for coordinate translation)
                const iframeRect = iframeEl.getBoundingClientRect();
                const offset = { x: iframeRect.x, y: iframeRect.y };

                // Get iframe context for frame switching (Playwright needs this)
                const iframeSrc = iframeEl.src || iframeEl.getAttribute('src') || '';
                let isSameOrigin = false;
                try {
                  // Try to access contentWindow to check if same-origin
                  isSameOrigin = iframeEl.contentWindow !== null;
                } catch (e) {
                  isSameOrigin = false;
                }

                // Adjust coordinates and add iframe context to each element
                const adjustedElements = iframeSnapshot.raw_elements.map((el) => {
                  const adjusted = { ...el };

                  // Adjust rect coordinates to parent viewport
                  if (adjusted.rect) {
                    adjusted.rect = {
                      ...adjusted.rect,
                      x: adjusted.rect.x + offset.x,
                      y: adjusted.rect.y + offset.y,
                    };
                  }

                  // Add iframe context so agents can switch frames in Playwright
                  adjusted.iframe_context = {
                    src: iframeSrc,
                    is_same_origin: isSameOrigin,
                  };

                  return adjusted;
                });

                // Append flattened iframe elements to main array
                allRawElements.push(...adjustedElements);
                totalIframeElements += adjustedElements.length;
              }
            });

            // console.log(`[SentienceAPI] Merged ${iframeSnapshots.size} iframe(s). Total elements: ${allRawElements.length} (${rawData.length} main + ${totalIframeElements} iframe)`);
          }
        } catch (error) {
          console.warn('[SentienceAPI] Iframe collection failed:', error);
        }
      }

      // Step 2: Send EVERYTHING to WASM (One giant flat list)
      // Now WASM prunes iframe elements and main elements in one pass!
      // No recursion needed - everything is already flat
      console.log(
        `[SentienceAPI] Sending ${allRawElements.length} total elements to WASM (${rawData.length} main + ${totalIframeElements} iframe)`
      );
      const processed = await processSnapshotInBackground(allRawElements, options);

      if (!processed || !processed.elements) {
        throw new Error('WASM processing returned invalid result');
      }

      // Step 3: Capture screenshot if requested
      let screenshot = null;
      if (options.screenshot) {
        screenshot = await captureScreenshot(options.screenshot);
      }

      // Step 4: Clean and return
      const cleanedElements = cleanElement(processed.elements);
      const cleanedRawElements = cleanElement(processed.raw_elements);

      // FIXED: Removed undefined 'totalIframeRawElements'
      // FIXED: Logic updated for "Flatten Early" architecture.
      // processed.elements ALREADY contains the merged iframe elements,
      // so we simply use .length. No addition needed.

      const totalCount = cleanedElements.length;
      const totalRaw = cleanedRawElements.length;
      const iframeCount = totalIframeElements || 0;

      console.log(
        `[SentienceAPI] ✓ Complete: ${totalCount} Smart Elements, ${totalRaw} Raw Elements (includes ${iframeCount} from iframes) (WASM took ${processed.duration?.toFixed(1)}ms)`
      );

      return {
        status: 'success',
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        elements: cleanedElements,
        raw_elements: cleanedRawElements,
        screenshot,
      };
    } catch (error) {
      console.error('[SentienceAPI] snapshot() failed:', error);
      console.error('[SentienceAPI] Error stack:', error.stack);
      return {
        status: 'error',
        error: error.message || 'Unknown error',
        stack: error.stack,
      };
    }
  }

  // read.js - Content Reading Methods

  // 2. Read Content (unchanged)
  function read(options = {}) {
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
      status: 'success',
      url: window.location.href,
      format,
      content,
      length: content.length,
    };
  }

  // 2b. Find Text Rectangle - Get exact pixel coordinates of specific text
  function findTextRect(options = {}) {
    const {
      text,
      containerElement = document.body,
      caseSensitive = false,
      wholeWord = false,
      maxResults = 10,
    } = options;

    if (!text || text.trim().length === 0) {
      return {
        status: 'error',
        error: 'Text parameter is required',
      };
    }

    const results = [];
    const searchText = caseSensitive ? text : text.toLowerCase();

    // Helper function to find text in a single text node
    function findInTextNode(textNode) {
      const nodeText = textNode.nodeValue;
      const searchableText = caseSensitive ? nodeText : nodeText.toLowerCase();

      let startIndex = 0;
      while (startIndex < nodeText.length && results.length < maxResults) {
        const foundIndex = searchableText.indexOf(searchText, startIndex);

        if (foundIndex === -1) break;

        // Check whole word matching if required
        if (wholeWord) {
          const before = foundIndex > 0 ? nodeText[foundIndex - 1] : ' ';
          const after =
            foundIndex + text.length < nodeText.length ? nodeText[foundIndex + text.length] : ' ';

          // Check if surrounded by word boundaries
          if (!/\s/.test(before) || !/\s/.test(after)) {
            startIndex = foundIndex + 1;
            continue;
          }
        }

        try {
          // Create range for this occurrence
          const range = document.createRange();
          range.setStart(textNode, foundIndex);
          range.setEnd(textNode, foundIndex + text.length);

          const rect = range.getBoundingClientRect();

          // Only include visible rectangles
          if (rect.width > 0 && rect.height > 0) {
            results.push({
              text: nodeText.substring(foundIndex, foundIndex + text.length),
              rect: {
                x: rect.left + window.scrollX,
                y: rect.top + window.scrollY,
                width: rect.width,
                height: rect.height,
                left: rect.left + window.scrollX,
                top: rect.top + window.scrollY,
                right: rect.right + window.scrollX,
                bottom: rect.bottom + window.scrollY,
              },
              viewport_rect: {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
              },
              context: {
                before: nodeText.substring(Math.max(0, foundIndex - 20), foundIndex),
                after: nodeText.substring(
                  foundIndex + text.length,
                  Math.min(nodeText.length, foundIndex + text.length + 20)
                ),
              },
              in_viewport:
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= window.innerHeight &&
                rect.right <= window.innerWidth,
            });
          }
        } catch (e) {
          console.warn('[SentienceAPI] Failed to get rect for text:', e);
        }

        startIndex = foundIndex + 1;
      }
    }

    // Tree walker to find all text nodes
    const walker = document.createTreeWalker(containerElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // Skip script, style, and empty text nodes
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const tagName = parent.tagName.toLowerCase();
        if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip whitespace-only nodes
        if (!node.nodeValue || node.nodeValue.trim().length === 0) {
          return NodeFilter.FILTER_REJECT;
        }

        // Check if element is visible
        const computedStyle = window.getComputedStyle(parent);
        if (
          computedStyle.display === 'none' ||
          computedStyle.visibility === 'hidden' ||
          computedStyle.opacity === '0'
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    // Walk through all text nodes
    let currentNode;
    while ((currentNode = walker.nextNode()) && results.length < maxResults) {
      findInTextNode(currentNode);
    }

    return {
      status: 'success',
      query: text,
      case_sensitive: caseSensitive,
      whole_word: wholeWord,
      matches: results.length,
      results,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scroll_x: window.scrollX,
        scroll_y: window.scrollY,
      },
    };
  }

  // click.js - Click Action Method

  // 3. Click Action (unchanged)
  function click(id) {
    const el = window.sentience_registry[id];
    if (el) {
      el.click();
      el.focus();
      return true;
    }
    return false;
  }

  // registry.js - Inspector Mode / Golden Set Collection

  // 4. Inspector Mode: Start Recording for Golden Set Collection
  function startRecording(options = {}) {
    const {
      highlightColor = '#ff0000',
      successColor = '#00ff00',
      autoDisableTimeout = 30 * 60 * 1000, // 30 minutes default
      keyboardShortcut = 'Ctrl+Shift+I',
    } = options;

    console.log(
      '🔴 [Sentience] Recording Mode STARTED. Click an element to copy its Ground Truth JSON.'
    );
    console.log(`   Press ${keyboardShortcut} or call stopRecording() to stop.`);

    // Validate registry is populated
    if (!window.sentience_registry || window.sentience_registry.length === 0) {
      console.warn(
        '⚠️ Registry empty. Call `await window.sentience.snapshot()` first to populate registry.'
      );
      alert('Registry empty. Run `await window.sentience.snapshot()` first!');
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
      highlightBox.style.top = rect.top + window.scrollY + 'px';
      highlightBox.style.left = rect.left + window.scrollX + 'px';
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
        console.warn('⚠️ Element not found in Sentience Registry. Did you run snapshot() first?');
        alert('Element not in registry. Run `await window.sentience.snapshot()` first!');
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
          selector,
          role,
          text: text.substring(0, 50),
        },
        debug_snapshot: rawData,
      };

      // Copy to clipboard
      const jsonString = JSON.stringify(snippet, null, 2);
      navigator.clipboard
        .writeText(jsonString)
        .then(() => {
          console.log('✅ Copied Ground Truth to clipboard:', snippet);

          // Flash green to indicate success
          highlightBox.style.border = `2px solid ${successColor}`;
          highlightBox.style.background = 'rgba(0, 255, 0, 0.2)';
          setTimeout(() => {
            highlightBox.style.border = `2px solid ${highlightColor}`;
            highlightBox.style.background = 'rgba(255, 0, 0, 0.1)';
          }, 500);
        })
        .catch((err) => {
          console.error('❌ Failed to copy to clipboard:', err);
          alert('Failed to copy to clipboard. Check console for JSON.');
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

      console.log('⚪ [Sentience] Recording Mode STOPPED.');
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
        console.log('⏰ [Sentience] Recording Mode auto-disabled after timeout.');
        stopRecording();
      }, autoDisableTimeout);
    }

    // Store stop function globally for keyboard shortcut access
    window.sentience_stopRecording = stopRecording;

    return stopRecording;
  }

  // overlay.js - Visual Overlay Methods

  /**
   * Show overlay highlighting specific elements with Shadow DOM
   * @param {Array} elements - List of elements with bbox, importance, visual_cues
   * @param {number} targetElementId - Optional ID of target element (shown in red)
   */
  function showOverlay(elements, targetElementId = null) {
    if (!elements || !Array.isArray(elements)) {
      console.warn('[Sentience] showOverlay: elements must be an array');
      return;
    }

    window.postMessage(
      {
        type: 'SENTIENCE_SHOW_OVERLAY',
        elements,
        targetElementId,
        timestamp: Date.now(),
      },
      '*'
    );

    console.log(`[Sentience] Overlay requested for ${elements.length} elements`);
  }

  /**
   * Clear overlay manually
   */
  function clearOverlay() {
    window.postMessage(
      {
        type: 'SENTIENCE_CLEAR_OVERLAY',
      },
      '*'
    );
    console.log('[Sentience] Overlay cleared');
  }

  // index.js - Main Entry Point for Injected API
  // This script ONLY collects raw DOM data and sends it to background for processing


  (async () => {
    // console.log('[SentienceAPI] Initializing (CSP-Resistant Mode)...');

    // Wait for Extension ID from content.js
    const getExtensionId = () => document.documentElement.dataset.sentienceExtensionId;
    let extId = getExtensionId();

    if (!extId) {
      await new Promise((resolve) => {
        const check = setInterval(() => {
          extId = getExtensionId();
          if (extId) {
            clearInterval(check);
            resolve();
          }
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

    // --- GLOBAL API ---
    window.sentience = {
      snapshot,
      read,
      findTextRect,
      click,
      startRecording,
      showOverlay,
      clearOverlay,
    };

    // Setup iframe handler when script loads (only once)
    if (!window.sentience_iframe_handler_setup) {
      setupIframeSnapshotHandler();
      window.sentience_iframe_handler_setup = true;
    }

    console.log('[SentienceAPI] ✓ Ready! (CSP-Resistant - WASM runs in background)');
  })();

})();
