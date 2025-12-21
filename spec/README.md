# Sentience API Specification

This directory contains the **single source of truth** for the API contract between the Chrome extension and SDKs.

## Files

- **`snapshot.schema.json`** - JSON Schema for snapshot response validation
- **`SNAPSHOT_V1.md`** - Human-readable snapshot API contract
- **`sdk-types.md`** - SDK-level type definitions (ActionResult, WaitResult, TraceStep)

## Purpose

These specifications ensure:
1. **Consistency**: Both Python and TypeScript SDKs implement the same contract
2. **Validation**: SDKs can validate extension responses
3. **Type Safety**: Strong typing in both languages
4. **Documentation**: Clear reference for developers

## Usage

### For SDK Developers

1. **Read** `SNAPSHOT_V1.md` for human-readable contract
2. **Use** `snapshot.schema.json` for JSON Schema validation
3. **Reference** `sdk-types.md` for SDK-level types

### For Extension Developers

1. **Ensure** extension output matches `snapshot.schema.json`
2. **Update** schema when adding new fields
3. **Version** schema for breaking changes

## Versioning

- **v1.0.0**: Initial stable version (Day 1)
- Future versions: Increment major version for breaking changes
- SDKs should validate version and handle compatibility

## Validation

Both SDKs should validate extension responses:

**Python**:
```python
import jsonschema
from spec.snapshot.schema import load_schema

schema = load_schema()
jsonschema.validate(snapshot_data, schema)
```

**TypeScript**:
```typescript
import Ajv from 'ajv';
import schema from './spec/snapshot.schema.json';

const ajv = new Ajv();
const validate = ajv.compile(schema);
validate(snapshot_data);
```

## Testing

- Validate against real extension output
- Test with edge cases (empty pages, many elements, errors)
- Verify type coercion and defaults

---

**Last Updated**: Day 1 Implementation  
**Status**: ✅ Stable

