/**
 * CLI commands for Sentience SDK
 */

import * as fs from 'fs';
import { SentienceBrowser } from './browser';
import { inspect } from './inspector';
import { record, Recorder, Trace } from './recorder';
import { ScriptGenerator } from './generator';

async function cmdInspect() {
  const browser = new SentienceBrowser(undefined, undefined, false);
  try {
    await browser.start();
    console.log('✅ Inspector started. Hover elements to see info, click to see full details.');
    console.log('Press Ctrl+C to stop.');

    const inspector = inspect(browser);
    await inspector.start();

    // Keep running until interrupted
    process.on('SIGINT', async () => {
      console.log('\n👋 Inspector stopped.');
      await inspector.stop();
      await browser.close();
      process.exit(0);
    });

    // Wait indefinitely
    await new Promise(() => {});
  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
    await browser.close();
    process.exit(1);
  }
}

async function cmdRecord(args: string[]) {
  const browser = new SentienceBrowser(undefined, undefined, false);
  try {
    await browser.start();

    // Parse arguments
    let url: string | undefined;
    let output = 'trace.json';
    let captureSnapshots = false;
    const maskPatterns: string[] = [];

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--url' && i + 1 < args.length) {
        url = args[++i];
      } else if (args[i] === '--output' || args[i] === '-o') {
        output = args[++i];
      } else if (args[i] === '--snapshots') {
        captureSnapshots = true;
      } else if (args[i] === '--mask' && i + 1 < args.length) {
        maskPatterns.push(args[++i]);
      }
    }

    // Navigate to start URL if provided
    if (url) {
      await browser.getPage().goto(url);
      await browser.getPage().waitForLoadState('networkidle');
    }

    console.log('✅ Recording started. Perform actions in the browser.');
    console.log('Press Ctrl+C to stop and save trace.');

    const rec = record(browser, captureSnapshots);
    rec.start();

    // Add mask patterns
    for (const pattern of maskPatterns) {
      rec.addMaskPattern(pattern);
    }

    // Keep running until interrupted
    process.on('SIGINT', async () => {
      console.log('\n💾 Saving trace...');
      await rec.save(output);
      console.log(`✅ Trace saved to ${output}`);
      await browser.close();
      process.exit(0);
    });

    // Wait indefinitely
    await new Promise(() => {});
  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
    await browser.close();
    process.exit(1);
  }
}

async function cmdGen(args: string[]) {
  try {
    // Parse arguments
    let traceFile: string | undefined;
    let lang: 'py' | 'ts' = 'py';
    let output: string | undefined;

    for (let i = 0; i < args.length; i++) {
      if (args[i] && !args[i].startsWith('--')) {
        traceFile = args[i];
      } else if (args[i] === '--lang') {
        lang = args[++i] as 'py' | 'ts';
      } else if (args[i] === '--output' || args[i] === '-o') {
        output = args[++i];
      }
    }

    if (!traceFile) {
      console.error('❌ Trace file required');
      process.exit(1);
    }

    // Load trace
    const trace = await Recorder.load(traceFile);

    // Generate script
    const generator = new ScriptGenerator(trace);

    if (lang === 'py') {
      const outputFile = output || 'generated.py';
      await generator.savePython(outputFile);
      console.log(`✅ Generated Python script: ${outputFile}`);
    } else {
      const outputFile = output || 'generated.ts';
      await generator.saveTypeScript(outputFile);
      console.log(`✅ Generated TypeScript script: ${outputFile}`);
    }
  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'inspect') {
    await cmdInspect();
  } else if (command === 'record') {
    await cmdRecord(args.slice(1));
  } else if (command === 'gen') {
    await cmdGen(args.slice(1));
  } else {
    console.log('Usage: sentience <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  inspect              Start inspector mode');
    console.log('  record [--url URL]   Start recording mode');
    console.log('  gen <trace.json>     Generate script from trace');
    console.log('');
    console.log('Examples:');
    console.log('  sentience inspect');
    console.log('  sentience record --url https://example.com --output trace.json');
    console.log('  sentience gen trace.json --lang py --output script.py');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

