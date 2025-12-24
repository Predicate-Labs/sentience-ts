/**
 * Example: Amazon Shopping using ConversationalAgent (Level 3)
 *
 * This demonstrates the power of natural language conversation:
 * - Complex multi-step tasks in ONE command
 * - Automatic planning and execution
 * - Natural language responses
 *
 * Code comparison:
 * - Manual approach: ~350 lines
 * - Level 2 (SentienceAgent): ~20 lines of technical commands
 * - Level 3 (ConversationalAgent): ~3 lines of natural conversation!
 *
 * Run with:
 *   npx ts-node examples/conversational-amazon-shopping.ts
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

  // Initialize LLM with GPT-4o for better complex planning
  // (You can use gpt-4o-mini for cost savings, but gpt-4o handles complex tasks better)
  const llm = new OpenAIProvider(openaiKey, 'gpt-4o');

  // Create conversational agent
  const agent = new ConversationalAgent(browser, llm, true);

  try {
    console.log('🛒 Conversational Amazon Shopping Demo\n');
    console.log('Level 3: One Natural Language Command Does Everything!\n');

    // Navigate to Amazon
    await browser.getPage().goto('https://www.amazon.com');
    await browser.getPage().waitForLoadState('networkidle');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // ONE natural language command handles entire workflow!
    // The agent will:
    // 1. Automatically plan: FIND_AND_CLICK search → FIND_AND_TYPE → PRESS_KEY → etc.
    // 2. Execute each step
    // 3. Return natural language summary
    console.log('📝 User: "Search for wireless mouse, click the first product, and add it to my cart"\n');

    const response = await agent.execute(
      'Search for wireless mouse, click the first product that appears, and add it to my cart'
    );

    console.log('\n' + '='.repeat(70));
    console.log('🤖 Agent Response:');
    console.log(response);
    console.log('='.repeat(70));

    // The agent automatically synthesized a natural response like:
    // "I searched for 'wireless mouse' on Amazon, selected the Logitech M185
    //  wireless mouse ($12.99), and successfully added it to your cart."

    // Get detailed session summary
    await new Promise(resolve => setTimeout(resolve, 2000));
    const summary = await agent.getSummary();

    console.log('\n📊 Session Summary:');
    console.log(summary);

    // Print execution details
    const history = agent.getHistory();
    console.log('\n📜 Execution Details:');
    history.forEach((entry, i) => {
      console.log(`\n${i + 1}. User Request: ${entry.user_input}`);
      console.log(`   Plan: ${entry.plan.intent}`);
      console.log(`   Steps executed: ${entry.plan.steps.length}`);
      entry.plan.steps.forEach((step, j) => {
        const result = entry.results[j];
        const status = result?.success ? '✅' : '❌';
        console.log(`      ${j + 1}. ${status} ${step.description}`);
      });
      console.log(`   Response: ${entry.response}`);
      console.log(`   Duration: ${entry.duration_ms}ms`);
    });

    // Token usage
    const stats = agent.getTokenStats();
    console.log('\n💰 Cost Analysis:');
    console.log(`   Total tokens: ${stats.totalTokens}`);
    console.log(`   Planning LLM calls: 1 (plan creation)`);
    console.log(`   Execution LLM calls: ${history[0]?.plan.steps.length || 0} (technical agent)`);
    console.log(`   Synthesis LLM calls: 1 (natural response)`);
    console.log(`   Estimated cost: $${(stats.totalTokens / 1000000 * 0.15).toFixed(4)}`);

    console.log('\n🎯 Code Comparison:');
    console.log('   Manual approach:         ~350 lines (prompts, parsing, error handling)');
    console.log('   Level 2 (SentienceAgent): ~20 lines (technical commands)');
    console.log('   Level 3 (Conversational):  ~3 lines (natural language!)');
    console.log('   \n   Reduction: 99% less code! 🚀');

    console.log('\n✨ Level 3 Benefits:');
    console.log('   ✅ Zero coding knowledge needed');
    console.log('   ✅ Complex tasks in one command');
    console.log('   ✅ Automatic planning and breakdown');
    console.log('   ✅ Natural language input AND output');
    console.log('   ✅ Conversational context memory');
    console.log('   ✅ Perfect for chatbots, voice assistants, end-user tools');

    console.log('\n⚠️  Tradeoffs vs Level 2:');
    console.log('   📈 2-3x higher LLM costs (planning + synthesis overhead)');
    console.log('   🐌 Slower execution (planning step added)');
    console.log('   🎲 Less deterministic (LLM plans may vary)');

    console.log('\n💡 When to use Level 3:');
    console.log('   • Building chatbots or voice assistants');
    console.log('   • End-user facing automation tools');
    console.log('   • Complex workflows that need planning');
    console.log('   • When natural language I/O is essential');

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
