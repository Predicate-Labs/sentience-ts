/**
 * Example: Google Search using SentienceAgent
 *
 * Demonstrates high-level agent abstraction with natural language commands.
 * No manual snapshot filtering or prompt engineering required.
 *
 * Run with:
 *   npx ts-node examples/agent-google-search.ts
 */

import { SentienceBrowser, SentienceAgent, OpenAIProvider } from '../src';

async function main() {
  // Initialize browser
  const browser = await SentienceBrowser.create({
    apiKey: process.env.SENTIENCE_API_KEY,
    headless: false
  });

  // Initialize LLM provider (OpenAI GPT-4o-mini for cost efficiency)
  const llm = new OpenAIProvider(
    process.env.OPENAI_API_KEY!,
    'gpt-4o-mini'
  );

  // Create agent
  const agent = new SentienceAgent(browser, llm, 50, true);

  try {
    console.log('🔍 Google Search Demo with SentienceAgent\n');

    // Navigate to Google
    await browser.getPage().goto('https://www.google.com');
    await browser.getPage().waitForLoadState('networkidle');

    // Use agent to perform search - just natural language commands!
    await agent.act('Click the search box');
    await agent.act("Type 'best mechanical keyboards 2024' into the search field");
    await agent.act('Press Enter key');

    // Wait for results
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Click first result
    await agent.act('Click the first non-ad search result');

    // Wait for page load
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n✅ Search completed successfully!\n');

    // Print token usage stats
    const stats = agent.getTokenStats();
    console.log('📊 Token Usage:');
    console.log(`   Total tokens: ${stats.totalTokens}`);
    console.log(`   Prompt tokens: ${stats.totalPromptTokens}`);
    console.log(`   Completion tokens: ${stats.totalCompletionTokens}`);
    console.log('\n📜 Action Breakdown:');
    stats.byAction.forEach((action, i) => {
      console.log(`   ${i + 1}. ${action.goal}: ${action.totalTokens} tokens`);
    });

  } finally {
    await browser.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
