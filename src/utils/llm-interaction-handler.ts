/**
 * LLMInteractionHandler - Handles LLM queries and response parsing
 *
 * Extracted from SentienceAgent to improve separation of concerns
 */

import { LLMProvider, LLMResponse } from '../llm-provider';
import { Snapshot } from '../types';
import { LLMResponseBuilder } from './llm-response-builder';

/**
 * LLMInteractionHandler handles all LLM-related operations
 */
export class LLMInteractionHandler {
  constructor(
    private llm: LLMProvider,
    private verbose: boolean = true
  ) {}

  /**
   * Build context string from snapshot for LLM prompt
   *
   * @param snap - Snapshot containing elements
   * @param goal - Goal/task description
   * @returns Formatted context string
   */
  buildContext(snap: Snapshot, _goal: string): string {
    const lines: string[] = [];

    for (const el of snap.elements) {
      // Extract visual cues
      const cues: string[] = [];
      if (el.visual_cues.is_primary) cues.push('PRIMARY');
      if (el.visual_cues.is_clickable) cues.push('CLICKABLE');
      if (el.visual_cues.background_color_name) {
        cues.push(`color:${el.visual_cues.background_color_name}`);
      }

      // Format element line
      const cuesStr = cues.length > 0 ? ` {${cues.join(',')}}` : '';
      const text = el.text || '';
      const textPreview = text.length > 50 ? text.substring(0, 50) + '...' : text;

      lines.push(
        `[${el.id}] <${el.role}> "${textPreview}"${cuesStr} ` +
          `@ (${Math.floor(el.bbox.x)},${Math.floor(el.bbox.y)}) (Imp:${el.importance})`
      );
    }

    return lines.join('\n');
  }

  /**
   * Query LLM with standardized prompt template
   *
   * @param domContext - DOM context string (formatted elements)
   * @param goal - Goal/task description
   * @returns LLM response
   */
  async queryLLM(domContext: string, goal: string): Promise<LLMResponse> {
    const systemPrompt = `You are an AI web automation agent.
Your job is to analyze the current page state and decide the next action to take.

Available actions:
- CLICK(id) - Click element with ID
- TYPE(id, "text") - Type text into element with ID
- PRESS("key") - Press keyboard key (e.g., "Enter", "Escape", "Tab")
- FINISH() - Task is complete

Format your response as a single action command on one line.
Example: CLICK(42) or TYPE(5, "search query") or PRESS("Enter")`;

    const userPrompt = `Goal: ${goal}

Current page elements:
${domContext}

What action should I take next? Respond with only the action command (e.g., CLICK(42)).`;

    try {
      const response = await this.llm.generate(systemPrompt, userPrompt, {
        temperature: 0.0,
      });

      // Validate response
      if (!LLMResponseBuilder.validate(response)) {
        throw new Error('Invalid LLM response format');
      }

      return response;
    } catch (error) {
      if (this.verbose) {
        console.error('LLM query failed:', error);
      }
      // Return error response
      return LLMResponseBuilder.createErrorResponse(
        error instanceof Error ? error : new Error(String(error)),
        this.llm.modelName
      );
    }
  }

  /**
   * Extract action string from LLM response
   *
   * @param response - LLM response
   * @returns Action string (e.g., "CLICK(42)")
   */
  extractAction(response: LLMResponse): string {
    return response.content.trim();
  }
}
