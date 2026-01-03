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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { OpenAI } = require('openai');
      this.client = new OpenAI({ apiKey });
    } catch {
      throw new Error('OpenAI package not installed. Run: npm install openai');
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
        { role: 'user', content: userPrompt },
      ],
      temperature: options.temperature ?? 0.0,
      ...options,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content || '',
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      modelName: this._modelName,
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Anthropic } = require('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey });
    } catch {
      throw new Error('Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk');
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
      messages: [{ role: 'user', content: userPrompt }],
      temperature: options.temperature ?? 0.0,
      ...options,
    });

    const content = response.content[0].text;
    return {
      content,
      promptTokens: response.usage?.input_tokens,
      completionTokens: response.usage?.output_tokens,
      totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      modelName: this._modelName,
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

/**
 * Zhipu AI GLM Provider (GLM-4, GLM-4-Plus, etc.)
 *
 * Requirements:
 *   npm install zhipuai-sdk-nodejs-v4
 */
export class GLMProvider extends LLMProvider {
  private client: any;
  private _modelName: string;

  constructor(apiKey: string, model: string = 'glm-4-plus') {
    super();

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ZhipuAI = require('zhipuai-sdk-nodejs-v4');
      this.client = new ZhipuAI({ apiKey });
    } catch {
      throw new Error('ZhipuAI SDK not installed. Run: npm install zhipuai-sdk-nodejs-v4');
    }

    this._modelName = model;
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
    options: Record<string, any> = {}
  ): Promise<LLMResponse> {
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const response = await this.client.chat.completions.create({
      model: this._modelName,
      messages,
      temperature: options.temperature ?? 0.0,
      max_tokens: options.max_tokens,
      ...options,
    });

    const choice = response.choices[0];
    const usage = response.usage;

    return {
      content: choice.message?.content || '',
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      totalTokens: usage?.total_tokens,
      modelName: this._modelName,
    };
  }

  supportsJsonMode(): boolean {
    // GLM-4 models support JSON mode
    return this._modelName.toLowerCase().includes('glm-4');
  }

  get modelName(): string {
    return this._modelName;
  }
}

/**
 * Google Gemini Provider (Gemini 2.0, Gemini 1.5 Pro, etc.)
 *
 * Requirements:
 *   npm install @google/generative-ai
 */
export class GeminiProvider extends LLMProvider {
  private model: any;
  private _modelName: string;

  constructor(apiKey: string, model: string = 'gemini-2.0-flash-exp') {
    super();

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ model });
    } catch {
      throw new Error(
        'Google Generative AI SDK not installed. Run: npm install @google/generative-ai'
      );
    }

    this._modelName = model;
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
    options: Record<string, any> = {}
  ): Promise<LLMResponse> {
    // Combine system and user prompts (Gemini doesn't have separate system role in all versions)
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;

    // Build generation config
    const generationConfig: any = {
      temperature: options.temperature ?? 0.0,
    };

    if (options.max_tokens) {
      generationConfig.maxOutputTokens = options.max_tokens;
    }

    // Merge additional parameters
    Object.assign(generationConfig, options);

    // Call Gemini API
    const result = await this.model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig,
    });

    const response = result.response;
    const content = response.text() || '';

    // Extract token usage if available
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let totalTokens: number | undefined;

    if (response.usageMetadata) {
      promptTokens = response.usageMetadata.promptTokenCount;
      completionTokens = response.usageMetadata.candidatesTokenCount;
      totalTokens = response.usageMetadata.totalTokenCount;
    }

    return {
      content,
      promptTokens,
      completionTokens,
      totalTokens,
      modelName: this._modelName,
    };
  }

  supportsJsonMode(): boolean {
    // Gemini 1.5+ models support JSON mode via response_mime_type
    const modelLower = this._modelName.toLowerCase();
    return modelLower.includes('gemini-1.5') || modelLower.includes('gemini-2.0');
  }

  get modelName(): string {
    return this._modelName;
  }
}
