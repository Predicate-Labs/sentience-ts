# Sentience TypeScript SDK

## Installation

```bash
npm install
npm run build

# Install Playwright browsers (required)
npx playwright install chromium
```

## Quick Start

```typescript
import { SentienceBrowser, snapshot, find, click } from './src';

async function main() {
  const browser = new SentienceBrowser();

  try {
    await browser.start();

    await browser.goto('https://example.com');
    await browser.getPage().waitForLoadState('networkidle');

    // Take snapshot - captures all interactive elements
    const snap = await snapshot(browser);
    console.log(`Found ${snap.elements.length} elements`);

    // Find and click a link using semantic selectors
    const link = find(snap, 'role=link text~"More information"');
    if (link) {
      const result = await click(browser, link.id);
      console.log(`Click success: ${result.success}`);
    }
  } finally {
    await browser.close();
  }
}

main();
```

## Real-World Example: Amazon Shopping Bot

This example demonstrates navigating Amazon, finding products, and adding items to cart:

```typescript
import { SentienceBrowser, snapshot, find, click } from './src';

async function main() {
  const browser = new SentienceBrowser(undefined, undefined, false);

  try {
    await browser.start();

    // Navigate to Amazon Best Sellers
    await browser.goto('https://www.amazon.com/gp/bestsellers/');
    await browser.getPage().waitForLoadState('networkidle');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Take snapshot and find products
    const snap = await snapshot(browser);
    console.log(`Found ${snap.elements.length} elements`);

    // Find first product in viewport using spatial filtering
    const products = snap.elements
      .filter(el =>
        el.role === 'link' &&
        el.visual_cues.is_clickable &&
        el.in_viewport &&
        !el.is_occluded &&
        el.bbox.y < 600  // First row
      );

    if (products.length > 0) {
      // Sort by position (left to right, top to bottom)
      products.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
      const firstProduct = products[0];

      console.log(`Clicking: ${firstProduct.text}`);
      const result = await click(browser, firstProduct.id);

      // Wait for product page
      await browser.getPage().waitForLoadState('networkidle');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Find and click "Add to Cart" button
      const productSnap = await snapshot(browser);
      const addToCart = find(productSnap, 'role=button text~"add to cart"');

      if (addToCart) {
        const cartResult = await click(browser, addToCart.id);
        console.log(`Added to cart: ${cartResult.success}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main();
```

**See the complete tutorial**: [Amazon Shopping Guide](../docs/AMAZON_SHOPPING_GUIDE.md)

## Running Examples

**⚠️ Important**: You cannot use `node` directly to run TypeScript files. Use one of these methods:

### Option 1: Using npm scripts (recommended)
```bash
npm run example:hello
npm run example:basic
npm run example:query
npm run example:wait
```

### Option 2: Using ts-node directly
```bash
npx ts-node examples/hello.ts
# or if ts-node is installed globally:
ts-node examples/hello.ts
```

### Option 3: Compile then run
```bash
npm run build
# Then use compiled JavaScript from dist/
```

## Core Features

### Browser Control
- **`SentienceBrowser`** - Playwright browser with Sentience extension pre-loaded
- **`browser.goto(url)`** - Navigate with automatic extension readiness checks
- Automatic bot evasion and stealth mode
- Configurable headless/headed mode

### Snapshot - Intelligent Page Analysis
- **`snapshot(browser, options?)`** - Capture page state with AI-ranked elements
- Returns semantic elements with roles, text, importance scores, and bounding boxes
- Optional screenshot capture (PNG/JPEG)
- TypeScript types for type safety

**Example:**
```typescript
const snap = await snapshot(browser, { screenshot: true });

// Access structured data
console.log(`URL: ${snap.url}`);
console.log(`Viewport: ${snap.viewport.width}x${snap.viewport.height}`);
console.log(`Elements: ${snap.elements.length}`);

// Iterate over elements
for (const element of snap.elements) {
  console.log(`${element.role}: ${element.text} (importance: ${element.importance})`);
}
```

### Query Engine - Semantic Element Selection
- **`query(snapshot, selector)`** - Find all matching elements
- **`find(snapshot, selector)`** - Find single best match (by importance)
- Powerful query DSL with multiple operators

**Query Examples:**
```typescript
// Find by role and text
const button = find(snap, 'role=button text="Sign in"');

// Substring match (case-insensitive)
const link = find(snap, 'role=link text~"more info"');

// Spatial filtering
const topLeft = find(snap, 'bbox.x<=100 bbox.y<=200');

// Multiple conditions (AND logic)
const primaryBtn = find(snap, 'role=button clickable=true visible=true importance>800');

// Prefix/suffix matching
const startsWith = find(snap, 'text^="Add"');
const endsWith = find(snap, 'text$="Cart"');

// Numeric comparisons
const important = query(snap, 'importance>=700');
const firstRow = query(snap, 'bbox.y<600');
```

**📖 [Complete Query DSL Guide](docs/QUERY_DSL.md)** - All operators, fields, and advanced patterns

### Actions - Interact with Elements
- **`click(browser, elementId)`** - Click element by ID
- **`clickRect(browser, rect)`** - Click at center of rectangle (coordinate-based)
- **`typeText(browser, elementId, text)`** - Type into input fields
- **`press(browser, key)`** - Press keyboard keys (Enter, Escape, Tab, etc.)

All actions return `ActionResult` with success status, timing, and outcome:

```typescript
const result = await click(browser, element.id);

console.log(`Success: ${result.success}`);
console.log(`Outcome: ${result.outcome}`);  // "navigated", "dom_updated", "error"
console.log(`Duration: ${result.duration_ms}ms`);
console.log(`URL changed: ${result.url_changed}`);
```

**Coordinate-based clicking:**
```typescript
import { clickRect } from './src';

// Click at center of rectangle (x, y, width, height)
await clickRect(browser, { x: 100, y: 200, w: 50, h: 30 });

// With visual highlight (default: red border for 2 seconds)
await clickRect(browser, { x: 100, y: 200, w: 50, h: 30 }, true, 2.0);

// Using element's bounding box
const snap = await snapshot(browser);
const element = find(snap, 'role=button');
if (element) {
  await clickRect(browser, {
    x: element.bbox.x,
    y: element.bbox.y,
    w: element.bbox.width,
    h: element.bbox.height
  });
}
```

### Wait & Assertions
- **`waitFor(browser, selector, timeout?, interval?, useApi?)`** - Wait for element to appear
- **`expect(browser, selector)`** - Assertion helper with fluent API

**Examples:**
```typescript
// Wait for element (auto-detects optimal interval based on API usage)
const result = await waitFor(browser, 'role=button text="Submit"', 10000);
if (result.found) {
  console.log(`Found after ${result.duration_ms}ms`);
}

// Use local extension with fast polling (250ms interval)
const result = await waitFor(browser, 'role=button', 5000, undefined, false);

// Use remote API with network-friendly polling (1500ms interval)
const result = await waitFor(browser, 'role=button', 5000, undefined, true);

// Custom interval override
const result = await waitFor(browser, 'role=button', 5000, 500, false);

// Semantic wait conditions
await waitFor(browser, 'clickable=true', 5000);  // Wait for clickable element
await waitFor(browser, 'importance>100', 5000);  // Wait for important element
await waitFor(browser, 'role=link visible=true', 5000);  // Wait for visible link

// Assertions
await expect(browser, 'role=button text="Submit"').toExist(5000);
await expect(browser, 'role=heading').toBeVisible();
await expect(browser, 'role=button').toHaveText('Submit');
await expect(browser, 'role=link').toHaveCount(10);
```

### Content Reading
- **`read(browser, options?)`** - Extract page content
  - `format: "text"` - Plain text extraction
  - `format: "markdown"` - High-quality markdown conversion (uses Turndown)
  - `format: "raw"` - Cleaned HTML (default)

**Example:**
```typescript
import { read } from './src';

// Get markdown content
const result = await read(browser, { format: 'markdown' });
console.log(result.content);  // Markdown text

// Get plain text
const result = await read(browser, { format: 'text' });
console.log(result.content);  // Plain text
```

### Screenshots
- **`screenshot(browser, options?)`** - Standalone screenshot capture
  - Returns base64-encoded data URL
  - PNG or JPEG format
  - Quality control for JPEG (1-100)

**Example:**
```typescript
import { screenshot } from './src';
import { writeFileSync } from 'fs';

// Capture PNG screenshot
const dataUrl = await screenshot(browser, { format: 'png' });

// Save to file
const base64Data = dataUrl.split(',')[1];
const imageData = Buffer.from(base64Data, 'base64');
writeFileSync('screenshot.png', imageData);

// JPEG with quality control (smaller file size)
const dataUrl = await screenshot(browser, { format: 'jpeg', quality: 85 });
```

## Element Properties

Elements returned by `snapshot()` have the following properties:

```typescript
element.id              // Unique identifier for interactions
element.role            // ARIA role (button, link, textbox, heading, etc.)
element.text            // Visible text content
element.importance      // AI importance score (0-1000)
element.bbox            // Bounding box (x, y, width, height)
element.visual_cues     // Visual analysis (is_primary, is_clickable, background_color)
element.in_viewport     // Is element visible in current viewport?
element.is_occluded     // Is element covered by other elements?
element.z_index         // CSS stacking order
```

## Query DSL Reference

### Basic Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Exact match | `role=button` |
| `!=` | Exclusion | `role!=link` |
| `~` | Substring (case-insensitive) | `text~"sign in"` |
| `^=` | Prefix match | `text^="Add"` |
| `$=` | Suffix match | `text$="Cart"` |
| `>`, `>=` | Greater than | `importance>500` |
| `<`, `<=` | Less than | `bbox.y<600` |

### Supported Fields

- **Role**: `role=button|link|textbox|heading|...`
- **Text**: `text`, `text~`, `text^=`, `text$=`
- **Visibility**: `clickable=true|false`, `visible=true|false`
- **Importance**: `importance`, `importance>=N`, `importance<N`
- **Position**: `bbox.x`, `bbox.y`, `bbox.width`, `bbox.height`
- **Layering**: `z_index`

## Examples

See the `examples/` directory for complete working examples:

- **`hello.ts`** - Extension bridge verification
- **`basic-agent.ts`** - Basic snapshot and element inspection
- **`query-demo.ts`** - Query engine demonstrations
- **`wait-and-click.ts`** - Waiting for elements and performing actions
- **`read-markdown.ts`** - Content extraction and markdown conversion

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- snapshot.test.ts
```

## Configuration

### Viewport Size

Default viewport is **1280x800** pixels. You can customize it using Playwright's API:

```typescript
const browser = new SentienceBrowser();
await browser.start();

// Set custom viewport before navigating
await browser.getPage().setViewportSize({ width: 1920, height: 1080 });

await browser.goto('https://example.com');
```

### Headless Mode

```typescript
// Headed mode (shows browser window)
const browser = new SentienceBrowser(undefined, undefined, false);

// Headless mode
const browser = new SentienceBrowser(undefined, undefined, true);

// Auto-detect based on environment (default)
const browser = new SentienceBrowser();  // headless=true if CI=true, else false
```

## Best Practices

### 1. Wait for Dynamic Content
```typescript
await browser.goto('https://example.com');
await browser.getPage().waitForLoadState('networkidle');
await new Promise(resolve => setTimeout(resolve, 1000));  // Extra buffer
```

### 2. Use Multiple Strategies for Finding Elements
```typescript
// Try exact match first
let btn = find(snap, 'role=button text="Add to Cart"');

// Fallback to fuzzy match
if (!btn) {
  btn = find(snap, 'role=button text~"cart"');
}
```

### 3. Check Element Visibility Before Clicking
```typescript
if (element.in_viewport && !element.is_occluded) {
  await click(browser, element.id);
}
```

### 4. Handle Navigation
```typescript
const result = await click(browser, linkId);
if (result.url_changed) {
  await browser.getPage().waitForLoadState('networkidle');
}
```

### 5. Use Screenshots Sparingly
```typescript
// Fast - no screenshot (only element data)
const snap = await snapshot(browser);

// Slower - with screenshot (for debugging/verification)
const snap = await snapshot(browser, { screenshot: true });
```

### 6. Always Close Browser
```typescript
const browser = new SentienceBrowser();

try {
  await browser.start();
  // ... your automation code
} finally {
  await browser.close();  // Always clean up
}
```

## Troubleshooting

### "Extension failed to load"
**Solution:** Build the extension first:
```bash
cd sentience-chrome
./build.sh
```

### "Cannot use import statement outside a module"
**Solution:** Don't use `node` directly. Use `ts-node` or npm scripts:
```bash
npx ts-node examples/hello.ts
# or
npm run example:hello
```

### "Element not found"
**Solutions:**
- Ensure page is loaded: `await browser.getPage().waitForLoadState('networkidle')`
- Use `waitFor()`: `await waitFor(browser, 'role=button', 10000)`
- Debug elements: `console.log(snap.elements.map(el => el.text))`

### Button not clickable
**Solutions:**
- Check visibility: `element.in_viewport && !element.is_occluded`
- Scroll to element: `await browser.getPage().evaluate(\`window.sentience_registry[${element.id}].scrollIntoView()\`)`

## Documentation

- **📖 [Amazon Shopping Guide](../docs/AMAZON_SHOPPING_GUIDE.md)** - Complete tutorial with real-world example
- **📖 [Query DSL Guide](docs/QUERY_DSL.md)** - Advanced query patterns and operators
- **📄 [API Contract](../spec/SNAPSHOT_V1.md)** - Snapshot API specification
- **📄 [Type Definitions](../spec/sdk-types.md)** - TypeScript/Python type definitions

## License

📜 **License**

This SDK is licensed under the **Elastic License 2.0 (ELv2)**.

The Elastic License 2.0 allows you to use, modify, and distribute this SDK for internal, research, and non-competitive purposes. It **does not permit offering this SDK or a derivative as a hosted or managed service**, nor using it to build a competing product or service.

### Important Notes

- This SDK is a **client-side library** that communicates with proprietary Sentience services and browser components.

- The Sentience backend services (including semantic geometry grounding, ranking, visual cues, and trace processing) are **not open source** and are governed by Sentience’s Terms of Service.

- Use of this SDK does **not** grant rights to operate, replicate, or reimplement Sentience’s hosted services.

For commercial usage, hosted offerings, or enterprise deployments, please contact Sentience to obtain a commercial license.

See the full license text in [`LICENSE`](./LICENSE.md).

