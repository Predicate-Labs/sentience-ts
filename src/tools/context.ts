import path from 'path';
import type { BackendCapabilities } from '../types';
import type { AgentRuntime } from '../agent-runtime';
import { FileSandbox } from './filesystem';

export class UnsupportedCapabilityError extends Error {
  readonly error = 'unsupported_capability';
  readonly detail: string;
  readonly capability: string;

  constructor(capability: string, detail?: string) {
    const message = detail ?? `${capability} not supported by backend`;
    super(message);
    this.detail = message;
    this.capability = capability;
  }
}

export class ToolContext {
  readonly runtime: AgentRuntime;
  readonly files: FileSandbox;

  constructor(runtime: AgentRuntime, files?: FileSandbox, baseDir?: string) {
    this.runtime = runtime;
    const root = baseDir
      ? path.resolve(baseDir)
      : path.resolve(process.cwd(), '.sentience', 'files');
    this.files = files ?? new FileSandbox(root);
  }

  capabilities(): BackendCapabilities {
    return this.runtime.capabilities();
  }

  can(name: keyof BackendCapabilities): boolean {
    return Boolean(this.capabilities()[name]);
  }

  require(name: keyof BackendCapabilities): void {
    if (!this.can(name)) {
      throw new UnsupportedCapabilityError(name);
    }
  }
}
