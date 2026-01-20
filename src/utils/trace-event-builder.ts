/**
 * TraceEventBuilder - Common trace event building patterns
 *
 * This utility class extracts common trace event building logic to reduce duplication
 * and ensure consistency across different parts of the codebase.
 */

import { TraceEventData, TraceElement } from '../tracing/types';
import { Snapshot, Element } from '../types';
import { AgentActResult } from '../agent';
import { LLMResponse } from '../llm-provider';
import { createHash } from 'crypto';

/**
 * TraceEventBuilder provides static methods for building trace events
 */
export class TraceEventBuilder {
  /**
   * Compute SHA256 hash of text
   *
   * @param text - Text to hash
   * @returns SHA256 hash as hex string
   *
   * @private
   */
  private static computeHash(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }

  /**
   * Build snapshot digest from snapshot data
   *
   * @param snapshot - Snapshot to compute digest for
   * @returns Digest string in format "sha256:..."
   */
  static buildSnapshotDigest(snapshot: Snapshot): string {
    const digestInput = `${snapshot.url}${snapshot.timestamp || ''}`;
    return `sha256:${this.computeHash(digestInput)}`;
  }

  /**
   * Build LLM usage data from LLM response
   *
   * @param llmResponse - LLM response object
   * @returns LLM usage data for trace event
   */
  static buildLLMData(llmResponse: LLMResponse): TraceEventData['llm'] {
    const responseText = llmResponse.content;
    const responseHash = `sha256:${this.computeHash(responseText)}`;

    return {
      model: llmResponse.modelName,
      response_text: responseText,
      response_hash: responseHash,
      usage: {
        prompt_tokens: llmResponse.promptTokens || 0,
        completion_tokens: llmResponse.completionTokens || 0,
        total_tokens: llmResponse.totalTokens || 0,
      },
    };
  }

  /**
   * Build execution data from action result
   *
   * @param result - Agent action result
   * @param snapshot - Snapshot used for the action
   * @returns Execution data for trace event
   */
  static buildExecutionData(result: AgentActResult, snapshot: Snapshot): TraceEventData['exec'] {
    const execData: TraceEventData['exec'] = {
      success: result.success,
      action: result.action || 'unknown',
      outcome:
        result.outcome ||
        (result.success
          ? `Action ${result.action || 'unknown'} executed successfully`
          : `Action ${result.action || 'unknown'} failed`),
      duration_ms: result.durationMs,
    };

    if (result.cursor !== undefined) {
      (execData as any).cursor = result.cursor;
    }

    // Add optional exec fields
    if (result.elementId !== undefined) {
      execData.element_id = result.elementId;

      // Add bounding box if element found
      const element = snapshot.elements.find(e => e.id === result.elementId);
      if (element) {
        execData.bounding_box = {
          x: element.bbox.x,
          y: element.bbox.y,
          width: element.bbox.width,
          height: element.bbox.height,
        };
      }
    }

    if (result.text !== undefined) {
      execData.text = result.text;
    }

    if (result.key !== undefined) {
      execData.key = result.key;
    }

    if (result.error !== undefined) {
      execData.error = result.error;
    }

    return execData;
  }

  /**
   * Build verify data from action result
   *
   * @param result - Agent action result
   * @param snapshot - Snapshot used for the action
   * @returns Verify data for trace event
   */
  static buildVerifyData(result: AgentActResult, snapshot: Snapshot): TraceEventData['verify'] {
    const verifyPassed = result.success && (result.urlChanged || result.action !== 'click');

    const verifySignals: TraceEventData['verify'] = {
      passed: verifyPassed,
      signals: {
        url_changed: result.urlChanged || false,
      },
    };

    if (result.error) {
      verifySignals.signals.error = result.error;
    }

    // Add elements_found array if element was targeted
    if (result.elementId !== undefined) {
      const element = snapshot.elements.find(e => e.id === result.elementId);
      if (element) {
        verifySignals.signals.elements_found = [
          {
            label: `Element ${result.elementId}`,
            bounding_box: {
              x: element.bbox.x,
              y: element.bbox.y,
              width: element.bbox.width,
              height: element.bbox.height,
            },
          },
        ];
      }
    }

    return verifySignals;
  }

  /**
   * Build complete step_end event data
   *
   * @param params - Parameters for building step_end event
   * @returns Complete step_end event data
   */
  static buildStepEndData(params: {
    stepId: string;
    stepIndex: number;
    goal: string;
    attempt: number;
    preUrl: string;
    postUrl: string | null;
    snapshot: Snapshot;
    llmResponse: LLMResponse;
    result: AgentActResult;
  }): TraceEventData {
    const { stepId, stepIndex, goal, attempt, preUrl, postUrl, snapshot, llmResponse, result } =
      params;

    const snapshotDigest = this.buildSnapshotDigest(snapshot);
    const llmData = this.buildLLMData(llmResponse);
    const execData = this.buildExecutionData(result, snapshot);
    const verifyData = this.buildVerifyData(result, snapshot);

    // Build elements data for pre field (include diff_status from snapshot)
    // Normalize importance values to importance_score (0-1 range) per snapshot
    const importanceValues = snapshot.elements.map(el => el.importance);
    const minImportance = importanceValues.length > 0 ? Math.min(...importanceValues) : 0;
    const maxImportance = importanceValues.length > 0 ? Math.max(...importanceValues) : 0;
    const importanceRange = maxImportance - minImportance;

    const preElements: TraceElement[] = snapshot.elements.map(el => {
      // Compute normalized importance_score
      let importanceScore: number;
      if (importanceRange > 0) {
        importanceScore = (el.importance - minImportance) / importanceRange;
      } else {
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

    return {
      v: 1,
      step_id: stepId,
      step_index: stepIndex,
      goal: goal,
      attempt: attempt,
      pre: {
        url: preUrl,
        snapshot_digest: snapshotDigest,
        elements: preElements, // Add elements array with diff_status
      },
      llm: llmData,
      exec: execData,
      post: {
        url: postUrl || undefined,
      },
      verify: verifyData,
    };
  }

  /**
   * Build snapshot event data
   *
   * @param snapshot - Snapshot to build event data for
   * @param goal - Optional goal/task description
   * @returns Snapshot event data
   */
  static buildSnapshotData(snapshot: Snapshot, goal?: string): TraceEventData {
    const data: TraceEventData = {
      url: snapshot.url,
      element_count: snapshot.elements.length,
      timestamp: snapshot.timestamp,
    };

    if (goal) {
      data.goal = goal;
    }

    // Convert elements to trace elements (simplified - just include IDs and basic info)
    if (snapshot.elements.length > 0) {
      data.elements = snapshot.elements.slice(0, 100).map(
        (el: Element): TraceElement => ({
          id: el.id,
          role: el.role,
          text: el.text || undefined,
          importance: el.importance,
          bbox: {
            x: el.bbox.x,
            y: el.bbox.y,
            width: el.bbox.width,
            height: el.bbox.height,
          },
        })
      );
    }

    if (snapshot.screenshot) {
      data.screenshot_base64 = snapshot.screenshot;
      data.screenshot_format = snapshot.screenshot_format || 'png';
    }

    return data;
  }

  /**
   * Build partial step_end event data for failed steps
   *
   * This is used when a step fails after collecting some data (snapshot, LLM response, etc.)
   * but before completing execution. It ensures diff_status and other fields are preserved
   * in traces even when the agent run fails.
   *
   * @param params - Parameters for building partial step_end event
   * @returns Partial step_end event data
   */
  static buildPartialStepEndData(params: {
    stepId: string;
    stepIndex: number;
    goal: string;
    attempt: number;
    preUrl: string | null;
    postUrl: string | null;
    snapshot?: Snapshot | null;
    llmResponse?: LLMResponse | null;
    error: string;
    durationMs: number;
  }): TraceEventData {
    const {
      stepId,
      stepIndex,
      goal,
      attempt,
      preUrl,
      postUrl,
      snapshot,
      llmResponse,
      error,
      durationMs,
    } = params;

    // Build pre data
    const preData: TraceEventData['pre'] = {
      url: preUrl || undefined,
      snapshot_digest: snapshot ? this.buildSnapshotDigest(snapshot) : undefined,
    };

    // Add elements with diff_status if snapshot is available
    if (snapshot && snapshot.elements.length > 0) {
      const importanceValues = snapshot.elements.map(el => el.importance);
      const minImportance = importanceValues.length > 0 ? Math.min(...importanceValues) : 0;
      const maxImportance = importanceValues.length > 0 ? Math.max(...importanceValues) : 0;
      const importanceRange = maxImportance - minImportance;

      preData.elements = snapshot.elements.map(el => {
        let importanceScore: number;
        if (importanceRange > 0) {
          importanceScore = (el.importance - minImportance) / importanceRange;
        } else {
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
    }

    // Build LLM data if available
    let llmData: TraceEventData['llm'] | undefined;
    if (llmResponse) {
      llmData = this.buildLLMData(llmResponse);
    }

    // Build exec data for failure
    const execData: TraceEventData['exec'] = {
      success: false,
      action: 'error',
      outcome: error,
      duration_ms: durationMs,
      error: error,
    };

    // Build verify data for failure
    const verifyData: TraceEventData['verify'] = {
      passed: false,
      signals: {
        error: error,
      },
    };

    return {
      v: 1,
      step_id: stepId,
      step_index: stepIndex,
      goal: goal,
      attempt: attempt,
      pre: preData,
      llm: llmData,
      exec: execData,
      post: {
        url: postUrl || undefined,
      },
      verify: verifyData,
    };
  }
}
