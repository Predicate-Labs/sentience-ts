# Changelog

All notable changes to `@predicate/sdk` will be documented in this file.

## Unreleased

### 2026-02-15

#### PredicateBrowserAgent (snapshot-first, verification-first)

`PredicateBrowserAgent` is a new high-level agent wrapper that gives you a **browser-use-like** `step()` / `run()` surface, but keeps Predicate’s core philosophy:

- **Snapshot-first perception** (structured DOM snapshot is the default)
- **Verification-first control plane** (you can gate progress with deterministic checks)
- Optional **vision fallback** (bounded) when snapshots aren’t sufficient

It’s built on top of `AgentRuntime` + `RuntimeAgent`.

##### Quickstart (single step)

```ts
import {
  AgentRuntime,
  PredicateBrowserAgent,
  type RuntimeStep,
  LocalLLMProvider, // or OpenAIProvider / AnthropicProvider / DeepInfraProvider
} from '@predicate/sdk';

const runtime = new AgentRuntime(browserLike, page, tracer);
const llm = new LocalLLMProvider({ model: 'qwen2.5:7b', baseUrl: 'http://localhost:11434/v1' });

const agent = new PredicateBrowserAgent({
  runtime,
  executor: llm,
  config: {
    // Token control: include last N step summaries in the prompt (0 disables history).
    historyLastN: 2,
  },
});

const ok = await agent.step({
  taskGoal: 'Find pricing and verify checkout button exists',
  step: { goal: 'Open pricing page' } satisfies RuntimeStep,
});
```

##### Customize the compact prompt (advanced)

```ts
const agent = new PredicateBrowserAgent({
  runtime,
  executor: llm,
  config: {
    compactPromptBuilder: (_taskGoal, _stepGoal, domContext, _snap, historySummary) => ({
      systemPrompt:
        'You are a web automation agent. Return ONLY one action: CLICK(id) | TYPE(id,"text") | PRESS("key") | FINISH()',
      userPrompt: `RECENT:\n${historySummary}\n\nELEMENTS:\n${domContext}\n\nReturn the single best action:`,
    }),
  },
});
```

##### CAPTCHA handling (interface-only; no solver shipped)

If you set `captcha.policy="callback"`, you must provide a handler. The SDK does **not** include a public CAPTCHA solver.

```ts
import { HumanHandoffSolver } from '@predicate/sdk';

const agent = new PredicateBrowserAgent({
  runtime,
  executor: llm,
  config: {
    captcha: {
      policy: 'callback',
      // Manual solve in the live session; SDK waits until it clears:
      handler: HumanHandoffSolver({ timeoutMs: 10 * 60_000, pollMs: 1_000 }),
    },
  },
});
```

#### RuntimeAgent: structured prompt override hooks

`RuntimeAgent` now supports optional hooks used by `PredicateBrowserAgent`:

- `structuredPromptBuilder(...)`
- `domContextPostprocessor(...)`
- `historySummaryProvider(...)`

#### PredicateBrowserAgent: opt-in token usage accounting (best-effort)

If you want to measure token spend, you can enable best-effort accounting (depends on provider reporting token counts):

```ts
const agent = new PredicateBrowserAgent({
  runtime,
  executor: llm,
  config: {
    tokenUsageEnabled: true,
  },
});

const usage = agent.getTokenUsage();
agent.resetTokenUsage();
```

#### RuntimeAgent: actOnce without step lifecycle (orchestrators)

`RuntimeAgent` now exposes `actOnce(...)` helpers that execute exactly one action **without** calling `runtime.beginStep()` / `runtime.emitStepEnd()`. This is intended for external orchestrators (e.g. WebBench) that already own step lifecycle and just want the SDK’s snapshot-first propose+execute block.

- `await agent.actOnce(...) -> string`
- `await agent.actOnceWithSnapshot(...) -> { action, snap }`
- `await agent.actOnceResult(...) -> { action, snap, usedVision }`

### 2026-02-13

#### Expanded deterministic verifications (adaptive resnapshotting)

You can now make `.eventually()` verifications more reliable on long / virtualized pages by **automatically increasing the snapshot `limit` across retries** (so later attempts see more elements).

- **AgentRuntime assertions**: `AssertionHandle.eventually({ snapshotLimitGrowth: ... })`
- **Expect-style verifications**: `expect(...).eventually({ snapshotLimitGrowth: ... })`
- **Commit**: `5f011b878c9a1dcb8c5976b365f0f80b7abe135c`

**Example**

```ts
await dbg.check(exists("text~'Checkout'"), 'checkout_visible', true).eventually({
  timeoutMs: 12_000,
  snapshotLimitGrowth: {
    startLimit: 60,
    step: 40,
    maxLimit: 220,
    applyOn: 'only_on_fail', // default; or "all"
  },
});
```

### Deprecated

- Soft-deprecated legacy `Sentience*` class names in favor of `Predicate*` names:
  - `SentienceBrowser` -> `PredicateBrowser`
  - `SentienceAgent` -> `PredicateAgent`
  - `SentienceVisualAgent` -> `PredicateVisualAgent`
  - `SentienceDebugger` -> `PredicateDebugger`
  - `backends.SentienceContext` -> `backends.PredicateContext`
- Legacy names remain supported as runtime aliases for compatibility during a transition window of **1-2 releases**.

### Added

- Runtime alias exports for `Predicate*` counterparts to preserve backwards compatibility while enabling rebrand migration.

### Fixed

- Hardened `search()` in `src/actions.ts` for CI reliability by making `page.waitForLoadState('networkidle')` best-effort with a bounded timeout, preventing flaky timeouts on pages with long-lived background requests.
