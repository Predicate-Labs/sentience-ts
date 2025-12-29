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

// ========== Text Search Types (findTextRect) ==========

/**
 * Rectangle coordinates for text occurrence.
 * Includes both absolute (page) and viewport-relative coordinates.
 */
export interface TextRect {
  /** Absolute X coordinate (page coordinate with scroll offset) */
  x: number;
  /** Absolute Y coordinate (page coordinate with scroll offset) */
  y: number;
  /** Rectangle width in pixels */
  width: number;
  /** Rectangle height in pixels */
  height: number;
  /** Absolute left position (same as x) */
  left: number;
  /** Absolute top position (same as y) */
  top: number;
  /** Absolute right position (x + width) */
  right: number;
  /** Absolute bottom position (y + height) */
  bottom: number;
}

/**
 * Viewport-relative rectangle coordinates (without scroll offset)
 */
export interface ViewportRect {
  /** Viewport-relative X coordinate */
  x: number;
  /** Viewport-relative Y coordinate */
  y: number;
  /** Rectangle width in pixels */
  width: number;
  /** Rectangle height in pixels */
  height: number;
}

/**
 * Context text surrounding a match
 */
export interface TextContext {
  /** Text before the match (up to 20 chars) */
  before: string;
  /** Text after the match (up to 20 chars) */
  after: string;
}

/**
 * A single text match with its rectangle and context
 */
export interface TextMatch {
  /** The matched text */
  text: string;
  /** Absolute rectangle coordinates (with scroll offset) */
  rect: TextRect;
  /** Viewport-relative rectangle (without scroll offset) */
  viewport_rect: ViewportRect;
  /** Surrounding text context */
  context: TextContext;
  /** Whether the match is currently visible in viewport */
  in_viewport: boolean;
}

/**
 * Result of findTextRect operation.
 * Returns all occurrences of text on the page with their exact pixel coordinates.
 */
export interface TextRectSearchResult {
  status: "success" | "error";
  /** The search text that was queried */
  query?: string;
  /** Whether search was case-sensitive */
  case_sensitive?: boolean;
  /** Whether whole-word matching was used */
  whole_word?: boolean;
  /** Number of matches found */
  matches?: number;
  /** List of text matches with coordinates */
  results?: TextMatch[];
  /** Current viewport dimensions */
  viewport?: Viewport & {
    scroll_x: number;
    scroll_y: number;
  };
  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Options for findTextRect operation
 */
export interface FindTextRectOptions {
  /** Text to search for (required) */
  text: string;
  /** Container element to search within (default: document.body) */
  containerElement?: Element;
  /** Case-sensitive search (default: false) */
  caseSensitive?: boolean;
  /** Match whole words only (default: false) */
  wholeWord?: boolean;
  /** Maximum number of results to return (default: 10) */
  maxResults?: number;
}



