# Sentience Chrome Extension - Complete Documentation

**A Rust/WASM-powered Chrome extension for extracting geometric layouts, visual cues, and importance scores from web pages.**

Perfect for AI agents, automation scripts, visual grounding, and accessibility tools.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Developer Quick Reference](#developer-quick-reference)
4. [Installation](#installation)
5. [User API](#user-api)
6. [Usage Examples](#usage-examples)
7. [Screenshot Feature](#screenshot-feature)
8. [Bounding Box Visualization](#bounding-box-visualization)
9. [Filtering & Ranking](#filtering--ranking)
10. [Architecture](#architecture)
11. [Implementation Details](#implementation-details)
12. [API Reference](#api-reference)
13. [Performance](#performance)
14. [Troubleshooting](#troubleshooting)
15. [Contributing](#contributing)

---

## Overview

### What It Does

Extracts a **geometry map** of any webpage:
- **Element positions** (bounding boxes)
- **Semantic roles** (button, link, textbox, etc.)
- **Importance scores** (AI-optimized ranking)
- **Visual cues** (colors, primary actions, clickability)
- **Screenshots** (Base64 PNG/JPEG)

### Why Use It?

✅ **AI Agent Navigation** - Provide structured page data to LLMs
✅ **Visual Grounding** - Combine screenshots with element positions
✅ **Accessibility Auditing** - Find low-importance or inaccessible elements
✅ **Form Detection** - Extract all input fields automatically
✅ **Primary CTA Detection** - Find the main call-to-action button
✅ **Automation** - Programmatically interact with web pages

### Technology Stack

- **Frontend**: JavaScript (DOM extraction)
- **Backend**: Rust/WASM (analysis & ranking)
- **Size**: ~50-150 KB WASM binary
- **Performance**: 100-300ms typical response

---

## Quick Start

### 5-Second Test

```bash
# 1. Install dependencies
npm install

# 2. Build extension (WASM + JavaScript)
npm run build

# 3. Load extension in Chrome
# chrome://extensions → Enable Developer mode → Load unpacked → Select this directory

# 4. Open any webpage, then in DevTools Console:
```

```javascript
const result = await window.sentience.snapshot({ limit: 5 });
console.log(result.elements);
```

**That's it!** You now have the top 5 most important elements with positions, roles, and scores.

---

## Developer Quick Reference

### 📦 **Build Commands**

| Command | What it does |
|---------|-------------|
| `npm install` | Install dependencies (first time only) |
| `npm run build` | **Full build** (WASM + JavaScript bundles) |
| `npm run build:wasm` | Build only WASM (Rust → pkg/) |
| `npm run build:bundle` | Build only JavaScript (src/ → dist/) |

### ✅ **Code Quality**

| Command | What it does |
|---------|-------------|
| `npm run lint` | Check code quality with ESLint |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check code formatting |

### 🧪 **Testing**

| Command | What it does |
|---------|-------------|
| `npm test` | Run all tests with coverage |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate coverage report |

### 📁 **Project Structure**

```
sentience-chrome/
├── src/                    # Modular source code
│   ├── background/         # Service worker with WASM
│   ├── content/            # Message bridge
│   └── injected/           # Main API (7 modules)
├── tests/                  # Unit tests (76 tests)
├── dist/                   # Bundled output (gitignored)
├── pkg/                    # WASM artifacts (gitignored)
└── docs/                   # Documentation
```

### 🔄 **Development Workflow**

```bash
# 1. Make changes to src/injected/utils.js (for example)
# 2. Rebuild JavaScript (fast)
npm run build:bundle

# 3. Reload extension in Chrome
# Click refresh icon in chrome://extensions/
```

### 📚 **Documentation**

- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Developer guide
- **[docs/RESTRUCTURING_PROGRESS.md](docs/RESTRUCTURING_PROGRESS.md)** - Architecture overview
- **[docs/RESTRUCTURING_ASSESSMENT.md](docs/RESTRUCTURING_ASSESSMENT.md)** - Planning document

---

## Installation

### Prerequisites

- **Rust** (for WASM compilation)
- **wasm-pack** (`cargo install wasm-pack`)
- **Chrome/Chromium** browser

### Build Steps

**Option 1: Use the build script (Recommended)**

```bash
# 1. Navigate to directory
cd /Users/guoliangwang/Desktop/Code/Rust/sentience-chrome/Claude

# 2. Run build script
./build.sh

# The script will:
# - Check for wasm-pack
# - Build the WASM module
# - Show file sizes
# - Display next steps
```

**Option 2: Manual build**

```bash
# 1. Navigate to directory
cd /Users/guoliangwang/Desktop/Code/Rust/sentience-chrome/Claude

# 2. Build WASM module
wasm-pack build --target web

# 3. Verify output
ls pkg/
# Should see: sentience_core.js, sentience_core_bg.wasm
```

**Load in Chrome:**

1. Open `chrome://extensions`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select the `Claude/` directory
5. Test on any webpage in DevTools Console:
   ```javascript
   await window.sentience.snapshot()
   ```

### File Structure

```
Claude/
├── src/
│   └── lib.rs                    # Rust/WASM logic
├── pkg/                          # Generated by wasm-pack
│   ├── sentience_core.js
│   └── sentience_core_bg.wasm
├── content.js                    # JavaScript entry point
├── background.js                 # Screenshot capture
├── manifest.json                 # Chrome extension config
├── Cargo.toml                    # Rust dependencies
├── build.sh                      # Build script (executable)
├── README.md                     # This file
├── IMPLEMENTATION_SUMMARY.md     # Technical implementation details
└── prompt.md                     # Original task instructions
```

---

## User API

### Core Functions

The extension provides two main functions:

1. **`window.sentience.snapshot(options?)`** - Extract page geometry and elements
2. **`window.sentience.findTextRect(options)`** - Find exact pixel coordinates of text

### snapshot() - Geometry Extraction

```javascript
window.sentience.snapshot(options?)
```

**Capabilities:**
- Get geometry map
- Capture screenshot
- Filter by role/size/z-index
- Limit to top N elements

### Complete Options

```typescript
await window.sentience.snapshot({
  // Screenshot
  screenshot?: boolean | {
    format: 'png' | 'jpeg',
    quality: number  // 0-100, JPEG only
  },

  // Filtering
  limit?: number,
  filter?: {
    min_area?: number,
    allowed_roles?: string[],
    min_z_index?: number
  }
})
```

### Response Format

```typescript
{
  status: "success",
  timestamp: string,
  url: string,
  viewport: { width: number, height: number },

  // Geometry data
  elements: [{
    id: number,
    role: string,
    importance: number,
    visual_cues: {
      is_primary: boolean,
      background_color_name: string | null,
      is_clickable: boolean
    },
    bbox: { x: number, y: number, width: number, height: number },
    z_index: number
  }],

  // Screenshot (optional)
  screenshot?: string,  // Base64 data URL
  screenshot_format?: 'png' | 'jpeg',
  screenshot_error?: string
}
```

### findTextRect() - Text Location Finder

Find exact pixel coordinates of any text on the page using the DOM Range API. Perfect for highlighting specific words, clicking on text, or text-based navigation **without Vision Models**.

```javascript
window.sentience.findTextRect(options)
```

**Parameters:**
```typescript
{
  text: string,                  // Required: Text to find
  containerElement?: Element,    // Optional: Search within (default: document.body)
  caseSensitive?: boolean,       // Optional: Case-sensitive search (default: false)
  wholeWord?: boolean,          // Optional: Match whole words only (default: false)
  maxResults?: number           // Optional: Limit results (default: 10)
}
```

**Returns:**
```typescript
{
  status: "success" | "error",
  query: string,                // The search text
  case_sensitive: boolean,
  whole_word: boolean,
  matches: number,              // Total matches found
  results: [{
    text: string,               // Actual matched text
    rect: {                     // Absolute coordinates (with scroll)
      x: number,
      y: number,
      width: number,
      height: number,
      left: number,
      top: number,
      right: number,
      bottom: number
    },
    viewport_rect: {            // Viewport-relative coordinates
      x: number,
      y: number,
      width: number,
      height: number
    },
    context: {                  // Surrounding text
      before: string,           // 20 chars before
      after: string             // 20 chars after
    },
    in_viewport: boolean        // Is it currently visible?
  }],
  viewport: {
    width: number,
    height: number,
    scroll_x: number,
    scroll_y: number
  },
  error?: string                // Error message if status is "error"
}
```

**Usage Examples:**

```javascript
// Example 1: Find "Add to Cart" text
const result = await window.sentience.findTextRect({
  text: "Add to Cart"
});

if (result.status === "success") {
  console.log(`Found ${result.matches} occurrences`);
  result.results.forEach((match, i) => {
    console.log(`${i+1}. At (${match.rect.x}, ${match.rect.y})`);
    console.log(`   Context: "${match.context.before}${match.text}${match.context.after}"`);
  });
}

// Example 2: Highlight all matches
const result = await window.sentience.findTextRect({
  text: "price",
  caseSensitive: false,
  maxResults: 20
});

result.results.forEach(match => {
  const highlight = document.createElement('div');
  highlight.style.cssText = `
    position: absolute;
    left: ${match.rect.x}px;
    top: ${match.rect.y}px;
    width: ${match.rect.width}px;
    height: ${match.rect.height}px;
    background: yellow;
    opacity: 0.5;
    pointer-events: none;
    z-index: 9999;
  `;
  document.body.appendChild(highlight);
});

// Example 3: Click on specific text (not button!)
const result = await window.sentience.findTextRect({
  text: "Terms of Service",
  wholeWord: true
});

if (result.matches > 0) {
  const first = result.results[0];
  // Click the center of the text
  const centerX = first.viewport_rect.x + first.viewport_rect.width / 2;
  const centerY = first.viewport_rect.y + first.viewport_rect.height / 2;

  document.elementFromPoint(centerX, centerY)?.click();
}

// Example 4: Find text only in header
const header = document.querySelector('header');
const result = await window.sentience.findTextRect({
  text: "Login",
  containerElement: header
});

// Example 5: Scroll to first match
const result = await window.sentience.findTextRect({
  text: "Contact Us"
});

if (result.matches > 0) {
  const first = result.results[0];
  window.scrollTo({
    top: first.rect.y - 100,  // Offset for header
    behavior: 'smooth'
  });
}
```

**Use Cases:**
- 🎯 **Text-based clicking** - Click on text that's not in a button
- 🖍️ **Text highlighting** - Draw bounding boxes around specific words
- 📍 **Text navigation** - Scroll to specific content
- ♿ **Accessibility** - Find and highlight important text
- 🤖 **AI Agents** - Locate text without vision models
- 🔍 **Search results** - Find and highlight search terms

**Features:**
- ✅ Pixel-perfect coordinates using DOM Range API
- ✅ Filters invisible/hidden text automatically
- ✅ Returns both absolute and viewport-relative coordinates
- ✅ Provides context for ambiguous matches
- ✅ Handles multiple occurrences
- ✅ Performance-safe with result limits
- ✅ Works with case-insensitive and whole-word matching

---

## Usage Examples

### Example 1: Basic Geometry Map

```javascript
const result = await window.sentience.snapshot();
console.log(`Found ${result.elements.length} elements`);
console.log('Top element:', result.elements[0]);
```

### Example 2: Top 10 Most Important

```javascript
const top10 = await window.sentience.snapshot({ limit: 10 });
top10.elements.forEach((el, i) => {
  console.log(`${i+1}. [${el.role}] Score: ${el.importance}, Position: (${el.bbox.x}, ${el.bbox.y})`);
});
```

### Example 3: Filter for Buttons Only

```javascript
const buttons = await window.sentience.snapshot({
  filter: { allowed_roles: ['button', 'submit'] }
});
console.log(`Found ${buttons.elements.length} buttons`);
```

### Example 4: Find Primary Action

```javascript
const result = await window.sentience.snapshot();
const cta = result.elements.find(el =>
  el.visual_cues.is_primary && el.role === 'button'
);
console.log('Primary CTA:', cta);
```

### Example 5: AI Agent Prompt

```javascript
const top5 = await window.sentience.snapshot({ limit: 5 });

const prompt = `
Available actions:
${top5.elements.map((el, i) =>
  `${i+1}. ${el.role} at (${el.bbox.x}, ${el.bbox.y})`
).join('\n')}

Which action should I take to search for products?
`;

// Send to LLM API
```

### Example 6: Form Field Detection

```javascript
const inputs = await window.sentience.snapshot({
  filter: {
    allowed_roles: ['textbox', 'searchbox', 'checkbox', 'radio']
  }
});

console.log('Form schema:', inputs.elements.map(el => ({
  role: el.role,
  position: el.bbox,
  importance: el.importance
})));
```

---

## Screenshot Feature

### Basic Screenshot

```javascript
const result = await window.sentience.snapshot({
  screenshot: true
});

console.log('Screenshot:', result.screenshot);  // Base64 data URL
console.log('Format:', result.screenshot_format);  // "png"
```

### JPEG for Smaller Size

```javascript
const result = await window.sentience.snapshot({
  screenshot: {
    format: 'jpeg',
    quality: 80  // Recommended: 70-85
  }
});
```

### Screenshot Format

**Important:** Screenshot is a **Base64 data URL string**, NOT a file path!

```
"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
```

### Display Screenshot

```javascript
const result = await window.sentience.snapshot({ screenshot: true });

const img = document.createElement('img');
img.src = result.screenshot;
document.body.appendChild(img);
```

### Download Screenshot

```javascript
const result = await window.sentience.snapshot({ screenshot: true });

const a = document.createElement('a');
a.href = result.screenshot;
a.download = 'screenshot.png';
a.click();
```

### Annotated Screenshot

```javascript
const result = await window.sentience.snapshot({
  screenshot: true,
  limit: 10
});

const img = new Image();
img.onload = () => {
  const canvas = document.createElement('canvas');
  canvas.width = result.viewport.width;
  canvas.height = result.viewport.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // Draw bounding boxes
  result.elements.forEach((el, i) => {
    ctx.strokeStyle = el.visual_cues.is_primary ? 'red' : 'blue';
    ctx.lineWidth = 3;
    ctx.strokeRect(el.bbox.x, el.bbox.y, el.bbox.width, el.bbox.height);

    // Label
    ctx.fillStyle = 'red';
    ctx.font = '14px Arial';
    ctx.fillText(`${i+1}: ${el.role}`, el.bbox.x, el.bbox.y - 5);
  });

  document.body.appendChild(canvas);
};
img.src = result.screenshot;
```

### Send to AI Vision API

```javascript
const result = await window.sentience.snapshot({
  screenshot: { format: 'jpeg', quality: 80 },
  limit: 10
});

// Extract Base64 (without prefix)
const base64Only = result.screenshot.split(',')[1];

// Send to GPT-4 Vision, Claude 3, etc.
await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4-vision-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'What should I click?' },
        { type: 'image_url', image_url: { url: result.screenshot } }
      ]
    }]
  })
});
```

### File Size Reference

| Format | Quality | Typical Size | Use Case |
|--------|---------|--------------|----------|
| PNG | N/A | 1-2 MB | Archival, exact pixels |
| JPEG | 90 | 300-800 KB | High quality uploads |
| JPEG | 80 | 150-400 KB | **Recommended** |
| JPEG | 70 | 80-200 KB | Bandwidth-limited |

---

## Bounding Box Visualization

### Simple Overlay

```javascript
const result = await window.sentience.snapshot({ limit: 10 });

result.elements.forEach((el, i) => {
  const box = document.createElement('div');
  box.style.cssText = `
    position: absolute;
    left: ${el.bbox.x}px;
    top: ${el.bbox.y}px;
    width: ${el.bbox.width}px;
    height: ${el.bbox.height}px;
    border: ${el.visual_cues.is_primary ? '3px solid red' : '2px solid blue'};
    pointer-events: none;
    z-index: 9999;
    box-sizing: border-box;
  `;

  // Add label
  const label = document.createElement('div');
  label.style.cssText = `
    position: absolute;
    top: -22px;
    background: ${el.visual_cues.is_primary ? 'red' : 'blue'};
    color: white;
    padding: 2px 6px;
    font-size: 12px;
  `;
  label.textContent = `${i+1}: ${el.role}`;
  box.appendChild(label);

  document.body.appendChild(box);
});
```

### Canvas Overlay (Better Performance)

```javascript
const result = await window.sentience.snapshot({ limit: 20 });

const canvas = document.createElement('canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
canvas.style.cssText = `
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 9999;
`;
document.body.appendChild(canvas);

const ctx = canvas.getContext('2d');

result.elements.forEach((el, i) => {
  ctx.strokeStyle = el.visual_cues.is_primary ? '#ff0000' : '#0066ff';
  ctx.lineWidth = el.visual_cues.is_primary ? 3 : 2;
  ctx.strokeRect(el.bbox.x, el.bbox.y, el.bbox.width, el.bbox.height);

  ctx.fillStyle = '#0066ff';
  ctx.font = '14px Arial';
  ctx.fillText(`${i+1}: ${el.role}`, el.bbox.x, el.bbox.y - 5);
});
```

### Reusable Helper Function

```javascript
// Add to content.js or run in console
window.sentience.visualize = async function(options = {}) {
  const {
    limit = 10,
    filter = null,
    highlightPrimary = true
  } = options;

  const result = await window.sentience.snapshot({ limit, filter });

  // Clear previous
  document.querySelectorAll('.sentience-box').forEach(el => el.remove());

  result.elements.forEach((el, i) => {
    const box = document.createElement('div');
    box.className = 'sentience-box';
    box.style.cssText = `
      position: absolute;
      left: ${el.bbox.x}px;
      top: ${el.bbox.y}px;
      width: ${el.bbox.width}px;
      height: ${el.bbox.height}px;
      border: ${el.visual_cues.is_primary && highlightPrimary ? '3px solid red' : '2px solid blue'};
      pointer-events: none;
      z-index: 9998;
      box-sizing: border-box;
    `;
    document.body.appendChild(box);
  });

  console.log(`✅ Visualized ${result.elements.length} elements`);
  return result;
};

// Usage
await window.sentience.visualize();
await window.sentience.visualize({ limit: 20 });
await window.sentience.visualize({ filter: { allowed_roles: ['button'] } });
```

---

## Filtering & Ranking

### Importance Scoring (6 Metrics)

Elements are ranked by:

1. **Role Priority** (1000+ for inputs, 500 for buttons, 100 for links)
2. **Area Score** (larger elements score higher, capped at 200)
3. **Center Bias** (penalizes footer/sidebar elements)
4. **Z-Index Bonus** (modals/overlays get priority)
5. **ARIA Label Bonus** (+200 for explicit labels)
6. **Visual Prominence** (+200 for `is_primary` elements)

**Score Range:** -300 to ~1800

### Filter Options

#### Limit to Top N

```javascript
{ limit: 10 }  // Returns top 10 most important
```

#### Filter by Element Size

```javascript
{
  filter: {
    min_area: 500  // Minimum 500 pixels² (e.g., 20×25)
  }
}
```

#### Filter by Role

```javascript
{
  filter: {
    allowed_roles: ['button', 'link', 'textbox']
  }
}
```

**Available Roles:**
- `button`, `submit` - Buttons
- `link` - Hyperlinks
- `textbox`, `searchbox` - Text inputs
- `checkbox`, `radio` - Form controls
- `combobox` - Dropdowns
- `generic` - Other elements

#### Filter by Z-Index

```javascript
{
  filter: {
    min_z_index: 100  // Only modals/overlays
  }
}
```

#### Combined Filters

```javascript
{
  limit: 20,
  filter: {
    allowed_roles: ['button', 'textbox'],
    min_area: 100,
    min_z_index: 0
  }
}
```

### Visual Cues

#### is_primary Detection

An element is marked as primary if:
1. **Actionable**: Has clickable role (button/link/input)
2. **NOT Decorative**: Not image/presentation
3. **Visually Prominent**:
   - Size > 1% of viewport, OR
   - Bold text + primary color (blue/green/orange/red), OR
   - Large font (≥18px) + primary color

#### Color Detection

32-color palette using Euclidean distance in RGB space:
- **Basic**: black, white, gray
- **Primary**: red, blue, green, yellow
- **Secondary**: orange, purple, pink, brown
- **Extended**: gold, salmon, skyblue, khaki, etc.

---

## Architecture

### Data Flow

```
User calls window.sentience.snapshot()
         ↓
content.js extracts raw DOM data
  - getBoundingClientRect() for positions
  - getComputedStyle() for colors/fonts
  - getAttribute() for roles/attributes
         ↓
WASM (lib.rs) analyzes
  1. infer_role() - Detect semantic roles
  2. extract_visual_cues() - Colors, prominence
  3. calculate_importance() - 6-metric scoring
  4. apply_filters() - Smart selection
         ↓
Return sorted, filtered JSON
```

### Component Breakdown

**content.js (JavaScript Layer)**
- DOM access (WASM can't access DOM)
- Element registry management
- WASM initialization
- API exposure

**lib.rs (Rust/WASM Layer)**
- Element analysis
- Filtering and ranking
- Smart selection algorithm
- No dependencies (small binary)

**background.js (Service Worker)**
- Screenshot capture via `chrome.tabs.captureVisibleTab`
- Message passing to content script

### Bridge Pattern

**JavaScript → WASM (Data Flow)**
```
Raw DOM data (JsValue)
  → analyze_page()
  → Vec<RawElement>
  → infer_role(), extract_visual_cues(), calculate_importance()
  → Vec<SmartElement>
  → JsValue
```

**WASM → JavaScript (Action Bridge)**
```
click_element_bridge(id)
  → js_click_element(id)
  → window.sentience_registry[id].click()
```

---

## Implementation Details

### Visual Cues Extraction

**RGB to Hex Conversion:**
```rust
fn rgb_to_hex(rgb_string: &str) -> Option<String> {
    // Parse "rgb(0, 123, 255)" → "#007bff"
    // Manual string parsing (no regex dependency)
}
```

**Nearest Color Name:**
```rust
fn find_nearest_color_name(hex: &str) -> Option<String> {
    // Euclidean distance to 32-color palette
    // Returns closest named color
}
```

**Primary Action Detection:**
```rust
fn extract_visual_cues(raw: &RawElement, role: &str) -> VisualCues {
    // Check: actionable + not decorative + visually prominent
    let is_primary = is_actionable && !is_decorative && is_visually_prominent;
}
```

### Importance Calculation

```rust
fn calculate_importance(raw: &RawElement, role: &str, cues: &VisualCues) -> i32 {
    let mut score = 0;

    // Role priority
    score += match role {
        "textbox" | "searchbox" => 1000,
        "button" | "checkbox" | "radio" => 500,
        "link" => 100,
        _ => 10,
    };

    // Area bonus
    let area = raw.rect.width * raw.rect.height;
    score += (area.sqrt() as i32).min(200);

    // Center bias
    let dist_from_center = calculate_manhattan_distance();
    score -= dist_from_center as i32;

    // Z-index bonus
    if z_index > 0 {
        score += (z_index.min(100)) * 2;
    }

    // ARIA label bonus
    if raw.attributes.aria_label.is_some() {
        score += 200;
    }

    // Visual prominence
    if cues.is_primary {
        score += 200;
    }

    score
}
```

### Smart Selection

```rust
fn apply_filters(elements: &mut Vec<SmartElement>, options: &AnalysisOptions) {
    // Stage 1: Attribute filters
    apply_attribute_filters(elements, &options.filter);

    // Stage 2: Smart selection
    if let Some(limit) = options.limit {
        // Truncate to top N
        elements.truncate(limit);

        // Re-sort by Y-position (reading order for LLMs)
        elements.sort_by(|a, b| a.bbox.y.partial_cmp(&b.bbox.y).unwrap());
    }
}
```

### Build Optimizations

**Cargo.toml:**
```toml
[profile.release]
opt-level = "z"     # Optimize for size
lto = true          # Link-time optimization
codegen-units = 1   # Better optimization
panic = "abort"     # Smaller panic handler
strip = true        # Strip debug symbols
```

**Result:** ~50-150 KB WASM binary

---

## API Reference

### snapshot(options?)

**Parameters:**
```typescript
{
  screenshot?: boolean | {
    format?: 'png' | 'jpeg',
    quality?: number  // 0-100
  },
  limit?: number,
  filter?: {
    min_area?: number,
    allowed_roles?: string[],
    min_z_index?: number
  }
}
```

**Returns:** Promise<GeometryMap>

```typescript
{
  status: "success" | "error",
  timestamp: string,
  url: string,
  viewport: { width, height },
  elements: SmartElement[],
  screenshot?: string,
  screenshot_format?: 'png' | 'jpeg',
  screenshot_error?: string
}
```

### SmartElement

```typescript
{
  id: number,                // Registry index
  role: string,              // Semantic role
  text: string | null,       // Text content
  importance: number,        // Score (-300 to 1800)
  visual_cues: {
    is_primary: boolean,
    background_color_name: string | null,
    is_clickable: boolean
  },
  bbox: {
    x: number,
    y: number,
    width: number,
    height: number
  },
  z_index: number
}
```

---

## Performance

### Timing Breakdown

| Operation | Time |
|-----------|------|
| Geometry extraction | 100-300ms |
| + PNG screenshot | +50-100ms |
| + JPEG screenshot | +30-80ms |
| Total | 150-400ms |

### Memory Usage

| Component | Size |
|-----------|------|
| WASM Binary | 50-150 KB |
| Registry (1000 elements) | ~100 KB |
| Raw Data | ~200 KB |
| Smart Elements | ~100 KB |
| Total Peak | ~500 KB |

### Optimization Tips

1. Use `limit` to reduce processing time
2. Filter with `allowed_roles` to skip irrelevant elements
3. Use JPEG for smaller screenshots
4. Cache results if analyzing same page multiple times

---

## Troubleshooting

### "WASM not ready" Error

**Solution:** Wait for WASM to load
```javascript
setTimeout(async () => {
  const result = await window.sentience.snapshot();
  console.log(result);
}, 1000);
```

### Empty Results

**Check:**
```javascript
const result = await window.sentience.snapshot();
console.log('Elements:', result.elements.length);
console.log('Registry:', window.sentience_registry.length);
```

### Screenshot Fails

**Causes:**
- Extension doesn't have tab permissions
- Page is restricted URL (chrome://, file://)
- Tab is not active

**Solution:**
```javascript
const result = await window.sentience.snapshot({ screenshot: true });
if (result.screenshot_error) {
  console.error('Screenshot error:', result.screenshot_error);
}
```

### Screenshot is Black

**Cause:** Page hasn't rendered

**Solution:** Add delay
```javascript
await new Promise(r => setTimeout(r, 500));
const result = await window.sentience.snapshot({ screenshot: true });
```

### Large Screenshots

**Solution:** Use JPEG with lower quality
```javascript
{
  screenshot: {
    format: 'jpeg',
    quality: 60
  }
}
```

---

## Summary

### What Users Can Do

1. ✅ Call `window.sentience.snapshot()` to get geometry map
2. ✅ Add `{ screenshot: true }` for visual snapshot
3. ✅ Add `{ limit: N }` to get top N elements
4. ✅ Add `{ filter: {...} }` to filter by role/size/z-index
5. ✅ Visualize with bounding boxes
6. ✅ Send to AI vision APIs

### What Users Get

- **Screenshot**: Base64-encoded PNG/JPEG
- **Viewport**: URL, width, height
- **Elements**: Sorted by importance, then Y-position
- **Positions**: Bounding boxes (x, y, width, height)
- **Roles**: Semantic (button/link/input)
- **Scores**: -300 to 1800 importance ranking
- **Visual Cues**: is_primary, colors, clickability

### One Function, All Features

```javascript
await window.sentience.snapshot({
  screenshot: { format: 'jpeg', quality: 80 },
  limit: 20,
  filter: {
    allowed_roles: ['button', 'textbox'],
    min_area: 100
  }
})
```

**That's it!** 🎉

---

## License

MIT License - See LICENSE file for details.

## Contributing

Contributions welcome! Please open issues or pull requests.

## Authors

- Built with Rust, WASM, and Chrome Extension APIs
- Ported from geometry-service architecture

---

**Questions?** Open an issue on GitHub.

## Running Python to use the chrome extension
> suppose we have python code running on the same machine as the chrome browser, can the python code invoke the snapshopt function in `window.sentience` of the chrome extension?

You are asking if Python code running locally can invoke the `snapshot` function exposed by the Chrome Extension.

The answer is **Yes**. Python can execute any JavaScript function available in the browser context using standard browser automation libraries like Playwright, Selenium, or Puppeteer. Since your extension injects `window.sentience` into the "Main World" (the same context the page uses), your Python script has full access to it via `page.evaluate()`.

### How to do it (Python Example)

Using **Playwright** (recommended for modern agents):

```python
from playwright.sync_api import sync_playwright
import json

def run_agent():
    with sync_playwright() as p:
        # 1. Launch Chrome with your Extension loaded
        # Note: Use launch_persistent_context to keep extension state/settings
        browser = p.chromium.launch_persistent_context(
            user_data_dir="/tmp/chrome-profile",
            headless=False, # Extensions don't work in headless=new yet (usually)
            args=[
                "--disable-extensions-except=./path/to/your/extension",
                "--load-extension=./path/to/your/extension"
            ]
        )
        
        page = browser.pages[0]
        page.goto("https://www.amazon.com")

        # 2. Invoke your API
        # Python waits for the Promise to resolve and gets the JSON back
        print("📸 Taking snapshot...")
        result = page.evaluate("window.sentience.snapshot({ limit: 50 })")

        if result.get("status") == "success":
            elements = result.get("elements", [])
            print(f"✅ Found {len(elements)} interactive elements")
            
            # Example: Find Search Box
            search_box = next((el for el in elements if el['role'] == 'searchbox'), None)
            
            if search_box:
                print(f"🔍 Clicking Search Box ID: {search_box['id']}")
                # 3. Execute Action via your API
                page.evaluate(f"window.sentience.click({search_box['id']})")
                
                # Or standard Playwright typing
                page.keyboard.type("Gaming Laptop")
                page.keyboard.press("Enter")
        else:
            print(f"❌ Error: {result.get('error')}")

        browser.close()

if __name__ == "__main__":
    run_agent()

```

### Why this architecture is powerful

1. **Zero Network Latency:** The Python script talks to the Extension instantly via the Chrome DevTools Protocol. No HTTP requests to your server.
2. **Shared State:** The Python script can see the `window.sentience` object just like a developer typing in the console.
3. **Hybrid Control:** You can mix your `sentience.snapshot()` (for vision) with standard Playwright commands (like `.type()` or `.waitForNavigation()`) for a robust agent.
---

## Contributing

We welcome contributions! This extension has been fully restructured with modern tooling and modular architecture.

### 🚀 **Quick Start for Contributors**

1. **Clone and install:**
   ```bash
   git clone https://github.com/YOUR_ORG/sentience-chrome.git
   cd sentience-chrome
   npm install
   ```

2. **Make changes** to the modular source in `src/`

3. **Test your changes:**
   ```bash
   npm run lint        # Check code quality
   npm test            # Run tests
   npm run build       # Build extension
   ```

4. **Submit a PR** - CI will automatically check linting, tests, and builds

### 📚 **Developer Resources**

- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Complete developer guide
- **[docs/RESTRUCTURING_PROGRESS.md](docs/RESTRUCTURING_PROGRESS.md)** - Architecture details
- **Modular codebase** - 7 focused modules instead of monolith
- **76 tests** with 80% pass rate
- **Automated CI/CD** - GitHub Actions for quality checks

### 🎯 **Key Features for Contributors**

- ✅ **ESLint + Prettier** - Automated code quality
- ✅ **Jest testing** - Unit tests with coverage reports
- ✅ **Rollup bundling** - Optimized builds
- ✅ **CI/CD pipelines** - Automated checks on every PR
- ✅ **Zero breaking changes** - SDK compatibility preserved

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## License

See [LICENSE](LICENSE) file.

---

**Built with ❤️ for AI agents and web automation**
