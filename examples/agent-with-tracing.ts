/**
 * Agent with Tracing Example
 *
 * Demonstrates how to record agent execution traces for debugging and analysis
 *
 * Usage:
 *   ts-node examples/agent-with-tracing.ts
 *   or
 *   npm run example:tracing
 */

import { SentienceBrowser } from '../src/browser';
import { SentienceAgent } from '../src/agent';
import { OpenAIProvider } from '../src/llm-provider';
import { Tracer } from '../src/tracing/tracer';
import { JsonlTraceSink } from '../src/tracing/jsonl-sink';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  // Get API keys from environment
  const sentienceKey = process.env.SENTIENCE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!sentienceKey || !openaiKey) {
    console.error('Error: Missing API keys');
    console.error('Please set SENTIENCE_API_KEY and OPENAI_API_KEY environment variables');
    process.exit(1);
  }

  console.log('🚀 Starting Agent with Tracing Demo\n');

  // Create browser and LLM
  const browser = await SentienceBrowser.create({ apiKey: sentienceKey });
  const llm = new OpenAIProvider(openaiKey, 'gpt-4o-mini');

  // Create traces directory
  const tracesDir = path.join(__dirname, '..', 'traces');
  if (!fs.existsSync(tracesDir)) {
    fs.mkdirSync(tracesDir, { recursive: true });
  }

  // Create tracer
  const runId = randomUUID();
  const traceFile = path.join(tracesDir, `${runId}.jsonl`);
  const sink = new JsonlTraceSink(traceFile);
  const tracer = new Tracer(runId, sink);

  console.log(`📝 Trace file: ${traceFile}`);
  console.log(`🆔 Run ID: ${runId}\n`);

  // Create agent with tracer
  const agent = new SentienceAgent(browser, llm, 50, true, tracer);

  // Emit run_start event
  tracer.emitRunStart('SentienceAgent', 'gpt-4o-mini', {
    example: 'agent-with-tracing',
    timestamp: new Date().toISOString(),
  });

  try {
    // Navigate to Google
    console.log('🌐 Navigating to Google...\n');
    const page = browser.getPage();
    await page.goto('https://www.google.com');
    await page.waitForLoadState('networkidle');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Execute agent actions (automatically traced!)
    console.log('🤖 Executing agent actions...\n');

    await agent.act('Click the search box');
    await agent.act("Type 'artificial intelligence' into the search field");
    await agent.act('Press Enter key');

    // Wait for results
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Emit run_end event
    tracer.emitRunEnd(3);

    console.log('\n✅ Agent execution completed successfully!\n');

    // Display token usage
    const stats = agent.getTokenStats();
    console.log('📊 Token Usage:');
    console.log(`   Total Prompt Tokens: ${stats.totalPromptTokens}`);
    console.log(`   Total Completion Tokens: ${stats.totalCompletionTokens}`);
    console.log(`   Total Tokens: ${stats.totalTokens}\n`);

  } catch (error: any) {
    console.error('❌ Error during execution:', error.message);
    tracer.emitError('main', error.message, 0);
  } finally {
    // Flush trace to disk
    console.log('💾 Flushing trace to disk...');
    await agent.closeTracer();
    await browser.close();
  }

  // Read and analyze the trace
  console.log('\n📖 Trace Analysis:\n');

  const content = fs.readFileSync(traceFile, 'utf-8');
  const events = content.trim().split('\n').map(line => JSON.parse(line));

  console.log(`   Total events: ${events.length}`);

  // Count by type
  const eventTypes = events.reduce((acc: Record<string, number>, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  console.log('   Event breakdown:');
  Object.entries(eventTypes).forEach(([type, count]) => {
    console.log(`     - ${type}: ${count}`);
  });

  // Show event sequence
  console.log('\n   Event sequence:');
  events.forEach((event, i) => {
    const stepInfo = event.step_id ? ` [step: ${event.step_id.substring(0, 8)}]` : '';
    console.log(`     [${event.seq}] ${event.type}${stepInfo} - ${event.ts}`);
  });

  // Calculate total tokens from trace
  const llmEvents = events.filter(e => e.type === 'llm_response');
  const totalTokensFromTrace = llmEvents.reduce(
    (sum, e) => sum + (e.data.prompt_tokens || 0) + (e.data.completion_tokens || 0),
    0
  );

  console.log(`\n   Total tokens (from trace): ${totalTokensFromTrace}`);

  console.log(`\n✨ Trace saved to: ${traceFile}`);
  console.log('   You can analyze this file with any JSONL parser!\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
