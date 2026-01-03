/**
 * ConversationalAgent - Level 4 Abstraction
 * Natural language interface for browser automation
 */

import { SentienceAgent } from './agent';
import { LLMProvider } from './llm-provider';
import { snapshot } from './snapshot';
import { SentienceBrowser } from './browser';
import { Snapshot } from './types';

export type ActionType =
  | 'NAVIGATE'
  | 'FIND_AND_CLICK'
  | 'FIND_AND_TYPE'
  | 'PRESS_KEY'
  | 'WAIT'
  | 'EXTRACT_INFO'
  | 'VERIFY';

export interface ActionParameters {
  url?: string;
  description?: string;
  text?: string;
  key?: string;
  seconds?: number;
  info_type?: string;
  condition?: string;
}

export interface PlanStep {
  action: ActionType;
  parameters: ActionParameters;
  reasoning: string;
}

export interface ExecutionPlan {
  steps: PlanStep[];
  goal: string;
}

export interface StepResult {
  success: boolean;
  action: ActionType;
  result?: any;
  error?: string;
  snapshot?: Snapshot;
  duration_ms?: number;
}

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  plan?: ExecutionPlan;
  results?: StepResult[];
}

export interface ConversationalAgentOptions {
  llmProvider: LLMProvider;
  browser: SentienceBrowser;
  verbose?: boolean;
  maxTokens?: number;
  planningModel?: string;
  executionModel?: string;
}

/**
 * ConversationalAgent provides the highest level of abstraction (Level 4).
 * It accepts natural language instructions, automatically plans the execution,
 * performs the actions, and synthesizes natural language responses.
 *
 * Example:
 *   const agent = new ConversationalAgent({ llmProvider, browser });
 *   const response = await agent.execute("Search Google for TypeScript tutorials");
 *   console.log(response);
 */
export class ConversationalAgent {
  private llmProvider: LLMProvider;
  private browser: SentienceBrowser;
  private verbose: boolean;
  private maxTokens: number;
  private planningModel?: string;
  private executionModel?: string;
  private conversationHistory: ConversationEntry[] = [];
  private sentienceAgent: SentienceAgent;

  constructor(options: ConversationalAgentOptions) {
    this.llmProvider = options.llmProvider;
    this.browser = options.browser;
    this.verbose = options.verbose ?? false;
    this.maxTokens = options.maxTokens ?? 4000;
    this.planningModel = options.planningModel;
    this.executionModel = options.executionModel;

    this.sentienceAgent = new SentienceAgent(this.browser, this.llmProvider, 50, this.verbose);
  }

  /**
   * Execute a natural language instruction.
   * Plans the steps, executes them, and returns a natural language response.
   */
  async execute(userInput: string): Promise<string> {
    const startTime = Date.now();

    if (this.verbose) {
      console.log(`\n[ConversationalAgent] User: ${userInput}`);
    }

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userInput,
      timestamp: new Date(),
    });

    try {
      // Step 1: Create execution plan
      const plan = await this.createPlan(userInput);

      if (this.verbose) {
        console.log(`[ConversationalAgent] Plan created with ${plan.steps.length} steps`);
      }

      // Step 2: Execute each step
      const results: StepResult[] = [];
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        if (this.verbose) {
          console.log(`[ConversationalAgent] Step ${i + 1}/${plan.steps.length}: ${step.action}`);
        }

        const result = await this.executeStep(step);
        results.push(result);

        if (!result.success && this.verbose) {
          console.log(`[ConversationalAgent] Step ${i + 1} failed: ${result.error}`);
        }
      }

      // Step 3: Synthesize response
      const response = await this.synthesizeResponse(userInput, plan, results);

      // Add to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        plan,
        results,
      });

      const duration = Date.now() - startTime;
      if (this.verbose) {
        console.log(`[ConversationalAgent] Completed in ${duration}ms`);
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const response = `I encountered an error while trying to help: ${errorMessage}`;

      this.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      });

      return response;
    }
  }

  /**
   * Create an execution plan from natural language input.
   * Uses LLM to break down the request into atomic steps.
   */
  private async createPlan(userInput: string): Promise<ExecutionPlan> {
    const systemPrompt = `You are a browser automation planner. Given a user's natural language request,
create a detailed execution plan with atomic steps.

Available actions:
- NAVIGATE: Navigate to a URL
  Parameters: { url: string }
- FIND_AND_CLICK: Find and click an element
  Parameters: { description: string }
- FIND_AND_TYPE: Find an input field and type text
  Parameters: { description: string, text: string }
- PRESS_KEY: Press a keyboard key
  Parameters: { key: string }
- WAIT: Wait for a specified time
  Parameters: { seconds: number }
- EXTRACT_INFO: Extract specific information from the page
  Parameters: { info_type: string }
- VERIFY: Verify a condition is met
  Parameters: { condition: string }

Return a JSON object with this structure:
{
  "goal": "brief description of the overall goal",
  "steps": [
    {
      "action": "ACTION_TYPE",
      "parameters": { ... },
      "reasoning": "why this step is needed"
    }
  ]
}`;

    const userPrompt = `Create an execution plan for this request: ${userInput}`;

    const llmResponse = await this.llmProvider.generate(systemPrompt, userPrompt, {
      json_mode: this.llmProvider.supportsJsonMode(),
    });

    const plan = JSON.parse(llmResponse.content) as ExecutionPlan;

    if (!plan.steps || !Array.isArray(plan.steps)) {
      throw new Error('Invalid plan format: missing steps array');
    }

    return plan;
  }

  /**
   * Execute a single step from the plan.
   */
  private async executeStep(step: PlanStep): Promise<StepResult> {
    const startTime = Date.now();

    try {
      let result: any;
      let snap: Snapshot | undefined;

      switch (step.action) {
        case 'NAVIGATE':
          if (!step.parameters.url) {
            throw new Error('NAVIGATE requires url parameter');
          }
          const navPage = this.browser.getPage();
          if (!navPage) {
            throw new Error('Browser not started. Call start() first.');
          }
          await navPage.goto(step.parameters.url);
          await navPage.waitForLoadState('domcontentloaded');
          snap = await snapshot(this.browser);
          result = { navigated_to: step.parameters.url };
          break;

        case 'FIND_AND_CLICK':
          if (!step.parameters.description) {
            throw new Error('FIND_AND_CLICK requires description parameter');
          }
          const clickResult = await this.sentienceAgent.act(
            `Click on: ${step.parameters.description}`
          );
          result = { clicked: clickResult.success, outcome: clickResult.outcome };
          break;

        case 'FIND_AND_TYPE':
          if (!step.parameters.description || !step.parameters.text) {
            throw new Error('FIND_AND_TYPE requires description and text parameters');
          }
          const typeResult = await this.sentienceAgent.act(
            `Type "${step.parameters.text}" into: ${step.parameters.description}`
          );
          result = { typed: typeResult.success, outcome: typeResult.outcome };
          break;

        case 'PRESS_KEY':
          if (!step.parameters.key) {
            throw new Error('PRESS_KEY requires key parameter');
          }
          const pressPage = this.browser.getPage();
          if (!pressPage) {
            throw new Error('Browser not started. Call start() first.');
          }
          await pressPage.keyboard.press(step.parameters.key);
          snap = await snapshot(this.browser);
          result = { key_pressed: step.parameters.key };
          break;

        case 'WAIT':
          const seconds = step.parameters.seconds ?? 2;
          const waitPage = this.browser.getPage();
          if (!waitPage) {
            throw new Error('Browser not started. Call start() first.');
          }
          await waitPage.waitForTimeout(seconds * 1000);
          snap = await snapshot(this.browser);
          result = { waited_seconds: seconds };
          break;

        case 'EXTRACT_INFO':
          if (!step.parameters.info_type) {
            throw new Error('EXTRACT_INFO requires info_type parameter');
          }
          snap = await snapshot(this.browser);
          const extractedInfo = await this.extractInformation(snap, step.parameters.info_type);
          result = { info: extractedInfo };
          break;

        case 'VERIFY':
          if (!step.parameters.condition) {
            throw new Error('VERIFY requires condition parameter');
          }
          snap = await snapshot(this.browser);
          const verified = await this.verifyCondition(snap, step.parameters.condition);
          result = { verified, condition: step.parameters.condition };
          break;

        default:
          throw new Error(`Unknown action type: ${step.action}`);
      }

      const duration = Date.now() - startTime;
      return {
        success: true,
        action: step.action,
        result,
        snapshot: snap,
        duration_ms: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        action: step.action,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: duration,
      };
    }
  }

  /**
   * Extract specific information from a page snapshot.
   */
  private async extractInformation(snap: Snapshot, infoType: string): Promise<any> {
    const snapText = this.snapshotToText(snap);
    const prompt = `From this webpage snapshot, extract: ${infoType}\n\nSnapshot:\n${snapText.slice(0, 3000)}`;

    const llmResponse = await this.llmProvider.generate(
      'You are a web page information extractor. Extract only the requested information concisely.',
      prompt
    );

    return llmResponse.content.trim();
  }

  /**
   * Verify a condition is met on the current page.
   */
  private async verifyCondition(snap: Snapshot, condition: string): Promise<boolean> {
    const snapText = this.snapshotToText(snap);
    const prompt = `Does this webpage satisfy the following condition: "${condition}"?\n\nRespond with only "yes" or "no".\n\nSnapshot:\n${snapText.slice(0, 3000)}`;

    const llmResponse = await this.llmProvider.generate(
      'You are a web page condition verifier. Respond with only "yes" or "no".',
      prompt
    );

    return llmResponse.content.toLowerCase().includes('yes');
  }

  /**
   * Convert a Snapshot object to text representation for LLM.
   */
  private snapshotToText(snap: Snapshot): string {
    let text = `URL: ${snap.url}\n\nElements:\n`;
    for (const elem of snap.elements.slice(0, 50)) {
      text += `[${elem.id}] ${elem.role || 'element'} ${elem.text || ''}\n`;
    }
    return text;
  }

  /**
   * Synthesize a natural language response from execution results.
   */
  private async synthesizeResponse(
    userInput: string,
    plan: ExecutionPlan,
    results: StepResult[]
  ): Promise<string> {
    const successCount = results.filter(r => r.success).length;

    // Build context from results
    let context = `User request: ${userInput}\n\n`;
    context += `Execution summary: ${successCount}/${results.length} steps succeeded\n\n`;

    for (let i = 0; i < results.length; i++) {
      const step = plan.steps[i];
      const result = results[i];

      context += `Step ${i + 1}: ${step.action}\n`;
      context += `  Reasoning: ${step.reasoning}\n`;
      context += `  Success: ${result.success}\n`;

      if (result.success && result.result) {
        context += `  Result: ${JSON.stringify(result.result, null, 2)}\n`;
      } else if (!result.success && result.error) {
        context += `  Error: ${result.error}\n`;
      }
      context += '\n';
    }

    const systemPrompt = `You are a helpful assistant that summarizes browser automation results.
Given the user's request and execution results, provide a natural, conversational response.
- Be concise but informative
- Mention what was accomplished
- If there were failures, explain them clearly
- If information was extracted, present it clearly`;

    const llmResponse = await this.llmProvider.generate(systemPrompt, context);

    return llmResponse.content.trim();
  }

  /**
   * Chat interface that maintains conversation context.
   * Unlike execute(), this method keeps track of the full conversation
   * and uses it for context in subsequent interactions.
   */
  async chat(message: string): Promise<string> {
    return await this.execute(message);
  }

  /**
   * Get a summary of the entire conversation session.
   */
  async getSummary(): Promise<string> {
    if (this.conversationHistory.length === 0) {
      return 'No conversation history yet.';
    }

    const context = this.conversationHistory
      .map((entry, i) => {
        let text = `${i + 1}. [${entry.role}]: ${entry.content}`;
        if (entry.plan) {
          text += ` (${entry.plan.steps.length} steps)`;
        }
        return text;
      })
      .join('\n');

    const systemPrompt = `You are summarizing a browser automation conversation session.
Provide a brief summary of what was accomplished.`;

    const llmResponse = await this.llmProvider.generate(
      systemPrompt,
      `Summarize this conversation:\n\n${context}`
    );

    return llmResponse.content.trim();
  }

  /**
   * Clear conversation history.
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Get the conversation history.
   */
  getHistory(): ConversationEntry[] {
    return [...this.conversationHistory];
  }

  /**
   * Get token usage statistics from the underlying agent.
   */
  getTokenStats() {
    return this.sentienceAgent.getTokenStats();
  }
}
