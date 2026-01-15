/**
 * v2: `.check(...).eventually(...)` with snapshot confidence gating + exhaustion.
 */

import { SentienceBrowser } from '../../src/browser';
import { AgentRuntime } from '../../src/agent-runtime';
import { createTracer } from '../../src/tracing/tracer-factory';
import { exists } from '../../src/verification';

async function main(): Promise<void> {
  const browser = new SentienceBrowser(process.env.SENTIENCE_API_KEY);
  await browser.start();

  const tracer = await createTracer({ runId: 'asserts-v2', uploadTrace: false });
  const adapter = {
    snapshot: async (_page: any, options?: Record<string, any>) => {
      return await browser.snapshot(options);
    },
  };
  const runtime = new AgentRuntime(adapter as any, browser.getPage() as any, tracer);

  await browser.getPage().goto('https://example.com');
  runtime.beginStep('Assert v2 eventually');

  const ok = await runtime
    .check(exists("text~'Example Domain'"), 'example_domain_text', true)
    .eventually({
      timeoutMs: 10_000,
      pollMs: 250,
      minConfidence: 0.7,
      maxSnapshotAttempts: 3,
      snapshotOptions: { use_api: true },
    });

  console.log('eventually() result:', ok);
  console.log('Final assertions:', runtime.getAssertionsForStepEnd().assertions);

  await tracer.close();
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

