# Predicate TypeScript SDK

> **A verification & control layer for AI agents that operate browsers**

Predicate is built for **AI agent developers** who already use Playwright / CDP / LangGraph and care about **flakiness, cost, determinism, evals, and debugging**.

Often described as _Jest for Browser AI Agents_ - but applied to end-to-end agent runs (not unit tests).

The core loop is:

> **Agent → Snapshot → Action → Verification → Artifact**

## What Predicate is

- A **verification-first runtime** (`AgentRuntime`) for browser agents
- Treats the browser as an adapter (Playwright / CDP); **`AgentRuntime` is the product**
- A **controlled perception** layer (semantic snapshots; pruning/limits; lowers token usage by filtering noise from what models see)
- A **debugging layer** (structured traces + failure artifacts)
- Enables **local LLM small models (3B-7B)** for browser automation (privacy, compliance, and cost control)
- Keeps vision models **optional** (use as a fallback when DOM/snapshot structure falls short, e.g. `<canvas>`)

## What Predicate is not

- Not a browser driver
- Not a Playwright replacement
- Not a vision-first agent framework

## Install

```bash
npm install @predicatelabs/sdk
npx playwright install chromium
```

## Naming migration (Predicate rebrand)

Use the new `Predicate*` class names for all new code:

- `PredicateBrowser`
- `PredicateAgent`
- `PredicateVisualAgent`
- `PredicateDebugger`
- `backends.PredicateContext`

## Conceptual example (why this exists)

- Steps are **gated by verifiable UI assertions**
- If progress can’t be proven, the run **fails with evidence**
- This is how you make runs **reproducible** and **debuggable**, and how you run evals reliably

## Quickstart: a verification-first loop

```ts
import { PredicateBrowser, AgentRuntime } from '@predicatelabs/sdk';
import { JsonlTraceSink, Tracer } from '@predicatelabs/sdk';
import { exists, urlContains } from '@predicatelabs/sdk';
import type { Page } from 'playwright';

async function main(): Promise<void> {
  const tracer = new Tracer('demo', new JsonlTraceSink('trace.jsonl'));

  const browser = new PredicateBrowser();
  await browser.start();
  const page = browser.getPage();
  if (!page) throw new Error('no page');

  await page.goto('https://example.com');

  // AgentRuntime needs a snapshot provider; PredicateBrowser.snapshot() does not depend on Page,
  // so we wrap it to fit the runtime interface.
  const runtime = new AgentRuntime(
    { snapshot: async (_page: Page, options?: Record<string, any>) => browser.snapshot(options) },
    page,
    tracer
  );

  runtime.beginStep('Verify homepage');
  await runtime.snapshot({ limit: 60 });

  runtime.assert(urlContains('example.com'), 'on_domain', true);
  runtime.assert(exists('role=heading'), 'has_heading');

  runtime.assertDone(exists("text~'Example'"), 'task_complete');

  await browser.close();
}

void main();
```

## PredicateDebugger: attach to your existing agent framework (sidecar mode)

If you already have an agent loop (LangGraph, custom planner/executor), keep it and attach Predicate as a **verifier + trace layer**.

Key idea: your agent still executes actions — Predicate **snapshots and verifies outcomes**.

```ts
import type { Page } from 'playwright';
import { PredicateDebugger, Tracer, JsonlTraceSink, exists, urlContains } from '@predicatelabs/sdk';

async function runExistingAgent(page: Page): Promise<void> {
  const tracer = new Tracer('run-123', new JsonlTraceSink('trace.jsonl'));
  const dbg = PredicateDebugger.attach(page, tracer);

  await dbg.step('agent_step: navigate + verify', async () => {
    // 1) Let your framework do whatever it does
    await yourAgent.step();

    // 2) Snapshot what the agent produced
    await dbg.snapshot({ limit: 60 });

    // 3) Verify outcomes (with bounded retries)
    await dbg
      .check(urlContains('example.com'), 'on_domain', true)
      .eventually({ timeoutMs: 10_000 });
    await dbg.check(exists('role=heading'), 'has_heading').eventually({ timeoutMs: 10_000 });
  });
}
```

## SDK-driven full loop (snapshots + actions)

If you want Predicate to drive the loop end-to-end, you can use the SDK primitives directly: take a snapshot, select elements, act, then verify.

```ts
import { PredicateBrowser, snapshot, find, typeText, click, waitFor } from '@predicatelabs/sdk';

async function loginExample(): Promise<void> {
  const browser = new PredicateBrowser();
  await browser.start();
  const page = browser.getPage();
  if (!page) throw new Error('no page');

  await page.goto('https://example.com/login');

  const snap = await snapshot(browser);
  const email = find(snap, "role=textbox text~'email'");
  const password = find(snap, "role=textbox text~'password'");
  const submit = find(snap, "role=button text~'sign in'");
  if (!email || !password || !submit) throw new Error('login form not found');

  await typeText(browser, email.id, 'user@example.com');
  await typeText(browser, password.id, 'password123');
  await click(browser, submit.id);

  const ok = await waitFor(browser, "role=heading text~'Dashboard'", 10_000);
  if (!ok.found) throw new Error('login failed');

  await browser.close();
}
```

## Capabilities (lifecycle guarantees)

### Controlled perception

- **Semantic snapshots** instead of raw DOM dumps
- **Pruning knobs** via `SnapshotOptions` (limit/filter)
- Snapshot diagnostics that help decide when “structure is insufficient”

### Constrained action space

- Action primitives operate on **stable IDs / rects** derived from snapshots
- Optional helpers for ordinality (“click the 3rd result”)

### Verified progress

- Predicates like `exists(...)`, `urlMatches(...)`, `isEnabled(...)`, `valueEquals(...)`
- Fluent assertion DSL via `expect(...)`
- Retrying verification via `runtime.check(...).eventually(...)`

### Scroll verification (prevent no-op scroll drift)

A common agent failure mode is “scrolling” without the UI actually advancing (overlays, nested scrollers, focus issues). Use `AgentRuntime.scrollBy(...)` to deterministically verify scroll _had effect_ via before/after `scrollTop`.

```ts
runtime.beginStep('Scroll the page and verify it moved');
const ok = await runtime.scrollBy(600, {
  verify: true,
  minDeltaPx: 50,
  label: 'scroll_effective',
  required: true,
  timeoutMs: 5_000,
});
if (!ok) {
  throw new Error('Scroll had no effect (likely blocked by overlay or nested scroller).');
}
```

### Explained failure

- JSONL trace events (`Tracer` + `JsonlTraceSink`)
- Optional failure artifact bundles (snapshots, diagnostics, step timelines, frames/clip)
- Deterministic failure semantics: when required assertions can’t be proven, the run fails with artifacts you can replay

### Framework interoperability

- Bring your own LLM and orchestration (LangGraph, custom loops)
- Register explicit LLM-callable tools with `ToolRegistry`

## ToolRegistry (LLM-callable tools)

```ts
import { ToolRegistry, registerDefaultTools } from '@predicatelabs/sdk';

const registry = new ToolRegistry();
registerDefaultTools(registry);
const toolsForLLM = registry.llmTools();
```

## Permissions (avoid Chrome permission bubbles)

Chrome permission prompts are outside the DOM and can be invisible to snapshots. Prefer setting a policy **before navigation**.

```ts
import { PredicateBrowser } from '@predicatelabs/sdk';
import type { PermissionPolicy } from '@predicatelabs/sdk';

const policy: PermissionPolicy = {
  default: 'clear',
  autoGrant: ['geolocation'],
  geolocation: { latitude: 37.77, longitude: -122.41, accuracy: 50 },
  origin: 'https://example.com',
};

// `permissionPolicy` is the last constructor argument; pass `keepAlive` right before it.
const browser = new PredicateBrowser(
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  false,
  policy
);
await browser.start();
```

If your backend supports it, you can also use ToolRegistry permission tools (`grant_permissions`, `clear_permissions`, `set_geolocation`) mid-run.

## Downloads (verification predicate)

```ts
import { downloadCompleted } from '@predicatelabs/sdk';

runtime.assert(downloadCompleted('report.csv'), 'download_ok', true);
```

## Debugging (fast)

- **Manual driver CLI**:

```bash
npx predicate driver --url https://example.com
```

- **Verification + artifacts + debugging with time-travel traces (Predicate Studio demo)**:

<video src="https://github.com/user-attachments/assets/7ffde43b-1074-4d70-bb83-2eb8d0469307" controls muted playsinline></video>

If the video tag doesn’t render in your GitHub README view, use this link: [`sentience-studio-demo.mp4`](https://github.com/user-attachments/assets/7ffde43b-1074-4d70-bb83-2eb8d0469307)

- **Predicate SDK Documentation**: https://predicatelabs.dev/docs
