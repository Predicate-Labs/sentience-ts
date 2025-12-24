/**
 * Tests for ConversationalAgent (Level 3)
 */

import {
  ConversationalAgent,
  ExecutionPlan,
  PlanStep,
  StepResult
} from '../src/conversational-agent';
import { LLMProvider, LLMResponse } from '../src/llm-provider';
import { SentienceBrowser } from '../src/browser';
import { Snapshot, Element, BBox, VisualCues, Viewport } from '../src/types';
import * as snapshotModule from '../src/snapshot';
import * as agentModule from '../src/agent';

/**
 * Mock LLM provider that returns predefined responses
 */
class MockLLMProvider extends LLMProvider {
  private responses: string[];
  private callCount: number;

  constructor(responses: string[] = []) {
    super();
    this.responses = responses;
    this.callCount = 0;
  }

  async generate(
    systemPrompt: string,
    userPrompt: string,
    options?: Record<string, any>
  ): Promise<LLMResponse> {
    const response = this.responses[this.callCount % this.responses.length];
    this.callCount++;

    return {
      content: response,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      modelName: 'mock-model'
    };
  }

  supportsJsonMode(): boolean {
    return true;
  }

  get modelName(): string {
    return 'mock-model';
  }
}

/**
 * Create mock browser
 */
function createMockBrowser(): SentienceBrowser {
  const mockPage = {
    url: jest.fn().mockReturnValue('https://example.com'),
    goto: jest.fn().mockResolvedValue(undefined)
  };

  const browser = {
    getPage: jest.fn().mockReturnValue(mockPage)
  } as any;

  return browser;
}

/**
 * Create mock snapshot
 */
function createMockSnapshot(): Snapshot {
  const elements: Element[] = [
    {
      id: 1,
      role: 'button',
      text: 'Search',
      importance: 900,
      bbox: { x: 100, y: 200, width: 80, height: 30 } as BBox,
      visual_cues: {
        is_primary: true,
        is_clickable: true,
        background_color_name: 'blue'
      } as VisualCues,
      in_viewport: true,
      is_occluded: false,
      z_index: 10
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
        background_color_name: null
      } as VisualCues,
      in_viewport: true,
      is_occluded: false,
      z_index: 5
    }
  ];

  return {
    status: 'success',
    timestamp: '2024-12-24T10:00:00Z',
    url: 'https://example.com',
    viewport: { width: 1920, height: 1080 } as Viewport,
    elements
  };
}

describe('ConversationalAgent', () => {
  describe('initialization', () => {
    it('should initialize agent', () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();

      const agent = new ConversationalAgent(browser, llm, false);

      expect(agent).toBeDefined();
      expect(agent.getHistory()).toEqual([]);
    });
  });

  describe('createPlan', () => {
    it('should create execution plan from LLM', async () => {
      const browser = createMockBrowser();

      const planJson = JSON.stringify({
        intent: 'Search for laptops',
        steps: [
          {
            action: 'FIND_AND_CLICK',
            description: 'Click the search box',
            parameters: { element_description: 'search box' }
          },
          {
            action: 'FIND_AND_TYPE',
            description: 'Type "laptops"',
            parameters: { element_description: 'search box', text: 'laptops' }
          },
          {
            action: 'PRESS_KEY',
            description: 'Press Enter',
            parameters: { key: 'Enter' }
          }
        ],
        expected_outcome: 'Search results for laptops displayed'
      });

      const llm = new MockLLMProvider([planJson]);
      const agent = new ConversationalAgent(browser, llm, false);

      const plan = await (agent as any).createPlan('Search for laptops');

      expect(plan.intent).toBe('Search for laptops');
      expect(plan.steps.length).toBe(3);
      expect(plan.steps[0].action).toBe('FIND_AND_CLICK');
      expect(plan.steps[1].action).toBe('FIND_AND_TYPE');
      expect(plan.steps[2].action).toBe('PRESS_KEY');
    });

    it('should handle JSON parse failure with fallback', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider(['invalid json {']);
      const agent = new ConversationalAgent(browser, llm, false);

      const plan = await (agent as any).createPlan('Click button');

      // Should create fallback plan
      expect(plan.intent).toBe('Click button');
      expect(plan.steps.length).toBe(1);
      expect(plan.steps[0].action).toBe('FIND_AND_CLICK');
    });
  });

  describe('executeStep', () => {
    it('should execute NAVIGATE action', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new ConversationalAgent(browser, llm, false);

      const step: PlanStep = {
        action: 'NAVIGATE',
        description: 'Go to google.com',
        parameters: { url: 'google.com' }
      };

      const result = await (agent as any).executeStep(step);

      expect(result.success).toBe(true);
      expect(result.action).toBe('NAVIGATE');
      expect(result.data.url).toBe('https://google.com');
      expect(browser.getPage().goto).toHaveBeenCalledWith(
        'https://google.com',
        { waitUntil: 'domcontentloaded' }
      );
    });

    it('should execute FIND_AND_CLICK action', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider(['CLICK(1)']);
      const agent = new ConversationalAgent(browser, llm, false);

      // Mock snapshot and click
      jest.spyOn(snapshotModule, 'snapshot').mockResolvedValue(createMockSnapshot());
      const mockClick = jest.spyOn(require('../src/actions'), 'click').mockResolvedValue({
        success: true,
        duration_ms: 100,
        outcome: 'dom_updated'
      });

      const step: PlanStep = {
        action: 'FIND_AND_CLICK',
        description: 'Click the search button',
        parameters: { element_description: 'search button' }
      };

      const result = await (agent as any).executeStep(step);

      expect(result.success).toBe(true);
      expect(result.action).toBe('FIND_AND_CLICK');
    });

    it('should execute FIND_AND_TYPE action', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider(['TYPE(2, "laptops")']);
      const agent = new ConversationalAgent(browser, llm, false);

      // Mock snapshot and typeText
      jest.spyOn(snapshotModule, 'snapshot').mockResolvedValue(createMockSnapshot());
      jest.spyOn(require('../src/actions'), 'typeText').mockResolvedValue({
        success: true,
        duration_ms: 150,
        outcome: 'dom_updated'
      });

      const step: PlanStep = {
        action: 'FIND_AND_TYPE',
        description: 'Type "laptops"',
        parameters: { element_description: 'search box', text: 'laptops' }
      };

      const result = await (agent as any).executeStep(step);

      expect(result.success).toBe(true);
      expect(result.action).toBe('FIND_AND_TYPE');
      expect(result.data.text).toBe('laptops');
    });

    it('should execute PRESS_KEY action', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider(['PRESS("Enter")']);
      const agent = new ConversationalAgent(browser, llm, false);

      // Mock snapshot and press
      jest.spyOn(snapshotModule, 'snapshot').mockResolvedValue(createMockSnapshot());
      jest.spyOn(require('../src/actions'), 'press').mockResolvedValue({
        success: true,
        duration_ms: 50,
        outcome: 'dom_updated'
      });

      const step: PlanStep = {
        action: 'PRESS_KEY',
        description: 'Press Enter',
        parameters: { key: 'Enter' }
      };

      const result = await (agent as any).executeStep(step);

      expect(result.success).toBe(true);
      expect(result.action).toBe('PRESS_KEY');
      expect(result.data.key).toBe('Enter');
    });

    it('should execute WAIT action', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new ConversationalAgent(browser, llm, false);

      const step: PlanStep = {
        action: 'WAIT',
        description: 'Wait 1 second',
        parameters: { duration: 0.1 } // 0.1 seconds for fast test
      };

      const startTime = Date.now();
      const result = await (agent as any).executeStep(step);
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.action).toBe('WAIT');
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some margin
    });

    it('should execute EXTRACT_INFO action', async () => {
      const browser = createMockBrowser();

      const extractionResult = JSON.stringify({
        found: true,
        data: { price: '$79.99' },
        summary: 'Found price $79.99'
      });

      const llm = new MockLLMProvider([extractionResult]);
      const agent = new ConversationalAgent(browser, llm, false);

      // Mock snapshot
      jest.spyOn(snapshotModule, 'snapshot').mockResolvedValue(createMockSnapshot());

      const step: PlanStep = {
        action: 'EXTRACT_INFO',
        description: 'Extract product price',
        parameters: { info_type: 'product price' }
      };

      const result = await (agent as any).executeStep(step);

      expect(result.success).toBe(true);
      expect(result.action).toBe('EXTRACT_INFO');
      expect(result.data.extracted.found).toBe(true);
      expect(result.data.extracted.data.price).toBe('$79.99');
    });

    it('should execute VERIFY action', async () => {
      const browser = createMockBrowser();

      const verifyResult = JSON.stringify({
        verified: true,
        reasoning: 'Search results are visible'
      });

      const llm = new MockLLMProvider([verifyResult]);
      const agent = new ConversationalAgent(browser, llm, false);

      // Mock snapshot
      jest.spyOn(snapshotModule, 'snapshot').mockResolvedValue(createMockSnapshot());

      const step: PlanStep = {
        action: 'VERIFY',
        description: 'Verify results appeared',
        parameters: { condition: 'page contains search results' }
      };

      const result = await (agent as any).executeStep(step);

      expect(result.success).toBe(true);
      expect(result.action).toBe('VERIFY');
      expect(result.data.verified).toBe(true);
    });
  });

  describe('execute full flow', () => {
    it('should execute complete natural language command', async () => {
      const browser = createMockBrowser();

      const planJson = JSON.stringify({
        intent: 'Search for laptops',
        steps: [
          {
            action: 'FIND_AND_CLICK',
            description: 'Click search box',
            parameters: { element_description: 'search box' }
          }
        ],
        expected_outcome: 'Search initiated'
      });

      const synthesisResponse = 'I clicked the search box successfully.';

      const llm = new MockLLMProvider([
        planJson,         // For createPlan
        'CLICK(1)',       // For FIND_AND_CLICK
        synthesisResponse // For synthesizeResponse
      ]);

      const agent = new ConversationalAgent(browser, llm, false);

      // Mock snapshot and actions
      jest.spyOn(snapshotModule, 'snapshot').mockResolvedValue(createMockSnapshot());
      jest.spyOn(require('../src/actions'), 'click').mockResolvedValue({
        success: true,
        duration_ms: 100,
        outcome: 'dom_updated'
      });

      const result = await agent.execute('Click the search box');

      expect(result).toContain('search box');
      expect(agent.getHistory().length).toBe(1);
      expect(agent.getHistory()[0].user_input).toBe('Click the search box');
    });

    it('should handle step failure gracefully', async () => {
      const browser = createMockBrowser();

      const planJson = JSON.stringify({
        intent: 'Click button',
        steps: [
          {
            action: 'FIND_AND_CLICK',
            description: 'Click button',
            parameters: { element_description: 'button' }
          }
        ],
        expected_outcome: 'Button clicked'
      });

      const synthesisResponse = 'I attempted to click the button but encountered an error.';

      const llm = new MockLLMProvider([
        planJson,
        'CLICK(999)',     // Invalid element ID
        synthesisResponse
      ]);

      const agent = new ConversationalAgent(browser, llm, false);

      // Mock snapshot and failing click
      jest.spyOn(snapshotModule, 'snapshot').mockResolvedValue(createMockSnapshot());
      jest.spyOn(require('../src/actions'), 'click').mockResolvedValue({
        success: false,
        duration_ms: 100,
        outcome: 'error',
        error: 'Element not found'
      });

      const result = await agent.execute('Click the button');

      // Should return error message
      expect(result).toBeTruthy();
      expect(agent.getHistory().length).toBe(1);
    });
  });

  describe('conversation history', () => {
    it('should track conversation history', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider([
        JSON.stringify({ intent: 'test', steps: [], expected_outcome: 'done' }),
        'Done'
      ]);
      const agent = new ConversationalAgent(browser, llm, false);

      await agent.execute('Test command');

      const history = agent.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].user_input).toBe('Test command');
      expect(history[0].response).toBeTruthy();
      expect(history[0].duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should clear history', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider([
        JSON.stringify({ intent: 'test', steps: [], expected_outcome: 'done' }),
        'Done'
      ]);
      const agent = new ConversationalAgent(browser, llm, false);

      await agent.execute('Test command');
      expect(agent.getHistory().length).toBe(1);

      agent.clearHistory();
      expect(agent.getHistory().length).toBe(0);
    });
  });

  describe('chat method', () => {
    it('should work as alias for execute', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider([
        JSON.stringify({ intent: 'test', steps: [], expected_outcome: 'done' }),
        'Done'
      ]);
      const agent = new ConversationalAgent(browser, llm, false);

      const result = await agent.chat('Test message');

      expect(result).toBeTruthy();
      expect(agent.getHistory().length).toBe(1);
    });
  });

  describe('getSummary', () => {
    it('should return summary of session', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider([
        JSON.stringify({ intent: 'test', steps: [], expected_outcome: 'done' }),
        'Done',
        'Session summary: Completed 1 action successfully.'
      ]);
      const agent = new ConversationalAgent(browser, llm, false);

      await agent.execute('Test command');

      const summary = await agent.getSummary();

      expect(summary).toBeTruthy();
      expect(
        summary.toLowerCase().includes('session') ||
        summary.toLowerCase().includes('completed') ||
        summary.toLowerCase().includes('action')
      ).toBe(true);
    });

    it('should handle empty history', async () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new ConversationalAgent(browser, llm, false);

      const summary = await agent.getSummary();

      expect(summary).toBe('No actions have been performed yet.');
    });
  });

  describe('getTokenStats', () => {
    it('should return token stats from technical agent', () => {
      const browser = createMockBrowser();
      const llm = new MockLLMProvider();
      const agent = new ConversationalAgent(browser, llm, false);

      const stats = agent.getTokenStats();

      expect(stats).toBeDefined();
      expect(stats.totalTokens).toBeDefined();
    });
  });
});
