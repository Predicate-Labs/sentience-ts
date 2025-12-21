/**
 * Query engine v1 - semantic selector matching
 */

import { Snapshot, Element, QuerySelector, QuerySelectorObject } from './types';

export function parseSelector(selector: string): QuerySelectorObject {
  const query: QuerySelectorObject = {};

  // Match patterns like: key=value, key~'value', key!="value"
  // This regex matches: key, operator (=, ~, !=), and value (quoted or unquoted)
  const pattern = /(\w+)([=~!]+)((?:'[^']+'|"[^"]+"|[^\s]+))/g;
  let match;

  while ((match = pattern.exec(selector)) !== null) {
    const key = match[1];
    const op = match[2];
    let value = match[3];

    // Remove quotes from value
    value = value.replace(/^["']|["']$/g, '');

    if (op === '!=') {
      if (key === 'role') {
        (query as any).role_exclude = value;
      } else if (key === 'clickable') {
        query.clickable = false;
      }
    } else if (op === '~') {
      if (key === 'text' || key === 'name') {
        (query as any).text_contains = value;
      }
    } else if (op === '=') {
      if (key === 'role') {
        query.role = value;
      } else if (key === 'clickable') {
        query.clickable = value.toLowerCase() === 'true';
      } else if (key === 'name' || key === 'text') {
        query.text = value;
      }
    }
  }

  return query;
}

function matchElement(element: Element, query: QuerySelectorObject & { role_exclude?: string; text_contains?: string }): boolean {
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

  return true;
}

export function query(snapshot: Snapshot, selector: QuerySelector): Element[] {
  // Parse selector if string
  const queryObj = typeof selector === 'string' ? parseSelector(selector) : selector;

  // Filter elements
  const matches = snapshot.elements.filter((el) => matchElement(el, queryObj));

  // Sort by importance (descending)
  matches.sort((a, b) => b.importance - a.importance);

  return matches;
}

export function find(snapshot: Snapshot, selector: QuerySelector): Element | null {
  const results = query(snapshot, selector);
  return results[0] || null;
}

