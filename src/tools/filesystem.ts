import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { ToolRegistry, defineTool } from './registry';
import type { ToolContext } from './context';

export class FileSandbox {
  readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private resolvePath(relPath: string): string {
    const candidate = path.resolve(this.baseDir, relPath);
    const relative = path.relative(this.baseDir, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('path escapes sandbox root');
    }
    return candidate;
  }

  readText(relPath: string): string {
    return fs.readFileSync(this.resolvePath(relPath), 'utf-8');
  }

  writeText(relPath: string, content: string, overwrite: boolean = true): number {
    const target = this.resolvePath(relPath);
    if (fs.existsSync(target) && !overwrite) {
      throw new Error('file exists and overwrite is false');
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');
    return Buffer.byteLength(content, 'utf-8');
  }

  appendText(relPath: string, content: string): number {
    const target = this.resolvePath(relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, content, 'utf-8');
    return Buffer.byteLength(content, 'utf-8');
  }

  replaceText(relPath: string, oldText: string, newText: string): number {
    const target = this.resolvePath(relPath);
    const data = fs.readFileSync(target, 'utf-8');
    const replaced = data.split(oldText).length - 1;
    fs.writeFileSync(target, data.split(oldText).join(newText), 'utf-8');
    return replaced;
  }
}

const readFileInput = z.object({
  path: z.string().min(1),
});

const readFileOutput = z.object({
  content: z.string(),
});

const writeFileInput = z.object({
  path: z.string().min(1),
  content: z.string(),
  overwrite: z.boolean().default(true),
});

const writeFileOutput = z.object({
  path: z.string(),
  bytes_written: z.number(),
});

const appendFileInput = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const appendFileOutput = z.object({
  path: z.string(),
  bytes_written: z.number(),
});

const replaceFileInput = z.object({
  path: z.string().min(1),
  old: z.string(),
  new: z.string(),
});

const replaceFileOutput = z.object({
  path: z.string(),
  replaced: z.number(),
});

export function registerFilesystemTools(
  registry: ToolRegistry,
  sandbox?: FileSandbox
): ToolRegistry {
  const getFiles = (ctx: ToolContext | null) => {
    if (ctx) return ctx.files;
    if (sandbox) return sandbox;
    throw new Error('FileSandbox is required for filesystem tools');
  };

  registry.register(
    defineTool<{ path: string }, { content: string }, ToolContext | null>({
      name: 'read_file',
      description: 'Read a file from the sandbox.',
      input: readFileInput,
      output: readFileOutput,
      handler: (ctx, params) => {
        const files = getFiles(ctx);
        return { content: files.readText(params.path) };
      },
    })
  );

  registry.register(
    defineTool<
      { path: string; content: string; overwrite: boolean },
      { path: string; bytes_written: number },
      ToolContext | null
    >({
      name: 'write_file',
      description: 'Write a file to the sandbox.',
      input: writeFileInput,
      output: writeFileOutput,
      handler: (ctx, params) => {
        const files = getFiles(ctx);
        const bytes = files.writeText(params.path, params.content, params.overwrite);
        return { path: params.path, bytes_written: bytes };
      },
    })
  );

  registry.register(
    defineTool<
      { path: string; content: string },
      { path: string; bytes_written: number },
      ToolContext | null
    >({
      name: 'append_file',
      description: 'Append text to a file in the sandbox.',
      input: appendFileInput,
      output: appendFileOutput,
      handler: (ctx, params) => {
        const files = getFiles(ctx);
        const bytes = files.appendText(params.path, params.content);
        return { path: params.path, bytes_written: bytes };
      },
    })
  );

  registry.register(
    defineTool<
      { path: string; old: string; new: string },
      { path: string; replaced: number },
      ToolContext | null
    >({
      name: 'replace_file',
      description: 'Replace text in a file in the sandbox.',
      input: replaceFileInput,
      output: replaceFileOutput,
      handler: (ctx, params) => {
        const files = getFiles(ctx);
        const replaced = files.replaceText(params.path, params.old, params.new);
        return { path: params.path, replaced };
      },
    })
  );

  return registry;
}
