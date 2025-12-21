# SDK-Level Type Definitions

**Purpose**: Define SDK-level types that extend the snapshot contract with action results, wait results, and trace steps.

## Core Types

### Snapshot
```typescript
interface Snapshot {
  status: "success" | "error";
  timestamp?: string;
  url: string;
  viewport?: { width: number; height: number };
  elements: Element[];
  screenshot?: string;
  screenshot_format?: "png" | "jpeg";
  error?: string;
  requires_license?: boolean;
}
```

### Element
```typescript
interface Element {
  id: number;
  role: string;
  text: string | null;
  importance: number;
  bbox: BBox;
  visual_cues: VisualCues;
  in_viewport: boolean;
  is_occluded: boolean;
  z_index: number;
}
```

### BBox
```typescript
interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### Viewport
```typescript
interface Viewport {
  width: number;
  height: number;
}
```

### VisualCues
```typescript
interface VisualCues {
  is_primary: boolean;
  background_color_name: string | null;
  is_clickable: boolean;
}
```

## Action Types

### ActionResult
```typescript
interface ActionResult {
  success: boolean;
  duration_ms: number;
  outcome?: "navigated" | "dom_updated" | "no_change" | "error";
  url_changed?: boolean;
  snapshot_after?: Snapshot;  // Optional in Week 1, required in Week 2
  error?: {
    code: string;
    reason: string;
    recovery_hint?: string;
  };
}
```

**Fields**:
- `success`: True if action completed successfully
- `duration_ms`: Time taken in milliseconds
- `outcome`: What happened after action (navigation, DOM update, no change, error)
- `url_changed`: True if URL changed (for navigation detection)
- `snapshot_after`: Post-action snapshot (optional in MVP, required for recorder)
- `error`: Error details if action failed

## Wait & Assert Types

### WaitResult
```typescript
interface WaitResult {
  found: boolean;
  element?: Element;
  duration_ms: number;
  timeout: boolean;
}
```

**Fields**:
- `found`: True if element was found
- `element`: Found element (if found)
- `duration_ms`: Time taken to find (or timeout)
- `timeout`: True if wait timed out

### AssertionError
```typescript
class AssertionError extends Error {
  predicate: string | object;
  timeout: number;
  element?: Element;
}
```

## Trace Types (for Recorder)

### Trace
```typescript
interface Trace {
  version: string;           // "1.0.0"
  created_at: string;        // ISO 8601
  start_url: string;
  steps: TraceStep[];
}
```

### TraceStep
```typescript
interface TraceStep {
  ts: number;                // Timestamp (milliseconds since start)
  type: "navigation" | "click" | "type" | "press" | "wait" | "assert";
  selector?: string;         // Semantic selector (inferred)
  element_id?: number;       // Element ID
  text?: string;             // For type actions (may be masked)
  key?: string;             // For press actions
  url?: string;             // For navigation
  snapshot?: Snapshot;       // Optional: snapshot at this step
}
```

**Step Types**:
- `navigation`: `goto(url)`
- `click`: Click on element
- `type`: Type text into element
- `press`: Press keyboard key
- `wait`: Wait for element/predicate
- `assert`: Assertion check

## Query Types

### QuerySelector
```typescript
// String DSL
type QuerySelectorString = string;  // e.g., "role=button text~'Sign in'"

// Structured object
interface QuerySelectorObject {
  role?: string;
  text?: string | RegExp;
  name?: string | RegExp;
  clickable?: boolean;
  isPrimary?: boolean;
  importance?: number | { min?: number; max?: number };
}

type QuerySelector = QuerySelectorString | QuerySelectorObject;
```

## Python Equivalents (Pydantic)

```python
from pydantic import BaseModel
from typing import Optional, List, Union
from datetime import datetime

class BBox(BaseModel):
    x: float
    y: float
    width: float
    height: float

class Viewport(BaseModel):
    width: float
    height: float

class VisualCues(BaseModel):
    is_primary: bool
    background_color_name: Optional[str]
    is_clickable: bool

class Element(BaseModel):
    id: int
    role: str
    text: Optional[str]
    importance: int
    bbox: BBox
    visual_cues: VisualCues
    in_viewport: bool = True
    is_occluded: bool = False
    z_index: int = 0

class Snapshot(BaseModel):
    status: str  # "success" | "error"
    timestamp: Optional[str] = None
    url: str
    viewport: Optional[Viewport] = None
    elements: List[Element]
    screenshot: Optional[str] = None
    screenshot_format: Optional[str] = None
    error: Optional[str] = None
    requires_license: Optional[bool] = None

class ActionResult(BaseModel):
    success: bool
    duration_ms: int
    outcome: Optional[str] = None
    url_changed: Optional[bool] = None
    snapshot_after: Optional[Snapshot] = None
    error: Optional[dict] = None

class WaitResult(BaseModel):
    found: bool
    element: Optional[Element] = None
    duration_ms: int
    timeout: bool

class TraceStep(BaseModel):
    ts: int
    type: str
    selector: Optional[str] = None
    element_id: Optional[int] = None
    text: Optional[str] = None
    key: Optional[str] = None
    url: Optional[str] = None
    snapshot: Optional[Snapshot] = None

class Trace(BaseModel):
    version: str
    created_at: str
    start_url: str
    steps: List[TraceStep]
```

## Type Validation Rules

1. **Required Fields**: Must be present and non-null
2. **Optional Fields**: May be omitted or null
3. **Type Coercion**: Numbers should be validated (no NaN, Infinity)
4. **Enum Values**: String enums must match exactly
5. **Array Bounds**: Elements array should be validated (not empty for success status)

## Compatibility Notes

- SDKs should handle missing optional fields gracefully
- Default values should match extension behavior
- Type coercion should be minimal (prefer validation errors)

