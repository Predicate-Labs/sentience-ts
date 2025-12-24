/**
 * Example: Conversational Amazon Shopping (Level 4 - Highest Abstraction)
 *
 * This example demonstrates a complex multi-step task using natural language.
 * The ConversationalAgent automatically breaks down the task into steps,
 * executes them, and provides natural language responses.
 *
 * Run with: npm run example:conversational-amazon
 */

import { SentienceBrowser } from '../src/browser';
import { ConversationalAgent } from '../src/conversational-agent';
import { AnthropicProvider } from '../src/llm-provider';

async function main() {
  // Check for API keys
  if (!process.env.SENTIENCE_API_KEY) {
    console.error('Error: SENTIENCE_API_KEY environment variable is required');
    console.log('Set it with: export SENTIENCE_API_KEY=your-api-key');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    console.log('Set it with: export ANTHROPIC_API_KEY=your-api-key');
    process.exit(1);
  }

  console.log('Starting Conversational Amazon Shopping Example...\n');

  // Create Sentience browser
  const browser = await SentienceBrowser.create({
    apiKey: process.env.SENTIENCE_API_KEY,
    headless: false
  });

  // Create LLM provider (using Anthropic Claude)
  const llmProvider = new AnthropicProvider(
    process.env.ANTHROPIC_API_KEY,
    'claude-3-5-sonnet-20241022'
  );

  // Create conversational agent
  const agent = new ConversationalAgent({
    llmProvider,
    browser,
    verbose: true,
    maxTokens: 4000
  });

  try {
    // Example 1: Complex multi-step shopping task in ONE command
    console.log('\n=== Example 1: Complete Shopping Flow ===');
    const response1 = await agent.execute(
      "Go to Amazon, search for 'wireless headphones', and find the top-rated product under $100"
    );
    console.log('\nAgent response:', response1);

    await page.waitForTimeout(3000);

    // Example 2: Extract detailed information
    console.log('\n\n=== Example 2: Get Product Details ===');
    const response2 = await agent.chat(
      "What are the key features and customer rating of this product?"
    );
    console.log('\nAgent response:', response2);

    await browser.getPage().waitForTimeout(2000);

    // Example 3: Compare products
    console.log('\n\n=== Example 3: Product Comparison ===');
    const response3 = await agent.chat(
      "Go back to search results and tell me the price difference between the first and second results"
    );
    console.log('\nAgent response:', response3);

    await browser.getPage().waitForTimeout(2000);

    // Example 4: Verify cart functionality
    console.log('\n\n=== Example 4: Add to Cart ===');
    const response4 = await agent.chat(
      "Add the first product to the shopping cart"
    );
    console.log('\nAgent response:', response4);

    await browser.getPage().waitForTimeout(3000);

    // Example 5: Verify cart
    console.log('\n\n=== Example 5: Verify Cart ===');
    const response5 = await agent.chat(
      "Check if the product was successfully added to the cart"
    );
    console.log('\nAgent response:', response5);

    // Get conversation summary
    console.log('\n\n=== Conversation Summary ===');
    const summary = await agent.getSummary();
    console.log(summary);

    // Show conversation history
    console.log('\n\n=== Conversation History ===');
    const history = agent.getHistory();
    console.log(`Total interactions: ${history.length / 2}`);
    for (let i = 0; i < history.length; i += 2) {
      const userMsg = history[i];
      const assistantMsg = history[i + 1];
      console.log(`\nUser: ${userMsg.content}`);
      console.log(`Assistant: ${assistantMsg.content.slice(0, 100)}...`);
    }

    // Show token stats
    console.log('\n\n=== Token Statistics ===');
    const stats = agent.getTokenStats();
    console.log('Total tokens used:', stats.totalTokens);
    console.log('Average tokens per action:', stats.averageTokensPerAction);

  } catch (error) {
    console.error('Error during automation:', error);
  } finally {
    // Clean up
    await browser.close();
  }
}

main();
