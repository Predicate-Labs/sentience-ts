/**
 * SnapshotProcessor - Helper for processing snapshots in agent
 *
 * Extracted from SentienceAgent to reduce complexity
 */

import { Snapshot } from '../types';
import { SnapshotDiff } from '../snapshot-diff';
import { ElementFilter } from './element-filter';

export interface ProcessedSnapshot {
  original: Snapshot;
  withDiff: Snapshot;
  filtered: Snapshot;
}

/**
 * SnapshotProcessor provides static methods for processing snapshots
 */
export class SnapshotProcessor {
  /**
   * Process a snapshot: compute diff status, filter elements
   *
   * @param snap - Original snapshot
   * @param previousSnapshot - Previous snapshot for diff computation
   * @param goal - Goal/task description for filtering
   * @param snapshotLimit - Maximum elements to include
   * @returns Processed snapshot with diff status and filtered elements
   */
  static process(
    snap: Snapshot,
    previousSnapshot: Snapshot | undefined,
    goal: string,
    snapshotLimit: number
  ): ProcessedSnapshot {
    // Compute diff_status by comparing with previous snapshot
    const elementsWithDiff = SnapshotDiff.computeDiffStatus(snap, previousSnapshot);

    // Create snapshot with diff_status populated
    const snapWithDiff: Snapshot = {
      ...snap,
      elements: elementsWithDiff,
    };

    // Apply element filtering based on goal using ElementFilter
    const filteredElements = ElementFilter.filterByGoal(snapWithDiff, goal, snapshotLimit);

    // Create filtered snapshot
    const filteredSnap: Snapshot = {
      ...snapWithDiff,
      elements: filteredElements,
    };

    return {
      original: snap,
      withDiff: snapWithDiff,
      filtered: filteredSnap,
    };
  }
}
