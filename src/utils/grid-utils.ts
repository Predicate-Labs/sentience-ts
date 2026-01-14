/**
 * Utility functions for working with grid layout data in snapshots.
 */

import type { Snapshot, GridInfo, Element } from '../types';

/**
 * Get grid coordinates (bounding boxes) for detected grids.
 *
 * Groups elements by grid_id and computes the overall bounding box,
 * row/column counts, and item count for each grid.
 *
 * @param snapshot - The snapshot containing elements with layout data
 * @param gridId - Optional grid ID to filter by. If undefined, returns all grids.
 * @returns Array of GridInfo objects, one per detected grid, sorted by grid_id.
 *          Each GridInfo contains:
 *          - grid_id: The grid identifier
 *          - bbox: Bounding box (x, y, width, height) in document coordinates
 *          - row_count: Number of rows in the grid
 *          - col_count: Number of columns in the grid
 *          - item_count: Total number of items in the grid
 *          - confidence: Confidence score (currently 1.0)
 *          - label: Optional inferred label (e.g., "product_grid", "search_results", "navigation")
 *            Note: Label inference is best-effort and may not always be accurate
 *
 * @example
 * ```typescript
 * const snapshot = await browser.snapshot();
 * // Get all grids
 * const allGrids = getGridBounds(snapshot);
 * // Get specific grid
 * const mainGrid = getGridBounds(snapshot, 0);
 * if (mainGrid.length > 0) {
 *   console.log(`Grid 0: ${mainGrid[0].item_count} items at (${mainGrid[0].bbox.x}, ${mainGrid[0].bbox.y})`);
 * }
 * ```
 */
export function getGridBounds(snapshot: Snapshot, gridId?: number): GridInfo[] {
  // Group elements by grid_id
  const gridElements: Map<number, Element[]> = new Map();

  for (const elem of snapshot.elements) {
    if (elem.layout?.grid_id != null) {
      const gid = elem.layout.grid_id;
      if (!gridElements.has(gid)) {
        gridElements.set(gid, []);
      }
      gridElements.get(gid)!.push(elem);
    }
  }

  // Filter by gridId if specified
  if (gridId !== undefined) {
    if (!gridElements.has(gridId)) {
      return [];
    }
    const filtered = new Map([[gridId, gridElements.get(gridId)!]]);
    gridElements.clear();
    filtered.forEach((v, k) => gridElements.set(k, v));
  }

  const gridInfos: GridInfo[] = [];
  const gridDominantCounts = new Map<number, { dominant: number; total: number }>();

  // Sort by grid_id for consistent output
  const sortedGridIds = Array.from(gridElements.keys()).sort((a, b) => a - b);

  // First pass: compute all grid infos and count dominant group elements
  for (const gid of sortedGridIds) {
    const elementsInGrid = gridElements.get(gid)!;
    if (elementsInGrid.length === 0) {
      continue;
    }

    // Count dominant group elements in this grid
    const dominantCount = elementsInGrid.filter(e => e.in_dominant_group === true).length;
    gridDominantCounts.set(gid, {
      dominant: dominantCount,
      total: elementsInGrid.length,
    });

    // Compute bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Count rows and columns
    const rowIndices = new Set<number>();
    const colIndices = new Set<number>();

    for (const elem of elementsInGrid) {
      const bbox = elem.bbox;
      minX = Math.min(minX, bbox.x);
      minY = Math.min(minY, bbox.y);
      maxX = Math.max(maxX, bbox.x + bbox.width);
      maxY = Math.max(maxY, bbox.y + bbox.height);

      if (elem.layout?.grid_pos) {
        rowIndices.add(elem.layout.grid_pos.row_index);
        colIndices.add(elem.layout.grid_pos.col_index);
      }
    }

    // Infer grid label from element patterns (best-effort heuristic)
    const label = inferGridLabel(elementsInGrid);

    gridInfos.push({
      grid_id: gid,
      bbox: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
      row_count: rowIndices.size,
      col_count: colIndices.size,
      item_count: elementsInGrid.length,
      confidence: 1.0,
      label: label,
      is_dominant: false, // Will be set below
    });
  }

  // Second pass: identify dominant grid
  // The grid with the highest count (or highest percentage >= 50%) of dominant group elements
  if (gridDominantCounts.size > 0) {
    // Find grid with highest absolute count
    let maxDominantCount = 0;
    for (const { dominant } of gridDominantCounts.values()) {
      maxDominantCount = Math.max(maxDominantCount, dominant);
    }

    if (maxDominantCount > 0) {
      // Find grid(s) with highest count
      const dominantGrids: number[] = [];
      for (const [gid, counts] of gridDominantCounts.entries()) {
        if (counts.dominant === maxDominantCount) {
          dominantGrids.push(gid);
        }
      }

      // If multiple grids tie, prefer the one with highest percentage
      dominantGrids.sort((a, b) => {
        const aCounts = gridDominantCounts.get(a)!;
        const bCounts = gridDominantCounts.get(b)!;
        const aPct = aCounts.total > 0 ? aCounts.dominant / aCounts.total : 0;
        const bPct = bCounts.total > 0 ? bCounts.dominant / bCounts.total : 0;
        return bPct - aPct;
      });

      // Mark the dominant grid
      const dominantGid = dominantGrids[0];
      const counts = gridDominantCounts.get(dominantGid)!;
      // Only mark as dominant if it has >= 50% dominant group elements or >= 3 elements
      if (counts.dominant >= 3 || (counts.total > 0 && counts.dominant / counts.total >= 0.5)) {
        const gridInfo = gridInfos.find(g => g.grid_id === dominantGid);
        if (gridInfo) {
          gridInfo.is_dominant = true;
        }
      }
    }
  }

  return gridInfos;
}

/**
 * Infer grid label from element patterns using text fingerprinting (best-effort heuristic).
 *
 * Uses patterns similar to dominant_group.rs content filtering logic, inverted to detect
 * semantic grid types. Analyzes first 5 items as a "bag of features".
 *
 * Returns null if label cannot be reliably determined.
 * This is a simple heuristic and may not always be accurate.
 */
function inferGridLabel(elements: Element[]): string | null {
  if (elements.length === 0) {
    return null;
  }

  // Sample first 5 items for fingerprinting (as suggested in feedback)
  const sampleElements = elements.slice(0, 5);
  const elementTexts = sampleElements.map(e => (e.text || '').trim()).filter(t => t.length > 0);

  if (elementTexts.length === 0) {
    return null;
  }

  // Collect text patterns
  const allText = elementTexts.map(t => t.toLowerCase()).join(' ');
  const hrefs = sampleElements.filter(e => e.href).map(e => (e.href || '').toLowerCase());

  // =========================================================================
  // 1. PRODUCT GRID: Currency symbols, action verbs, ratings
  // =========================================================================
  // Currency patterns: $, €, £, or price patterns like "19.99", "$50", "€30"
  const currencyPattern = /[$€£¥]\s*\d+|\d+\.\d{2}/.test(allText);
  const productActionVerbs = [
    'add to cart',
    'buy now',
    'shop now',
    'purchase',
    'out of stock',
    'in stock',
  ];
  const hasProductActions = productActionVerbs.some(verb => allText.includes(verb));

  // Ratings pattern: "4.5 stars", "(120 reviews)", "4.5/5"
  const ratingPattern = /\d+\.?\d*\s*(stars?|reviews?|\/5|\/10)/i.test(allText);

  // Product URL patterns
  const productUrlPatterns = ['/product/', '/item/', '/dp/', '/p/', '/products/'];
  const hasProductUrls = hrefs.some(href =>
    productUrlPatterns.some(pattern => href.includes(pattern))
  );

  if (
    (currencyPattern || hasProductActions || ratingPattern) &&
    (hasProductUrls ||
      elementTexts.filter(t => /[$€£¥]\s*\d+|\d+\.\d{2}/.test(t.toLowerCase())).length >= 2)
  ) {
    return 'product_grid';
  }

  // =========================================================================
  // 2. ARTICLE/NEWS FEED: Timestamps, bylines, reading time
  // =========================================================================
  // Timestamp patterns (reusing logic from dominant_group.rs)
  // "2 hours ago", "3 days ago", "5 minutes ago", "1 second ago", "2 ago"
  const timestampPatterns = [
    /\d+\s+(hour|day|minute|second)s?\s+ago/i,
    /\d+\s+ago/i, // Short form: "2 ago"
    /\d{1,2}\s+(hour|day|minute|second)\s+ago/i, // Singular
  ];
  const hasTimestamps = timestampPatterns.some(pattern => pattern.test(allText));

  // Date patterns: "Aug 21, 2024", "2024-01-13", "Jan 15"
  const datePatterns = [
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i,
    /\d{4}-\d{2}-\d{2}/,
    /\d{1,2}\/\d{1,2}\/\d{4}/,
  ];
  const hasDates = datePatterns.some(pattern => pattern.test(allText));

  // Bylines: "By [Name]", "Author:", "Written by"
  const bylinePatterns = ['by ', 'author:', 'written by', 'posted by'];
  const hasBylines = bylinePatterns.some(pattern => allText.includes(pattern));

  // Reading time: "5 min read", "10 min", "read more"
  const readingTimePattern = /\d+\s*(min|minute)s?\s*(read)?/i.test(allText);

  if (hasTimestamps || (hasDates && hasBylines) || readingTimePattern) {
    return 'article_feed';
  }

  // =========================================================================
  // 3. SEARCH RESULTS: Snippets, metadata, ellipses
  // =========================================================================
  const searchKeywords = ['result', 'search', 'found', 'showing', 'results 1-', 'sponsored'];
  const hasSearchMetadata = searchKeywords.some(keyword => allText.includes(keyword));

  // Snippet indicators: ellipses, "match found", truncated text
  const hasEllipses =
    allText.includes('...') || elementTexts.some(t => t.length > 100 && t.includes('...'));

  // Check if many elements are links (typical for search results)
  const linkCount = sampleElements.filter(e => e.role === 'link' || e.href).length;
  const isMostlyLinks = linkCount >= sampleElements.length * 0.7; // 70%+ are links

  if ((hasSearchMetadata || hasEllipses) && isMostlyLinks) {
    return 'search_results';
  }

  // =========================================================================
  // 4. NAVIGATION: Short length, homogeneity, common nav terms
  // =========================================================================
  // Calculate average text length and variance
  const textLengths = elementTexts.map(t => t.length);
  if (textLengths.length > 0) {
    const avgLength = textLengths.reduce((sum, len) => sum + len, 0) / textLengths.length;
    // Low variance = homogeneous (typical of navigation)
    const variance =
      textLengths.length > 1
        ? textLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) /
          textLengths.length
        : 0;

    const navKeywords = [
      'home',
      'about',
      'contact',
      'menu',
      'login',
      'sign in',
      'profile',
      'settings',
    ];
    const hasNavKeywords = navKeywords.some(keyword => allText.includes(keyword));

    // Navigation: short average length (< 15 chars) AND low variance OR nav keywords
    if (avgLength < 15 && (variance < 20 || hasNavKeywords)) {
      // Also check if all are links
      if (sampleElements.every(e => e.role === 'link' || e.href)) {
        return 'navigation';
      }
    }
  }

  // =========================================================================
  // 5. BUTTON GRID: All buttons
  // =========================================================================
  if (sampleElements.every(e => e.role === 'button')) {
    return 'button_grid';
  }

  // =========================================================================
  // 6. LINK LIST: Mostly links but not navigation
  // =========================================================================
  const linkListCount = sampleElements.filter(e => e.role === 'link' || e.href).length;
  if (linkListCount >= sampleElements.length * 0.8) {
    // 80%+ are links
    return 'link_list';
  }

  // Unknown/unclear
  return null;
}
