/**
 * Sentience TypeScript SDK - AI Agent Browser Automation
 */

export { SentienceBrowser } from './browser';
export { snapshot, SnapshotOptions } from './snapshot';
export { query, find, parseSelector } from './query';
export { click, typeText, press, clickRect, ClickRect } from './actions';
export { waitFor } from './wait';
export { expect, Expectation } from './expect';
export { Inspector, inspect } from './inspector';
export { Recorder, Trace, TraceStep, record } from './recorder';
export { ScriptGenerator, generate } from './generator';
export { read, ReadOptions, ReadResult } from './read';
export { screenshot, ScreenshotOptions } from './screenshot';
export * from './types';

// Agent Layer (v0.2.0+)
export {
  LLMProvider,
  LLMResponse,
  OpenAIProvider,
  AnthropicProvider
} from './llm-provider';
export {
  SentienceAgent,
  AgentActResult,
  HistoryEntry,
  TokenStats
} from './agent';
export {
  ConversationalAgent,
  ExecutionPlan,
  PlanStep,
  StepResult,
  ConversationEntry,
  ActionType,
  ActionParameters
} from './conversational-agent';

