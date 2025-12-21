/**
 * Script Generator - converts trace into executable code
 */

import { Trace, TraceStep } from './recorder';

export class ScriptGenerator {
  constructor(private trace: Trace) {}

  generatePython(): string {
    const lines = [
      '"""',
      `Generated script from trace: ${this.trace.start_url}`,
      `Created: ${this.trace.created_at}`,
      '"""',
      '',
      'from sentience import SentienceBrowser, snapshot, find, click, type_text, press',
      '',
      'def main():',
      '    with SentienceBrowser(headless=False) as browser:',
      `        browser.page.goto("${this.trace.start_url}")`,
      '        browser.page.wait_for_load_state("networkidle")',
      '',
    ];

    for (const step of this.trace.steps) {
      lines.push(...this.generatePythonStep(step, '        '));
    }

    lines.push('', 'if __name__ == "__main__":', '    main()');

    return lines.join('\n');
  }

  generateTypeScript(): string {
    const lines = [
      '/**',
      ` * Generated script from trace: ${this.trace.start_url}`,
      ` * Created: ${this.trace.created_at}`,
      ' */',
      '',
      "import { SentienceBrowser, snapshot, find, click, typeText, press } from './src';",
      '',
      'async function main() {',
      '  const browser = new SentienceBrowser(undefined, undefined, false);',
      '',
      '  try {',
      '    await browser.start();',
      `    await browser.getPage().goto('${this.trace.start_url}');`,
      '    await browser.getPage().waitForLoadState(\'networkidle\');',
      '',
    ];

    for (const step of this.trace.steps) {
      lines.push(...this.generateTypeScriptStep(step, '    '));
    }

    lines.push('  } finally {', '    await browser.close();', '  }', '}', '', 'main().catch(console.error);');

    return lines.join('\n');
  }

  private generatePythonStep(step: TraceStep, indent: string): string[] {
    const lines: string[] = [];

    if (step.type === 'navigation') {
      lines.push(`${indent}# Navigate to ${step.url}`);
      lines.push(`${indent}browser.page.goto("${step.url}")`);
      lines.push(`${indent}browser.page.wait_for_load_state("networkidle")`);
    } else if (step.type === 'click') {
      if (step.selector) {
        lines.push(`${indent}# Click: ${step.selector}`);
        lines.push(`${indent}snap = snapshot(browser)`);
        lines.push(`${indent}element = find(snap, "${step.selector}")`);
        lines.push(`${indent}if element:`);
        lines.push(`${indent}    click(browser, element.id)`);
        lines.push(`${indent}else:`);
        lines.push(`${indent}    raise Exception("Element not found: ${step.selector}")`);
      } else if (step.element_id !== undefined) {
        lines.push(`${indent}# TODO: replace with semantic selector`);
        lines.push(`${indent}click(browser, ${step.element_id})`);
      }
      lines.push('');
    } else if (step.type === 'type') {
      if (step.selector) {
        lines.push(`${indent}# Type into: ${step.selector}`);
        lines.push(`${indent}snap = snapshot(browser)`);
        lines.push(`${indent}element = find(snap, "${step.selector}")`);
        lines.push(`${indent}if element:`);
        lines.push(`${indent}    type_text(browser, element.id, "${step.text}")`);
        lines.push(`${indent}else:`);
        lines.push(`${indent}    raise Exception("Element not found: ${step.selector}")`);
      } else if (step.element_id !== undefined) {
        lines.push(`${indent}# TODO: replace with semantic selector`);
        lines.push(`${indent}type_text(browser, ${step.element_id}, "${step.text}")`);
      }
      lines.push('');
    } else if (step.type === 'press') {
      lines.push(`${indent}# Press key: ${step.key}`);
      lines.push(`${indent}press(browser, "${step.key}")`);
      lines.push('');
    }

    return lines;
  }

  private generateTypeScriptStep(step: TraceStep, indent: string): string[] {
    const lines: string[] = [];

    if (step.type === 'navigation') {
      lines.push(`${indent}// Navigate to ${step.url}`);
      lines.push(`${indent}await browser.getPage().goto('${step.url}');`);
      lines.push(`${indent}await browser.getPage().waitForLoadState('networkidle');`);
    } else if (step.type === 'click') {
      if (step.selector) {
        lines.push(`${indent}// Click: ${step.selector}`);
        lines.push(`${indent}const snap = await snapshot(browser);`);
        lines.push(`${indent}const element = find(snap, '${step.selector}');`);
        lines.push(`${indent}if (element) {`);
        lines.push(`${indent}  await click(browser, element.id);`);
        lines.push(`${indent}} else {`);
        lines.push(`${indent}  throw new Error('Element not found: ${step.selector}');`);
        lines.push(`${indent}}`);
      } else if (step.element_id !== undefined) {
        lines.push(`${indent}// TODO: replace with semantic selector`);
        lines.push(`${indent}await click(browser, ${step.element_id});`);
      }
      lines.push('');
    } else if (step.type === 'type') {
      if (step.selector) {
        lines.push(`${indent}// Type into: ${step.selector}`);
        lines.push(`${indent}const snap = await snapshot(browser);`);
        lines.push(`${indent}const element = find(snap, '${step.selector}');`);
        lines.push(`${indent}if (element) {`);
        lines.push(`${indent}  await typeText(browser, element.id, '${step.text}');`);
        lines.push(`${indent}} else {`);
        lines.push(`${indent}  throw new Error('Element not found: ${step.selector}');`);
        lines.push(`${indent}}`);
      } else if (step.element_id !== undefined) {
        lines.push(`${indent}// TODO: replace with semantic selector`);
        lines.push(`${indent}await typeText(browser, ${step.element_id}, '${step.text}');`);
      }
      lines.push('');
    } else if (step.type === 'press') {
      lines.push(`${indent}// Press key: ${step.key}`);
      lines.push(`${indent}await press(browser, '${step.key}');`);
      lines.push('');
    }

    return lines;
  }

  async savePython(filepath: string): Promise<void> {
    const code = this.generatePython();
    const fs = await import('fs');
    fs.writeFileSync(filepath, code, 'utf-8');
  }

  async saveTypeScript(filepath: string): Promise<void> {
    const code = this.generateTypeScript();
    const fs = await import('fs');
    fs.writeFileSync(filepath, code, 'utf-8');
  }
}

export function generate(trace: Trace, language: 'py' | 'ts' = 'py'): string {
  const generator = new ScriptGenerator(trace);
  if (language === 'py') {
    return generator.generatePython();
  } else {
    return generator.generateTypeScript();
  }
}

