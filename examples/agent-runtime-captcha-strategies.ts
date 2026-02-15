import {
  AgentRuntime,
  CaptchaOptions,
  ExternalSolver,
  HumanHandoffSolver,
  SentienceBrowser,
  VisionSolver,
} from '@predicate/sdk';
import { createTracer } from '@predicate/sdk';

async function notifyWebhook(ctx: any): Promise<void> {
  console.log(`[captcha] external resolver notified: url=${ctx.url} run_id=${ctx.runId}`);
}

async function main(): Promise<void> {
  const browser = await SentienceBrowser.create({ apiKey: process.env.SENTIENCE_API_KEY });
  const tracer = await createTracer({ runId: 'captcha-demo', uploadTrace: false });

  const browserAdapter = {
    snapshot: async (_page: any, options?: Record<string, any>) => {
      return await browser.snapshot(options);
    },
  };
  const runtime = new AgentRuntime(browserAdapter as any, browser.getPage() as any, tracer);

  // Option 1: Human-in-loop
  runtime.setCaptchaOptions({ policy: 'callback', handler: HumanHandoffSolver() });

  // Option 2: Vision-only verification (no actions)
  runtime.setCaptchaOptions({ policy: 'callback', handler: VisionSolver() });

  // Option 3: External resolver orchestration
  runtime.setCaptchaOptions({
    policy: 'callback',
    handler: ExternalSolver(async ctx => notifyWebhook(ctx)),
  });

  await browser.getPage().goto(process.env.CAPTCHA_TEST_URL ?? 'https://example.com');
  runtime.beginStep('Captcha-aware snapshot');
  await runtime.snapshot();

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
