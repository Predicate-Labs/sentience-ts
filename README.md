# Sentience TypeScript SDK

**Status**: ✅ Week 1 Complete

TypeScript SDK for Sentience AI Agent Browser Automation.

## Installation

```bash
cd sdk-ts
npm install
npm run build

# Install Playwright browsers (required)
npx playwright install chromium
```

## Quick Start

```typescript
import { SentienceBrowser, snapshot, find, click } from './src';

async function main() {
  const browser = new SentienceBrowser(undefined, undefined, false);
  
  try {
    await browser.start();
    
    await browser.getPage().goto('https://example.com');
    await browser.getPage().waitForLoadState('networkidle');
    
    // Take snapshot
    const snap = await snapshot(browser);
    console.log(`Found ${snap.elements.length} elements`);
    
    // Find and click a link
    const link = find(snap, 'role=link');
    if (link) {
      const result = await click(browser, link.id);
      console.log(`Click success: ${result.success}`);
    }
  } finally {
    await browser.close();
  }
}
```

## Running Examples

**⚠️ Important**: You cannot use `node` directly to run TypeScript files. Use one of these methods:

**Option 1: Using npm scripts (recommended)**
```bash
npm run example:hello
npm run example:basic
```

**Option 2: Using ts-node directly**
```bash
npx ts-node examples/hello.ts
# or if ts-node is installed globally:
ts-node examples/hello.ts
```

**Option 3: Compile then run (not recommended for examples)**
```bash
npm run build
# Examples would need to be compiled separately
```

## Features

### Day 2: Browser Harness
- `SentienceBrowser` - Launch Playwright with extension loaded
- Automatic extension loading and verification

### Day 3: Snapshot
- `snapshot(browser, options)` - Capture page state
- TypeScript types for type safety

### Day 4: Query Engine
- `query(snapshot, selector)` - Find elements matching selector
- `find(snapshot, selector)` - Find single best match
- String DSL: `"role=button text~'Sign in'"`
- **📖 [Complete DSL Query Guide](docs/QUERY_DSL.md)** - Comprehensive documentation with all operators, fields, and examples

### Day 5: Actions
- `click(browser, elementId)` - Click element
- `typeText(browser, elementId, text)` - Type into element
- `press(browser, key)` - Press keyboard key

### Day 6: Wait & Assert
- `waitFor(browser, selector, timeout)` - Wait for element
- `expect(browser, selector)` - Assertion helper
  - `.toExist()`
  - `.toBeVisible()`
  - `.toHaveText(text)`
  - `.toHaveCount(n)`

## Examples

See `examples/` directory:
- `hello.ts` - Extension bridge verification
- `basic-agent.ts` - Basic snapshot
- `query-demo.ts` - Query engine
- `wait-and-click.ts` - Wait and actions

## Testing

```bash
npm test
```

## Documentation

- **📖 [Query DSL Guide](docs/QUERY_DSL.md)** - Complete guide to the semantic query language
- API Contract: `../spec/SNAPSHOT_V1.md`
- Type Definitions: `../spec/sdk-types.md`
