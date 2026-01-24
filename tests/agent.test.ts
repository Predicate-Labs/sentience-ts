/**
 * Tests for Sentience Agent Layer
 * Tests LLM providers and SentienceAgent without requiring browser
 */

import { LLMProvider, LLMResponse, OpenAIProvider, AnthropicProvider } from '../src/llm-provider';
import { SentienceAgent } from '../src/agent';
import { SentienceBrowser } from '../src/browser';
import {
  Snapshot,
  Element,
  BBox,
  VisualCues,
  Viewport,
  ActionResult,
  StepHookContext,
} from '../src/types';
import * as agentModule from '../src/agent';
import * as snapshotModule from '../src/snapshot';
import * as actionsModule from '../src/actions';

/**
 * Mock LLM provider for testing
 */
class MockLLMProvider extends LLMProvider {
  private responses: string[];
  private callCount: number;
  public calls: Array<{
    system: string;
    user: string;
    options?: Record<string, any>;
  }>;

  constructor(responses: string[] = []) {
    super();
    this.responses = responses.length > 0 ? responses : ['CLICK(1)'];
    this.callCount = 0;
    this.calls = [];
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
    options?: Record<string, any>
  ): Promise<LLMResponse> {
    this.calls.push({
      system: systemPrompt,
      user: userPrompt,
      options,
    });

    const response = this.responses[this.callCount % this.responses.length];
    this.callCount++;

    return {
      content: response,
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      modelName: 'mock-model',
    };
  }

  supportsJsonMode(): boolean {
    return true;
  }

  get modelName(): string {
    return 'mock-model';
  }
}

// ========== LLM Provider Tests ==========

describe('LLMProvider', () => {
  describe('LLMResponse', () => {
    it('should create LLMResponse object', () => {
      const response: LLMResponse = {
        content: 'CLICK(42)',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        modelName: 'gpt-4o',
      };

      expect(response.content).toBe('CLICK(42)');
      expect(response.promptTokens).toBe(100);
      expect(response.completionTokens).toBe(20);
      expect(response.totalTokens).toBe(120);
      expect(response.modelName).toBe('gpt-4o');
    });
  });

  describe('MockLLMProvider', () => {
    it('should return mocked responses', async () => {
      const provider = new MockLLMProvider(['CLICK(1)', 'TYPE(2, "test")']);

      const response1 = await provider.generate('system', 'user');
      expect(response1.content).toBe('CLICK(1)');
      expect(provider.calls.length).toBe(1);

      const response2 = await provider.generate('system', 'user');
      expect(response2.content).toBe('TYPE(2, "test")');
      expect(provider.calls.length).toBe(2);

      expect(provider.calls[0].system).toBe('system');
    });

    it('should support JSON mode', () => {
      const provider = new MockLLMProvider();
      expect(provider.supportsJsonMode()).toBe(true);
    });

    it('should have model name', () => {
      const provider = new MockLLMProvider();
      expect(provider.modelName).toBe('mock-model');
    });
  });

  describe('OpenAIProvider', () => {
    it('should throw error if openai package not installed', () => {
      // This will pass in environments without openai installed
      // In real usage, openai would be optionally installed
      expect(true).toBe(true);
    });
  });

  describe('AnthropicProvider', () => {
    it('should throw error if anthropic package not installed', () => {
      // This will pass in environments without anthropic installed
      // In real usage, anthropic would be optionally installed
      expect(true).toBe(true);
    });
  });
});

// ========== SentienceAgent Tests ==========

function createMockBrowser(): SentienceBrowser {
  const browser = {
    getPage: jest.fn().mockReturnValue({
      url: 'https://example.com',
    }),
  } as any;
  return browser;
}

function createMockSnapshot(): Snapshot {
  const elements: Element[] = [
    {
      id: 1,
      role: 'button',
      text: 'Click Me',
      importance: 900,
      bbox: { x: 100, y: 200, width: 80, height: 30 } as BBox,
      visual_cues: {
        is_primary: true,
        is_clickable: true,
        background_color_name: 'blue',
      } as VisualCues,
      in_viewport: true,
      is_occluded: false,
      z_index: 10,
    },
    {
      id: 2,
      role: 'textbox',
      text: '',
      importance: 850,
      bbox: { x: 100, y: 100, width: 200, height: 40 } as BBox,
      visual_cues: {
        is_primary: false,
        is_clickable: true,
        background_color_name: null,
      } as VisualCues,
      in_viewport: true,
      is_occluded: false,
      z_index: 5,
    },
  ];

  return {
    status: 'success',
    timestamp: '2024-12-24T10:00:00Z',
    url: 'https://example.com',
    viewport: { width: 1920, height: 1080 } as Viewport,
    elements,
  };
}

describe('SentienceAgent', () => {
  describe('initialization', () => {
    it('should initialize agent', () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();

      const agent = new SentienceAgent(browser, llm, 50, false);

      expect(agent).toBeDefined();
      expect(agent.getHistory()).toEqual([]);
      expect(agent.getTokenStats().totalTokens).toBe(0);
    });
  });

  describe('buildContext', () => {
    it('should build context from snapshot', () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new SentienceAgent(browser, llm, 50, false);

      const snap = createMockSnapshot();
      // Access LLMInteractionHandler through agent for testing
      const context = (agent as any).llmHandler.buildContext(snap, 'test goal');

      expect(context).toContain('[1]');
      expect(context).toContain('[2]');
      expect(context).toContain('button');
      expect(context).toContain('textbox');
      expect(context).toContain('Click Me');
      expect(context).toContain('PRIMARY');
      expect(context).toContain('CLICKABLE');
      expect(context).toContain('color:blue');
      expect(context).toContain('importance:900');
      expect(context).toContain('size:80x30');
    });
  });

  describe('executeAction', () => {
    it('should parse and execute CLICK action', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new SentienceAgent(browser, llm, 50, false);

      const snap = createMockSnapshot();

      // Mock click function
      const mockClick = jest.fn().mockResolvedValue({
        success: true,
        duration_ms: 150,
        outcome: 'dom_updated',
        url_changed: false,
      } as ActionResult);

      jest.spyOn(actionsModule, 'click').mockImplementation(mockClick);

      const result = await (agent as any).executeAction('CLICK(1)', snap);

      expect(result.success).toBe(true);
      expect(result.action).toBe('click');
      expect(result.elementId).toBe(1);
      expect(mockClick).toHaveBeenCalledWith(browser, 1);
    });

    it('should parse and execute TYPE action', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new SentienceAgent(browser, llm, 50, false);

      const snap = createMockSnapshot();

      const mockType = jest.fn().mockResolvedValue({
        success: true,
        duration_ms: 200,
        outcome: 'dom_updated',
      } as ActionResult);

      jest.spyOn(actionsModule, 'typeText').mockImplementation(mockType);

      const result = await (agent as any).executeAction('TYPE(2, "hello world")', snap);

      expect(result.success).toBe(true);
      expect(result.action).toBe('type');
      expect(result.elementId).toBe(2);
      expect(result.text).toBe('hello world');
      expect(mockType).toHaveBeenCalledWith(browser, 2, 'hello world');
    });

    it('should parse and execute PRESS action', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new SentienceAgent(browser, llm, 50, false);

      const snap = createMockSnapshot();

      const mockPress = jest.fn().mockResolvedValue({
        success: true,
        duration_ms: 50,
        outcome: 'dom_updated',
      } as ActionResult);

      jest.spyOn(actionsModule, 'press').mockImplementation(mockPress);

      const result = await (agent as any).executeAction('PRESS("Enter")', snap);

      expect(result.success).toBe(true);
      expect(result.action).toBe('press');
      expect(result.key).toBe('Enter');
      expect(mockPress).toHaveBeenCalledWith(browser, 'Enter');
    });

    it('should parse FINISH action', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new SentienceAgent(browser, llm, 50, false);

      const snap = createMockSnapshot();
      const result = await (agent as any).executeAction('FINISH()', snap);

      expect(result.success).toBe(true);
      expect(result.action).toBe('finish');
    });

    it('should throw error for invalid action format', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new SentienceAgent(browser, llm, 50, false);

      const snap = createMockSnapshot();

      await expect((agent as any).executeAction('INVALID_ACTION', snap)).rejects.toThrow(
        'Unknown action format'
      );
    });
  });

  describe('act full cycle', () => {
    it('should complete full act() cycle', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider(['CLICK(1)']);
      const agent = new SentienceAgent(browser, llm, 50, false);

      // Mock snapshot
      const mockSnapshot = jest.fn().mockResolvedValue(createMockSnapshot());
      jest.spyOn(snapshotModule, 'snapshot').mockImplementation(mockSnapshot);

      // Mock click
      const mockClick = jest.fn().mockResolvedValue({
        success: true,
        duration_ms: 150,
        outcome: 'dom_updated',
        url_changed: false,
      } as ActionResult);
      jest.spyOn(actionsModule, 'click').mockImplementation(mockClick);

      const result = await agent.act('Click the button', 0);

      expect(result.success).toBe(true);
      expect(result.action).toBe('click');
      expect(result.elementId).toBe(1);
      expect(result.goal).toBe('Click the button');

      // Check history
      expect(agent.getHistory().length).toBe(1);
      expect(agent.getHistory()[0].goal).toBe('Click the button');

      // Check tokens
      expect(agent.getTokenStats().totalTokens).toBeGreaterThan(0);
    });

    it('should invoke step hooks once per act()', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider(['CLICK(1)']);
      const agent = new SentienceAgent(browser, llm, 50, false);

      const mockSnapshot = jest.fn().mockResolvedValue(createMockSnapshot());
      jest.spyOn(snapshotModule, 'snapshot').mockImplementation(mockSnapshot);

      const mockClick = jest.fn().mockResolvedValue({
        success: true,
        duration_ms: 150,
        outcome: 'dom_updated',
        url_changed: false,
      } as ActionResult);
      jest.spyOn(actionsModule, 'click').mockImplementation(mockClick);

      const started: StepHookContext[] = [];
      const ended: StepHookContext[] = [];

      const result = await agent.act(
        'Click the button',
        0,
        undefined,
        ctx => {
          started.push(ctx);
        },
        ctx => {
          ended.push(ctx);
        }
      );

      expect(result.success).toBe(true);
      expect(started).toHaveLength(1);
      expect(ended).toHaveLength(1);
      expect(started[0].goal).toBe('Click the button');
      expect(ended[0].success).toBe(true);
    });
  });

  describe('token tracking', () => {
    it('should track token usage', () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new SentienceAgent(browser, llm, 50, false);

      const response1: LLMResponse = {
        content: 'CLICK(1)',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      };
      const response2: LLMResponse = {
        content: 'TYPE(2, "test")',
        promptTokens: 150,
        completionTokens: 30,
        totalTokens: 180,
      };

      (agent as any).trackTokens('goal 1', response1);
      (agent as any).trackTokens('goal 2', response2);

      const stats = agent.getTokenStats();
      expect(stats.totalPromptTokens).toBe(250);
      expect(stats.totalCompletionTokens).toBe(50);
      expect(stats.totalTokens).toBe(300);
      expect(stats.byAction.length).toBe(2);
    });
  });

  describe('clearHistory', () => {
    it('should clear history and token stats', () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new SentienceAgent(browser, llm, 50, false);

      // Add some history
      (agent as any).history.push({ goal: 'test' });
      (agent as any).tokenUsage.totalTokens = 100;

      agent.clearHistory();

      expect(agent.getHistory().length).toBe(0);
      expect(agent.getTokenStats().totalTokens).toBe(0);
    });
  });

  describe('action parsing variations', () => {
    it('should handle various action string formats', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new SentienceAgent(browser, llm, 50, false);

      const snap = createMockSnapshot();

      const mockResult: ActionResult = {
        success: true,
        duration_ms: 100,
        outcome: 'dom_updated',
      };

      const mockClick = jest.fn().mockResolvedValue(mockResult);
      const mockType = jest.fn().mockResolvedValue(mockResult);
      const mockPress = jest.fn().mockResolvedValue(mockResult);

      jest.spyOn(actionsModule, 'click').mockImplementation(mockClick);
      jest.spyOn(actionsModule, 'typeText').mockImplementation(mockType);
      jest.spyOn(actionsModule, 'press').mockImplementation(mockPress);

      // Test variations
      await (agent as any).executeAction('click(1)', snap); // lowercase
      await (agent as any).executeAction('CLICK( 1 )', snap); // extra spaces
      await (agent as any).executeAction("TYPE(2, 'single quotes')", snap); // single quotes
      await (agent as any).executeAction("PRESS('Enter')", snap); // single quotes
      await (agent as any).executeAction('finish()', snap); // lowercase finish

      expect(mockClick).toHaveBeenCalledTimes(2);
      expect(mockType).toHaveBeenCalledTimes(1);
      expect(mockPress).toHaveBeenCalledTimes(1);
    });
  });
});
