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
export { showOverlay, clearOverlay } from './overlay';
export { findTextRect } from './textSearch';
export * from './types';
export { saveStorageState } from './utils';

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

// Conversational Agent Layer (v0.3.0+)
export {
  ConversationalAgent,
  ExecutionPlan,
  PlanStep,
  StepResult,
  ConversationEntry,
  ActionType,
  ActionParameters
} from './conversational-agent';

// Tracing Layer (v0.3.1+)
export {
  Tracer,
  TraceSink,
  JsonlTraceSink,
  TraceEvent,
  TraceEventData
} from './tracing';

