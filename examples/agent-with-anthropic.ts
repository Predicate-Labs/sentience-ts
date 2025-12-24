/**
 * Example: Using SentienceAgent with Anthropic Claude
 *
 * Demonstrates pluggable LLM providers - use Claude instead of GPT.
 * Same API, different brain!
 *
 * Run with:
 *   npm install @anthropic-ai/sdk
 *   npx ts-node examples/agent-with-anthropic.ts
 */

import { SentienceBrowser, SentienceAgent, AnthropicProvider } from '../src';

async function main() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicKey) {
    console.error('❌ Error: ANTHROPIC_API_KEY environment variable not set');
    console.log('Get your key at: https://console.anthropic.com/');
    console.log('Set it with: export ANTHROPIC_API_KEY="your-key-here"');
    process.exit(1);
  }

  // Initialize browser
  const browser = await SentienceBrowser.create({
    apiKey: process.env.SENTIENCE_API_KEY,
    headless: false
  });

  // Use Anthropic Claude 3.5 Sonnet (latest model)
  const llm = new AnthropicProvider(
    anthropicKey,
    'claude-3-5-sonnet-20241022'
  );

  // Create agent (same API regardless of LLM provider)
  const agent = new SentienceAgent(browser, llm, 50, true);

  try {
    console.log('🤖 Agent Demo with Anthropic Claude 3.5 Sonnet\n');

    // Navigate to Wikipedia
    await browser.getPage().goto('https://www.wikipedia.org');
    await browser.getPage().waitForLoadState('networkidle');

    // Search for topic
    console.log('Searching for "Artificial Intelligence"...\n');
    await agent.act('Click the search box');
    await agent.act("Type 'Artificial Intelligence' into the search field");
    await agent.act('Press Enter key');

    // Wait for article to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n✅ Navigation completed!\n');

    // Display stats
    const stats = agent.getTokenStats();
    console.log('📊 Claude Token Usage:');
    console.log(`   Model: ${stats.byAction[0]?.model || 'claude-3-5-sonnet-20241022'}`);
    console.log(`   Total tokens: ${stats.totalTokens}`);
    console.log(`   Input tokens: ${stats.totalPromptTokens}`);
    console.log(`   Output tokens: ${stats.totalCompletionTokens}`);

    console.log('\n💡 BYOB (Bring Your Own Brain):');
    console.log('   ✅ OpenAIProvider - GPT-4, GPT-4o, GPT-4o-mini');
    console.log('   ✅ AnthropicProvider - Claude 3.5 Sonnet, Claude 3 Opus');
    console.log('   🔌 Custom - Implement LLMProvider for any model');

  } finally {
    await browser.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
