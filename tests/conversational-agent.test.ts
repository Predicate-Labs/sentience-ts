/**
 * Tests for ConversationalAgent (Level 4 Abstraction)
 */

import { ConversationalAgent, ExecutionPlan } from '../src/conversational-agent';
import { LLMProvider } from '../src/llm-provider';
import { SentienceBrowser } from '../src/browser';
import { snapshot } from '../src/snapshot';
import { SentienceAgent } from '../src/agent';
import { Snapshot } from '../src/types';

// Mock dependencies
jest.mock('../src/snapshot');
jest.mock('../src/agent');

const mockSnapshot = snapshot as jest.MockedFunction<typeof snapshot>;

describe('ConversationalAgent', () => {
  let mockLLMProvider: jest.Mocked<LLMProvider>;
  let mockBrowser: jest.Mocked<SentienceBrowser>;
  let agent: ConversationalAgent;
  let mockActFn: jest.Mock;

  beforeEach(() => {
    // Mock SentienceAgent.act before creating ConversationalAgent
    const MockedSentienceAgent = SentienceAgent as jest.MockedClass<typeof SentienceAgent>;
    mockActFn = jest.fn().mockResolvedValue({
      success: true,
      outcome: 'Success',
      durationMs: 100,
      attempt: 1,
      goal: 'test',
    });
    MockedSentienceAgent.prototype.act = mockActFn;
    MockedSentienceAgent.prototype.getTokenStats = jest.fn().mockReturnValue({
      totalPromptTokens: 200,
      totalCompletionTokens: 300,
      totalTokens: 500,
      byAction: [],
    });

    // Mock LLM Provider
    mockLLMProvider = {
      generate: jest.fn(),
      supportsJsonMode: jest.fn().mockReturnValue(true),
      modelName: 'test-model',
    } as any;

    // Mock SentienceBrowser
    const mockPage = {
      goto: jest.fn(),
      waitForLoadState: jest.fn(),
      keyboard: {
        press: jest.fn(),
      },
      waitForTimeout: jest.fn(),
    } as any;

    mockBrowser = {
      getPage: jest.fn().mockReturnValue(mockPage),
      getApiKey: jest.fn(),
      getApiUrl: jest.fn(),
    } as any;

    // Mock snapshot function
    const mockSnap: Snapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [
        {
          id: 1,
          role: 'button',
          text: 'Click me',
          importance: 1,
          bbox: { x: 0, y: 0, width: 100, height: 50 },
          visual_cues: { is_primary: true, background_color_name: 'blue', is_clickable: true },
          in_viewport: true,
          is_occluded: false,
          z_index: 1,
        },
        {
          id: 2,
          role: 'textbox',
          text: 'Search',
          importance: 1,
          bbox: { x: 0, y: 100, width: 200, height: 30 },
          visual_cues: { is_primary: false, background_color_name: 'white', is_clickable: true },
          in_viewport: true,
          is_occluded: false,
          z_index: 1,
        },
      ],
    };
    mockSnapshot.mockResolvedValue(mockSnap);

    // Create agent
    agent = new ConversationalAgent({
      llmProvider: mockLLMProvider,
      browser: mockBrowser,
      verbose: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with required parameters', () => {
      expect(agent).toBeInstanceOf(ConversationalAgent);
      expect(agent.getHistory()).toEqual([]);
    });

    test('should initialize with custom options', () => {
      const customAgent = new ConversationalAgent({
        llmProvider: mockLLMProvider,
        browser: mockBrowser,
        verbose: true,
        maxTokens: 8000,
        planningModel: 'gpt-4',
        executionModel: 'gpt-3.5-turbo',
      });

      expect(customAgent).toBeInstanceOf(ConversationalAgent);
    });
  });

  describe('createPlan', () => {
    test('should create a valid execution plan', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Search Google for TypeScript',
        steps: [
          {
            action: 'NAVIGATE',
            parameters: { url: 'https://google.com' },
            reasoning: 'Go to Google homepage',
          },
          {
            action: 'FIND_AND_TYPE',
            parameters: { description: 'search box', text: 'TypeScript' },
            reasoning: 'Enter search term',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValue({
        content: JSON.stringify(mockPlan),
        totalTokens: 100,
      });

      const response = await agent.execute('Search Google for TypeScript');

      expect(mockLLMProvider.generate).toHaveBeenCalled();
      expect(response).toBeTruthy();
    });

    test('should handle planning errors', async () => {
      mockLLMProvider.generate.mockRejectedValue(new Error('LLM API error'));

      const response = await agent.execute('Do something');

      expect(response).toContain('error');
    });
  });

  describe('executeStep - NAVIGATE', () => {
    test('should navigate to a URL', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Navigate to Google',
        steps: [
          {
            action: 'NAVIGATE',
            parameters: { url: 'https://google.com' },
            reasoning: 'Go to Google',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Successfully navigated to Google.',
        totalTokens: 30,
      });

      const response = await agent.execute('Go to Google');

      expect(mockBrowser.getPage().goto).toHaveBeenCalledWith('https://google.com');
      expect(mockBrowser.getPage().waitForLoadState).toHaveBeenCalledWith('domcontentloaded');
      expect(response).toContain('Google');
    });
  });

  describe('executeStep - FIND_AND_CLICK', () => {
    test('should click on an element', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Click the login button',
        steps: [
          {
            action: 'FIND_AND_CLICK',
            parameters: { description: 'login button' },
            reasoning: 'Click login',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Successfully clicked the login button.',
        totalTokens: 30,
      });

      const response = await agent.execute('Click the login button');

      expect(mockActFn).toHaveBeenCalledWith(expect.stringContaining('Click on: login button'));
      expect(response).toBeTruthy();
    });
  });

  describe('executeStep - FIND_AND_TYPE', () => {
    test('should type text into an element', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Enter username',
        steps: [
          {
            action: 'FIND_AND_TYPE',
            parameters: { description: 'username field', text: 'testuser' },
            reasoning: 'Type username',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Successfully entered the username.',
        totalTokens: 30,
      });

      const response = await agent.execute('Enter username testuser');

      expect(mockActFn).toHaveBeenCalledWith(
        expect.stringContaining('Type "testuser" into: username field')
      );
      expect(response).toBeTruthy();
    });
  });

  describe('executeStep - PRESS_KEY', () => {
    test('should press a keyboard key', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Press Enter',
        steps: [
          {
            action: 'PRESS_KEY',
            parameters: { key: 'Enter' },
            reasoning: 'Submit form',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Pressed the Enter key.',
        totalTokens: 30,
      });

      const response = await agent.execute('Press Enter');

      expect(mockBrowser.getPage().keyboard.press).toHaveBeenCalledWith('Enter');
      expect(response).toBeTruthy();
    });
  });

  describe('executeStep - WAIT', () => {
    test('should wait for specified seconds', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Wait 3 seconds',
        steps: [
          {
            action: 'WAIT',
            parameters: { seconds: 3 },
            reasoning: 'Wait for page to load',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Waited 3 seconds.',
        totalTokens: 30,
      });

      const response = await agent.execute('Wait 3 seconds');

      expect(mockBrowser.getPage().waitForTimeout).toHaveBeenCalledWith(3000);
      expect(response).toBeTruthy();
    });

    test('should wait for default 2 seconds if not specified', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Wait a moment',
        steps: [
          {
            action: 'WAIT',
            parameters: {},
            reasoning: 'Wait briefly',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Waited for a moment.',
        totalTokens: 30,
      });

      await agent.execute('Wait a moment');

      expect(mockBrowser.getPage().waitForTimeout).toHaveBeenCalledWith(2000);
    });
  });

  describe('executeStep - EXTRACT_INFO', () => {
    test('should extract information from the page', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Get page title',
        steps: [
          {
            action: 'EXTRACT_INFO',
            parameters: { info_type: 'page title' },
            reasoning: 'Extract title',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      // Mock extraction response
      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Google Search',
        totalTokens: 20,
      });

      // Mock synthesis response
      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'The page title is "Google Search".',
        totalTokens: 30,
      });

      const response = await agent.execute('What is the page title?');

      expect(response).toBeTruthy();
    });
  });

  describe('executeStep - VERIFY', () => {
    test('should verify a condition is true', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Check if logged in',
        steps: [
          {
            action: 'VERIFY',
            parameters: { condition: 'user is logged in' },
            reasoning: 'Verify login status',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      // Mock verification response
      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'yes',
        totalTokens: 5,
      });

      // Mock synthesis response
      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Yes, the user is logged in.',
        totalTokens: 30,
      });

      const response = await agent.execute('Am I logged in?');

      expect(response).toBeTruthy();
    });

    test('should verify a condition is false', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Check if error shown',
        steps: [
          {
            action: 'VERIFY',
            parameters: { condition: 'error message is displayed' },
            reasoning: 'Check for errors',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      // Mock verification response
      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'no',
        totalTokens: 5,
      });

      // Mock synthesis response
      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'No error message is displayed.',
        totalTokens: 30,
      });

      const response = await agent.execute('Is there an error?');

      expect(response).toBeTruthy();
    });
  });

  describe('execute - Full Flow', () => {
    test('should execute a complete multi-step plan', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Search Google for TypeScript',
        steps: [
          {
            action: 'NAVIGATE',
            parameters: { url: 'https://google.com' },
            reasoning: 'Go to Google',
          },
          {
            action: 'FIND_AND_TYPE',
            parameters: { description: 'search box', text: 'TypeScript' },
            reasoning: 'Enter search term',
          },
          {
            action: 'PRESS_KEY',
            parameters: { key: 'Enter' },
            reasoning: 'Submit search',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 100,
      });

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'I searched Google for TypeScript and got the results.',
        totalTokens: 50,
      });

      const response = await agent.execute('Search Google for TypeScript');

      expect(mockBrowser.getPage().goto).toHaveBeenCalled();
      expect(mockActFn).toHaveBeenCalled();
      expect(mockBrowser.getPage().keyboard.press).toHaveBeenCalledWith('Enter');
      expect(response).toContain('TypeScript');
    });

    test('should handle step failures gracefully', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Click something',
        steps: [
          {
            action: 'FIND_AND_CLICK',
            parameters: { description: 'nonexistent button' },
            reasoning: 'Try to click',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      // Override the mockActFn for this specific test to simulate failure
      mockActFn.mockRejectedValueOnce(new Error('Element not found'));

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Could not find the button to click.',
        totalTokens: 30,
      });

      const response = await agent.execute('Click the button');

      expect(response).toBeTruthy();
    });
  });

  describe('Conversation History', () => {
    test('should track conversation history', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Simple task',
        steps: [
          {
            action: 'WAIT',
            parameters: { seconds: 1 },
            reasoning: 'Wait',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Completed the task.',
        totalTokens: 20,
      });

      await agent.execute('Do something');

      const history = agent.getHistory();
      expect(history).toHaveLength(2); // user + assistant
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
    });

    test('should clear conversation history', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Simple task',
        steps: [
          {
            action: 'WAIT',
            parameters: { seconds: 1 },
            reasoning: 'Wait',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Done.',
        totalTokens: 10,
      });

      await agent.execute('Do something');

      expect(agent.getHistory()).toHaveLength(2);

      agent.clearHistory();

      expect(agent.getHistory()).toHaveLength(0);
    });
  });

  describe('chat', () => {
    test('should handle chat messages', async () => {
      const mockPlan: ExecutionPlan = {
        goal: 'Respond to chat',
        steps: [
          {
            action: 'WAIT',
            parameters: { seconds: 1 },
            reasoning: 'Process',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Hello! How can I help?',
        totalTokens: 20,
      });

      const response = await agent.chat('Hello');

      expect(response).toBeTruthy();
      expect(agent.getHistory()).toHaveLength(2);
    });
  });

  describe('getSummary', () => {
    test('should generate conversation summary', async () => {
      // First, have a conversation
      const mockPlan: ExecutionPlan = {
        goal: 'Do task',
        steps: [
          {
            action: 'WAIT',
            parameters: { seconds: 1 },
            reasoning: 'Wait',
          },
        ],
      };

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: JSON.stringify(mockPlan),
        totalTokens: 50,
      });

      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'Task completed.',
        totalTokens: 20,
      });

      await agent.execute('Do a task');

      // Now get summary
      mockLLMProvider.generate.mockResolvedValueOnce({
        content: 'The session completed one task successfully.',
        totalTokens: 30,
      });

      const summary = await agent.getSummary();

      expect(summary).toBeTruthy();
      const summaryLower = summary.toLowerCase();
      expect(
        summaryLower.includes('session') ||
          summaryLower.includes('completed') ||
          summaryLower.includes('task')
      ).toBe(true);
    });

    test('should handle empty conversation history', async () => {
      const summary = await agent.getSummary();

      expect(summary).toContain('No conversation history');
    });
  });

  describe('Token Statistics', () => {
    test('should provide token statistics', () => {
      const stats = agent.getTokenStats();

      expect(stats).toBeDefined();
      expect(stats.totalTokens).toBe(500);
    });
  });
});
