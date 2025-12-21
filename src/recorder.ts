/**
 * Recorder - captures user actions into a trace
 */

import { SentienceBrowser } from './browser';
import { Snapshot, Element } from './types';
import { snapshot } from './snapshot';
import { find, query, parseSelector } from './query';

export interface TraceStep {
  ts: number; // Timestamp (milliseconds since start)
  type: 'navigation' | 'click' | 'type' | 'press' | 'wait' | 'assert';
  selector?: string; // Semantic selector (inferred)
  element_id?: number; // Element ID
  text?: string; // For type actions (may be masked)
  key?: string; // For press actions
  url?: string; // For navigation
  snapshot?: Snapshot; // Optional: snapshot at this step
}

export interface Trace {
  version: string; // "1.0.0"
  created_at: string; // ISO 8601
  start_url: string;
  steps: TraceStep[];
}

export class Recorder {
  private trace: Trace | null = null;
  private active: boolean = false;
  private startTime: Date = new Date();
  private maskPatterns: string[] = [];

  constructor(
    private browser: SentienceBrowser,
    private captureSnapshots: boolean = false
  ) {}

  start(): void {
    const page = this.browser.getPage();
    this.active = true;
    const startUrl = page.url();
    this.startTime = new Date();

    this.trace = {
      version: '1.0.0',
      created_at: new Date().toISOString(),
      start_url: startUrl,
      steps: [],
    };
  }

  stop(): void {
    this.active = false;
  }

  addMaskPattern(pattern: string): void {
    this.maskPatterns.push(pattern.toLowerCase());
  }

  private shouldMask(text: string): boolean {
    const textLower = text.toLowerCase();
    return this.maskPatterns.some((pattern) => textLower.includes(pattern));
  }

  recordNavigation(url: string): void {
    if (!this.active || !this.trace) return;

    const ts = Date.now() - this.startTime.getTime();
    this.trace.steps.push({
      ts,
      type: 'navigation',
      url,
    });
  }

  async recordClick(elementId: number, selector?: string): Promise<void> {
    if (!this.active || !this.trace) return;

    // If no selector provided, try to infer one
    if (!selector) {
      selector = await this.inferSelector(elementId);
    }

    const ts = Date.now() - this.startTime.getTime();

    // Optionally capture snapshot
    if (this.captureSnapshots) {
      try {
        const snap = await snapshot(this.browser);
        this.trace.steps.push({
          ts,
          type: 'click',
          element_id: elementId,
          selector,
          snapshot: snap,
        });
      } catch (e) {
        // If snapshot fails, just record without it
        this.trace.steps.push({
          ts,
          type: 'click',
          element_id: elementId,
          selector,
        });
      }
    } else {
      this.trace.steps.push({
        ts,
        type: 'click',
        element_id: elementId,
        selector,
      });
    }
  }

  async recordType(elementId: number, text: string, selector?: string): Promise<void> {
    if (!this.active || !this.trace) return;

    // If no selector provided, try to infer one
    if (!selector) {
      selector = await this.inferSelector(elementId);
    }

    const ts = Date.now() - this.startTime.getTime();
    const mask = this.shouldMask(text);
    const maskedText = mask ? '***' : text;

    this.trace.steps.push({
      ts,
      type: 'type',
      element_id: elementId,
      text: maskedText,
      selector,
    });
  }

  recordPress(key: string): void {
    if (!this.active || !this.trace) return;

    const ts = Date.now() - this.startTime.getTime();
    this.trace.steps.push({
      ts,
      type: 'press',
      key,
    });
  }

  getTrace(): Trace {
    if (!this.trace) {
      throw new Error('No trace available. Start recording first.');
    }
    return this.trace;
  }

  async save(filepath: string): Promise<void> {
    if (!this.trace) {
      throw new Error('No trace to save. Start recording first.');
    }

    const fs = await import('fs');
    fs.writeFileSync(filepath, JSON.stringify(this.trace, null, 2), 'utf-8');
  }

  static async load(filepath: string): Promise<Trace> {
    const fs = await import('fs');
    const data = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(data) as Trace;
  }

  private async inferSelector(elementId: number): Promise<string | undefined> {
    try {
      // Take a snapshot to get element info
      const snap = await snapshot(this.browser);

      // Find the element in the snapshot
      let element: Element | undefined;
      for (const el of snap.elements) {
        if (el.id === elementId) {
          element = el;
          break;
        }
      }

      if (!element) {
        return undefined;
      }

      // Build candidate selector
      const parts: string[] = [];

      // Add role
      if (element.role && element.role !== 'generic') {
        parts.push(`role=${element.role}`);
      }

      // Add text if available
      if (element.text) {
        const textPart = element.text.replace(/"/g, '\\"').substring(0, 50);
        parts.push(`text~"${textPart}"`);
      } else {
        // Try to get name/aria-label/placeholder from DOM
        try {
          const el = await this.browser.getPage().evaluate(
            (id) => {
              const registry = (window as any).sentience_registry;
              if (!registry || !registry[id]) return null;
              const elem = registry[id];
              return {
                name: (elem as HTMLInputElement).name || null,
                ariaLabel: elem.getAttribute('aria-label') || null,
                placeholder: (elem as HTMLInputElement).placeholder || null,
              };
            },
            elementId
          );

          if (el) {
            if (el.name) {
              parts.push(`name="${el.name}"`);
            } else if (el.ariaLabel) {
              parts.push(`text~"${el.ariaLabel}"`);
            } else if (el.placeholder) {
              parts.push(`text~"${el.placeholder}"`);
            }
          }
        } catch (e) {
          // Ignore errors
        }
      }

      // Add clickable if relevant
      if (element.visual_cues.is_clickable) {
        parts.push('clickable=true');
      }

      if (parts.length === 0) {
        return undefined;
      }

      const selector = parts.join(' ');

      // Validate selector - should match exactly 1 element
      const matches = query(snap, selector);

      if (matches.length === 1) {
        return selector;
      } else if (matches.length > 1) {
        // Multiple matches - return selector anyway (could add more constraints later)
        return selector;
      } else {
        // Selector doesn't match - return undefined (will use element_id)
        return undefined;
      }
    } catch (e) {
      return undefined;
    }
  }
}

export function record(browser: SentienceBrowser, captureSnapshots: boolean = false): Recorder {
  return new Recorder(browser, captureSnapshots);
}

