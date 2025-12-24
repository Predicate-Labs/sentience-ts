# Sentience TypeScript SDK

The SDK is open under ELv2; the core semantic geometry and reliability logic runs in Sentience-hosted services.

## Installation

```bash
npm install
npm run build

# Install Playwright browsers (required)
npx playwright install chromium
```

## Quick Start: Choose Your Abstraction Level

Sentience SDK offers **4 levels of abstraction** - choose based on your needs:

### 🗣️ Level 4: Conversational (Full Natural Language) - **Perfect for Chatbots & End Users**

Complete natural language conversation. ONE command does everything:

```typescript
import { SentienceBrowser, ConversationalAgent, OpenAIProvider } from 'sentience-ts';

const browser = await SentienceBrowser.create({ apiKey: process.env.SENTIENCE_API_KEY });
const llm = new OpenAIProvider(process.env.OPENAI_API_KEY!, 'gpt-4o');
const agent = new ConversationalAgent(browser, llm);

await browser.getPage().goto('https://www.amazon.com');

// ONE natural language command - agent plans and executes everything!
const response = await agent.execute(
  'Search for wireless mouse and add the cheapest one to my cart'
);
console.log(response);
// → "I searched for wireless mouse, found the Logitech M185 for $12.99,
//    and added it to your cart."

await browser.close();
```

**When to use:** Chatbots, voice assistants, end-user tools
**Code reduction:** 99% less code (350 lines → 3 lines!)
**Features:** Auto-planning, natural I/O, conversation memory
**Requirements:** OpenAI API key (GPT-4o recommended for complex planning)

### 🤖 Level 3: Agent (Technical Commands) - **Best for AI Developers**

Natural language commands with more control:

```typescript
import { SentienceBrowser, SentienceAgent, OpenAIProvider } from 'sentience-ts';

const browser = await SentienceBrowser.create({ apiKey: process.env.SENTIENCE_API_KEY });
const llm = new OpenAIProvider(process.env.OPENAI_API_KEY!, 'gpt-4o-mini');
const agent = new SentienceAgent(browser, llm);

await browser.getPage().goto('https://www.amazon.com');

// Technical natural language commands - you control the steps
await agent.act('Click the search box');
await agent.act("Type 'wireless mouse' into the search field");
await agent.act('Press Enter key');
await agent.act('Click the first product result');

// Automatic token tracking
console.log(`Tokens used: ${agent.getTokenStats().totalTokens}`);
await browser.close();
```

**When to use:** AI agents, automation scripts, rapid prototyping
**Code reduction:** 95% less code vs manual approach
**Features:** Technical control, retry logic, token tracking
**Requirements:** OpenAI API key (or Anthropic for Claude)

### 🔧 Level 2: Direct SDK (Technical Control)

Full control with semantic selectors. For technical users who want precision:

```typescript
import { SentienceBrowser, snapshot, find, click, typeText, press } from 'sentience-ts';

const browser = await SentienceBrowser.create({ apiKey: process.env.SENTIENCE_API_KEY });
await browser.getPage().goto('https://www.amazon.com');

// Get semantic snapshot
const snap = await snapshot(browser);

// Find elements using query DSL
const searchBox = find(snap, 'role=textbox text~"search"');
await click(browser, searchBox!.id);

// Type and submit
await typeText(browser, searchBox!.id, 'wireless mouse');
await press(browser, 'Enter');

await browser.close();
```

**When to use:** Need precise control, debugging, custom workflows
**Code reduction:** Still 80% less code vs raw Playwright
**Requirements:** Only Sentience API key

### ⚙️ Level 1: Raw Playwright (Maximum Control)

For when you need complete low-level control (rare):

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://www.amazon.com');
await page.fill('#twotabsearchtextbox', 'wireless mouse');
await page.press('#twotabsearchtextbox', 'Enter');
await browser.close();
```

**When to use:** Very specific edge cases, custom browser configs
**Tradeoffs:** No semantic intelligence, brittle selectors, more code

---

## Agent Layer Examples

### Level 4: Conversational Agent (Full Natural Language)

#### One Command Does Everything

```typescript
import { SentienceBrowser, ConversationalAgent, OpenAIProvider } from 'sentience-ts';

const browser = await SentienceBrowser.create({ apiKey: apiKey });
const llm = new OpenAIProvider(openaiKey, 'gpt-4o');
const agent = new ConversationalAgent(browser, llm);

await browser.getPage().goto('https://www.google.com');

// ONE command handles search, click, and extraction!
const response = await agent.execute(
  'Search for best mechanical keyboards 2024 and tell me what you find'
);
console.log(response);
// → "I searched for 'best mechanical keyboards 2024' and found several comprehensive guides.
//    The top result is from rtings.com with an in-depth keyboard buying guide."

await browser.close();
```

**99% code reduction:** 350 lines → 3 lines!

**See full examples:**
- [examples/conversational-google-search.ts](examples/conversational-google-search.ts)
- [examples/conversational-amazon-shopping.ts](examples/conversational-amazon-shopping.ts)

#### Conversation with Context Memory

```typescript
// First interaction
await agent.execute('Go to google.com');
// → "I've navigated to google.com"

// Contextual follow-up (agent remembers where it is)
await agent.execute('Search for laptops');
// → "I searched for 'laptops' and found results from various retailers"

// Get session summary
const summary = await agent.getSummary();
// → "During this session, I navigated to Google and searched for laptops,
//    finding results from Amazon, Best Buy, and other major retailers."
```

---

### Level 3: SentienceAgent (Technical Commands)

#### Google Search (6 lines of code)

```typescript
import { SentienceBrowser, SentienceAgent, OpenAIProvider } from 'sentience-ts';

const browser = await SentienceBrowser.create({ apiKey: apiKey });
const llm = new OpenAIProvider(openaiKey, 'gpt-4o-mini');
const agent = new SentienceAgent(browser, llm);

await browser.getPage().goto('https://www.google.com');
await agent.act('Click the search box');
await agent.act("Type 'mechanical keyboards' into the search field");
await agent.act('Press Enter key');
await agent.act('Click the first non-ad search result');

await browser.close();
```

**See full example:** [examples/agent-google-search.ts](examples/agent-google-search.ts)

### Using Anthropic Claude Instead of GPT

```typescript
import { SentienceAgent, AnthropicProvider } from 'sentience-ts';

// Swap OpenAI for Anthropic - same API!
const llm = new AnthropicProvider(
  process.env.ANTHROPIC_API_KEY!,
  'claude-3-5-sonnet-20241022'
);

const agent = new SentienceAgent(browser, llm);
await agent.act('Click the search button'); // Works exactly the same
```

**BYOB (Bring Your Own Brain):** OpenAI, Anthropic, or implement `LLMProvider` for any model.

**See full example:** [examples/agent-with-anthropic.ts](examples/agent-with-anthropic.ts)

### Amazon Shopping (98% code reduction)

**Before (manual approach):** 350 lines
**After (agent layer):** 6 lines

```typescript
await agent.act('Click the search box');
await agent.act("Type 'wireless mouse' into the search field");
await agent.act('Press Enter key');
await agent.act('Click the first visible product in the search results');
await agent.act("Click the 'Add to Cart' button");
```

**See full example:** [examples/agent-amazon-shopping.ts](examples/agent-amazon-shopping.ts)

---

## Installation for Agent Layer

```bash
# Install core SDK
npm install sentience-ts

# Install LLM provider (choose one or both)
npm install openai              # For GPT-4, GPT-4o, GPT-4o-mini
npm install @anthropic-ai/sdk   # For Claude 3.5 Sonnet

# Set API keys
export SENTIENCE_API_KEY="your-sentience-key"
export OPENAI_API_KEY="your-openai-key"        # OR
export ANTHROPIC_API_KEY="your-anthropic-key"
```

---

## Direct SDK Quick Start

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

### Agent Layer (Level 3 - Natural Language)
- **`agent-google-search.ts`** - Google search automation with natural language commands
- **`agent-amazon-shopping.ts`** - Amazon shopping bot (6 lines vs 350 lines manual code)
- **`agent-with-anthropic.ts`** - Using Anthropic Claude instead of OpenAI GPT

### Direct SDK (Level 2 - Technical Control)
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

