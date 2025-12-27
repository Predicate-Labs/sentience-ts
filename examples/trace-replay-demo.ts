/**
 * Trace Replay Demo
 *
 * Demonstrates how to read and analyze trace files
 *
 * Usage:
 *   ts-node examples/trace-replay-demo.ts <trace-file.jsonl>
 */

import * as fs from 'fs';
import * as path from 'path';
import { TraceEvent } from '../src/tracing/types';

function analyzeTrace(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: Trace file not found: ${filePath}`);
    process.exit(1);
  }

  console.log('📖 Reading trace file...\n');

  const content = fs.readFileSync(filePath, 'utf-8');
  const events: TraceEvent[] = content
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));

  console.log(`✅ Loaded ${events.length} events\n`);

  // Extract metadata
  const runStart = events.find(e => e.type === 'run_start');
  const runEnd = events.find(e => e.type === 'run_end');

  if (runStart) {
    console.log('🏁 Run Metadata:');
    console.log(`   Run ID: ${runStart.run_id}`);
    console.log(`   Agent: ${runStart.data.agent}`);
    console.log(`   LLM Model: ${runStart.data.llm_model || 'N/A'}`);
    console.log(`   Started: ${runStart.ts}`);
    if (runEnd) {
      console.log(`   Ended: ${runEnd.ts}`);
      console.log(`   Total Steps: ${runEnd.data.steps}`);
    }
    console.log();
  }

  // Event type breakdown
  const eventTypes = events.reduce((acc: Record<string, number>, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  console.log('📊 Event Types:');
  Object.entries(eventTypes)
    .sort(([, a], [, b]) => b - a)
    .forEach(([type, count]) => {
      console.log(`   ${type.padEnd(15)} : ${count}`);
    });
  console.log();

  // Step analysis
  const stepStarts = events.filter(e => e.type === 'step_start');
  console.log(`🔄 Steps (${stepStarts.length} total):`);
  stepStarts.forEach(step => {
    console.log(`   [Step ${step.data.step_index}] ${step.data.goal}`);
    console.log(`      URL: ${step.data.url}`);
    console.log(`      Attempt: ${step.data.attempt}`);
  });
  console.log();

  // Token usage analysis
  const llmEvents = events.filter(e => e.type === 'llm_response');
  if (llmEvents.length > 0) {
    const totalPromptTokens = llmEvents.reduce(
      (sum, e) => sum + (e.data.prompt_tokens || 0),
      0
    );
    const totalCompletionTokens = llmEvents.reduce(
      (sum, e) => sum + (e.data.completion_tokens || 0),
      0
    );

    console.log('💬 LLM Usage:');
    console.log(`   Total Calls: ${llmEvents.length}`);
    console.log(`   Prompt Tokens: ${totalPromptTokens}`);
    console.log(`   Completion Tokens: ${totalCompletionTokens}`);
    console.log(`   Total Tokens: ${totalPromptTokens + totalCompletionTokens}`);
    console.log();

    console.log('   Decisions:');
    llmEvents.forEach((event, i) => {
      const responsePreview = event.data.response_text?.substring(0, 50) || 'N/A';
      console.log(`     [${i + 1}] ${responsePreview}...`);
    });
    console.log();
  }

  // Action analysis
  const actions = events.filter(e => e.type === 'action');
  if (actions.length > 0) {
    console.log(`⚡ Actions (${actions.length} total):`);
    actions.forEach((action, i) => {
      const status = action.data.success ? '✅' : '❌';
      const actionType = action.data.action_type || 'unknown';
      const details = action.data.element_id
        ? `element ${action.data.element_id}`
        : action.data.text
        ? `text: "${action.data.text}"`
        : action.data.key
        ? `key: ${action.data.key}`
        : '';

      console.log(`   [${i + 1}] ${status} ${actionType} ${details}`);
    });
    console.log();
  }

  // Error analysis
  const errors = events.filter(e => e.type === 'error');
  if (errors.length > 0) {
    console.log(`❌ Errors (${errors.length} total):`);
    errors.forEach((error, i) => {
      console.log(`   [${i + 1}] Attempt ${error.data.attempt}: ${error.data.error}`);
    });
    console.log();
  } else {
    console.log('✅ No errors recorded\n');
  }

  // Timeline
  console.log('⏱️  Timeline:');
  events.forEach(event => {
    const time = new Date(event.ts).toLocaleTimeString();
    const stepInfo = event.step_id ? ` [${event.step_id.substring(0, 8)}]` : '';
    const icon = {
      run_start: '🏁',
      run_end: '🏁',
      step_start: '▶️',
      snapshot: '📸',
      llm_response: '🧠',
      action: '⚡',
      error: '❌',
    }[event.type] || '•';

    console.log(`   [${event.seq.toString().padStart(3)}] ${time} ${icon} ${event.type}${stepInfo}`);
  });
  console.log();
}

// CLI usage
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: ts-node examples/trace-replay-demo.ts <trace-file.jsonl>');
  console.log('\nExample:');
  console.log('  ts-node examples/trace-replay-demo.ts traces/abc-123.jsonl');
  process.exit(1);
}

const traceFile = path.resolve(args[0]);
analyzeTrace(traceFile);
