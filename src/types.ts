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
  fallback_background_color_name?: string | null;
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

  // ML reranking metadata (optional - can be absent or null)
  rerank_index?: number; // 0-based, The rank after ML reranking
  heuristic_index?: number; // 0-based, Where it would have been without ML
  ml_probability?: number; // Confidence score from ONNX model (0.0 - 1.0)
  ml_score?: number; // Raw logit score (optional, for debugging)

  // Diff status for frontend Diff Overlay feature
  diff_status?: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'MOVED';

  // Phase 1: Ordinal support fields for position-based selection
  center_x?: number; // X coordinate of element center (viewport coords)
  center_y?: number; // Y coordinate of element center (viewport coords)
  doc_y?: number; // Y coordinate in document (center_y + scroll_y)
  group_key?: string; // Geometric bucket key for ordinal grouping
  group_index?: number; // Position within group (0-indexed, sorted by doc_y)

  // Hyperlink URL (for link elements)
  href?: string;

  /** Nearby static text (best-effort, usually only for top-ranked elements) */
  nearby_text?: string | null;

  // ===== v1 state-aware assertion fields (optional) =====
  /** Best-effort accessible name/label for controls (distinct from visible text) */
  name?: string | null;
  /** Current value for inputs/textarea/select (PII-aware: may be omitted/redacted) */
  value?: string | null;
  /** Input type (e.g., "text", "email", "password") */
  input_type?: string | null;
  /** Whether value was redacted for privacy */
  value_redacted?: boolean | null;
  /** Normalized boolean states (best-effort) */
  checked?: boolean | null;
  disabled?: boolean | null;
  expanded?: boolean | null;
  /** Raw ARIA state strings (tri-state / debugging) */
  aria_checked?: string | null;
  aria_disabled?: string | null;
  aria_expanded?: string | null;

  // Phase 3.2: Pre-computed dominant group membership (uses fuzzy matching)
  // This field is computed by the gateway so downstream consumers don't need to
  // implement fuzzy matching logic themselves.
  in_dominant_group?: boolean;

  // Layout-derived metadata (internal-only in v0, not exposed in API responses)
  // Per ChatGPT feedback: explicitly optional to prevent users assuming layout is always present
  // Note: This field is marked with skip_serializing_if in Rust, so it won't appear in API responses
  layout?: LayoutHints;
}

export interface GridPosition {
  /** 0-based row index */
  row_index: number;
  /** 0-based column index */
  col_index: number;
  /** ID of the row cluster (for distinguishing separate grids) */
  cluster_id: number;
}

export interface LayoutHints {
  /** Grid ID (maps to GridInfo.grid_id) - distinguishes multiple grids on same page */
  /** Per feedback: Add grid_id to distinguish main feed + sidebar lists + nav links */
  grid_id?: number | null;
  /** Grid position within the grid (row_index, col_index) */
  grid_pos?: GridPosition | null;
  /** Inferred parent index in the original elements slice */
  parent_index?: number | null;
  /** Indices of children elements (optional to avoid payload bloat - container elements can have hundreds) */
  /** Per feedback: Make optional/capped to prevent serializing large arrays */
  children_indices?: number[] | null;
  /** Confidence score for grid position assignment (0.0-1.0) */
  grid_confidence: number;
  /** Confidence score for parent-child containment (0.0-1.0) */
  parent_confidence: number;
  /** Optional: Page region (header/nav/main/aside/footer) - killer signal for ordinality + dominant group */
  /** Per feedback: Optional but very useful for region detection */
  region?: 'header' | 'nav' | 'main' | 'aside' | 'footer' | null;
  /** Confidence score for region assignment (0.0-1.0) */
  region_confidence: number;
}

export interface GridInfo {
  /** The grid ID (matches grid_id in LayoutHints) */
  grid_id: number;
  /** Bounding box: x, y, width, height (document coordinates) */
  bbox: BBox;
  /** Number of rows in the grid */
  row_count: number;
  /** Number of columns in the grid */
  col_count: number;
  /** Total number of items in the grid */
  item_count: number;
  /** Confidence score (currently 1.0) */
  confidence: number;
  /** Optional inferred label (e.g., "product_grid", "search_results", "navigation") - best-effort heuristic, may be null */
  label?: string | null;
  /** Whether this grid is the dominant group (main content area) */
  is_dominant?: boolean;

  // Z-index and modal detection fields (from gateway/sentience-core)
  /** Z-index of this grid (max among elements in this grid) */
  z_index?: number;
  /** Global max z-index across ALL grids (for comparison) */
  z_index_max?: number;
  /** Whether this grid blocks interaction with content behind it */
  blocks_interaction?: boolean;
  /** Ratio of grid area to viewport area (0.0-1.0) */
  viewport_coverage?: number;
}

export interface Snapshot {
  status: 'success' | 'error';
  timestamp?: string;
  url: string;
  viewport?: Viewport;
  elements: Element[];
  screenshot?: string;
  screenshot_format?: 'png' | 'jpeg';
  error?: string;
  requires_license?: boolean;
  // Phase 2: Dominant group key for ordinal selection
  dominant_group_key?: string; // The most common group_key (main content group)
  // Phase 2: Runtime stability/debug info (confidence/reasons/metrics)
  diagnostics?: SnapshotDiagnostics;
  // Modal detection fields (from gateway)
  /** True if a modal/overlay grid was detected */
  modal_detected?: boolean;
  /** Array of GridInfo for detected modal grids */
  modal_grids?: GridInfo[];
}

export interface StepHookContext {
  stepId: string;
  stepIndex: number;
  goal: string;
  attempt: number;
  url?: string | null;
  success?: boolean;
  outcome?: string | null;
  error?: string | null;
}

export interface SnapshotDiagnosticsMetrics {
  ready_state?: string | null;
  quiet_ms?: number | null;
  node_count?: number | null;
  interactive_count?: number | null;
  raw_elements_count?: number | null;
}

export interface CaptchaEvidence {
  text_hits: string[];
  selector_hits: string[];
  iframe_src_hits: string[];
  url_hits: string[];
}

export interface CaptchaDiagnostics {
  detected: boolean;
  provider_hint?: 'recaptcha' | 'hcaptcha' | 'turnstile' | 'arkose' | 'awswaf' | 'unknown' | null;
  confidence: number;
  evidence: CaptchaEvidence;
}

export interface SnapshotDiagnostics {
  confidence?: number | null;
  reasons?: string[];
  metrics?: SnapshotDiagnosticsMetrics;
  captcha?: CaptchaDiagnostics;
  /** P1-01: forward-compatible vision recommendation signal (optional) */
  requires_vision?: boolean | null;
  requires_vision_reason?: string | null;
}

/**
 * Metadata for a stored screenshot.
 * Used by CloudTraceSink to track screenshots before upload.
 */
export interface ScreenshotMetadata {
  sequence: number;
  format: 'png' | 'jpeg';
  sizeBytes: number;
  stepId: string | null;
  filepath: string;
}

export interface ActionResult {
  success: boolean;
  duration_ms: number;
  outcome?: 'navigated' | 'dom_updated' | 'no_change' | 'error';
  url_changed?: boolean;
  snapshot_after?: Snapshot;
  /** Optional: action metadata (e.g., human-like cursor movement path) */
  cursor?: Record<string, any>;
  error?: {
    code: string;
    reason: string;
    recovery_hint?: string;
  };
}

export interface TabInfo {
  tab_id: string;
  url?: string | null;
  title?: string | null;
  is_active: boolean;
}

export interface TabListResult {
  ok: boolean;
  tabs: TabInfo[];
  error?: string | null;
}

export interface TabOperationResult {
  ok: boolean;
  tab?: TabInfo | null;
  error?: string | null;
}

export interface BackendCapabilities {
  tabs: boolean;
  evaluate_js: boolean;
  downloads: boolean;
  filesystem_tools: boolean;
  keyboard: boolean;
}

export interface EvaluateJsRequest {
  code: string;
  max_output_chars?: number;
  truncate?: boolean;
}

export interface EvaluateJsResult {
  ok: boolean;
  value?: any;
  text?: string | null;
  truncated?: boolean;
  error?: string | null;
}

export interface WaitResult {
  found: boolean;
  element?: Element;
  duration_ms: number;
  timeout: boolean;
}

export interface ExtractResult {
  ok: boolean;
  data?: any;
  raw?: string | null;
  error?: string | null;
}

export interface QuerySelectorObject {
  role?: string;
  text?: string;
  name?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  expanded?: boolean;
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
  sameSite?: 'Strict' | 'Lax' | 'None';
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
  status: 'success' | 'error';
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
