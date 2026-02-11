# Changelog

All notable changes to `@predicatelabs/sdk` will be documented in this file.

## Unreleased

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
