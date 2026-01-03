/**
 * Tests for ActionExecutor utility
 */

import { ActionExecutor } from '../../src/utils/action-executor';
import { SentienceBrowser } from '../../src/browser';
import { Snapshot, Element, BBox, VisualCues } from '../../src/types';
import { AgentActResult } from '../../src/agent';
import * as actionsModule from '../../src/actions';

// Mock actions module
jest.mock('../../src/actions');

describe('ActionExecutor', () => {
  let mockBrowser: jest.Mocked<SentienceBrowser>;
  let executor: ActionExecutor;
  let mockSnapshot: Snapshot;

  beforeEach(() => {
    mockBrowser = {
      getPage: jest.fn(),
      getApiKey: jest.fn(),
      getApiUrl: jest.fn(),
    } as any;

    executor = new ActionExecutor(mockBrowser, false);

    // Create mock snapshot with elements
    mockSnapshot = {
      status: 'success',
      url: 'https://example.com',
      elements: [
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
        {
          id: 2,
          role: 'textbox',
          text: null,
          importance: 0.8,
          bbox: { x: 10, y: 60, width: 200, height: 30 },
          visual_cues: {
            is_primary: false,
            background_color_name: null,
            is_clickable: true,
          },
          in_viewport: true,
          is_occluded: false,
          z_index: 1,
        },
      ],
    };
  });

  describe('executeAction', () => {
    it('should execute CLICK action', async () => {
      const mockClick = actionsModule.click as jest.MockedFunction<typeof actionsModule.click>;
      mockClick.mockResolvedValue({
        success: true,
        duration_ms: 100,
        outcome: 'navigated',
        url_changed: true,
      });

      const result = await executor.executeAction('CLICK(1)', mockSnapshot);

      expect(result.success).toBe(true);
      expect(result.action).toBe('click');
      expect(result.elementId).toBe(1);
      expect(mockClick).toHaveBeenCalledWith(mockBrowser, 1);
    });

    it('should execute TYPE action', async () => {
      const mockTypeText = actionsModule.typeText as jest.MockedFunction<
        typeof actionsModule.typeText
      >;
      mockTypeText.mockResolvedValue({
        success: true,
        duration_ms: 200,
        outcome: 'dom_updated',
        url_changed: false,
      });

      const result = await executor.executeAction('TYPE(2, "hello")', mockSnapshot);

      expect(result.success).toBe(true);
      expect(result.action).toBe('type');
      expect(result.elementId).toBe(2);
      expect(result.text).toBe('hello');
      expect(mockTypeText).toHaveBeenCalledWith(mockBrowser, 2, 'hello');
    });

    it('should execute PRESS action', async () => {
      const mockPress = actionsModule.press as jest.MockedFunction<typeof actionsModule.press>;
      mockPress.mockResolvedValue({
        success: true,
        duration_ms: 50,
        outcome: 'dom_updated',
        url_changed: false,
      });

      const result = await executor.executeAction('PRESS("Enter")', mockSnapshot);

      expect(result.success).toBe(true);
      expect(result.action).toBe('press');
      expect(result.key).toBe('Enter');
      expect(mockPress).toHaveBeenCalledWith(mockBrowser, 'Enter');
    });

    it('should execute FINISH action', async () => {
      const result = await executor.executeAction('FINISH()', mockSnapshot);

      expect(result.success).toBe(true);
      expect(result.action).toBe('finish');
      expect(result.outcome).toBe('Task completed');
    });

    it('should throw error for invalid action format', async () => {
      await expect(executor.executeAction('INVALID', mockSnapshot)).rejects.toThrow(
        'Unknown action format'
      );
    });

    it('should throw error if element not found', async () => {
      await expect(executor.executeAction('CLICK(999)', mockSnapshot)).rejects.toThrow(
        'Element 999 not found in snapshot'
      );
    });

    it('should throw error for invalid TYPE format', async () => {
      await expect(executor.executeAction('TYPE(1)', mockSnapshot)).rejects.toThrow(
        'Invalid TYPE format'
      );
    });

    it('should throw error for invalid PRESS format', async () => {
      await expect(executor.executeAction('PRESS(Enter)', mockSnapshot)).rejects.toThrow(
        'Invalid PRESS format'
      );
    });
  });
});
