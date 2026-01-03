/**
 * Query engine v1 - semantic selector matching
 */

import { Snapshot, Element, QuerySelector, QuerySelectorObject } from './types';

/**
 * Parse a selector string into a QuerySelectorObject
 * 
 * Supports operators: =, !=, ~, ^=, $=, >, >=, <, <=
 * Supports dot notation: attr.id, css.color, bbox.x
 * 
 * @param selector - Selector string (e.g., "role=button", "text~search", "importance>0.5")
 * @returns Parsed query object
 * 
 * @example
 * ```typescript
 * const query = parseSelector('role=button clickable=true importance>0.5');
 * // Returns: { role: 'button', clickable: true, importance_min: 0.5 }
 * ```
 */
export function parseSelector(selector: string): QuerySelectorObject {
  const query: QuerySelectorObject & {
    role_exclude?: string;
    text_contains?: string;
    text_prefix?: string;
    text_suffix?: string;
    visible?: boolean;
    tag?: string;
    importance?: number;
    importance_min?: number;
    importance_max?: number;
    z_index_min?: number;
    z_index_max?: number;
    in_viewport?: boolean;
    is_occluded?: boolean;
    [key: string]: any; // For bbox.* and attr.*, css.*
  } = {};

  // Match patterns like: key=value, key~'value', key!="value", key>123, key^='prefix', key$='suffix'
  // Updated regex to support: =, !=, ~, ^=, $=, >, >=, <, <=
  // Supports dot notation: attr.id, css.color
  // Note: Handle ^= and $= first (before single char operators) to avoid regex conflicts
  const pattern = /([\w.]+)(\^=|\$=|>=|<=|!=|[=~<>])((?:'[^']+'|"[^"]+"|[^\s]+))/g;
  let match;

  while ((match = pattern.exec(selector)) !== null) {
    const key = match[1];
    const op = match[2];
    let value = match[3];

    // Remove quotes from value
    value = value.replace(/^["']|["']$/g, '');

    // Handle numeric comparisons
    let isNumeric = false;
    let numericValue = 0;
    const parsedNum = parseFloat(value);
    if (!isNaN(parsedNum) && isFinite(parsedNum)) {
      isNumeric = true;
      numericValue = parsedNum;
    }

    if (op === '!=') {
      if (key === 'role') {
        query.role_exclude = value;
      } else if (key === 'clickable') {
        query.clickable = false;
      } else if (key === 'visible') {
        query.visible = false;
      }
    } else if (op === '~') {
      // Substring match (case-insensitive)
      if (key === 'text' || key === 'name') {
        query.text_contains = value;
      }
    } else if (op === '^=') {
      // Prefix match
      if (key === 'text' || key === 'name') {
        query.text_prefix = value;
      }
    } else if (op === '$=') {
      // Suffix match
      if (key === 'text' || key === 'name') {
        query.text_suffix = value;
      }
    } else if (op === '>') {
      // Greater than
      if (isNumeric) {
        if (key === 'importance') {
          query.importance_min = numericValue + 0.0001; // Exclusive
        } else if (key.startsWith('bbox.')) {
          query[`${key}_min`] = numericValue + 0.0001;
        } else if (key === 'z_index') {
          query.z_index_min = numericValue + 0.0001;
        }
      } else if (key.startsWith('attr.') || key.startsWith('css.')) {
        query[`${key}_gt`] = value;
      }
    } else if (op === '>=') {
      // Greater than or equal
      if (isNumeric) {
        if (key === 'importance') {
          query.importance_min = numericValue;
        } else if (key.startsWith('bbox.')) {
          query[`${key}_min`] = numericValue;
        } else if (key === 'z_index') {
          query.z_index_min = numericValue;
        }
      } else if (key.startsWith('attr.') || key.startsWith('css.')) {
        query[`${key}_gte`] = value;
      }
    } else if (op === '<') {
      // Less than
      if (isNumeric) {
        if (key === 'importance') {
          query.importance_max = numericValue - 0.0001; // Exclusive
        } else if (key.startsWith('bbox.')) {
          query[`${key}_max`] = numericValue - 0.0001;
        } else if (key === 'z_index') {
          query.z_index_max = numericValue - 0.0001;
        }
      } else if (key.startsWith('attr.') || key.startsWith('css.')) {
        query[`${key}_lt`] = value;
      }
    } else if (op === '<=') {
      // Less than or equal
      if (isNumeric) {
        if (key === 'importance') {
          query.importance_max = numericValue;
        } else if (key.startsWith('bbox.')) {
          query[`${key}_max`] = numericValue;
        } else if (key === 'z_index') {
          query.z_index_max = numericValue;
        }
      } else if (key.startsWith('attr.') || key.startsWith('css.')) {
        query[`${key}_lte`] = value;
      }
    } else if (op === '=') {
      // Exact match
      if (key === 'role') {
        query.role = value;
      } else if (key === 'clickable') {
        query.clickable = value.toLowerCase() === 'true';
      } else if (key === 'visible') {
        query.visible = value.toLowerCase() === 'true';
      } else if (key === 'tag') {
        query.tag = value;
      } else if (key === 'name' || key === 'text') {
        query.text = value;
      } else if (key === 'importance' && isNumeric) {
        query.importance = numericValue;
      } else if (key.startsWith('attr.')) {
        // Dot notation for attributes: attr.id="submit-btn"
        const attrKey = key.substring(5); // Remove "attr." prefix
        if (!query.attr) {
          query.attr = {};
        }
        (query.attr as any)[attrKey] = value;
      } else if (key.startsWith('css.')) {
        // Dot notation for CSS: css.color="red"
        const cssKey = key.substring(4); // Remove "css." prefix
        if (!query.css) {
          query.css = {};
        }
        (query.css as any)[cssKey] = value;
      }
    }
  }

  return query;
}

function matchElement(
  element: Element,
  query: QuerySelectorObject & {
    role_exclude?: string;
    text_contains?: string;
    text_prefix?: string;
    text_suffix?: string;
    visible?: boolean;
    tag?: string;
    importance?: number;
    importance_min?: number;
    importance_max?: number;
    z_index_min?: number;
    z_index_max?: number;
    in_viewport?: boolean;
    is_occluded?: boolean;
    [key: string]: any; // For bbox.* and attr.*, css.*
  }
): boolean {
  // Role exact match
  if (query.role !== undefined) {
    if (element.role !== query.role) {
      return false;
    }
  }

  // Role exclusion
  if (query.role_exclude !== undefined) {
    if (element.role === query.role_exclude) {
      return false;
    }
  }

  // Clickable
  if (query.clickable !== undefined) {
    if (element.visual_cues.is_clickable !== query.clickable) {
      return false;
    }
  }

  // Visible (using in_viewport and !is_occluded)
  if (query.visible !== undefined) {
    const isVisible = element.in_viewport && !element.is_occluded;
    if (isVisible !== query.visible) {
      return false;
    }
  }

  // Tag (not yet in Element model, but prepare for future)
  if (query.tag !== undefined) {
    // For now, this will always fail since tag is not in Element model
    // This is a placeholder for future implementation
  }

  // Text exact match
  if (query.text !== undefined) {
    if (!element.text || element.text !== query.text) {
      return false;
    }
  }

  // Text contains (case-insensitive)
  if (query.text_contains !== undefined) {
    if (!element.text) {
      return false;
    }
    if (!element.text.toLowerCase().includes(query.text_contains.toLowerCase())) {
      return false;
    }
  }

  // Text prefix match
  if (query.text_prefix !== undefined) {
    if (!element.text) {
      return false;
    }
    if (!element.text.toLowerCase().startsWith(query.text_prefix.toLowerCase())) {
      return false;
    }
  }

  // Text suffix match
  if (query.text_suffix !== undefined) {
    if (!element.text) {
      return false;
    }
    if (!element.text.toLowerCase().endsWith(query.text_suffix.toLowerCase())) {
      return false;
    }
  }

  // Importance filtering
  if (query.importance !== undefined) {
    if (element.importance !== query.importance) {
      return false;
    }
  }
  if (query.importance_min !== undefined) {
    if (element.importance < query.importance_min) {
      return false;
    }
  }
  if (query.importance_max !== undefined) {
    if (element.importance > query.importance_max) {
      return false;
    }
  }

  // BBox filtering (spatial)
  if (query['bbox.x_min'] !== undefined) {
    if (element.bbox.x < query['bbox.x_min']) {
      return false;
    }
  }
  if (query['bbox.x_max'] !== undefined) {
    if (element.bbox.x > query['bbox.x_max']) {
      return false;
    }
  }
  if (query['bbox.y_min'] !== undefined) {
    if (element.bbox.y < query['bbox.y_min']) {
      return false;
    }
  }
  if (query['bbox.y_max'] !== undefined) {
    if (element.bbox.y > query['bbox.y_max']) {
      return false;
    }
  }
  if (query['bbox.width_min'] !== undefined) {
    if (element.bbox.width < query['bbox.width_min']) {
      return false;
    }
  }
  if (query['bbox.width_max'] !== undefined) {
    if (element.bbox.width > query['bbox.width_max']) {
      return false;
    }
  }
  if (query['bbox.height_min'] !== undefined) {
    if (element.bbox.height < query['bbox.height_min']) {
      return false;
    }
  }
  if (query['bbox.height_max'] !== undefined) {
    if (element.bbox.height > query['bbox.height_max']) {
      return false;
    }
  }

  // Z-index filtering
  if (query.z_index_min !== undefined) {
    if (element.z_index < query.z_index_min) {
      return false;
    }
  }
  if (query.z_index_max !== undefined) {
    if (element.z_index > query.z_index_max) {
      return false;
    }
  }

  // In viewport filtering
  if (query.in_viewport !== undefined) {
    if (element.in_viewport !== query.in_viewport) {
      return false;
    }
  }

  // Occlusion filtering
  if (query.is_occluded !== undefined) {
    if (element.is_occluded !== query.is_occluded) {
      return false;
    }
  }

  // Attribute filtering (dot notation: attr.id="submit-btn")
  if (query.attr !== undefined) {
    // This requires DOM access, which is not available in the Element model
    // This is a placeholder for future implementation when we add DOM access
  }

  // CSS property filtering (dot notation: css.color="red")
  if (query.css !== undefined) {
    // This requires DOM access, which is not available in the Element model
    // This is a placeholder for future implementation when we add DOM access
  }

  return true;
}

/**
 * Query elements from a snapshot using a selector
 * 
 * @param snapshot - Snapshot containing elements to query
 * @param selector - Query selector (string DSL or object)
 * @returns Array of matching elements, sorted by importance (descending)
 * 
 * @example
 * ```typescript
 * const snap = await snapshot(browser);
 * 
 * // String selector
 * const buttons = query(snap, 'role=button');
 * const clickable = query(snap, 'clickable=true');
 * 
 * // Object selector
 * const results = query(snap, {
 *   role: 'button',
 *   importance_min: 0.5
 * });
 * ```
 */
export function query(snapshot: Snapshot, selector: QuerySelector): Element[] {
  // Parse selector if string
  const queryObj = typeof selector === 'string' ? parseSelector(selector) : (selector as any);

  // Filter elements
  const matches = snapshot.elements.filter((el) => matchElement(el, queryObj));

  // Sort by importance (descending)
  matches.sort((a, b) => b.importance - a.importance);

  return matches;
}

/**
 * Find the first element matching a selector
 * 
 * @param snapshot - Snapshot containing elements to search
 * @param selector - Query selector (string DSL or object)
 * @returns First matching element, or null if none found
 * 
 * @example
 * ```typescript
 * const snap = await snapshot(browser);
 * 
 * // Find first button
 * const button = find(snap, 'role=button');
 * if (button) {
 *   await click(browser, button.id);
 * }
 * 
 * // Find element by text
 * const searchBox = find(snap, 'text~search');
 * ```
 */
export function find(snapshot: Snapshot, selector: QuerySelector): Element | null {
  const results = query(snapshot, selector);
  return results[0] || null;
}

