/**
 * Sentience Agent: High-level automation agent using LLM + SDK
 * Implements observe-think-act loop for natural language commands
 */

import { SentienceBrowser } from './browser';
import { snapshot, SnapshotOptions } from './snapshot';
import { Snapshot } from './types';
import { LLMProvider, LLMResponse } from './llm-provider';
import { Tracer } from './tracing/tracer';
import { randomUUID } from 'crypto';
import { TraceEventBuilder } from './utils/trace-event-builder';
import { LLMInteractionHandler } from './utils/llm-interaction-handler';
import { ActionExecutor } from './utils/action-executor';
import { SnapshotEventBuilder } from './utils/snapshot-event-builder';
import { SnapshotProcessor } from './utils/snapshot-processor';

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
  /** Optional action metadata (e.g., human-like cursor movement path) */
  cursor?: Record<string, any>;
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
  private llmHandler: LLMInteractionHandler;
  private actionExecutor: ActionExecutor;

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
      byAction: [],
    };

    // Initialize handlers
    this.llmHandler = new LLMInteractionHandler(this.llm, this.verbose);
    this.actionExecutor = new ActionExecutor(this.browser, this.verbose);
  }

  /**
   * Get bounding box for an element from snapshot
   */
  private getElementBbox(
    elementId: number | undefined,
    snap: Snapshot
  ): { x: number; y: number; width: number; height: number } | undefined {
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
   * @deprecated Use LLMInteractionHandler.buildContext() instead
   */
  private buildContext(snap: Snapshot, goal: string): string {
    return this.llmHandler.buildContext(snap, goal);
  }

  /**
   * @deprecated Use LLMInteractionHandler.queryLLM() instead
   */
  private async queryLLM(domContext: string, goal: string): Promise<LLMResponse> {
    return this.llmHandler.queryLLM(domContext, goal);
  }

  /**
   * @deprecated Use ActionExecutor.executeAction() instead
   */
  private async executeAction(actionStr: string, snap: Snapshot): Promise<AgentActResult> {
    return this.actionExecutor.executeAction(actionStr, snap);
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
      const page = this.browser.getPage();
      const currentUrl = page ? page.url() : 'unknown';
      this.tracer.emitStepStart(stepId, this.stepCount, goal, 0, currentUrl);
    }

    // Track data collected during step execution for step_end emission on failure
    let stepSnapWithDiff: Snapshot | null = null;
    let stepPreUrl: string | null = null;
    let stepLlmResponse: LLMResponse | null = null;
    let stepStartTime: number = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 1. OBSERVE: Get refined semantic snapshot
        const startTime = Date.now();
        stepStartTime = startTime;

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

        // Process snapshot: compute diff status and filter elements
        const processed = SnapshotProcessor.process(
          snap,
          this.previousSnapshot,
          goal,
          this.snapshotLimit
        );

        // Update previous snapshot for next comparison
        this.previousSnapshot = snap;

        const snapWithDiff = processed.withDiff;
        const filteredSnap = processed.filtered;

        // Track for step_end emission on failure
        stepSnapWithDiff = snapWithDiff;
        stepPreUrl = snap.url;

        // Emit snapshot event
        if (this.tracer) {
          const snapshotData = SnapshotEventBuilder.buildSnapshotEventData(snapWithDiff, stepId);
          this.tracer.emit('snapshot', snapshotData, stepId);
        }

        // 2. GROUND: Format elements for LLM context (filteredSnap already created above)
        const context = this.llmHandler.buildContext(filteredSnap, goal);

        // 3. THINK: Query LLM for next action
        const llmResponse = await this.llmHandler.queryLLM(context, goal);

        // Track for step_end emission on failure
        stepLlmResponse = llmResponse;

        if (this.verbose) {
          console.log(`🧠 LLM Decision: ${llmResponse.content}`);
        }

        // Emit LLM response event
        if (this.tracer) {
          this.tracer.emit(
            'llm_response',
            {
              model: llmResponse.modelName,
              prompt_tokens: llmResponse.promptTokens,
              completion_tokens: llmResponse.completionTokens,
              response_text: llmResponse.content.substring(0, 500),
            },
            stepId
          );
        }

        // Track token usage
        this.trackTokens(goal, llmResponse);

        // Parse action from LLM response
        const actionStr = this.llmHandler.extractAction(llmResponse);

        // 4. EXECUTE: Parse and run action
        const result = await this.actionExecutor.executeAction(actionStr, filteredSnap);

        const durationMs = Date.now() - startTime;
        result.durationMs = durationMs;
        result.attempt = attempt;
        result.goal = goal;

        // Emit action event
        if (this.tracer) {
          this.tracer.emit(
            'action',
            {
              action_type: result.action,
              element_id: result.elementId,
              text: result.text,
              key: result.key,
              success: result.success,
              cursor: result.cursor,
            },
            stepId
          );
        }

        // 5. RECORD: Track history
        this.history.push({
          goal,
          action: actionStr,
          result,
          success: result.success,
          attempt,
          durationMs,
        });

        if (this.verbose) {
          const status = result.success ? '✅' : '❌';
          console.log(`${status} Completed in ${durationMs}ms`);
        }

        // Emit step_end event if tracer is enabled
        if (this.tracer) {
          const preUrl = snap.url;
          const postUrl = this.browser.getPage()?.url() || null;

          // Build step_end event using TraceEventBuilder
          // Use snapWithDiff to include elements with diff_status in pre field
          const stepEndData = TraceEventBuilder.buildStepEndData({
            stepId,
            stepIndex: this.stepCount,
            goal,
            attempt,
            preUrl,
            postUrl,
            snapshot: snapWithDiff,
            llmResponse,
            result,
          });

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
          // Emit step_end with whatever data we collected before failure
          // This ensures diff_status and other fields are preserved in traces
          if (this.tracer && stepSnapWithDiff) {
            const postUrl = this.browser.getPage()?.url() || null;
            const durationMs = Date.now() - stepStartTime;

            const stepEndData = TraceEventBuilder.buildPartialStepEndData({
              stepId,
              stepIndex: this.stepCount,
              goal,
              attempt,
              preUrl: stepPreUrl,
              postUrl,
              snapshot: stepSnapWithDiff,
              llmResponse: stepLlmResponse,
              error: error.message,
              durationMs,
            });

            this.tracer.emit('step_end', stepEndData, stepId);
          }

          const errorResult: AgentActResult = {
            success: false,
            goal,
            error: error.message,
            attempt,
            durationMs: 0,
          };
          this.history.push(errorResult as any);
          throw new Error(`Failed after ${maxRetries} retries: ${error.message}`);
        }
      }
    }

    throw new Error('Unexpected: loop should have returned or thrown');
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
      model: llmResponse.modelName,
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
      byAction: [],
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
