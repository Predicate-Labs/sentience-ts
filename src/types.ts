/**
 * TypeScript type definitions - matches spec/sdk-types.md
 */

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface VisualCues {
  is_primary: boolean;
  background_color_name: string | null;
  is_clickable: boolean;
}

export interface Element {
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

export interface Snapshot {
  status: "success" | "error";
  timestamp?: string;
  url: string;
  viewport?: Viewport;
  elements: Element[];
  screenshot?: string;
  screenshot_format?: "png" | "jpeg";
  error?: string;
  requires_license?: boolean;
}

export interface ActionResult {
  success: boolean;
  duration_ms: number;
  outcome?: "navigated" | "dom_updated" | "no_change" | "error";
  url_changed?: boolean;
  snapshot_after?: Snapshot;
  error?: {
    code: string;
    reason: string;
    recovery_hint?: string;
  };
}

export interface WaitResult {
  found: boolean;
  element?: Element;
  duration_ms: number;
  timeout: boolean;
}

export interface QuerySelectorObject {
  role?: string;
  text?: string;
  name?: string;
  clickable?: boolean;
  isPrimary?: boolean;
  importance?: number | { min?: number; max?: number };
}

export type QuerySelector = string | QuerySelectorObject;



