/**
 * Tests for LLMResponseBuilder utility
 */

import { LLMResponseBuilder } from '../../src/utils/llm-response-builder';
import { LLMResponse } from '../../src/llm-provider';

describe('LLMResponseBuilder', () => {
  describe('build', () => {
    it('should build response from OpenAI format', () => {
      const response = LLMResponseBuilder.build(
        'CLICK(1)',
        'gpt-4o',
        { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        'openai'
      );

      expect(response.content).toBe('CLICK(1)');
      expect(response.modelName).toBe('gpt-4o');
      expect(response.promptTokens).toBe(100);
      expect(response.completionTokens).toBe(20);
      expect(response.totalTokens).toBe(120);
    });

    it('should build response from Anthropic format', () => {
      const response = LLMResponseBuilder.build(
        'CLICK(1)',
        'claude-3-5-sonnet',
        { input_tokens: 100, output_tokens: 20 },
        'anthropic'
      );

      expect(response.content).toBe('CLICK(1)');
      expect(response.modelName).toBe('claude-3-5-sonnet');
      expect(response.promptTokens).toBe(100);
      expect(response.completionTokens).toBe(20);
      expect(response.totalTokens).toBe(120);
    });

    it('should build response from generic format', () => {
      const response = LLMResponseBuilder.build(
        'CLICK(1)',
        'generic-model',
        { prompt_tokens: 50, completion_tokens: 10 },
        'generic'
      );

      expect(response.content).toBe('CLICK(1)');
      expect(response.promptTokens).toBe(50);
      expect(response.completionTokens).toBe(10);
      expect(response.totalTokens).toBe(60);
    });
  });

  describe('validate', () => {
    it('should validate correct response', () => {
      const response: LLMResponse = {
        content: 'CLICK(1)',
        modelName: 'test-model',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      };

      expect(LLMResponseBuilder.validate(response)).toBe(true);
    });

    it('should reject response without content', () => {
      const response: any = {
        modelName: 'test-model',
      };

      expect(LLMResponseBuilder.validate(response)).toBe(false);
    });

    it('should reject response with invalid token counts', () => {
      const response: any = {
        content: 'CLICK(1)',
        promptTokens: 'invalid',
      };

      expect(LLMResponseBuilder.validate(response)).toBe(false);
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response from string', () => {
      const response = LLMResponseBuilder.createErrorResponse('Test error', 'test-model');

      expect(response.content).toContain('Error: Test error');
      expect(response.modelName).toBe('test-model');
      expect(response.promptTokens).toBe(0);
    });

    it('should create error response from Error object', () => {
      const error = new Error('Test error');
      const response = LLMResponseBuilder.createErrorResponse(error);

      expect(response.content).toContain('Error: Test error');
      expect(response.modelName).toBe('unknown');
    });
  });
});
