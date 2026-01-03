/**
 * LLMResponseBuilder - Helper for consistent LLM response building
 *
 * Provides standardized response building and error handling across LLM providers
 */

import { LLMResponse } from '../llm-provider';

/**
 * LLMResponseBuilder provides static methods for building and validating LLM responses
 */
export class LLMResponseBuilder {
  /**
   * Build a standardized LLMResponse from provider-specific response data
   *
   * @param content - Response content text
   * @param modelName - Model name/identifier
   * @param usage - Token usage data (provider-specific format)
   * @param providerType - Provider type for usage extraction
   * @returns Standardized LLMResponse
   *
   * @example
   * ```typescript
   * // OpenAI format
   * const response = LLMResponseBuilder.build(
   *   'CLICK(1)',
   *   'gpt-4o',
   *   { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
   *   'openai'
   * );
   *
   * // Anthropic format
   * const response = LLMResponseBuilder.build(
   *   'CLICK(1)',
   *   'claude-3-5-sonnet',
   *   { input_tokens: 100, output_tokens: 20 },
   *   'anthropic'
   * );
   * ```
   */
  static build(
    content: string,
    modelName: string,
    usage: any,
    providerType: 'openai' | 'anthropic' | 'glm' | 'gemini' | 'generic' = 'generic'
  ): LLMResponse {
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let totalTokens: number | undefined;

    switch (providerType) {
      case 'openai':
        promptTokens = usage?.prompt_tokens;
        completionTokens = usage?.completion_tokens;
        totalTokens = usage?.total_tokens;
        break;
      case 'anthropic':
        promptTokens = usage?.input_tokens;
        completionTokens = usage?.output_tokens;
        totalTokens = (usage?.input_tokens || 0) + (usage?.output_tokens || 0);
        break;
      case 'glm':
        promptTokens = usage?.prompt_tokens;
        completionTokens = usage?.completion_tokens;
        totalTokens = usage?.total_tokens;
        break;
      case 'gemini':
        promptTokens = usage?.promptTokenCount;
        completionTokens = usage?.candidatesTokenCount;
        totalTokens = usage?.totalTokenCount;
        break;
      case 'generic':
      default:
        // Try common field names
        promptTokens = usage?.prompt_tokens || usage?.input_tokens || usage?.promptTokenCount;
        completionTokens =
          usage?.completion_tokens || usage?.output_tokens || usage?.candidatesTokenCount;
        totalTokens =
          usage?.total_tokens ||
          usage?.totalTokenCount ||
          (promptTokens || 0) + (completionTokens || 0);
        break;
    }

    return {
      content: content || '',
      promptTokens,
      completionTokens,
      totalTokens,
      modelName,
    };
  }

  /**
   * Validate that an LLMResponse has required fields
   *
   * @param response - LLMResponse to validate
   * @returns True if valid, false otherwise
   */
  static validate(response: LLMResponse): boolean {
    if (!response || typeof response.content !== 'string') {
      return false;
    }
    if (response.modelName && typeof response.modelName !== 'string') {
      return false;
    }
    // Token counts are optional but should be numbers if present
    if (response.promptTokens !== undefined && typeof response.promptTokens !== 'number') {
      return false;
    }
    if (response.completionTokens !== undefined && typeof response.completionTokens !== 'number') {
      return false;
    }
    if (response.totalTokens !== undefined && typeof response.totalTokens !== 'number') {
      return false;
    }
    return true;
  }

  /**
   * Create an error response
   *
   * @param error - Error message or Error object
   * @param modelName - Optional model name
   * @returns LLMResponse with error content
   */
  static createErrorResponse(error: string | Error, modelName?: string): LLMResponse {
    const errorMessage = error instanceof Error ? error.message : error;
    return {
      content: `Error: ${errorMessage}`,
      modelName: modelName || 'unknown',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
  }
}
