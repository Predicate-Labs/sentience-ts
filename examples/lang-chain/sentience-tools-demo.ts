/**
 * Example: Wrap Sentience TS SDK primitives as LangChain JS tools.
 *
 * Install (example):
 *   npm install @predicatesystems/sdk @langchain/core zod
 *
 * Run:
 *   npx ts-node examples/lang-chain/sentience-tools-demo.ts
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { SentienceBrowser, snapshot, click, typeText, press, read } from '../../src/index';

async function main() {
  const apiKey = process.env.SENTIENCE_API_KEY as string | undefined;
  const browser = new SentienceBrowser(apiKey, undefined, false);

  await browser.start();
  await browser.getPage().goto('https://example.com');

  // Tool: snapshot_state
  const snapshotState = new DynamicStructuredTool({
    name: 'sentience_snapshot_state',
    description:
      'Observe: take a bounded snapshot (default limit=50) and return elements with ids/roles/bboxes.',
    schema: z.object({
      limit: z.number().int().min(1).max(500).default(50),
    }),
    func: async ({ limit }) => {
      const snap = await snapshot(browser, { limit });
      return JSON.stringify(
        {
          url: snap.url,
          elements: snap.elements.map(e => ({
            id: e.id,
            role: e.role,
            text: e.text,
            bbox: e.bbox,
            importance: e.importance,
          })),
        },
        null,
        2
      );
    },
  });

  // Tool: click(element_id)
  const clickTool = new DynamicStructuredTool({
    name: 'sentience_click',
    description: 'Act: click an element by elementId from snapshot.',
    schema: z.object({
      elementId: z.number().int(),
    }),
    func: async ({ elementId }) => JSON.stringify(await click(browser, elementId)),
  });

  // Tool: type_text(element_id, text)
  const typeTool = new DynamicStructuredTool({
    name: 'sentience_type_text',
    description: 'Act: type text into an element by elementId from snapshot.',
    schema: z.object({
      elementId: z.number().int(),
      text: z.string(),
    }),
    func: async ({ elementId, text }) => JSON.stringify(await typeText(browser, elementId, text)),
  });

  // Tool: press_key(key)
  const pressTool = new DynamicStructuredTool({
    name: 'sentience_press_key',
    description: 'Act: press a keyboard key (Enter/Escape/Tab/etc.).',
    schema: z.object({
      key: z.string(),
    }),
    func: async ({ key }) => JSON.stringify(await press(browser, key)),
  });

  // Tool: read_page(format)
  const readTool = new DynamicStructuredTool({
    name: 'sentience_read_page',
    description: 'Observe: read page content as text/markdown/raw HTML.',
    schema: z.object({
      format: z.enum(['raw', 'text', 'markdown']).default('text'),
    }),
    func: async ({ format }) => JSON.stringify(await read(browser, { format })),
  });

  const tools = [snapshotState, clickTool, typeTool, pressTool, readTool];
  console.log('Created LangChain tools:', tools.map(t => t.name));

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

