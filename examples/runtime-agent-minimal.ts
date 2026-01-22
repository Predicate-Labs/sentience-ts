/**
 * Example: RuntimeAgent (AgentRuntime-backed) minimal demo.
 *
 * This demonstrates the verification-first loop:
 * snapshot -> propose action (structured executor) -> execute -> verify (AgentRuntime predicates)
 *
 * Requirements:
 * - SENTIENCE_API_KEY (needed to start SentienceBrowser)
 *
 * Usage:
 *   ts-node examples/runtime-agent-minimal.ts
 */

import { Page } from 'playwright';
import {
  AgentRuntime,
  RuntimeAgent,
  RuntimeStep,
  StepVerification,
  SentienceBrowser,
  exists,
  urlContains,
} from '../src';
import { createTracer } from '../src/tracing/tracer-factory';
import { LLMProvider, LLMResponse } from '../src/llm-provider';
import type { Snapshot } from '../src/types';

/**
 * Adapter to make SentienceBrowser compatible with AgentRuntime's BrowserLike interface.
 * AgentRuntime expects snapshot(page, options) but SentienceBrowser has snapshot(options).
 */
function createBrowserAdapter(browser: SentienceBrowser) {
  return {
    snapshot: async (_page: Page, options?: Record<string, any>): Promise<Snapshot> => {
      return await browser.snapshot(options);
    },
  };
}

class FixedActionProvider extends LLMProvider {
  constructor(private action: string) {
    super();
  }
  get modelName(): string {
    return 'fixed-action';
  }
  supportsJsonMode(): boolean {
    return false;
  }
  async generate(_systemPrompt: string, _userPrompt: string, _options: Record<string, any> = {}): Promise<LLMResponse> {
    return { content: this.action, modelName: this.modelName };
  }
}

async function main() {
  const sentienceKey = process.env.SENTIENCE_API_KEY;
  if (!sentienceKey) {
    console.error('Error: SENTIENCE_API_KEY not set');
    process.exit(1);
  }

  const runId = 'runtime-agent-minimal';
  const tracer = await createTracer({ apiKey: sentienceKey, runId, uploadTrace: false });

  const browser = new SentienceBrowser(sentienceKey, undefined, false);
  await browser.start();
  const page = browser.getPage();

  try {
    await page.goto('https://example.com');
    await page.waitForLoadState('networkidle');

    const runtime = new AgentRuntime(createBrowserAdapter(browser), page, tracer);

    // Structured executor (for demo, we just return FINISH()).
    const executor = new FixedActionProvider('FINISH()');
    const agent = new RuntimeAgent({ runtime, executor });

    const step: RuntimeStep = {
      goal: 'Confirm Example Domain page is loaded',
      verifications: [
        { predicate: urlContains('example.com'), label: 'url_contains_example', required: true } satisfies StepVerification,
        { predicate: exists('role=heading'), label: 'has_heading', required: true } satisfies StepVerification,
      ],
      maxSnapshotAttempts: 2,
      snapshotLimitBase: 60,
    };

    const ok = await agent.runStep({ taskGoal: 'Open example.com and verify', step });
    console.log(`step ok: ${ok}`);
  } finally {
    await tracer.close(true);
    await browser.close();
  }
}

main().catch(console.error);

