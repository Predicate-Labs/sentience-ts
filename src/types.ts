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

// ========== Storage State Types (Auth Injection) ==========

/**
 * Cookie definition for storage state injection.
 * Matches Playwright's cookie format for storage_state.
 */
export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number; // Unix timestamp
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

/**
 * LocalStorage item for a specific origin.
 * Playwright stores localStorage as an array of {name, value} objects.
 */
export interface LocalStorageItem {
  name: string;
  value: string;
}

/**
 * Storage state for a specific origin (localStorage).
 * Represents localStorage data for a single domain.
 */
export interface OriginStorage {
  origin: string;
  localStorage: LocalStorageItem[];
}

/**
 * Complete browser storage state (cookies + localStorage).
 * This is the format used by Playwright's storage_state() method.
 * Can be saved to/loaded from JSON files for session injection.
 */
export interface StorageState {
  cookies: Cookie[];
  origins: OriginStorage[];
}



