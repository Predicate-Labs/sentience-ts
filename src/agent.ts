/**
 * Sentience Agent: High-level automation agent using LLM + SDK
 * Implements observe-think-act loop for natural language commands
 */

import { SentienceBrowser } from './browser';
import { snapshot, SnapshotOptions } from './snapshot';
import { click, typeText, press } from './actions';
import { Snapshot, Element, ActionResult } from './types';
import { LLMProvider, LLMResponse } from './llm-provider';
import { Tracer } from './tracing/tracer';
import { TraceEventData, TraceElement } from './tracing/types';
import { randomUUID, createHash } from 'crypto';
import { SnapshotDiff } from './snapshot-diff';

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
  private tracer?: Tracer;
  private stepCount: number;
  private history: HistoryEntry[];
  private tokenUsage: TokenStats;
  private showOverlay: boolean;
  private previousSnapshot?: Snapshot;

  /**
   * Initialize Sentience Agent
   * @param browser - SentienceBrowser instance
   * @param llm - LLM provider (OpenAIProvider, AnthropicProvider, etc.)
   * @param snapshotLimit - Maximum elements to include in context (default: 50)
   * @param verbose - Print execution logs (default: true)
   * @param tracer - Optional tracer for recording execution (default: undefined)
   * @param showOverlay - Show green bbox overlay in browser (default: false)
   */
  constructor(
    browser: SentienceBrowser,
    llm: LLMProvider,
    snapshotLimit: number = 50,
    verbose: boolean = true,
    tracer?: Tracer,
    showOverlay: boolean = false
  ) {
    this.browser = browser;
    this.llm = llm;
    this.snapshotLimit = snapshotLimit;
    this.verbose = verbose;
    this.tracer = tracer;
    this.showOverlay = showOverlay;
    this.stepCount = 0;
    this.history = [];
    this.tokenUsage = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      byAction: []
    };
    
  }

  /**
   * Compute SHA256 hash of text
   */
  private computeHash(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }

  /**
   * Get bounding box for an element from snapshot
   */
  private getElementBbox(elementId: number | undefined, snap: Snapshot): { x: number; y: number; width: number; height: number } | undefined {
    if (elementId === undefined) return undefined;
    const el = snap.elements.find(e => e.id === elementId);
    if (!el) return undefined;
    return {
      x: el.bbox.x,
      y: el.bbox.y,
      width: el.bbox.width,
      height: el.bbox.height,
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

    // Increment step counter and generate step ID
    this.stepCount += 1;
    const stepId = randomUUID();

    // Emit step_start event
    if (this.tracer) {
      const currentUrl = this.browser.getPage().url();
      this.tracer.emitStepStart(stepId, this.stepCount, goal, 0, currentUrl);
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 1. OBSERVE: Get refined semantic snapshot
        const startTime = Date.now();

        const snapOpts: SnapshotOptions = {
          ...snapshotOptions,
          goal: snapshotOptions?.goal ?? goal,
          limit: snapshotOptions?.limit || this.snapshotLimit,
        };
        // Apply showOverlay from agent config if not explicitly set in snapshotOptions
        if (snapshotOptions?.show_overlay === undefined) {
          snapOpts.show_overlay = this.showOverlay;
        }

        const snap = await snapshot(this.browser, snapOpts);

        if (snap.status !== 'success') {
          throw new Error(`Snapshot failed: ${snap.error}`);
        }

        // Compute diff_status by comparing with previous snapshot
        const elementsWithDiff = SnapshotDiff.computeDiffStatus(snap, this.previousSnapshot);

        // Create snapshot with diff_status populated
        const snapWithDiff: Snapshot = {
          ...snap,
          elements: elementsWithDiff
        };

        // Update previous snapshot for next comparison
        this.previousSnapshot = snap;

        // Apply element filtering based on goal
        const filteredElements = this.filterElements(snapWithDiff, goal);

        // Create filtered snapshot
        const filteredSnap: Snapshot = {
          ...snapWithDiff,
          elements: filteredElements
        };

        // Emit snapshot event
        if (this.tracer) {
          // Normalize importance values to importance_score (0-1 range) per snapshot
          // Min-max normalization: (value - min) / (max - min)
          const importanceValues = snapWithDiff.elements.map(el => el.importance);
          const minImportance = importanceValues.length > 0 ? Math.min(...importanceValues) : 0;
          const maxImportance = importanceValues.length > 0 ? Math.max(...importanceValues) : 0;
          const importanceRange = maxImportance - minImportance;

          // Include ALL elements with full data for DOM tree display
          // Use snapWithDiff.elements (with diff_status) not filteredSnap.elements
          const elements: TraceElement[] = snapWithDiff.elements.map(el => {
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

          // Always include screenshot in trace event for studio viewer compatibility
          // CloudTraceSink will extract and upload screenshots separately, then remove
          // screenshot_base64 from events before uploading the trace file.
          if (snap.screenshot) {
            // Extract base64 string from data URL if needed
            let screenshotBase64: string;
            if (snap.screenshot.startsWith('data:image')) {
              // Format: "data:image/jpeg;base64,{base64_string}"
              screenshotBase64 = snap.screenshot.includes(',') 
                ? snap.screenshot.split(',', 2)[1] 
                : snap.screenshot;
            } else {
              screenshotBase64 = snap.screenshot;
            }
            
            snapshotData.screenshot_base64 = screenshotBase64;
            if (snap.screenshot_format) {
              snapshotData.screenshot_format = snap.screenshot_format;
            }
          }

          this.tracer.emit('snapshot', snapshotData, stepId);
        }

        // 2. GROUND: Format elements for LLM context
        const context = this.buildContext(filteredSnap, goal);

        // 3. THINK: Query LLM for next action
        const llmResponse = await this.queryLLM(context, goal);

        if (this.verbose) {
          console.log(`🧠 LLM Decision: ${llmResponse.content}`);
        }

        // Emit LLM response event
        if (this.tracer) {
          this.tracer.emit('llm_response', {
            model: llmResponse.modelName,
            prompt_tokens: llmResponse.promptTokens,
            completion_tokens: llmResponse.completionTokens,
            response_text: llmResponse.content.substring(0, 500),
          }, stepId);
        }

        // Track token usage
        this.trackTokens(goal, llmResponse);

        // Parse action from LLM response
        const actionStr = llmResponse.content.trim();

        // 4. EXECUTE: Parse and run action
        const result = await this.executeAction(actionStr, filteredSnap);

        const durationMs = Date.now() - startTime;
        result.durationMs = durationMs;
        result.attempt = attempt;
        result.goal = goal;

        // Emit action event
        if (this.tracer) {
          this.tracer.emit('action', {
            action_type: result.action,
            element_id: result.elementId,
            text: result.text,
            key: result.key,
            success: result.success,
          }, stepId);
        }

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

        // Emit step_end event if tracer is enabled
        if (this.tracer) {
          const preUrl = snap.url;
          const postUrl = this.browser.getPage()?.url() || null;
          
          // Compute snapshot digest (simplified - use URL + timestamp)
          const snapshotDigest = `sha256:${this.computeHash(`${preUrl}${snap.timestamp}`)}`;
          
          // Build LLM data
          const llmResponseText = llmResponse.content;
          const llmResponseHash = `sha256:${this.computeHash(llmResponseText)}`;
          const llmData: TraceEventData['llm'] = {
            model: llmResponse.modelName,
            response_text: llmResponseText,
            response_hash: llmResponseHash,
            usage: {
              prompt_tokens: llmResponse.promptTokens || 0,
              completion_tokens: llmResponse.completionTokens || 0,
              total_tokens: llmResponse.totalTokens || 0,
            },
          };
          
          // Build exec data
          const execData: TraceEventData['exec'] = {
            success: result.success,
            action: result.action || 'unknown',
            outcome: result.outcome || (result.success ? `Action ${result.action || 'unknown'} executed successfully` : `Action ${result.action || 'unknown'} failed`),
            duration_ms: durationMs,
          };
          
          // Add optional exec fields
          if (result.elementId !== undefined) {
            execData.element_id = result.elementId;
            // Add bounding box if element found
            const bbox = this.getElementBbox(result.elementId, snap);
            if (bbox) {
              execData.bounding_box = bbox;
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
          
          // Build verify data (simplified - based on success and url_changed)
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
            const bbox = this.getElementBbox(result.elementId, snap);
            if (bbox) {
              verifySignals.signals.elements_found = [
                {
                  label: `Element ${result.elementId}`,
                  bounding_box: bbox,
                },
              ];
            }
          }
          
          // Build complete step_end event
          const stepEndData: TraceEventData = {
            v: 1,
            step_id: stepId,
            step_index: this.stepCount,
            goal: goal,
            attempt: attempt,
            pre: {
              url: preUrl,
              snapshot_digest: snapshotDigest,
            },
            llm: llmData,
            exec: execData,
            post: {
              url: postUrl || undefined,
            },
            verify: verifySignals,
          };
          
          this.tracer.emit('step_end', stepEndData, stepId);
        }

        return result;

      } catch (error: any) {
        // Emit error event
        if (this.tracer) {
          this.tracer.emitError(stepId, error.message, attempt);
        }

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
   * Filter elements from snapshot based on goal context.
   * Applies goal-based keyword matching to boost relevant elements and filters out irrelevant ones.
   */
  private filterElements(snap: Snapshot, goal: string): Element[] {
    let elements = snap.elements;

    // If no goal provided, return all elements (up to limit)
    if (!goal) {
      return elements.slice(0, this.snapshotLimit);
    }

    const goalLower = goal.toLowerCase();

    // Extract keywords from goal
    const keywords = this.extractKeywords(goalLower);

    // Boost elements matching goal keywords
    const scoredElements: Array<[number, Element]> = [];
    for (const el of elements) {
      let score = el.importance;

      // Boost if element text matches goal
      if (el.text && keywords.some(kw => el.text!.toLowerCase().includes(kw))) {
        score += 0.3;
      }

      // Boost if role matches goal intent
      if (goalLower.includes('click') && el.visual_cues.is_clickable) {
        score += 0.2;
      }
      if (goalLower.includes('type') && (el.role === 'textbox' || el.role === 'searchbox')) {
        score += 0.2;
      }
      if (goalLower.includes('search')) {
        // Filter out non-interactive elements for search tasks
        if ((el.role === 'link' || el.role === 'img') && !el.visual_cues.is_primary) {
          score -= 0.5;
        }
      }

      scoredElements.push([score, el]);
    }

    // Re-sort by boosted score
    scoredElements.sort((a, b) => b[0] - a[0]);
    elements = scoredElements.map(([, el]) => el);

    return elements.slice(0, this.snapshotLimit);
  }

  /**
   * Extract meaningful keywords from goal text
   */
  private extractKeywords(text: string): string[] {
    const stopwords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was'
    ]);
    const words = text.split(/\s+/);
    return words.filter(w => !stopwords.has(w) && w.length > 2);
  }

  /**
   * Convert snapshot elements to token-efficient prompt string
   * Format: [ID] <role> "text" {cues} @ (x,y) (Imp:score)
   * Note: elements are already filtered by filterElements() in act()
   */
  private buildContext(snap: Snapshot, goal: string): string {
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
    this.stepCount = 0;
    this.tokenUsage = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      byAction: []
    };
  }

  /**
   * Close the tracer and flush events to disk
   */
  async closeTracer(): Promise<void> {
    if (this.tracer) {
      await this.tracer.close();
    }
  }

  /**
   * Get the tracer instance (if any)
   */
  getTracer(): Tracer | undefined {
    return this.tracer;
  }
}
