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
  let runEndStatus: string | null = null; // Track status from run_end event
  let agentName: string | null = null; // Extract from run_start event
  let lineCount = 0; // Track total line count

  const stepsById: Map<string, StepIndex> = new Map();
  const stepOrder: string[] = [];

  // Stream through file, tracking byte offsets and line numbers
  const fileBuffer = fs.readFileSync(tracePath);
  let byteOffset = 0;
  const lines = fileBuffer.toString('utf-8').split('\n');

  let lineNumber = 0; // Track line number for each event
  for (const line of lines) {
    lineNumber++;
    lineCount++;
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

    // Extract agent_name from run_start event
    if (eventType === 'run_start') {
      agentName = data.agent || null;
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
          'failure',  // Default to failure (will be updated by step_end event)
          ts,
          ts,
          byteOffset,
          byteOffset + lineBytes,
          lineNumber,  // Track line number
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
    step.line_number = lineNumber;  // Update line number on each event
    step.counters.events++;

    // Handle specific event types
    if (eventType === 'step_start') {
      step.goal = data.goal;
      step.url_before = data.pre_url;
    } else if (eventType === 'snapshot' || eventType === 'snapshot_taken') {
      // Handle both "snapshot" (current) and "snapshot_taken" (schema) for backward compatibility
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
    } else if (eventType === 'action' || eventType === 'action_executed') {
      // Handle both "action" (current) and "action_executed" (schema) for backward compatibility
      step.action = new ActionInfo(
        data.type,
        data.target_element_id,
        computeActionDigest(data),
        data.success !== false
      );
      step.counters.actions++;
    } else if (eventType === 'llm_response' || eventType === 'llm_called') {
      // Handle both "llm_response" (current) and "llm_called" (schema) for backward compatibility
      step.counters.llm_calls++;
    } else if (eventType === 'error') {
      step.status = 'failure';
    } else if (eventType === 'step_end') {
      // Determine status from step_end event data
      // Frontend expects: success, failure, or partial
      // Logic: success = exec.success && verify.passed
      //        partial = exec.success && !verify.passed
      //        failure = !exec.success
      const execData = data.exec || {};
      const verifyData = data.verify || {};
      
      const execSuccess = execData.success === true;
      const verifyPassed = verifyData.passed === true;
      
      if (execSuccess && verifyPassed) {
        step.status = 'success';
      } else if (execSuccess && !verifyPassed) {
        step.status = 'partial';
      } else if (!execSuccess) {
        step.status = 'failure';
      } else {
        // Fallback: if step_end exists but no exec/verify data, default to failure
        step.status = 'failure';
      }
    } else if (eventType === 'run_end') {
      // Extract status from run_end event (will be used for summary)
      runEndStatus = data.status;
      // Validate status value
      if (runEndStatus && !['success', 'failure', 'partial', 'unknown'].includes(runEndStatus)) {
        runEndStatus = null;
      }
    }

    byteOffset += lineBytes;
  }

  // Use run_end status if available, otherwise infer from step statuses
  let summaryStatus: 'success' | 'failure' | 'partial' | 'unknown' | null = null;
  if (runEndStatus) {
    summaryStatus = runEndStatus as 'success' | 'failure' | 'partial' | 'unknown';
  } else {
    const stepStatuses = Array.from(stepsById.values()).map(s => s.status);
    if (stepStatuses.length > 0) {
      // Infer overall status from step statuses
      if (stepStatuses.every(s => s === 'success')) {
        summaryStatus = 'success';
      } else if (stepStatuses.some(s => s === 'failure')) {
        // If any failure and no successes, it's failure; otherwise partial
        if (stepStatuses.some(s => s === 'success')) {
          summaryStatus = 'partial';
        } else {
          summaryStatus = 'failure';
        }
      } else if (stepStatuses.some(s => s === 'partial')) {
        summaryStatus = 'partial';
      } else {
        summaryStatus = 'failure';  // Default to failure instead of unknown
      }
    } else {
      summaryStatus = 'failure';  // Default to failure instead of unknown
    }
  }
  
  // Calculate duration
  let durationMs: number | null = null;
  if (firstTs && lastTs) {
    const start = new Date(firstTs);
    const end = new Date(lastTs);
    durationMs = end.getTime() - start.getTime();
  }

  // Aggregate counters
  const snapshotCount = Array.from(stepsById.values())
    .reduce((sum, s) => sum + s.counters.snapshots, 0);
  const actionCount = Array.from(stepsById.values())
    .reduce((sum, s) => sum + s.counters.actions, 0);
  const counters = {
    snapshot_count: snapshotCount,
    action_count: actionCount,
    error_count: errorCount,
  };
  
  // Build summary
  const summary = new TraceSummary(
    firstTs,
    lastTs,
    eventCount,
    stepsById.size,
    errorCount,
    finalUrl,
    summaryStatus,
    agentName,
    durationMs,
    counters
  );

  // Build steps list in order
  const stepsList = stepOrder.map((sid) => stepsById.get(sid)!);

  // Build trace file info
  const traceFile = new TraceFileInfo(
    tracePath,
    fs.statSync(tracePath).size,
    computeFileSha256(tracePath),
    lineCount
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
 * @param tracePath - Path to trace JSONL file
 * @param indexPath - Optional custom path for index file
 * @param frontendFormat - If true, write in frontend-compatible format (default: false)
 */
export function writeTraceIndex(
  tracePath: string,
  indexPath?: string,
  frontendFormat: boolean = false
): string {
  if (!indexPath) {
    indexPath = tracePath.replace(/\.jsonl$/, '.index.json');
  }

  const index = buildTraceIndex(tracePath);

  if (frontendFormat) {
    fs.writeFileSync(indexPath, JSON.stringify(index.toSentienceStudioJSON(), null, 2));
  } else {
    fs.writeFileSync(indexPath, JSON.stringify(index.toJSON(), null, 2));
  }

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
