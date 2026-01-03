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
      expect(context).toContain('@ (10,20)');
      expect(context).toContain('size:100x30');
      expect(context).toContain('importance:0.9');
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

    it('should include status indicators when present', () => {
      const elements: Element[] = [
        {
          id: 1,
          role: 'button',
          text: 'Test',
          importance: 0.9,
          bbox: { x: 10, y: 20, width: 100, height: 30 },
          visual_cues: {
            is_primary: false,
            background_color_name: null,
            is_clickable: true,
          },
          in_viewport: false, // Not in viewport
          is_occluded: true, // Occluded
          z_index: 1,
          diff_status: 'ADDED', // Has diff status
        },
      ];

      const snap: Snapshot = {
        status: 'success',
        url: 'https://example.com',
        elements,
      };

      const context = handler.buildContext(snap, 'test');
      expect(context).toContain('not_in_viewport');
      expect(context).toContain('occluded');
      expect(context).toContain('diff:ADDED');
      expect(context).toContain('size:100x30');
      expect(context).toContain('importance:0.9');
    });

    it('should exclude REMOVED elements from context', () => {
      const elements: Element[] = [
        {
          id: 1,
          role: 'button',
          text: 'Click me',
          importance: 100,
          bbox: { x: 10, y: 20, width: 100, height: 30 },
          visual_cues: {
            is_primary: true,
            background_color_name: 'blue',
            is_clickable: true,
          },
          in_viewport: true,
          is_occluded: false,
          z_index: 1,
          diff_status: undefined,
        },
        {
          id: 6344,
          role: 'button',
          text: '5.0 out of 5 stars Excellent product',
          importance: 0,
          bbox: { x: 429, y: 9175, width: 204, height: 17 },
          visual_cues: {
            is_primary: true,
            background_color_name: 'black',
            is_clickable: true,
          },
          in_viewport: false,
          is_occluded: false,
          z_index: 0,
          diff_status: 'REMOVED', // This should be excluded
        },
      ];

      const snap: Snapshot = {
        status: 'success',
        url: 'https://example.com',
        elements,
      };

      const context = handler.buildContext(snap, 'test goal');

      // Should include normal element
      expect(context).toContain('[1]');
      expect(context).toContain('Click me');

      // Should NOT include REMOVED element
      expect(context).not.toContain('[6344]');
      expect(context).not.toContain('5.0 out of 5 stars');
      expect(context).not.toContain('diff:REMOVED');
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
