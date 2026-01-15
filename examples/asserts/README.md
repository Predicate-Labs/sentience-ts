# Assertions examples (v1 + v2)

These examples focus on **AgentRuntime assertions**:

- **v1**: deterministic, state-aware assertions (enabled/checked/value/expanded) + failure intelligence
- **v2**: `.check(...).eventually(...)` retry loops with `minConfidence` gating + snapshot exhaustion

Run examples:

```bash
cd sdk-ts
npm run build
node dist/examples/asserts/state-assertions.js
node dist/examples/asserts/eventually-min-confidence.js
```

