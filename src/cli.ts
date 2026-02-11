/**
 * CLI commands for Sentience SDK
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { SentienceBrowser } from './browser';
import { inspect } from './inspector';
import { record, Recorder } from './recorder';
import { ScriptGenerator } from './generator';
import { click, press, typeText } from './actions';
import { snapshot, SnapshotOptions } from './snapshot';
import { screenshot } from './screenshot';

async function cmdInspect(args: string[]) {
  // Parse proxy from args
  let proxy: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--proxy' && i + 1 < args.length) {
      proxy = args[++i];
    }
  }

  const browser = new SentienceBrowser(undefined, undefined, false, proxy);
  try {
    await browser.start();
    console.log('✅ Inspector started. Hover elements to see info, click to see full details.');
    console.log('Press Ctrl+C to stop.');

    const inspector = inspect(browser);
    await inspector.start();

    // Keep running until interrupted
    process.on('SIGINT', () => {
      void (async () => {
        console.log('\n👋 Inspector stopped.');
        await inspector.stop();
        await browser.close();
        process.exit(0);
      })();
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
  // Parse arguments
  let url: string | undefined;
  let output = 'trace.json';
  let captureSnapshots = false;
  let proxy: string | undefined;
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
    } else if (args[i] === '--proxy' && i + 1 < args.length) {
      proxy = args[++i];
    }
  }

  const browser = new SentienceBrowser(undefined, undefined, false, proxy);
  try {
    await browser.start();

    // Navigate to start URL if provided
    if (url) {
      const page = browser.getPage();
      if (!page) {
        throw new Error('Browser not started. Call start() first.');
      }
      await page.goto(url);
      await page.waitForLoadState('networkidle');
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
    process.on('SIGINT', () => {
      void (async () => {
        console.log('\n💾 Saving trace...');
        await rec.save(output);
        console.log(`✅ Trace saved to ${output}`);
        await browser.close();
        process.exit(0);
      })();
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

function printDriverHelp(): void {
  console.log('\nCommands:');
  console.log('  open <url>                 Navigate to URL');
  console.log('  state [limit]              List clickable elements (optional limit)');
  console.log('  click <element_id>         Click element by id');
  console.log('  type <element_id> <text>   Type text into element');
  console.log('  press <key>                Press a key (e.g., Enter)');
  console.log('  screenshot [path]          Save screenshot (png/jpg)');
  console.log('  close                      Close browser and exit');
  console.log('  help                       Show this help');
}

function parseDriverLine(raw: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(raw)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      tokens.push(match[2]);
    } else if (match[0]) {
      tokens.push(match[0]);
    }
  }
  return tokens;
}

async function cmdDriver(args: string[]) {
  let url: string | undefined;
  let limit = 50;
  let headless = false;
  let proxy: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && i + 1 < args.length) {
      url = args[++i];
    } else if (args[i] === '--limit' && i + 1 < args.length) {
      const parsed = Number(args[++i]);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        console.error('❌ --limit must be a positive number');
        process.exit(1);
      }
      limit = Math.floor(parsed);
    } else if (args[i] === '--headless') {
      headless = true;
    } else if (args[i] === '--proxy' && i + 1 < args.length) {
      proxy = args[++i];
    }
  }

  const browser = new SentienceBrowser(undefined, undefined, headless, proxy);
  try {
    await browser.start();
    if (url) {
      const page = browser.getPage();
      if (!page) throw new Error('Browser not started. Call start() first.');
      await page.goto(url);
      await page.waitForLoadState('networkidle');
    }

    console.log("✅ Manual driver started. Type 'help' for commands.");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let closed = false;

    rl.on('close', () => {
      closed = true;
    });
    rl.on('SIGINT', () => {
      console.log('\n👋 Exiting manual driver.');
      rl.close();
    });

    const ask = async (): Promise<void> => {
      const raw = await new Promise<string>(resolve => rl.question('sentience> ', resolve));
      const trimmed = raw.trim();
      if (!trimmed) {
        return;
      }

      const parts = parseDriverLine(trimmed);
      if (parts.length === 0) return;
      const cmd = parts[0].toLowerCase();
      const cmdArgs = parts.slice(1);

      if (cmd === 'help' || cmd === '?') {
        printDriverHelp();
        return;
      }

      if (cmd === 'open') {
        if (cmdArgs.length < 1) {
          console.log('❌ Usage: open <url>');
          return;
        }
        const target = cmdArgs[0];
        const page = browser.getPage();
        if (!page) throw new Error('Browser not started. Call start() first.');
        await page.goto(target);
        await page.waitForLoadState('networkidle');
        console.log(`✅ Opened ${target}`);
        return;
      }

      if (cmd === 'state') {
        let currentLimit = limit;
        if (cmdArgs.length > 0) {
          const parsed = Number(cmdArgs[0]);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            console.log('❌ Usage: state [limit]');
            return;
          }
          currentLimit = Math.floor(parsed);
        }
        const snapOpts: SnapshotOptions = { limit: currentLimit };
        const snap = await snapshot(browser, snapOpts);
        const clickables = snap.elements.filter(el => el.visual_cues?.is_clickable);
        console.log(`URL: ${snap.url}`);
        console.log(`Clickable elements: ${clickables.length}`);
        for (const el of clickables) {
          let text = (el.text || '').replace(/\n/g, ' ').trim();
          if (text.length > 60) {
            text = `${text.slice(0, 57)}...`;
          }
          console.log(`- id=${el.id} role=${el.role} text='${text}'`);
        }
        return;
      }

      if (cmd === 'click') {
        if (cmdArgs.length !== 1) {
          console.log('❌ Usage: click <element_id>');
          return;
        }
        const elementId = Number(cmdArgs[0]);
        if (!Number.isFinite(elementId)) {
          console.log('❌ element_id must be a number');
          return;
        }
        await click(browser, elementId);
        console.log(`✅ Clicked element ${elementId}`);
        return;
      }

      if (cmd === 'type') {
        if (cmdArgs.length < 2) {
          console.log('❌ Usage: type <element_id> <text>');
          return;
        }
        const elementId = Number(cmdArgs[0]);
        if (!Number.isFinite(elementId)) {
          console.log('❌ element_id must be a number');
          return;
        }
        const text = cmdArgs.slice(1).join(' ');
        await typeText(browser, elementId, text);
        console.log(`✅ Typed into element ${elementId}`);
        return;
      }

      if (cmd === 'press') {
        if (cmdArgs.length !== 1) {
          console.log('❌ Usage: press <key> (e.g., "Enter")');
          return;
        }
        await press(browser, cmdArgs[0]);
        console.log(`✅ Pressed ${cmdArgs[0]}`);
        return;
      }

      if (cmd === 'screenshot') {
        let outPath = cmdArgs[0];
        if (!outPath) {
          outPath = `screenshot-${Date.now()}.png`;
        }
        const ext = path.extname(outPath).toLowerCase();
        const format = ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : 'png';
        const dataUrl = await screenshot(browser, { format });
        const comma = dataUrl.indexOf(',');
        const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
        console.log(`✅ Saved screenshot to ${outPath}`);
        return;
      }

      if (cmd === 'close' || cmd === 'exit' || cmd === 'quit') {
        console.log('👋 Closing browser.');
        rl.close();
        return;
      }

      console.log(`❌ Unknown command: ${cmd}. Type 'help' for options.`);
    };

    while (!closed) {
      await ask();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'inspect') {
    await cmdInspect(args.slice(1));
  } else if (command === 'record') {
    await cmdRecord(args.slice(1));
  } else if (command === 'gen') {
    await cmdGen(args.slice(1));
  } else if (command === 'driver') {
    await cmdDriver(args.slice(1));
  } else {
    console.log('Usage: sentience <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  inspect                    Start inspector mode');
    console.log('  record [--url URL]         Start recording mode');
    console.log('  gen <trace.json>           Generate script from trace');
    console.log('  driver [--url URL]         Manual driver CLI');
    console.log('');
    console.log('Options:');
    console.log(
      '  --proxy <url>              Proxy connection string (e.g., http://user:pass@host:port)'
    );
    console.log('');
    console.log('Examples:');
    console.log('  sentience inspect');
    console.log('  sentience inspect --proxy http://user:pass@proxy.com:8000');
    console.log('  sentience record --url https://example.com --output trace.json');
    console.log(
      '  sentience record --proxy http://user:pass@proxy.com:8000 --url https://example.com'
    );
    console.log('  sentience gen trace.json --lang py --output script.py');
    console.log('  predicate driver --url https://example.com');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
