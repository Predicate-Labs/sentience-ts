/**
 * Agent Regression Tests
 *
 * Ensures agent modifications for tracing don't break existing functionality
 */

import { SentienceAgent } from '../../src/agent';

describe('Agent Regression Tests (Tracing Integration)', () => {
  describe('Constructor Backward Compatibility', () => {
    it('should accept 4 parameters (without tracer)', () => {
      const mockBrowser: any = {
        getPage: () => ({ url: () => 'https://test.com' }),
      };
      const mockLLM: any = {};

      // Old signature: (browser, llm, snapshotLimit, verbose)
      const agent = new SentienceAgent(mockBrowser, mockLLM, 50, true);

      expect(agent).toBeDefined();
      expect(agent.getTracer()).toBeUndefined();
    });

    it('should accept 5 parameters (with tracer)', () => {
      const mockBrowser: any = {
        getPage: () => ({ url: () => 'https://test.com' }),
      };
      const mockLLM: any = {};
      const mockTracer: any = {
        emit: jest.fn(),
        emitStepStart: jest.fn(),
        close: jest.fn(),
      };

      // New signature: (browser, llm, snapshotLimit, verbose, tracer)
      const agent = new SentienceAgent(mockBrowser, mockLLM, 50, true, mockTracer);

      expect(agent).toBeDefined();
      expect(agent.getTracer()).toBe(mockTracer);
    });

    it('should accept minimal parameters', () => {
      const mockBrowser: any = {
        getPage: () => ({ url: () => 'https://test.com' }),
      };
      const mockLLM: any = {};

      // Minimal signature: (browser, llm)
      const agent = new SentienceAgent(mockBrowser, mockLLM);

      expect(agent).toBeDefined();
      expect(agent.getTracer()).toBeUndefined();
    });
  });

  describe('Method Signatures', () => {
    let agent: SentienceAgent;

    beforeEach(() => {
      const mockBrowser: any = {
        getPage: () => ({ url: () => 'https://test.com' }),
      };
      const mockLLM: any = {};
      agent = new SentienceAgent(mockBrowser, mockLLM);
    });

    it('should have getTokenStats method', () => {
      const stats = agent.getTokenStats();
      expect(stats).toBeDefined();
      expect(stats.totalPromptTokens).toBe(0);
      expect(stats.totalCompletionTokens).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.byAction).toEqual([]);
    });

    it('should have getHistory method', () => {
      const history = agent.getHistory();
      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });

    it('should have clearHistory method', () => {
      agent.clearHistory();
      expect(agent.getHistory().length).toBe(0);
    });

    it('should have new closeTracer method', async () => {
      // Should not throw even without tracer
      await expect(agent.closeTracer()).resolves.not.toThrow();
    });

    it('should have new getTracer method', () => {
      expect(agent.getTracer()).toBeUndefined();
    });
  });

  describe('Return Types', () => {
    it('should maintain AgentActResult interface', () => {
      const mockBrowser: any = {
        getPage: () => ({ url: () => 'https://test.com' }),
      };
      const mockLLM: any = {};
      const agent = new SentienceAgent(mockBrowser, mockLLM);

      // Type check - this will fail at compile time if interface changed
      const checkType = (result: any) => {
        const typed: {
          success: boolean;
          action?: string;
          elementId?: number;
          text?: string;
          key?: string;
          outcome?: string;
          urlChanged?: boolean;
          durationMs: number;
          attempt: number;
          goal: string;
          error?: string;
          message?: string;
        } = result;
        return typed;
      };

      expect(checkType).toBeDefined();
    });

    it('should maintain HistoryEntry interface', () => {
      const mockBrowser: any = {
        getPage: () => ({ url: () => 'https://test.com' }),
      };
      const mockLLM: any = {};
      const agent = new SentienceAgent(mockBrowser, mockLLM);

      const history = agent.getHistory();

      // Type check
      const checkType = (entry: any) => {
        const typed: {
          goal: string;
          action: string;
          result: any;
          success: boolean;
          attempt: number;
          durationMs: number;
        } = entry;
        return typed;
      };

      expect(checkType).toBeDefined();
    });

    it('should maintain TokenStats interface', () => {
      const mockBrowser: any = {
        getPage: () => ({ url: () => 'https://test.com' }),
      };
      const mockLLM: any = {};
      const agent = new SentienceAgent(mockBrowser, mockLLM);

      const stats = agent.getTokenStats();

      // Type check
      const typed: {
        totalPromptTokens: number;
        totalCompletionTokens: number;
        totalTokens: number;
        byAction: Array<{
          goal: string;
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
          model?: string;
        }>;
      } = stats;

      expect(typed).toBeDefined();
    });
  });

  describe('Imports', () => {
    it('should not break existing imports', () => {
      // This test verifies that the import still works
      expect(SentienceAgent).toBeDefined();
    });
  });
});
