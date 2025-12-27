/**
 * Example: Agent with Cloud Tracing
 *
 * Demonstrates how to use cloud tracing with SentienceAgent to upload traces
 * and screenshots to cloud storage for remote viewing and analysis.
 *
 * Requirements:
 * - Pro or Enterprise tier API key (SENTIENCE_API_KEY)
 * - OpenAI API key (OPENAI_API_KEY) for LLM
 *
 * Usage:
 *   ts-node examples/cloud-tracing-agent.ts
 *   or
 *   npm run example:cloud-tracing
 */

import { SentienceBrowser } from '../src/browser';
import { SentienceAgent } from '../src/agent';
import { OpenAIProvider } from '../src/llm-provider';
import { createTracer } from '../src/tracing/tracer-factory';

async function main() {
  // Get API keys from environment
  const sentienceKey = process.env.SENTIENCE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!sentienceKey) {
    console.error('❌ Error: SENTIENCE_API_KEY not set');
    console.error('   Cloud tracing requires Pro or Enterprise tier');
    console.error('   Get your API key at: https://sentience.studio');
    process.exit(1);
  }

  if (!openaiKey) {
    console.error('❌ Error: OPENAI_API_KEY not set');
    process.exit(1);
  }

  console.log('🚀 Starting Agent with Cloud Tracing Demo\n');

  // 1. Create tracer with automatic tier detection
  // If apiKey is Pro/Enterprise, uses CloudTraceSink
  // If apiKey is missing/invalid, falls back to local JsonlTraceSink
  const runId = 'cloud-tracing-demo';
  const tracer = await createTracer({
    apiKey: sentienceKey,
    runId: runId
  });

  console.log(`🆔 Run ID: ${runId}\n`);

  // 2. Create browser and LLM
  console.log('🌐 Starting browser...');
  const browser = new SentienceBrowser(sentienceKey, undefined, false);
  
  try {
    await browser.start();
    console.log('✅ Browser started successfully');
  } catch (error: any) {
    console.error(`❌ Failed to start browser: ${error.message}`);
    throw error;
  }
  
  const llm = new OpenAIProvider(openaiKey, 'gpt-4o-mini');

  // 3. Create agent with tracer
  // Note: Screenshot capture is handled automatically by the tracer
  // The agent will capture screenshots for each step when tracer is provided
  const agent = new SentienceAgent(browser, llm, 50, true, tracer);

  try {
    // 5. Navigate and execute agent actions
    console.log('🌐 Navigating to Google...\n');
    const page = browser.getPage();
    console.log('   Getting page...');
    
    try {
      console.log('   Navigating to Google...');
      await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log('   Page loaded!');
      
      // Wait a bit for page to stabilize (instead of networkidle which can hang)
      console.log('   Waiting for page to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Wait for extension to inject (required for snapshot)
      console.log('   Waiting for Sentience extension to inject...');
      try {
        await page.waitForFunction(
          () => typeof (window as any).sentience !== 'undefined',
          { timeout: 10000 }
        );
        console.log('   ✅ Extension ready!\n');
      } catch (error: any) {
        console.error(`   ⚠️  Extension not ready after 10s: ${error.message}`);
        console.error('   Continuing anyway - snapshot may fail if extension not loaded');
      }
    } catch (error: any) {
      console.error(`   ❌ Navigation/extension error: ${error.message}`);
      throw error;
    }

    // All actions are automatically traced!
    console.log('📝 Executing agent actions (all automatically traced)...\n');
    console.log('   Action 1: Click the search box...');
    await agent.act('Click the search box');
    console.log('   ✅ Action 1 complete');
    console.log('   Action 2: Type into search field...');
    await agent.act("Type 'Sentience AI agent SDK' into the search field");
    console.log('   ✅ Action 2 complete');
    
    console.log('   Action 3: Press Enter...');
    await agent.act('Press Enter key');
    console.log('   ✅ Action 3 complete');

    // Wait for results
    console.log('   Waiting for search results...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('   Action 4: Click first result...');
    await agent.act('Click the first non-ad search result');
    console.log('   ✅ Action 4 complete');

    console.log('\n✅ Agent execution complete!');

    // 6. Get token usage stats
    const stats = agent.getTokenStats();
    console.log('\n📊 Token Usage:');
    console.log(`   Total tokens: ${stats.totalTokens}`);
    console.log(`   Prompt tokens: ${stats.totalPromptTokens}`);
    console.log(`   Completion tokens: ${stats.totalCompletionTokens}`);

  } catch (error: any) {
    console.error(`\n❌ Error during execution: ${error.message}`);
    throw error;
  } finally {
    // 7. Close tracer (uploads to cloud)
    console.log('\n📤 Uploading trace to cloud...');
    try {
      await tracer.close(true);  // Wait for upload to complete
      console.log('✅ Trace uploaded successfully!');
      console.log(`   View at: https://studio.sentienceapi.com (run_id: ${runId})`);
    } catch (error: any) {
      console.error(`⚠️  Upload failed: ${error.message}`);
      console.error(`   Trace preserved locally at: ~/.sentience/traces/pending/${runId}.jsonl`);
    }

    await browser.close();
  }
}

main().catch(console.error);

