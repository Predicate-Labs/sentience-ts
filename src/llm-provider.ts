/**
 * LLM Provider Abstraction - BYOB (Bring Your Own Brain)
 * Enables pluggable LLM support for SentienceAgent
 */

/**
 * Response from LLM provider
 */
export interface LLMResponse {
  content: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  modelName?: string;
}

/**
 * Abstract base class for LLM providers
 * Implement this to integrate any LLM (OpenAI, Anthropic, Local, etc.)
 */
export abstract class LLMProvider {
  /**
   * Generate LLM response from prompts
   * @param systemPrompt - System/instruction prompt
   * @param userPrompt - User query prompt
   * @param options - Additional provider-specific options
   */
  abstract generate(
    systemPrompt: string,
    userPrompt: string,
    options?: Record<string, any>
  ): Promise<LLMResponse>;

  /**
   * Whether this provider supports JSON mode (structured output)
   */
  abstract supportsJsonMode(): boolean;

  /**
   * Get the model name/identifier
   */
  abstract get modelName(): string;
}

/**
 * OpenAI Provider (GPT-4, GPT-4o, etc.)
 * Requires: npm install openai
 */
export class OpenAIProvider extends LLMProvider {
  private client: any;
  private _modelName: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    super();

    // Lazy import to avoid requiring openai package if not used
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { OpenAI } = require('openai');
      this.client = new OpenAI({ apiKey });
    } catch (error) {
      throw new Error(
        'OpenAI package not installed. Run: npm install openai'
      );
    }

    this._modelName = model;
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
    options: Record<string, any> = {}
  ): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: this._modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: options.temperature ?? 0.0,
      ...options
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content || '',
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      modelName: this._modelName
    };
  }

  supportsJsonMode(): boolean {
    return true;
  }

  get modelName(): string {
    return this._modelName;
  }
}

/**
 * Anthropic Provider (Claude 3.5 Sonnet, etc.)
 * Requires: npm install @anthropic-ai/sdk
 */
export class AnthropicProvider extends LLMProvider {
  private client: any;
  private _modelName: string;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20241022') {
    super();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Anthropic } = require('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey });
    } catch (error) {
      throw new Error(
        'Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk'
      );
    }

    this._modelName = model;
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
    options: Record<string, any> = {}
  ): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: this._modelName,
      max_tokens: options.max_tokens ?? 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      temperature: options.temperature ?? 0.0,
      ...options
    });

    const content = response.content[0].text;
    return {
      content,
      promptTokens: response.usage?.input_tokens,
      completionTokens: response.usage?.output_tokens,
      totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      modelName: this._modelName
    };
  }

  supportsJsonMode(): boolean {
    // Claude supports structured output but not via "json_mode" flag
    return false;
  }

  get modelName(): string {
    return this._modelName;
  }
}
