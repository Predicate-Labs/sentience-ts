/**
 * SnapshotEventBuilder - Helper for building snapshot trace events
 *
 * Extracted from SentienceAgent to reduce complexity
 */

import { Snapshot } from '../types';
import { TraceEventData, TraceElement } from '../tracing/types';

/**
 * SnapshotEventBuilder provides static methods for building snapshot trace events
 */
export class SnapshotEventBuilder {
  /**
   * Build snapshot trace event data from snapshot
   *
   * @param snap - Snapshot to build event from
   * @param stepId - Optional step ID
   * @returns Trace event data for snapshot
   */
  static buildSnapshotEventData(snap: Snapshot, stepId?: string): TraceEventData {
    // Normalize importance values to importance_score (0-1 range) per snapshot
    const importanceValues = snap.elements.map(el => el.importance);
    const minImportance = importanceValues.length > 0 ? Math.min(...importanceValues) : 0;
    const maxImportance = importanceValues.length > 0 ? Math.max(...importanceValues) : 0;
    const importanceRange = maxImportance - minImportance;

    // Include ALL elements with full data for DOM tree display
    const elements: TraceElement[] = snap.elements.map(el => {
      // Compute normalized importance_score
      let importanceScore: number;
      if (importanceRange > 0) {
        importanceScore = (el.importance - minImportance) / importanceRange;
      } else {
        // If all elements have same importance, set to 0.5
        importanceScore = 0.5;
      }

      return {
        id: el.id,
        role: el.role,
        text: el.text,
        bbox: el.bbox,
        importance: el.importance,
        importance_score: importanceScore,
        visual_cues: el.visual_cues,
        in_viewport: el.in_viewport,
        is_occluded: el.is_occluded,
        z_index: el.z_index,
        rerank_index: el.rerank_index,
        heuristic_index: el.heuristic_index,
        ml_probability: el.ml_probability,
        ml_score: el.ml_score,
        diff_status: el.diff_status,
      };
    });

    const snapshotData: TraceEventData = {
      url: snap.url,
      element_count: snap.elements.length,
      timestamp: snap.timestamp,
      elements,
    };

    if (stepId) {
      snapshotData.step_id = stepId;
    }

    // Always include screenshot in trace event for studio viewer compatibility
    if (snap.screenshot) {
      snapshotData.screenshot_base64 = this.extractScreenshotBase64(snap.screenshot);
      if (snap.screenshot_format) {
        snapshotData.screenshot_format = snap.screenshot_format;
      }
    }

    return snapshotData;
  }

  /**
   * Extract base64 string from screenshot data URL
   *
   * @param screenshot - Screenshot data URL or base64 string
   * @returns Base64 string without data URL prefix
   */
  private static extractScreenshotBase64(screenshot: string): string {
    if (screenshot.startsWith('data:image')) {
      // Format: "data:image/jpeg;base64,{base64_string}"
      return screenshot.includes(',') ? screenshot.split(',', 2)[1] : screenshot;
    }
    return screenshot;
  }
}
