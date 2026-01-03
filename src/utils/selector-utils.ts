/**
 * Utility functions for working with QuerySelector
 */

import { QuerySelector } from '../types';

/**
 * Convert a QuerySelector to a string representation for error messages
 *
 * @param selector - QuerySelector (string or object)
 * @returns String representation
 */
export function selectorToString(selector: QuerySelector): string {
  if (typeof selector === 'string') {
    return selector;
  }

  // Convert QuerySelectorObject to string representation
  const obj = selector;
  const parts: string[] = [];

  if (obj.role) parts.push(`role=${obj.role}`);
  if (obj.text) parts.push(`text="${obj.text}"`);
  if (obj.name) parts.push(`name="${obj.name}"`);
  if (obj.clickable !== undefined) parts.push(`clickable=${obj.clickable}`);
  if (obj.isPrimary !== undefined) parts.push(`isPrimary=${obj.isPrimary}`);

  return parts.length > 0 ? parts.join(' ') : JSON.stringify(obj);
}
