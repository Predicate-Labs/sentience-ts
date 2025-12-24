/**
 * Conversational Agent: Natural language interface for Sentience SDK
 * Enables end users to control web automation using plain English
 */

import { SentienceBrowser } from './browser';
import { LLMProvider, LLMResponse } from './llm-provider';
import { SentienceAgent } from './agent';
import { snapshot } from './snapshot';
import { Snapshot } from './types';

/**
 * Plan step action types
 */
export type ActionType =
  | 'NAVIGATE'
  | 'FIND_AND_CLICK'
  | 'FIND_AND_TYPE'
  | 'PRESS_KEY'
  | 'WAIT'
  | 'EXTRACT_INFO'
  | 'VERIFY';

/**
 * Parameters for different action types
 */
export interface ActionParameters {
  url?: string;
  element_description?: string;
  text?: string;
  key?: string;
  duration?: number;
  info_type?: string;
  condition?: string;
}

/**
 * Single step in execution plan
 */
export interface PlanStep {
  action: ActionType;
  description: string;
  parameters: ActionParameters;
}

/**
 * Execution plan from LLM
 */
export interface ExecutionPlan {
  intent: string;
  steps: PlanStep[];
  expected_outcome: string;
}

/**
 * Result from executing a single step
 */
export interface StepResult {
  success: boolean;
  action: ActionType;
  data?: any;
  error?: string;
}

/**
 * Conversation history entry
 */
export interface ConversationEntry {
  user_input: string;
  plan: ExecutionPlan;
  results: StepResult[];
  response: string;
  duration_ms: number;
}

/**
 * Execution context tracking
 */
export interface ExecutionContext {
  current_url: string | null;
  last_action: string | null;
  discovered_elements: any[];
  session_data: Record<string, any>;
}

/**
 * Natural language agent that translates user intent into SDK actions
 * and returns human-readable results.
 *
 * This is Level 3 - the highest abstraction level for non-technical users.
 *
 * Example:
 * ```typescript
 * const agent = new ConversationalAgent(browser, llm);
 * const result = await agent.execute("Search for magic mouse on google.com");
 * console.log(result);
 * // → "I searched for 'magic mouse' on Google and found several results.
 * //    The top result is from amazon.com selling the Apple Magic Mouse 2 for $79."
 * ```
 */
export class ConversationalAgent {
  private browser: SentienceBrowser;
  private llm: LLMProvider;
  private verbose: boolean;
  private technicalAgent: SentienceAgent;
  private conversationHistory: ConversationEntry[];
  private executionContext: ExecutionContext;

  /**
   * Initialize conversational agent
   * @param browser - SentienceBrowser instance
   * @param llm - LLM provider (OpenAI, Anthropic, etc.)
   * @param verbose - Print step-by-step execution logs (default: true)
   */
  constructor(
    browser: SentienceBrowser,
    llm: LLMProvider,
    verbose: boolean = true
  ) {
    this.browser = browser;
    this.llm = llm;
    this.verbose = verbose;

    // Underlying technical agent
    this.technicalAgent = new SentienceAgent(browser, llm, 50, false);

    // Conversation history and context
    this.conversationHistory = [];
    this.executionContext = {
      current_url: null,
      last_action: null,
      discovered_elements: [],
      session_data: {}
    };
  }

  /**
   * Execute a natural language command and return natural language result
   *
   * @param userInput - Natural language instruction (e.g., "Search for magic mouse")
   * @returns Human-readable result description
   *
   * Example:
   * ```typescript
   * const result = await agent.execute("Go to google.com and search for magic mouse");
   * // → "I navigated to google.com, searched for 'magic mouse', and found 10 results.
   * //    The top result is from amazon.com selling Magic Mouse 2 for $79."
   * ```
   */
  async execute(userInput: string): Promise<string> {
    if (this.verbose) {
      console.log('\n' + '='.repeat(70));
      console.log(`👤 User: ${userInput}`);
      console.log('='.repeat(70));
    }

    const startTime = Date.now();

    // Step 1: Plan the execution (break down into atomic steps)
    const plan = await this.createPlan(userInput);

    if (this.verbose) {
      console.log('\n📋 Execution Plan:');
      plan.steps.forEach((step, i) => {
        console.log(`  ${i + 1}. ${step.description}`);
      });
    }

    // Step 2: Execute each step
    const executionResults: StepResult[] = [];
    for (const step of plan.steps) {
      const stepResult = await this.executeStep(step);
      executionResults.push(stepResult);

      if (!stepResult.success) {
        // Early exit on failure
        if (this.verbose) {
          console.log(`⚠️  Step failed: ${step.description}`);
        }
        break;
      }
    }

    // Step 3: Synthesize natural language response
    const response = await this.synthesizeResponse(userInput, plan, executionResults);

    const durationMs = Date.now() - startTime;

    // Step 4: Update conversation history
    this.conversationHistory.push({
      user_input: userInput,
      plan,
      results: executionResults,
      response,
      duration_ms: durationMs
    });

    if (this.verbose) {
      console.log(`\n🤖 Agent: ${response}`);
      console.log(`⏱️  Completed in ${durationMs}ms\n`);
    }

    return response;
  }

  /**
   * Use LLM to break down user input into atomic executable steps
   */
  private async createPlan(userInput: string): Promise<ExecutionPlan> {
    // Get current page context
    const currentUrl = this.browser.getPage()?.url() || 'None';

    const systemPrompt = `You are a web automation planning assistant.

Your job is to analyze a natural language request and break it down into atomic steps
that can be executed by a web automation agent.

AVAILABLE ACTIONS:
1. NAVIGATE - Go to a URL
2. FIND_AND_CLICK - Find and click an element by description
3. FIND_AND_TYPE - Find input field and type text
4. PRESS_KEY - Press a keyboard key (Enter, Escape, etc.)
5. WAIT - Wait for page to load or element to appear
6. EXTRACT_INFO - Extract specific information from the page
7. VERIFY - Verify a condition is met

RESPONSE FORMAT (JSON):
{
  "intent": "brief summary of user intent",
  "steps": [
    {
      "action": "NAVIGATE" | "FIND_AND_CLICK" | "FIND_AND_TYPE" | "PRESS_KEY" | "WAIT" | "EXTRACT_INFO" | "VERIFY",
      "description": "human-readable description",
      "parameters": {
        "url": "https://...",
        "element_description": "search box",
        "text": "magic mouse",
        "key": "Enter",
        "duration": 2.0,
        "info_type": "product link",
        "condition": "page contains results"
      }
    }
  ],
  "expected_outcome": "what success looks like"
}

IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks.`;

    const userPrompt = `Current URL: ${currentUrl}

User Request: ${userInput}

Create a step-by-step execution plan.`;

    try {
      const response = await this.llm.generate(
        systemPrompt,
        userPrompt,
        {
          temperature: 0.0,
          response_format: this.llm.supportsJsonMode() ? { type: 'json_object' } : undefined
        }
      );

      // Parse JSON response
      const plan = JSON.parse(response.content) as ExecutionPlan;
      return plan;

    } catch (e: any) {
      // Fallback: create simple plan
      if (this.verbose) {
        console.log(`⚠️  JSON parsing failed, using fallback plan: ${e.message}`);
      }

      return {
        intent: userInput,
        steps: [
          {
            action: 'FIND_AND_CLICK',
            description: userInput,
            parameters: { element_description: userInput }
          }
        ],
        expected_outcome: 'Complete user request'
      };
    }
  }

  /**
   * Execute a single atomic step from the plan
   */
  private async executeStep(step: PlanStep): Promise<StepResult> {
    const action = step.action;
    const params = step.parameters;

    if (this.verbose) {
      console.log(`\n⚙️  Executing: ${step.description}`);
    }

    try {
      if (action === 'NAVIGATE') {
        let url = params.url!;
        // Add https:// if missing
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        await this.browser.getPage().goto(url, { waitUntil: 'domcontentloaded' });
        this.executionContext.current_url = url;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Brief wait

        return {
          success: true,
          action,
          data: { url }
        };

      } else if (action === 'FIND_AND_CLICK') {
        const elementDesc = params.element_description!;
        // Use technical agent to find and click
        const result = await this.technicalAgent.act(`Click the ${elementDesc}`);
        return {
          success: result.success,
          action,
          data: result
        };

      } else if (action === 'FIND_AND_TYPE') {
        const elementDesc = params.element_description!;
        const text = params.text!;
        // Use technical agent to find input and type
        const result = await this.technicalAgent.act(`Type '${text}' into ${elementDesc}`);
        return {
          success: result.success,
          action,
          data: { text }
        };

      } else if (action === 'PRESS_KEY') {
        const key = params.key!;
        const result = await this.technicalAgent.act(`Press ${key} key`);
        return {
          success: result.success,
          action,
          data: { key }
        };

      } else if (action === 'WAIT') {
        const duration = params.duration || 2.0;
        await new Promise(resolve => setTimeout(resolve, duration * 1000));
        return {
          success: true,
          action,
          data: { duration }
        };

      } else if (action === 'EXTRACT_INFO') {
        const infoType = params.info_type!;
        // Get current page snapshot and extract info
        const snap = await snapshot(this.browser, { limit: 50 });

        // Use LLM to extract specific information
        const extracted = await this.extractInformation(snap, infoType);

        return {
          success: true,
          action,
          data: { extracted, info_type: infoType }
        };

      } else if (action === 'VERIFY') {
        const condition = params.condition!;
        // Verify condition using current page state
        const isVerified = await this.verifyCondition(condition);
        return {
          success: isVerified,
          action,
          data: { condition, verified: isVerified }
        };

      } else {
        throw new Error(`Unknown action: ${action}`);
      }

    } catch (error: any) {
      if (this.verbose) {
        console.log(`❌ Step failed: ${error.message}`);
      }
      return {
        success: false,
        action,
        error: error.message
      };
    }
  }

  /**
   * Extract specific information from snapshot using LLM
   */
  private async extractInformation(snap: Snapshot, infoType: string): Promise<any> {
    // Build context from snapshot
    const elementsText = snap.elements
      .slice(0, 30) // Top 30 elements
      .map(el => `[${el.id}] ${el.role}: ${el.text} (importance: ${el.importance})`)
      .join('\n');

    const systemPrompt = `Extract ${infoType} from the following page elements.

ELEMENTS:
${elementsText}

Return JSON with extracted information:
{
  "found": true/false,
  "data": {
    // extracted information fields
  },
  "summary": "brief description of what was found"
}`;

    const userPrompt = `Extract ${infoType} from the elements above.`;

    try {
      const response = await this.llm.generate(
        systemPrompt,
        userPrompt,
        { response_format: this.llm.supportsJsonMode() ? { type: 'json_object' } : undefined }
      );
      return JSON.parse(response.content);
    } catch {
      return { found: false, data: {}, summary: 'Failed to extract information' };
    }
  }

  /**
   * Verify a condition is met on current page
   */
  private async verifyCondition(condition: string): Promise<boolean> {
    try {
      const snap = await snapshot(this.browser, { limit: 30 });

      // Build context
      const elementsText = snap.elements
        .slice(0, 20)
        .map(el => `${el.role}: ${el.text}`)
        .join('\n');

      const systemPrompt = `Verify if the following condition is met based on page elements.

CONDITION: ${condition}

PAGE ELEMENTS:
${elementsText}

Return JSON:
{
  "verified": true/false,
  "reasoning": "explanation"
}`;

      const response = await this.llm.generate(
        systemPrompt,
        '',
        { response_format: this.llm.supportsJsonMode() ? { type: 'json_object' } : undefined }
      );
      const result = JSON.parse(response.content);
      return result.verified || false;
    } catch {
      return false;
    }
  }

  /**
   * Synthesize a natural language response from execution results
   */
  private async synthesizeResponse(
    userInput: string,
    plan: ExecutionPlan,
    executionResults: StepResult[]
  ): Promise<string> {
    // Build summary of what happened
    const successfulSteps = executionResults.filter(r => r.success);
    const failedSteps = executionResults.filter(r => !r.success);

    // Extract key data
    const extractedData = executionResults
      .filter(r => r.action === 'EXTRACT_INFO')
      .map(r => r.data?.extracted || {});

    // Use LLM to create natural response
    const systemPrompt = `You are a helpful assistant that summarizes web automation results
in natural, conversational language.

Your job is to take technical execution results and convert them into a friendly,
human-readable response that answers the user's original request.

Be concise but informative. Include key findings or data discovered.
If the task failed, explain what went wrong in simple terms.

IMPORTANT: Return only the natural language response, no JSON, no markdown.`;

    const resultsSummary = {
      user_request: userInput,
      plan_intent: plan.intent,
      total_steps: executionResults.length,
      successful_steps: successfulSteps.length,
      failed_steps: failedSteps.length,
      extracted_data: extractedData,
      final_url: this.browser.getPage()?.url() || null
    };

    const userPrompt = `Summarize these automation results in 1-3 natural sentences:

${JSON.stringify(resultsSummary, null, 2)}

Respond as if you're talking to a user, not listing technical details.`;

    try {
      const response = await this.llm.generate(systemPrompt, userPrompt, { temperature: 0.3 });
      return response.content.trim();
    } catch {
      // Fallback response
      if (failedSteps.length > 0) {
        return `I attempted to ${userInput}, but encountered an error during execution.`;
      } else {
        return `I completed your request: ${userInput}`;
      }
    }
  }

  /**
   * Conversational interface with context awareness
   *
   * @param message - User message (can reference previous context)
   * @returns Agent response
   *
   * Example:
   * ```typescript
   * await agent.chat("Go to google.com");
   * // → "I've navigated to google.com"
   * await agent.chat("Search for magic mouse"); // Contextual
   * // → "I searched for 'magic mouse' and found 10 results"
   * ```
   */
  async chat(message: string): Promise<string> {
    return this.execute(message);
  }

  /**
   * Get a summary of the entire conversation/session
   *
   * @returns Natural language summary of all actions taken
   */
  async getSummary(): Promise<string> {
    if (this.conversationHistory.length === 0) {
      return 'No actions have been performed yet.';
    }

    const systemPrompt = `Summarize this web automation session in a brief, natural paragraph.
Focus on what was accomplished and key findings.`;

    const sessionData = {
      total_interactions: this.conversationHistory.length,
      actions: this.conversationHistory.map(h => ({
        request: h.user_input,
        outcome: h.response
      }))
    };

    const userPrompt = `Summarize this session:\n${JSON.stringify(sessionData, null, 2)}`;

    try {
      const summary = await this.llm.generate(systemPrompt, userPrompt);
      return summary.content.trim();
    } catch {
      return `Session with ${this.conversationHistory.length} interactions completed.`;
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.technicalAgent.clearHistory();
    this.executionContext = {
      current_url: null,
      last_action: null,
      discovered_elements: [],
      session_data: {}
    };
  }

  /**
   * Get conversation history
   * @returns Array of conversation entries
   */
  getHistory(): ConversationEntry[] {
    return [...this.conversationHistory];
  }

  /**
   * Get token usage from underlying technical agent
   * @returns Token statistics
   */
  getTokenStats() {
    return this.technicalAgent.getTokenStats();
  }
}
