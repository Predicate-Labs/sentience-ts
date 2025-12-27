/**
 * Example: Using Authentication Session Injection with Sentience SDK
 *
 * This example demonstrates how to inject pre-recorded authentication sessions
 * (cookies + localStorage) into SentienceBrowser to start agents already logged in.
 *
 * Two Workflows:
 * 1. Inject Pre-recorded Session: Load a saved session from a JSON file
 * 2. Persistent Sessions: Use a user data directory to persist sessions across runs
 *
 * Benefits:
 * - Bypass login screens and CAPTCHAs
 * - Save tokens and reduce costs (no login steps needed)
 * - Maintain stateful sessions across agent runs
 * - Act as authenticated users (access "My Orders", "My Account", etc.)
 *
 * Usage:
 *   # Workflow 1: Inject pre-recorded session
 *   ts-node examples/auth-injection-agent.ts --storage-state auth.json
 *
 *   # Workflow 2: Use persistent user data directory
 *   ts-node examples/auth-injection-agent.ts --user-data-dir ./chrome_profile
 *
 * Requirements:
 * - OpenAI API key (OPENAI_API_KEY) for LLM
 * - Optional: Sentience API key (SENTIENCE_API_KEY) for Pro/Enterprise features
 * - Optional: Pre-saved storage state file (auth.json) or user data directory
 */

import { SentienceBrowser, SentienceAgent, OpenAIProvider, saveStorageState } from '../src';
import * as fs from 'fs';
import * as readline from 'readline';

async function exampleInjectStorageState() {
  console.log('='.repeat(60));
  console.log('Example 1: Inject Pre-recorded Session');
  console.log('='.repeat(60));

  const storageStateFile = 'auth.json';

  if (!fs.existsSync(storageStateFile)) {
    console.log(`\n⚠️  Storage state file not found: ${storageStateFile}`);
    console.log('\n   To create this file:');
    console.log('   1. Log in manually to your target website');
    console.log('   2. Use saveStorageState() to save the session');
    console.log('\n   Example code:');
    console.log('   ```typescript');
    console.log('   import { SentienceBrowser, saveStorageState } from \'sentience-ts\';');
    console.log('   const browser = new SentienceBrowser();');
    console.log('   await browser.start();');
    console.log('   await browser.getPage().goto(\'https://example.com\');');
    console.log('   // ... log in manually ...');
    console.log('   await saveStorageState(browser.getContext(), \'auth.json\');');
    console.log('   ```');
    console.log('\n   Skipping this example...\n');
    return;
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.error('❌ Error: OPENAI_API_KEY not set');
    return;
  }

  // Create browser with storage state injection
  const browser = new SentienceBrowser(
    undefined, // apiKey
    undefined, // apiUrl
    false,     // headless
    undefined, // proxy
    undefined, // userDataDir
    storageStateFile // storageState - inject saved session
  );

  const llm = new OpenAIProvider(openaiKey, 'gpt-4o-mini');
  const agent = new SentienceAgent(browser, llm, 50, true);

  try {
    console.log('\n🚀 Starting browser with injected session...');
    await browser.start();

    console.log('🌐 Navigating to authenticated page...');
    // Agent starts already logged in!
    await browser.getPage().goto('https://example.com/orders'); // Or your authenticated page
    await browser.getPage().waitForLoadState('networkidle');

    console.log('\n✅ Browser started with pre-injected authentication!');
    console.log('   Agent can now access authenticated pages without logging in');

    // Example: Use agent on authenticated pages
    await agent.act('Show me my recent orders');
    await agent.act('Click on the first order');

    console.log('\n✅ Agent execution complete!');

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

async function examplePersistentSession() {
  console.log('='.repeat(60));
  console.log('Example 2: Persistent Session (User Data Directory)');
  console.log('='.repeat(60));

  const userDataDir = './chrome_profile';

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.error('❌ Error: OPENAI_API_KEY not set');
    return;
  }

  // Create browser with persistent user data directory
  const browser = new SentienceBrowser(
    undefined, // apiKey
    undefined, // apiUrl
    false,     // headless
    undefined, // proxy
    userDataDir, // userDataDir - persist cookies and localStorage
    undefined  // storageState
  );

  const llm = new OpenAIProvider(openaiKey, 'gpt-4o-mini');
  const agent = new SentienceAgent(browser, llm, 50, true);

  try {
    console.log('\n🚀 Starting browser with persistent session...');
    await browser.start();

    // Check if this is first run (no existing session)
    await browser.getPage().goto('https://example.com');
    await browser.getPage().waitForLoadState('networkidle');

    // First run: Agent needs to log in
    // Second run: Agent is already logged in (cookies persist)
    if (fs.existsSync(userDataDir)) {
      console.log('\n✅ Using existing session from previous run');
      console.log('   Cookies and localStorage are loaded automatically');
    } else {
      console.log('\n📝 First run - session will be saved after login');
      console.log('   Next run will automatically use saved session');
    }

    // Example: Log in (first run) or use existing session (subsequent runs)
    await agent.act('Click the sign in button');
    await agent.act('Type your email into the email field');
    await agent.act('Type your password into the password field');
    await agent.act('Click the login button');

    console.log('\n✅ Session will persist in:', userDataDir);
    console.log('   Next run will automatically use this session');

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

async function exampleSaveStorageState() {
  console.log('='.repeat(60));
  console.log('Example 3: Save Current Session');
  console.log('='.repeat(60));

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.error('❌ Error: OPENAI_API_KEY not set');
    return;
  }

  const browser = new SentienceBrowser();
  const llm = new OpenAIProvider(openaiKey, 'gpt-4o-mini');
  const agent = new SentienceAgent(browser, llm, 50, true);

  try {
    console.log('\n🚀 Starting browser...');
    await browser.start();

    console.log('🌐 Navigate to your target website and log in manually...');
    await browser.getPage().goto('https://example.com');
    await browser.getPage().waitForLoadState('networkidle');

    console.log('\n⏸️  Please log in manually in the browser window');
    console.log('   Press Enter when you\'re done logging in...');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise<void>(resolve => {
      rl.question('', () => {
        rl.close();
        resolve();
      });
    });

    // Save the current session
    const storageStateFile = 'auth.json';
    await saveStorageState(browser.getContext(), storageStateFile);

    console.log(`\n✅ Session saved to: ${storageStateFile}`);
    console.log('   You can now use this file with storageState parameter:');
    console.log(`   const browser = new SentienceBrowser(..., '${storageStateFile}');`);

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const storageStateArg = args.find(arg => arg.startsWith('--storage-state='));
  const userDataDirArg = args.find(arg => arg.startsWith('--user-data-dir='));
  const saveSession = args.includes('--save-session');

  console.log('\n' + '='.repeat(60));
  console.log('Sentience SDK - Authentication Session Injection Examples');
  console.log('='.repeat(60) + '\n');

  if (saveSession) {
    await exampleSaveStorageState();
  } else if (storageStateArg) {
    // Would need to modify example to use provided path
    await exampleInjectStorageState();
  } else if (userDataDirArg) {
    // Would need to modify example to use provided directory
    await examplePersistentSession();
  } else {
    // Run all examples
    await exampleSaveStorageState();
    console.log('\n');
    await exampleInjectStorageState();
    console.log('\n');
    await examplePersistentSession();
  }

  console.log('\n' + '='.repeat(60));
  console.log('Examples Complete!');
  console.log('='.repeat(60));
  console.log('\n💡 Tips:');
  console.log('   - Use storageState to inject pre-recorded sessions');
  console.log('   - Use userDataDir to persist sessions across runs');
  console.log('   - Save sessions after manual login for reuse');
  console.log('   - Bypass login screens and CAPTCHAs with valid sessions');
  console.log('   - Reduce token costs by skipping login steps\n');
}

main().catch(console.error);

