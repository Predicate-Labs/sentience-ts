/**
 * Example: Conversational Google Search (Level 4 - Highest Abstraction)
 *
 * This example demonstrates the ConversationalAgent, which accepts
 * natural language instructions and automatically plans and executes
 * browser automation tasks.
 *
 * Run with: npm run example:conversational-google
 */

import { SentienceBrowser } from '../src/browser';
import { ConversationalAgent } from '../src/conversational-agent';
import { OpenAIProvider } from '../src/llm-provider';

async function main() {
  // Check for API keys
  if (!process.env.SENTIENCE_API_KEY) {
    console.error('Error: SENTIENCE_API_KEY environment variable is required');
    console.log('Set it with: export SENTIENCE_API_KEY=your-api-key');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    console.log('Set it with: export OPENAI_API_KEY=your-api-key');
    process.exit(1);
  }

  console.log('Starting Conversational Google Search Example...\n');

  // Create Sentience browser
  const browser = await SentienceBrowser.create({
    apiKey: process.env.SENTIENCE_API_KEY,
    headless: false
  });

  // Create LLM provider
  const llmProvider = new OpenAIProvider(process.env.OPENAI_API_KEY, 'gpt-4o');

  // Create conversational agent
  const agent = new ConversationalAgent({
    llmProvider,
    browser,
    verbose: true
  });

  try {
    // Example 1: Simple search
    console.log('\n=== Example 1: Simple Search ===');
    const response1 = await agent.execute(
      "Go to Google and search for 'TypeScript tutorial'"
    );
    console.log('\nAgent response:', response1);

    // Wait a moment to see the results
    await page.waitForTimeout(3000);

    // Example 2: Extract information
    console.log('\n\n=== Example 2: Extract Information ===');
    const response2 = await agent.execute(
      "What are the top 3 search results?"
    );
    console.log('\nAgent response:', response2);

    // Example 3: Contextual follow-up
    console.log('\n\n=== Example 3: Contextual Follow-up ===');
    const response3 = await agent.chat(
      "Click on the first result"
    );
    console.log('\nAgent response:', response3);

    await browser.getPage().waitForTimeout(3000);

    // Example 4: Verification
    console.log('\n\n=== Example 4: Verification ===');
    const response4 = await agent.chat(
      "Verify that we're now on a page about TypeScript"
    );
    console.log('\nAgent response:', response4);

    // Get conversation summary
    console.log('\n\n=== Conversation Summary ===');
    const summary = await agent.getSummary();
    console.log(summary);

    // Show token stats
    console.log('\n=== Token Statistics ===');
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
