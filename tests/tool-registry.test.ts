import fs from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import { defineTool, ToolRegistry } from '../src/tools/registry';
import { FileSandbox, registerFilesystemTools } from '../src/tools/filesystem';

describe('ToolRegistry', () => {
  it('validates and executes tools', async () => {
    const registry = new ToolRegistry();
    registry.register(
      defineTool<{ msg: string }, { msg: string }, null>({
        name: 'echo',
        description: 'Echo input',
        input: z.object({ msg: z.string() }),
        output: z.object({ msg: z.string() }),
        handler: async (_ctx, params) => ({ msg: params.msg }),
      })
    );

    const result = await registry.execute<{ msg: string }>('echo', { msg: 'hello' });
    expect(result.msg).toBe('hello');
  });
});

describe('Filesystem tools', () => {
  it('writes and reads from sandbox', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sentience-tools-'));
    const sandbox = new FileSandbox(tmpRoot);
    const registry = new ToolRegistry();
    registerFilesystemTools(registry, sandbox);

    await registry.execute('write_file', { path: 'note.txt', content: 'hi', overwrite: true });
    const result = await registry.execute<{ content: string }>('read_file', { path: 'note.txt' });
    expect(result.content).toBe('hi');
  });
});
