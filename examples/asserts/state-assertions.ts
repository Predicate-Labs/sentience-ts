/**
 * v1: State-aware assertions with AgentRuntime.
 *
 * This example is meant to be run with a Pro/Enterprise API key so the Gateway
 * can refine raw elements into SmartElements with state fields (enabled/checked/value/etc).
 *
 * Env vars:
 *  - SENTIENCE_API_KEY (optional but recommended for v1 state assertions)
 */

import { SentienceBrowser } from '../../src/browser';
import { AgentRuntime } from '../../src/agent-runtime';
import { createTracer } from '../../src/tracing/tracer-factory';
import { exists, isChecked, isDisabled, isEnabled, isExpanded, valueContains } from '../../src/verification';

async function main(): Promise<void> {
  const browser = new SentienceBrowser(process.env.SENTIENCE_API_KEY);
  await browser.start();

  const tracer = await createTracer({ runId: 'asserts-v1', uploadTrace: false });

  // AgentRuntime in TS expects a minimal adapter with snapshot(page, options).
  const adapter = {
    snapshot: async (_page: any, options?: Record<string, any>) => {
      return await browser.snapshot(options);
    },
  };

  const runtime = new AgentRuntime(adapter as any, browser.getPage() as any, tracer);

  await browser.getPage().goto('https://example.com');
  runtime.beginStep('Assert v1 state');
  await runtime.snapshot({ use_api: true }); // Pro tier (Gateway refinement) if api key is present

  runtime.assert(exists('role=heading'), 'has_heading');
  runtime.assert(isEnabled('role=link'), 'some_link_enabled');
  runtime.assert(isDisabled("role=button text~'continue'"), 'continue_disabled_if_present');
  runtime.assert(isChecked("role=checkbox name~'subscribe'"), 'subscribe_checked_if_present');
  runtime.assert(isExpanded("role=button name~'more'"), 'more_is_expanded_if_present');
  runtime.assert(valueContains("role=textbox name~'email'", '@'), 'email_has_at_if_present');

  console.log('Assertions recorded:', runtime.getAssertionsForStepEnd().assertions);
  await tracer.close();
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

