# Running Tests - TypeScript SDK

## Prerequisites

```bash
cd sdk-ts
npm install
npm run build
npx playwright install chromium
```

## Setting Up Jest

First, create a Jest configuration file:

```bash
# Create jest.config.js
cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
};
EOF
```

## Running All Tests

```bash
# From sdk-ts directory
npm test

# Or with Jest directly
npx jest

# With watch mode (re-runs on file changes)
npm test -- --watch
```

## Running Specific Test Files

```bash
# Run a specific test file
npx jest tests/inspector.test.ts

# Run multiple test files
npx jest tests/inspector.test.ts tests/recorder.test.ts
```

## Running Tests with Patterns

```bash
# Run tests matching a pattern
npx jest -t "inspector"

# Run tests in a directory
npx jest tests/
```

## Running Tests with Output

```bash
# Verbose output
npm test -- --verbose

# Show coverage
npm test -- --coverage

# Update snapshots (if using)
npm test -- -u
```

## Example Test Files

Create test files in `tests/` directory:

### Example: `tests/inspector.test.ts`

```typescript
import { SentienceBrowser, inspect } from '../src';

describe('Inspector', () => {
  it('should start and stop', async () => {
    const browser = new SentienceBrowser(undefined, undefined, false);
    await browser.start();
    
    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle');
      
      const inspector = inspect(browser);
      await inspector.start();
      
      const active = await browser.getPage().evaluate(
        () => (window as any).__sentience_inspector_active === true
      );
      expect(active).toBe(true);
      
      await inspector.stop();
      
      const inactive = await browser.getPage().evaluate(
        () => (window as any).__sentience_inspector_active === true
      );
      expect(inactive).toBe(false);
    } finally {
      await browser.close();
    }
  });
});
```

### Example: `tests/recorder.test.ts`

```typescript
import { SentienceBrowser, record } from '../src';

describe('Recorder', () => {
  it('should record click events', async () => {
    const browser = new SentienceBrowser(undefined, undefined, false);
    await browser.start();
    
    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle');
      
      const rec = record(browser);
      rec.start();
      
      rec.recordClick(1, 'role=button');
      
      const trace = rec.getTrace();
      expect(trace.steps.length).toBe(1);
      expect(trace.steps[0].type).toBe('click');
      expect(trace.steps[0].element_id).toBe(1);
      
      rec.stop();
    } finally {
      await browser.close();
    }
  });
});
```

## Running Tests in Watch Mode

```bash
# Watch mode - re-runs tests on file changes
npm test -- --watch

# Watch mode for specific file
npm test -- --watch tests/inspector.test.ts
```

## Running Tests with Coverage

```bash
# Generate coverage report
npm test -- --coverage

# View coverage report
open coverage/lcov-report/index.html
```

## Common Options

```bash
# Run only changed tests (with git)
npm test -- --onlyChanged

# Run tests matching a name pattern
npm test -- -t "should start"

# Stop on first failure
npm test -- --bail

# Run tests in parallel (default)
npm test -- --maxWorkers=4

# Run tests serially
npm test -- --runInBand
```

## Example: Full Test Run

```bash
cd sdk-ts
npm test -- --verbose
```

## Example: Quick Smoke Test

```bash
cd sdk-ts
npm test -- tests/inspector.test.ts -t "should start"
```

## Troubleshooting

### TypeScript compilation errors
```bash
npm run build
```

### Browser not found
```bash
npx playwright install chromium
```

### Extension not found
Make sure the extension is built:
```bash
cd ../sentience-chrome
./build.sh
```

### Module not found errors
```bash
npm install
npm run build
```

