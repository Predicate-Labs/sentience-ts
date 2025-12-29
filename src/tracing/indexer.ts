/**
 * Trace indexing for fast timeline rendering and step drill-down.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import {
  TraceIndex,
  StepIndex,
  TraceSummary,
  TraceFileInfo,
  SnapshotInfo,
  ActionInfo,
  StepCounters,
  StepStatus,
} from './index-schema';

/**
 * Normalize text for digest: trim, collapse whitespace, lowercase, cap length
 */
function normalizeText(text: string | undefined, maxLen: number = 80): string {
  if (!text) return '';

  // Trim and collapse whitespace
  let normalized = text.split(/\s+/).join(' ').trim();

  // Lowercase
  normalized = normalized.toLowerCase();

  // Cap length
  if (normalized.length > maxLen) {
    normalized = normalized.substring(0, maxLen);
  }

  return normalized;
}

/**
 * Round bbox coordinates to reduce noise (default: 2px precision)
 */
function roundBBox(bbox: any, precision: number = 2): any {
  return {
    x: Math.round((bbox.x || 0) / precision) * precision,
    y: Math.round((bbox.y || 0) / precision) * precision,
    width: Math.round((bbox.width || 0) / precision) * precision,
    height: Math.round((bbox.height || 0) / precision) * precision,
  };
}

/**
 * Compute stable digest of snapshot for diffing
 */
function computeSnapshotDigest(snapshotData: any): string {
  const url = snapshotData.url || '';
  const viewport = snapshotData.viewport || {};
  const elements = snapshotData.elements || [];

  // Canonicalize elements
  const canonicalElements = elements.map((elem: any) => ({
    id: elem.id,
    role: elem.role || '',
    text_norm: normalizeText(elem.text),
    bbox: roundBBox(elem.bbox || { x: 0, y: 0, width: 0, height: 0 }),
    is_primary: elem.is_primary || false,
    is_clickable: elem.is_clickable || false,
  }));

  // Sort by element id for determinism
  canonicalElements.sort((a: { id?: number }, b: { id?: number }) => (a.id || 0) - (b.id || 0));

  // Build canonical object
  const canonical = {
    url,
    viewport: {
      width: viewport.width || 0,
      height: viewport.height || 0,
    },
    elements: canonicalElements,
  };

  // Hash
  const canonicalJson = JSON.stringify(canonical);
  const hash = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Compute digest of action args for privacy + determinism
 */
function computeActionDigest(actionData: any): string {
  const actionType = actionData.type || '';
  const targetId = actionData.target_element_id;

  const canonical: any = {
    type: actionType,
    target_element_id: targetId,
  };

  // Type-specific canonicalization
  if (actionType === 'TYPE') {
    const text = actionData.text || '';
    canonical.text_len = text.length;
    canonical.text_sha256 = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  } else if (actionType === 'PRESS') {
    canonical.key = actionData.key || '';
  }
  // CLICK has no extra args

  // Hash
  const canonicalJson = JSON.stringify(canonical);
  const hash = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Compute SHA256 hash of entire file
 */
function computeFileSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Build trace index from JSONL file in single streaming pass
 */
export function buildTraceIndex(tracePath: string): TraceIndex {
  if (!fs.existsSync(tracePath)) {
    throw new Error(`Trace file not found: ${tracePath}`);
  }

  // Extract run_id from filename
  const runId = path.basename(tracePath, '.jsonl');

  // Initialize summary
  let firstTs = '';
  let lastTs = '';
  let eventCount = 0;
  let errorCount = 0;
  let finalUrl: string | null = null;

  const stepsById: Map<string, StepIndex> = new Map();
  const stepOrder: string[] = [];

  // Stream through file, tracking byte offsets
  const fileBuffer = fs.readFileSync(tracePath);
  let byteOffset = 0;
  const lines = fileBuffer.toString('utf-8').split('\n');

  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line + '\n', 'utf-8');

    if (!line.trim()) {
      byteOffset += lineBytes;
      continue;
    }

    let event: any;
    try {
      event = JSON.parse(line);
    } catch (e) {
      // Skip malformed lines
      byteOffset += lineBytes;
      continue;
    }

    // Extract event metadata
    const eventType = event.type || '';
    const ts = event.ts || event.timestamp || '';
    const stepId = event.step_id || 'step-0';
    const data = event.data || {};

    // Update summary
    eventCount++;
    if (!firstTs) {
      firstTs = ts;
    }
    lastTs = ts;

    if (eventType === 'error') {
      errorCount++;
    }

    // Initialize step if first time seeing this step_id
    if (!stepsById.has(stepId)) {
      stepOrder.push(stepId);
      stepsById.set(
        stepId,
        new StepIndex(
          stepOrder.length,
          stepId,
          null,
          'partial',
          ts,
          ts,
          byteOffset,
          byteOffset + lineBytes,
          null,
          null,
          new SnapshotInfo(),
          new SnapshotInfo(),
          new ActionInfo(),
          new StepCounters()
        )
      );
    }

    const step = stepsById.get(stepId)!;

    // Update step metadata
    step.ts_end = ts;
    step.offset_end = byteOffset + lineBytes;
    step.counters.events++;

    // Handle specific event types
    if (eventType === 'step_start') {
      step.goal = data.goal;
      step.url_before = data.pre_url;
    } else if (eventType === 'snapshot') {
      const snapshotId = data.snapshot_id;
      const url = data.url;
      const digest = computeSnapshotDigest(data);

      // First snapshot = before, last snapshot = after
      if (!step.snapshot_before.snapshot_id) {
        step.snapshot_before = new SnapshotInfo(snapshotId, digest, url);
        step.url_before = step.url_before || url;
      }

      step.snapshot_after = new SnapshotInfo(snapshotId, digest, url);
      step.url_after = url;
      step.counters.snapshots++;
      finalUrl = url;
    } else if (eventType === 'action') {
      step.action = new ActionInfo(
        data.type,
        data.target_element_id,
        computeActionDigest(data),
        data.success !== false
      );
      step.counters.actions++;
    } else if (eventType === 'llm_response') {
      step.counters.llm_calls++;
    } else if (eventType === 'error') {
      step.status = 'error';
    } else if (eventType === 'step_end') {
      if (step.status !== 'error') {
        step.status = 'ok';
      }
    }

    byteOffset += lineBytes;
  }

  // Build summary
  const summary = new TraceSummary(
    firstTs,
    lastTs,
    eventCount,
    stepsById.size,
    errorCount,
    finalUrl
  );

  // Build steps list in order
  const stepsList = stepOrder.map((sid) => stepsById.get(sid)!);

  // Build trace file info
  const traceFile = new TraceFileInfo(
    tracePath,
    fs.statSync(tracePath).size,
    computeFileSha256(tracePath)
  );

  // Build final index
  const index = new TraceIndex(
    1,
    runId,
    new Date().toISOString(),
    traceFile,
    summary,
    stepsList
  );

  return index;
}

/**
 * Build index and write to file
 */
export function writeTraceIndex(tracePath: string, indexPath?: string): string {
  if (!indexPath) {
    indexPath = tracePath.replace(/\.jsonl$/, '.index.json');
  }

  const index = buildTraceIndex(tracePath);

  fs.writeFileSync(indexPath, JSON.stringify(index.toJSON(), null, 2));

  return indexPath;
}

/**
 * Read events for a specific step using byte offsets from index
 */
export function readStepEvents(
  tracePath: string,
  offsetStart: number,
  offsetEnd: number
): any[] {
  const events: any[] = [];

  const fd = fs.openSync(tracePath, 'r');
  const bytesToRead = offsetEnd - offsetStart;
  const buffer = Buffer.alloc(bytesToRead);

  fs.readSync(fd, buffer, 0, bytesToRead, offsetStart);
  fs.closeSync(fd);

  // Parse lines
  const chunk = buffer.toString('utf-8');
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const event = JSON.parse(line);
      events.push(event);
    } catch (e) {
      // Skip malformed lines
    }
  }

  return events;
}
