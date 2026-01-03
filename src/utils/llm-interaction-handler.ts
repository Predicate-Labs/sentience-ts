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
   * Format: [ID] <role> "text" {cues} @ (x,y) size:WxH importance:score [status]
   *
   * @param snap - Snapshot containing elements
   * @param goal - Goal/task description (unused but kept for API consistency)
   * @returns Formatted context string
   */
  buildContext(snap: Snapshot, _goal: string): string {
    const lines: string[] = [];

    for (const el of snap.elements) {
      // Skip REMOVED elements - they're not actionable and shouldn't be in LLM context
      if (el.diff_status === 'REMOVED') {
        continue;
      }
      // Extract visual cues
      const cues: string[] = [];
      if (el.visual_cues.is_primary) cues.push('PRIMARY');
      if (el.visual_cues.is_clickable) cues.push('CLICKABLE');
      if (el.visual_cues.background_color_name) {
        cues.push(`color:${el.visual_cues.background_color_name}`);
      }

      // Format element line with improved readability
      const cuesStr = cues.length > 0 ? ` {${cues.join(',')}}` : '';

      // Better text handling - show truncation indicator
      let textPreview = '';
      if (el.text) {
        if (el.text.length > 50) {
          textPreview = `"${el.text.substring(0, 50)}..."`;
        } else {
          textPreview = `"${el.text}"`;
        }
      }

      // Build position and size info
      const x = Math.floor(el.bbox.x);
      const y = Math.floor(el.bbox.y);
      const width = Math.floor(el.bbox.width);
      const height = Math.floor(el.bbox.height);
      const positionStr = `@ (${x},${y})`;
      const sizeStr = `size:${width}x${height}`;

      // Build status indicators (only include if relevant)
      const statusParts: string[] = [];
      if (!el.in_viewport) {
        statusParts.push('not_in_viewport');
      }
      if (el.is_occluded) {
        statusParts.push('occluded');
      }
      if (el.diff_status) {
        statusParts.push(`diff:${el.diff_status}`);
      }
      const statusStr = statusParts.length > 0 ? ` [${statusParts.join(',')}]` : '';

      // Format: [ID] <role> "text" {cues} @ (x,y) size:WxH importance:score [status]
      lines.push(
        `[${el.id}] <${el.role}> ${textPreview}${cuesStr} ` +
          `${positionStr} ${sizeStr} importance:${el.importance}${statusStr}`
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

GOAL: ${goal}

VISIBLE ELEMENTS (sorted by importance):
${domContext}

VISUAL CUES EXPLAINED:
After the text, you may see visual cues in curly braces like {CLICKABLE} or {PRIMARY,CLICKABLE,color:white}:
- PRIMARY: Main call-to-action element on the page
- CLICKABLE: Element is clickable/interactive
- color:X: Background color name (e.g., color:white, color:blue)
Multiple cues are comma-separated inside the braces: {CLICKABLE,color:white}

ELEMENT FORMAT EXPLAINED:
Each element line follows this format:
[ID] <role> "text" {cues} @ (x,y) size:WxH importance:score [status]

Example: [346] <button> "Computer Accessories" {CLICKABLE,color:white} @ (664,100) size:150x40 importance:811

Breaking down each part:
- [ID]: The number in brackets is the element ID - use this EXACT number in CLICK/TYPE commands
  Example: If you see [346], use CLICK(346) or TYPE(346, "text")
- <role>: Element type (button, link, textbox, etc.)
- "text": Visible text content (truncated with "..." if long)
- {cues}: Optional visual cues in curly braces (e.g., {CLICKABLE}, {PRIMARY,CLICKABLE}, {CLICKABLE,color:white})
  If no cues, this part is omitted entirely
- @ (x,y): Element position in pixels from top-left corner
- size:WxH: Element dimensions (width x height in pixels)
- importance: Score indicating element relevance (higher = more important)
- [status]: Optional status flags in brackets (not_in_viewport, occluded, diff:ADDED/MODIFIED/etc)

CRITICAL RESPONSE FORMAT:
You MUST respond with ONLY ONE of these exact action formats:
- CLICK(id) - Click element by ID (use the number from [ID] brackets)
- TYPE(id, "text") - Type text into element (use the number from [ID] brackets)
- PRESS("key") - Press keyboard key (Enter, Escape, Tab, ArrowDown, etc)
- FINISH() - Task complete

DO NOT include any explanation, reasoning, or natural language.
DO NOT use markdown formatting or code blocks.
DO NOT say "The next step is..." or anything similar.

CORRECT Examples (matching element IDs from the list above):
If element is [346] <button> "Click me" → respond: CLICK(346)
If element is [15] <textbox> "Search" → respond: TYPE(15, "magic mouse")
PRESS("Enter")
FINISH()

INCORRECT Examples (DO NOT DO THIS):
"The next step is to click..."
"I will type..."
\`\`\`CLICK(42)\`\`\``;

    const userPrompt = 'Return the single action command:';

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
