/**
 * Example: Google Search using ConversationalAgent (Level 3)
 *
 * This demonstrates the highest abstraction level - full natural language conversation.
 * Just describe what you want, and the agent plans and executes automatically!
 *
 * Run with:
 *   npx ts-node examples/conversational-google-search.ts
 */

import { SentienceBrowser, ConversationalAgent, OpenAIProvider } from '../src';

async function main() {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    console.error('❌ Error: OPENAI_API_KEY environment variable not set');
    console.log('Set it with: export OPENAI_API_KEY="your-key-here"');
    process.exit(1);
  }

  // Initialize browser
  const browser = await SentienceBrowser.create({
    apiKey: process.env.SENTIENCE_API_KEY,
    headless: false
  });

  // Initialize LLM provider
  const llm = new OpenAIProvider(openaiKey, 'gpt-4o-mini');

  // Create conversational agent
  const agent = new ConversationalAgent(browser, llm, true);

  try {
    console.log('🔍 Conversational Google Search Demo\n');
    console.log('Level 3: Natural Language Conversation\n');

    // Navigate to Google first
    await browser.getPage().goto('https://www.google.com');
    await browser.getPage().waitForLoadState('networkidle');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Single natural language command - agent handles everything!
    console.log('📝 User Request: "Search for best mechanical keyboards 2024"\n');
    const response1 = await agent.execute(
      'Search for best mechanical keyboards 2024 and tell me what you find'
    );

    console.log('\n' + '='.repeat(70));
    console.log('Agent Response:');
    console.log(response1);
    console.log('='.repeat(70));

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Contextual follow-up (agent remembers previous actions)
    console.log('\n📝 Follow-up Request: "Click the first result"\n');
    const response2 = await agent.execute('Click the first non-ad result');

    console.log('\n' + '='.repeat(70));
    console.log('Agent Response:');
    console.log(response2);
    console.log('='.repeat(70));

    // Get session summary
    await new Promise(resolve => setTimeout(resolve, 2000));
    const summary = await agent.getSummary();

    console.log('\n📊 Session Summary:');
    console.log(summary);

    // Print token usage
    const stats = agent.getTokenStats();
    console.log('\n💰 Token Usage:');
    console.log(`   Total tokens: ${stats.totalTokens}`);
    console.log(`   Estimated cost: $${(stats.totalTokens / 1000000 * 0.15).toFixed(4)}`);

    // Print conversation history
    const history = agent.getHistory();
    console.log('\n📜 Conversation History:');
    history.forEach((entry, i) => {
      console.log(`\n${i + 1}. User: ${entry.user_input}`);
      console.log(`   Agent: ${entry.response}`);
      console.log(`   Duration: ${entry.duration_ms}ms`);
      console.log(`   Steps executed: ${entry.results.length}`);
    });

    console.log('\n✨ Key Differences from Level 2 (SentienceAgent):');
    console.log('   ✅ Natural language input AND output');
    console.log('   ✅ Automatic multi-step planning');
    console.log('   ✅ Conversational context awareness');
    console.log('   ✅ Human-friendly responses');
    console.log('   ⚠️  Higher LLM costs (2-3x Level 2)');
    console.log('   ⚠️  Less control over individual steps');

  } finally {
    await browser.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
