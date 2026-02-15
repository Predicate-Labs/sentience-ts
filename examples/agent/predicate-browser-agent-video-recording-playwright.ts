/**
 * Example: PredicateBrowserAgent + Playwright video recording (recommended approach).
 *
 * Video recording is a Playwright context feature (recordVideo), not an agent constructor flag.
 * This example shows how to:
 * 1) create a Playwright context with recordVideo enabled
 * 2) wrap the existing page with SentienceBrowser.fromPage(...)
 * 3) use AgentRuntime + PredicateBrowserAgent normally
 *
 * Usage:
 *   ts-node examples/agent/predicate-browser-agent-video-recording-playwright.ts
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

import {
  AgentRuntime,
  PredicateBrowserAgent,
  type PredicateBrowserAgentConfig,
  SentienceBrowser,
  type RuntimeStep,
} from '../../src';
import { createTracer } from '../../src/tracing/tracer-factory';
import { LLMProvider, type LLMResponse } from '../../src/llm-provider';
import type { Snapshot } from '../../src/types';

function createBrowserAdapter(browser: SentienceBrowser) {
  return {
    snapshot: async (_page: any, options?: Record<string, any>): Promise<Snapshot> => {
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
  async generate(_system: string, _user: string, _opts: Record<string, any> = {}): Promise<LLMResponse> {
    return { content: this.action, modelName: this.modelName };
  }
}

async function main() {
  const apiKey = (process.env.PREDICATE_API_KEY ||
    process.env.SENTIENCE_API_KEY) as string | undefined;

  const recordingsDir = path.join(process.cwd(), 'recordings');
  if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

  const pw = await chromium.launch({ headless: false });
  const context = await pw.newContext({
    recordVideo: { dir: recordingsDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();

  const runId = 'predicate-browser-agent-video-recording';
  const tracer = await createTracer({ apiKey, runId, uploadTrace: false });

  // Wrap existing Playwright page.
  const sentienceBrowser = SentienceBrowser.fromPage(page, apiKey);

  try {
    await page.goto('https://example.com');
    await page.waitForLoadState('networkidle');

    const runtime = new AgentRuntime(createBrowserAdapter(sentienceBrowser), page as any, tracer);
    const config: PredicateBrowserAgentConfig = { historyLastN: 0 };

    const agent = new PredicateBrowserAgent({
      runtime,
      executor: new FixedActionProvider('FINISH()'),
      config,
    });

    const out = await agent.step({
      taskGoal: 'Open example.com',
      step: { goal: 'Finish immediately' } satisfies RuntimeStep,
    });
    console.log(`step ok: ${out.ok}`);
    console.log(`videos will be saved under: ${recordingsDir}`);
  } finally {
    await tracer.close(true);
    await context.close(); // flush video
    await pw.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

