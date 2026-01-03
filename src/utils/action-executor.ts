/**
 * ActionExecutor - Executes actions and handles retries
 *
 * Extracted from SentienceAgent to improve separation of concerns
 */

import { IBrowser } from '../protocols/browser-protocol';
import { Snapshot } from '../types';
import { click, typeText, press } from '../actions';
import { AgentActResult } from '../agent';

/**
 * ActionExecutor handles action parsing and execution
 */
export class ActionExecutor {
  constructor(
    private browser: IBrowser,
    private verbose: boolean = true
  ) {}

  /**
   * Execute an action string (e.g., "CLICK(42)", "TYPE(5, \"text\")")
   *
   * @param actionStr - Action string to parse and execute
   * @param snap - Current snapshot for element lookup
   * @returns Action result
   */
  async executeAction(actionStr: string, snap: Snapshot): Promise<AgentActResult> {
    // Parse action string
    const actionMatch = actionStr.match(/^(\w+)\((.*)\)$/);

    if (!actionMatch) {
      throw new Error(
        `Unknown action format: ${actionStr}\n` +
          `Expected: CLICK(id), TYPE(id, "text"), PRESS("key"), or FINISH()`
      );
    }

    const [, action, argsStr] = actionMatch;
    const actionUpper = action.toUpperCase();

    if (actionUpper === 'FINISH') {
      return {
        success: true,
        action: 'finish',
        outcome: 'Task completed',
        durationMs: 0,
        attempt: 0,
        goal: '',
        urlChanged: false,
      };
    }

    if (actionUpper === 'CLICK') {
      const elementId = parseInt(argsStr.trim(), 10);
      if (isNaN(elementId)) {
        throw new Error(`Invalid element ID in CLICK action: ${argsStr}`);
      }

      // Verify element exists
      const element = snap.elements.find(el => el.id === elementId);
      if (!element) {
        throw new Error(`Element ${elementId} not found in snapshot`);
      }

      const result = await click(this.browser, elementId);
      return {
        success: result.success,
        action: 'click',
        elementId,
        outcome: result.outcome || (result.success ? 'Clicked successfully' : 'Click failed'),
        durationMs: result.duration_ms,
        attempt: 0,
        goal: '',
        urlChanged: result.url_changed || false,
        error: result.error?.reason,
      };
    }

    if (actionUpper === 'TYPE') {
      // Parse TYPE(id, "text") - support both single and double quotes, and flexible whitespace
      const typeMatch = argsStr.match(/^(\d+)\s*,\s*["']([^"']+)["']$/);
      if (!typeMatch) {
        throw new Error(`Invalid TYPE format. Expected: TYPE(id, "text")`);
      }

      const [, elementIdStr, text] = typeMatch;
      const elementId = parseInt(elementIdStr, 10);

      // Verify element exists
      const element = snap.elements.find(el => el.id === elementId);
      if (!element) {
        throw new Error(`Element ${elementId} not found in snapshot`);
      }

      const result = await typeText(this.browser, elementId, text);
      return {
        success: result.success,
        action: 'type',
        elementId,
        text,
        outcome: result.outcome || (result.success ? 'Typed successfully' : 'Type failed'),
        durationMs: result.duration_ms,
        attempt: 0,
        goal: '',
        urlChanged: result.url_changed || false,
        error: result.error?.reason,
      };
    }

    if (actionUpper === 'PRESS') {
      // Parse PRESS("key") - support both single and double quotes
      const keyMatch = argsStr.match(/^["']([^"']+)["']$/);
      if (!keyMatch) {
        throw new Error(`Invalid PRESS format. Expected: PRESS("key")`);
      }

      const [, key] = keyMatch;
      const result = await press(this.browser, key);
      return {
        success: result.success,
        action: 'press',
        key,
        outcome: result.outcome || (result.success ? 'Key pressed successfully' : 'Press failed'),
        durationMs: result.duration_ms,
        attempt: 0,
        goal: '',
        urlChanged: result.url_changed || false,
        error: result.error?.reason,
      };
    }

    throw new Error(
      `Unknown action: ${actionUpper}\n` +
        `Expected: CLICK(id), TYPE(id, "text"), PRESS("key"), or FINISH()`
    );
  }
}
