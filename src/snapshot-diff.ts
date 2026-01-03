/**
 * Snapshot comparison utilities for diff_status detection.
 * Implements change detection logic for the Diff Overlay feature.
 */

import { Element, Snapshot } from './types';

export class SnapshotDiff {
  /**
   * Check if element's bounding box has changed significantly.
   * @param el1 - First element
   * @param el2 - Second element
   * @param threshold - Position change threshold in pixels (default: 5.0)
   * @returns True if position or size changed beyond threshold
   */
  private static hasBboxChanged(el1: Element, el2: Element, threshold: number = 5.0): boolean {
    return (
      Math.abs(el1.bbox.x - el2.bbox.x) > threshold ||
      Math.abs(el1.bbox.y - el2.bbox.y) > threshold ||
      Math.abs(el1.bbox.width - el2.bbox.width) > threshold ||
      Math.abs(el1.bbox.height - el2.bbox.height) > threshold
    );
  }

  /**
   * Check if element's content has changed.
   * @param el1 - First element
   * @param el2 - Second element
   * @returns True if text, role, or visual properties changed
   */
  private static hasContentChanged(el1: Element, el2: Element): boolean {
    // Compare text content
    if (el1.text !== el2.text) {
      return true;
    }

    // Compare role
    if (el1.role !== el2.role) {
      return true;
    }

    // Compare visual cues
    if (el1.visual_cues.is_primary !== el2.visual_cues.is_primary) {
      return true;
    }
    if (el1.visual_cues.is_clickable !== el2.visual_cues.is_clickable) {
      return true;
    }

    return false;
  }

  /**
   * Compare current snapshot with previous and set diff_status on elements.
   * @param current - Current snapshot
   * @param previous - Previous snapshot (undefined if this is the first snapshot)
   * @returns List of elements with diff_status set (includes REMOVED elements from previous)
   */
  static computeDiffStatus(current: Snapshot, previous: Snapshot | undefined): Element[] {
    // If no previous snapshot, all current elements are ADDED
    if (!previous) {
      return current.elements.map(el => ({
        ...el,
        diff_status: "ADDED" as const
      }));
    }

    // Build lookup maps by element ID
    const currentById = new Map(current.elements.map(el => [el.id, el]));
    const previousById = new Map(previous.elements.map(el => [el.id, el]));

    const currentIds = new Set(currentById.keys());
    const previousIds = new Set(previousById.keys());

    const result: Element[] = [];

    // Process current elements
    for (const el of current.elements) {
      if (!previousIds.has(el.id)) {
        // Element is new - mark as ADDED
        result.push({
          ...el,
          diff_status: "ADDED"
        });
      } else {
        // Element existed before - check for changes
        const prevEl = previousById.get(el.id)!;

        const bboxChanged = SnapshotDiff.hasBboxChanged(el, prevEl);
        const contentChanged = SnapshotDiff.hasContentChanged(el, prevEl);

        if (bboxChanged && contentChanged) {
          // Both position and content changed - mark as MODIFIED
          result.push({
            ...el,
            diff_status: "MODIFIED"
          });
        } else if (bboxChanged) {
          // Only position changed - mark as MOVED
          result.push({
            ...el,
            diff_status: "MOVED"
          });
        } else if (contentChanged) {
          // Only content changed - mark as MODIFIED
          result.push({
            ...el,
            diff_status: "MODIFIED"
          });
        } else {
          // No change - don't set diff_status (frontend expects undefined)
          result.push({
            ...el,
            diff_status: undefined
          });
        }
      }
    }

    // Process removed elements (existed in previous but not in current)
    for (const prevId of previousIds) {
      if (!currentIds.has(prevId)) {
        const prevEl = previousById.get(prevId)!;
        result.push({
          ...prevEl,
          diff_status: "REMOVED"
        });
      }
    }

    return result;
  }
}
