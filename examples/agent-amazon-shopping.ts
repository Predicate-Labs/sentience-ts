/**
 * Example: Amazon Shopping using SentienceAgent
 *
 * Demonstrates complex multi-step automation with the agent layer.
 * Reduces 300+ lines of manual code to ~20 lines of natural language commands.
 *
 * Run with:
 *   npx ts-node examples/agent-amazon-shopping.ts
 */

import { SentienceBrowser, SentienceAgent, OpenAIProvider } from '../src';

async function main() {
  // Set up environment
  const sentienceKey = process.env.SENTIENCE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    console.error('❌ Error: OPENAI_API_KEY environment variable not set');
    console.log('Set it with: export OPENAI_API_KEY="your-key-here"');
    process.exit(1);
  }

  // Initialize browser and agent
  const browser = await SentienceBrowser.create({
    apiKey: sentienceKey,
    headless: false
  });

  const llm = new OpenAIProvider(openaiKey, 'gpt-4o-mini');
  const agent = new SentienceAgent(browser, llm, 50, true);

  try {
    console.log('🛒 Amazon Shopping Demo with SentienceAgent\n');

    // Navigate to Amazon
    await browser.getPage().goto('https://www.amazon.com');
    await browser.getPage().waitForLoadState('networkidle');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Search for product
    console.log('Step 1: Searching for wireless mouse...\n');
    await agent.act('Click the search box');
    await agent.act("Type 'wireless mouse' into the search field");
    await agent.act('Press Enter key');

    // Wait for search results
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Select a product
    console.log('Step 2: Selecting a product...\n');
    await agent.act('Click the first visible product in the search results');

    // Wait for product page to load
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Add to cart
    console.log('Step 3: Adding to cart...\n');
    await agent.act("Click the 'Add to Cart' button");

    // Wait for cart confirmation
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n✅ Shopping automation completed!\n');

    // Print execution summary
    const stats = agent.getTokenStats();
    const history = agent.getHistory();

    console.log('📊 Execution Summary:');
    console.log(`   Actions executed: ${history.length}`);
    console.log(`   Total tokens: ${stats.totalTokens}`);
    console.log(`   Avg tokens per action: ${Math.round(stats.totalTokens / history.length)}`);

    console.log('\n📜 Action History:');
    history.forEach((entry, i) => {
      const status = entry.success ? '✅' : '❌';
      console.log(`   ${i + 1}. ${status} ${entry.goal} (${entry.durationMs}ms)`);
    });

    console.log('\n💡 Code Comparison:');
    console.log('   Old approach: ~350 lines (manual snapshots, prompts, filtering)');
    console.log('   Agent approach: ~6 lines (natural language commands)');
    console.log('   Reduction: 98%');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
