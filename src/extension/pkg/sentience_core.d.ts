/* tslint:disable */
/* eslint-disable */

export function analyze_page(val: any): any;

export function analyze_page_with_options(val: any, options: any): any;

export function decide_and_act(_raw_elements: any): void;

/**
 * Prune raw elements before sending to API
 * This is a "dumb" filter that reduces payload size without leaking proprietary IP
 * Filters out: tiny elements, invisible elements, non-interactive wrapper divs
 * Amazon: 5000-6000 elements -> ~200-400 elements (~95% reduction)
 */
export function prune_for_api(val: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly analyze_page: (a: number) => number;
  readonly analyze_page_with_options: (a: number, b: number) => number;
  readonly decide_and_act: (a: number) => void;
  readonly prune_for_api: (a: number) => number;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export3: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
