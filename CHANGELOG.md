# Changelog

All notable changes to `@predicatelabs/sdk` will be documented in this file.

## Unreleased

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
