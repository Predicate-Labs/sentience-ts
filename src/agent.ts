/**
 * Sentience Agent: High-level automation agent using LLM + SDK
 * Implements observe-think-act loop for natural language commands
 */

import { SentienceBrowser } from './browser';
import { snapshot, SnapshotOptions } from './snapshot';
import { click, typeText, press } from './actions';
import { Snapshot, Element, ActionResult } from './types';
import { LLMProvider, LLMResponse } from './llm-provider';

/**
 * Execution result from agent.act()
 */
export interface AgentActResult {
  success: boolean;
  action?: string;
  elementId?: number;
  text?: string;
  key?: string;
  outcome?: string;
  urlChanged?: boolean;
  durationMs: number;
  attempt: number;
  goal: string;
  error?: string;
  message?: string;
}

/**
 * History entry for executed action
 */
export interface HistoryEntry {
  goal: string;
  action: string;
  result: AgentActResult;
  success: boolean;
  attempt: number;
  durationMs: number;
}

/**
 * Token usage statistics
 */
export interface TokenStats {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  byAction: Array<{
    goal: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    model?: string;
  }>;
}

/**
 * High-level agent that combines Sentience SDK with any LLM provider.
 *
 * Uses observe-think-act loop to execute natural language commands:
 * 1. OBSERVE: Get snapshot of current page state
 * 2. THINK: Query LLM to decide next action
 * 3. ACT: Execute action using SDK
 *
 * Example:
 * ```typescript
 * import { SentienceBrowser, SentienceAgent, OpenAIProvider } from 'sentience-ts';
 *
 * const browser = await SentienceBrowser.create({ apiKey: 'sentience_key' });
 * const llm = new OpenAIProvider('openai_key', 'gpt-4o');
 * const agent = new SentienceAgent(browser, llm);
 *
 * await browser.getPage().goto('https://google.com');
 * await agent.act('Click the search box');
 * await agent.act("Type 'magic mouse' into the search field");
 * await agent.act('Press Enter key');
 * ```
 */
export class SentienceAgent {
  private browser: SentienceBrowser;
  private llm: LLMProvider;
  private snapshotLimit: number;
  private verbose: boolean;
  private history: HistoryEntry[];
  private tokenUsage: TokenStats;

  /**
   * Initialize Sentience Agent
   * @param browser - SentienceBrowser instance
   * @param llm - LLM provider (OpenAIProvider, AnthropicProvider, etc.)
   * @param snapshotLimit - Maximum elements to include in context (default: 50)
   * @param verbose - Print execution logs (default: true)
   */
  constructor(
    browser: SentienceBrowser,
    llm: LLMProvider,
    snapshotLimit: number = 50,
    verbose: boolean = true
  ) {
    this.browser = browser;
    this.llm = llm;
    this.snapshotLimit = snapshotLimit;
    this.verbose = verbose;
    this.history = [];
    this.tokenUsage = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      byAction: []
    };
  }

  /**
   * Execute a high-level goal using observe → think → act loop
   * @param goal - Natural language instruction (e.g., "Click the Sign In button")
   * @param maxRetries - Number of retries on failure (default: 2)
   * @param snapshotOptions - Optional snapshot parameters (limit, filter, etc.)
   * @returns Result dict with status, action_taken, reasoning, and execution data
   *
   * Example:
   * ```typescript
   * const result = await agent.act('Click the search box');
   * console.log(result);
   * // { success: true, action: 'click', elementId: 42, ... }
   * ```
   */
  async act(
    goal: string,
    maxRetries: number = 2,
    snapshotOptions?: SnapshotOptions
  ): Promise<AgentActResult> {
    if (this.verbose) {
      console.log('\n' + '='.repeat(70));
      console.log(`🤖 Agent Goal: ${goal}`);
      console.log('='.repeat(70));
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 1. OBSERVE: Get refined semantic snapshot
        const startTime = Date.now();

        const snapOpts = snapshotOptions || {};
        if (!snapOpts.limit) {
          snapOpts.limit = this.snapshotLimit;
        }

        const snap = await snapshot(this.browser, snapOpts);

        if (snap.status !== 'success') {
          throw new Error(`Snapshot failed: ${snap.error}`);
        }

        // 2. GROUND: Format elements for LLM context
        const context = this.buildContext(snap, goal);

        // 3. THINK: Query LLM for next action
        const llmResponse = await this.queryLLM(context, goal);

        if (this.verbose) {
          console.log(`🧠 LLM Decision: ${llmResponse.content}`);
        }

        // Track token usage
        this.trackTokens(goal, llmResponse);

        // Parse action from LLM response
        const actionStr = llmResponse.content.trim();

        // 4. EXECUTE: Parse and run action
        const result = await this.executeAction(actionStr, snap);

        const durationMs = Date.now() - startTime;
        result.durationMs = durationMs;
        result.attempt = attempt;
        result.goal = goal;

        // 5. RECORD: Track history
        this.history.push({
          goal,
          action: actionStr,
          result,
          success: result.success,
          attempt,
          durationMs
        });

        if (this.verbose) {
          const status = result.success ? '✅' : '❌';
          console.log(`${status} Completed in ${durationMs}ms`);
        }

        return result;

      } catch (error: any) {
        if (attempt < maxRetries) {
          if (this.verbose) {
            console.log(`⚠️  Retry ${attempt + 1}/${maxRetries}: ${error.message}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          const errorResult: AgentActResult = {
            success: false,
            goal,
            error: error.message,
            attempt,
            durationMs: 0
          };
          this.history.push(errorResult as any);
          throw new Error(`Failed after ${maxRetries} retries: ${error.message}`);
        }
      }
    }

    throw new Error('Unexpected: loop should have returned or thrown');
  }

  /**
   * Convert snapshot elements to token-efficient prompt string
   * Format: [ID] <role> "text" {cues} @ (x,y) (Imp:score)
   */
  private buildContext(snap: Snapshot, goal: string): string {
    const lines: string[] = [];

    for (const el of snap.elements.slice(0, this.snapshotLimit)) {
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
   */
  private async queryLLM(domContext: string, goal: string): Promise<LLMResponse> {
    const systemPrompt = `You are an AI web automation agent.

GOAL: ${goal}

VISIBLE ELEMENTS (sorted by importance, max ${this.snapshotLimit}):
${domContext}

VISUAL CUES EXPLAINED:
- {PRIMARY}: Main call-to-action element on the page
- {CLICKABLE}: Element is clickable
- {color:X}: Background color name

RESPONSE FORMAT:
Return ONLY the function call, no explanation or markdown.

Available actions:
- CLICK(id) - Click element by ID
- TYPE(id, "text") - Type text into element
- PRESS("key") - Press keyboard key (Enter, Escape, Tab, ArrowDown, etc)
- FINISH() - Task complete

Examples:
- CLICK(42)
- TYPE(15, "magic mouse")
- PRESS("Enter")
- FINISH()
`;

    const userPrompt = 'What is the next step to achieve the goal?';

    return await this.llm.generate(systemPrompt, userPrompt, { temperature: 0.0 });
  }

  /**
   * Parse action string and execute SDK call
   */
  private async executeAction(actionStr: string, snap: Snapshot): Promise<AgentActResult> {
    // Parse CLICK(42)
    let match = actionStr.match(/CLICK\s*\(\s*(\d+)\s*\)/i);
    if (match) {
      const elementId = parseInt(match[1], 10);
      const result = await click(this.browser, elementId);
      return {
        success: result.success,
        action: 'click',
        elementId,
        outcome: result.outcome,
        urlChanged: result.url_changed,
        durationMs: 0,
        attempt: 0,
        goal: ''
      };
    }

    // Parse TYPE(42, "hello world")
    match = actionStr.match(/TYPE\s*\(\s*(\d+)\s*,\s*["']([^"']*)["']\s*\)/i);
    if (match) {
      const elementId = parseInt(match[1], 10);
      const text = match[2];
      const result = await typeText(this.browser, elementId, text);
      return {
        success: result.success,
        action: 'type',
        elementId,
        text,
        outcome: result.outcome,
        durationMs: 0,
        attempt: 0,
        goal: ''
      };
    }

    // Parse PRESS("Enter")
    match = actionStr.match(/PRESS\s*\(\s*["']([^"']+)["']\s*\)/i);
    if (match) {
      const key = match[1];
      const result = await press(this.browser, key);
      return {
        success: result.success,
        action: 'press',
        key,
        outcome: result.outcome,
        durationMs: 0,
        attempt: 0,
        goal: ''
      };
    }

    // Parse FINISH()
    if (/FINISH\s*\(\s*\)/i.test(actionStr)) {
      return {
        success: true,
        action: 'finish',
        message: 'Task marked as complete',
        durationMs: 0,
        attempt: 0,
        goal: ''
      };
    }

    throw new Error(
      `Unknown action format: ${actionStr}\n` +
      `Expected: CLICK(id), TYPE(id, "text"), PRESS("key"), or FINISH()`
    );
  }

  /**
   * Track token usage for analytics
   */
  private trackTokens(goal: string, llmResponse: LLMResponse): void {
    if (llmResponse.promptTokens) {
      this.tokenUsage.totalPromptTokens += llmResponse.promptTokens;
    }
    if (llmResponse.completionTokens) {
      this.tokenUsage.totalCompletionTokens += llmResponse.completionTokens;
    }
    if (llmResponse.totalTokens) {
      this.tokenUsage.totalTokens += llmResponse.totalTokens;
    }

    this.tokenUsage.byAction.push({
      goal,
      promptTokens: llmResponse.promptTokens,
      completionTokens: llmResponse.completionTokens,
      totalTokens: llmResponse.totalTokens,
      model: llmResponse.modelName
    });
  }

  /**
   * Get token usage statistics
   * @returns Dictionary with token usage breakdown
   */
  getTokenStats(): TokenStats {
    return { ...this.tokenUsage };
  }

  /**
   * Get execution history
   * @returns List of all actions taken with results
   */
  getHistory(): HistoryEntry[] {
    return [...this.history];
  }

  /**
   * Clear execution history and reset token counters
   */
  clearHistory(): void {
    this.history = [];
    this.tokenUsage = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      byAction: []
    };
  }
}
