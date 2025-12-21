# Sentience Snapshot API Contract v1

**Version**: 1.0.0  
**Last Updated**: [Current Date]  
**Status**: Stable

This document defines the **single source of truth** for the snapshot data structure returned by `window.sentience.snapshot()`. Both Python and TypeScript SDKs must implement this contract exactly.

## Overview

The snapshot API returns a structured representation of the current page state, including:
- All interactive elements with semantic roles
- Element positions (bounding boxes)
- Importance scores (AI-optimized ranking)
- Visual cues (primary actions, colors, clickability)
- Optional screenshot

## Response Structure

### Top-Level Object

```typescript
{
  status: "success" | "error",
  timestamp?: string,           // ISO 8601
  url: string,
  viewport?: { width: number, height: number },
  elements: Element[],
  screenshot?: string,          // Base64 data URL
  screenshot_format?: "png" | "jpeg",
  error?: string,              // If status is "error"
  requires_license?: boolean   // If license required
}
```

### Element Object

```typescript
{
  id: number,                  // REQUIRED: Unique identifier (registry index)
  role: string,                // REQUIRED: Semantic role
  text: string | null,         // Text content, aria-label, or placeholder
  importance: number,          // REQUIRED: Importance score (-300 to ~1800)
  bbox: BBox,                  // REQUIRED: Bounding box
  visual_cues: VisualCues,     // REQUIRED: Visual analysis
  in_viewport: boolean,        // Is element visible in viewport
  is_occluded: boolean,        // Is element covered by overlay
  z_index: number              // CSS z-index (0 if auto)
}
```

### BBox (Bounding Box)

```typescript
{
  x: number,       // Left edge in pixels
  y: number,       // Top edge in pixels
  width: number,   // Width in pixels
  height: number   // Height in pixels
}
```

### VisualCues

```typescript
{
  is_primary: boolean,                    // Visually prominent primary action
  background_color_name: string | null,   // Named color from palette
  is_clickable: boolean                   // Has pointer cursor or actionable role
}
```

## Field Details

### `id` (required)
- **Type**: `integer`
- **Description**: Unique element identifier, corresponds to index in `window.sentience_registry`
- **Usage**: Used for actions like `click(id)`
- **Stability**: May change between page loads (not persistent)

### `role` (required)
- **Type**: `string`
- **Values**: `"button"`, `"link"`, `"textbox"`, `"searchbox"`, `"checkbox"`, `"radio"`, `"combobox"`, `"image"`, `"generic"`
- **Description**: Semantic role inferred from HTML tag, ARIA attributes, and context
- **Usage**: Primary filter for query engine

### `text` (optional)
- **Type**: `string | null`
- **Description**: Text content extracted from element:
  - `aria-label` if present
  - `value` or `placeholder` for inputs
  - `alt` for images
  - `innerText` for other elements (truncated to 100 chars)
- **Usage**: Text matching in query engine

### `importance` (required)
- **Type**: `integer`
- **Range**: -300 to ~1800
- **Description**: AI-optimized importance score calculated from:
  - Role priority (inputs: 1000, buttons: 500, links: 100)
  - Area score (larger elements score higher, capped at 200)
  - Visual prominence (+200 for primary actions)
  - Viewport/occlusion penalties (-500 off-screen, -800 occluded)
- **Usage**: Ranking and filtering elements

### `bbox` (required)
- **Type**: `BBox` object
- **Description**: Element position and size in viewport coordinates
- **Coordinates**: Relative to viewport (0,0) at top-left
- **Usage**: Spatial queries, visual grounding, click coordinates

### `visual_cues` (required)
- **Type**: `VisualCues` object
- **Description**: Visual analysis results
- **Fields**:
  - `is_primary`: True if element is visually prominent primary action
  - `background_color_name`: Nearest named color (32-color palette) or null
  - `is_clickable`: True if element has pointer cursor or actionable role

### `in_viewport` (optional)
- **Type**: `boolean`
- **Description**: True if element is visible in current viewport
- **Default**: `true` (if not present, assume visible)

### `is_occluded` (optional)
- **Type**: `boolean`
- **Description**: True if element is covered by another element
- **Default**: `false` (if not present, assume not occluded)

### `z_index` (optional)
- **Type**: `integer`
- **Description**: CSS z-index value (0 if "auto" or not set)
- **Default**: `0`

## Element Sorting

Elements in the `elements` array are sorted by:
1. **Primary sort**: `importance` (descending) - most important first
2. **Secondary sort**: `bbox.y` (ascending) - top-to-bottom reading order (if limit applied)

## Example Response

```json
{
  "status": "success",
  "timestamp": "2025-01-20T10:30:00Z",
  "url": "https://example.com",
  "viewport": {
    "width": 1280,
    "height": 800
  },
  "elements": [
    {
      "id": 42,
      "role": "button",
      "text": "Sign In",
      "importance": 850,
      "bbox": {
        "x": 100,
        "y": 200,
        "width": 120,
        "height": 40
      },
      "visual_cues": {
        "is_primary": true,
        "background_color_name": "blue",
        "is_clickable": true
      },
      "in_viewport": true,
      "is_occluded": false,
      "z_index": 0
    }
  ]
}
```

## Error Response

```json
{
  "status": "error",
  "error": "Headless mode requires a valid license key...",
  "requires_license": true
}
```

## SDK Implementation Requirements

Both Python and TypeScript SDKs must:

1. **Validate** snapshot response against this schema
2. **Parse** all required fields correctly
3. **Handle** optional fields gracefully (defaults)
4. **Type-check** all fields (Pydantic for Python, TypeScript types for TS)
5. **Preserve** field names exactly (no renaming)

## Versioning

- **v1.0.0**: Initial stable version
- Future versions will increment major version for breaking changes
- SDKs should validate version and handle compatibility

## Related Documents

- `snapshot.schema.json` - JSON Schema validation
- Extension implementation: `sentience-chrome/injected_api.js`
- WASM implementation: `sentience-chrome/src/lib.rs`

