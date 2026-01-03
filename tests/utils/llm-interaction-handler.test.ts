/**
 * Tests for LLMInteractionHandler utility
 */

import { LLMInteractionHandler } from '../../src/utils/llm-interaction-handler';
import { LLMProvider, LLMResponse } from '../../src/llm-provider';
import { Snapshot, Element, BBox, VisualCues } from '../../src/types';

/**
 * Mock LLM provider for testing
 */
class MockLLMProvider extends LLMProvider {
  private responses: LLMResponse[] = [];
  private callCount: number = 0;

  constructor(responses: LLMResponse[] = []) {
    super();
    this.responses =
      responses.length > 0 ? responses : [{ content: 'CLICK(1)', modelName: 'mock-model' }];
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
    options?: Record<string, any>
  ): Promise<LLMResponse> {
    const response = this.responses[this.callCount % this.responses.length];
    this.callCount++;
    return response;
  }

  supportsJsonMode(): boolean {
    return true;
  }

  get modelName(): string {
    return 'mock-model';
  }
}

describe('LLMInteractionHandler', () => {
  let handler: LLMInteractionHandler;
  let mockLLM: MockLLMProvider;

  beforeEach(() => {
    mockLLM = new MockLLMProvider();
    handler = new LLMInteractionHandler(mockLLM, false);
  });

  describe('buildContext', () => {
    it('should build context string from snapshot', () => {
      const elements: Element[] = [
        {
          id: 1,
          role: 'button',
          text: 'Click me',
          importance: 0.9,
          bbox: { x: 10, y: 20, width: 100, height: 30 },
          visual_cues: {
            is_primary: true,
            background_color_name: 'blue',
            is_clickable: true,
          },
          in_viewport: true,
          is_occluded: false,
          z_index: 1,
        },
      ];

      const snap: Snapshot = {
        status: 'success',
        url: 'https://example.com',
        elements,
      };

      const context = handler.buildContext(snap, 'test goal');

      expect(context).toContain('[1]');
      expect(context).toContain('<button>');
      expect(context).toContain('"Click me"');
      expect(context).toContain('PRIMARY');
      expect(context).toContain('CLICKABLE');
      expect(context).toContain('color:blue');
    });

    it('should truncate long text', () => {
      const longText = 'a'.repeat(100);
      const elements: Element[] = [
        {
          id: 1,
          role: 'button',
          text: longText,
          importance: 0.9,
          bbox: { x: 10, y: 20, width: 100, height: 30 },
          visual_cues: {
            is_primary: false,
            background_color_name: null,
            is_clickable: true,
          },
          in_viewport: true,
          is_occluded: false,
          z_index: 1,
        },
      ];

      const snap: Snapshot = {
        status: 'success',
        url: 'https://example.com',
        elements,
      };

      const context = handler.buildContext(snap, 'test');
      const match = context.match(/"([^"]+)"/);
      expect(match).toBeTruthy();
      expect(match![1].length).toBeLessThanOrEqual(53); // 50 chars + "..."
    });
  });

  describe('queryLLM', () => {
    it('should query LLM with context and goal', async () => {
      const response: LLMResponse = {
        content: 'CLICK(1)',
        modelName: 'mock-model',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      };
      mockLLM = new MockLLMProvider([response]);
      handler = new LLMInteractionHandler(mockLLM, false);

      const result = await handler.queryLLM('test context', 'test goal');

      expect(result.content).toBe('CLICK(1)');
      expect(result.modelName).toBe('mock-model');
    });

    it('should handle LLM errors gracefully', async () => {
      const errorLLM = {
        generate: async () => {
          throw new Error('LLM error');
        },
        modelName: 'error-model',
        supportsJsonMode: () => false,
      } as any;

      handler = new LLMInteractionHandler(errorLLM, false);

      const result = await handler.queryLLM('context', 'goal');

      expect(result.content).toContain('Error:');
      expect(result.modelName).toBe('error-model');
    });
  });

  describe('extractAction', () => {
    it('should extract action from LLM response', () => {
      const response: LLMResponse = {
        content: '  CLICK(42)  ',
        modelName: 'mock-model',
      };

      const action = handler.extractAction(response);

      expect(action).toBe('CLICK(42)');
    });

    it('should handle empty response', () => {
      const response: LLMResponse = {
        content: '',
        modelName: 'mock-model',
      };

      const action = handler.extractAction(response);

      expect(action).toBe('');
    });
  });
});
