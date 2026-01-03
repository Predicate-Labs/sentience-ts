/**
 * Tests for script generator functionality
 */

import { SentienceBrowser, record, ScriptGenerator } from '../src';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createTestBrowser } from './test-utils';

describe('ScriptGenerator', () => {
  it('should generate Python code', async () => {
    const browser = await createTestBrowser();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle', { timeout: 10000 });

      const rec = record(browser);
      rec.start();
      rec.recordNavigation('https://example.com');
      await rec.recordClick(1, 'role=button text~"Click"');

      const generator = new ScriptGenerator(rec.getTrace());
      const code = generator.generatePython();

      expect(code).toContain('from sentience import');
      expect(code).toContain('def main():');
      expect(code).toContain('SentienceBrowser');
      expect(code).toContain('role=button text~"Click"');
      expect(code).toContain('click(browser');

      rec.stop();
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow

  it('should generate TypeScript code', async () => {
    const browser = await createTestBrowser();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle', { timeout: 10000 });

      const rec = record(browser);
      rec.start();
      rec.recordNavigation('https://example.com');
      await rec.recordClick(1, 'role=button');

      const generator = new ScriptGenerator(rec.getTrace());
      const code = generator.generateTypeScript();

      expect(code).toContain('import');
      expect(code).toContain('async function main()');
      expect(code).toContain('SentienceBrowser');
      expect(code).toContain('await click');

      rec.stop();
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow

  it('should save Python script', async () => {
    const browser = await createTestBrowser();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle', { timeout: 10000 });

      const rec = record(browser);
      rec.start();
      await rec.recordClick(1);

      const generator = new ScriptGenerator(rec.getTrace());
      const tempFile = path.join(os.tmpdir(), `generated-${Date.now()}.py`);
      await generator.savePython(tempFile);

      expect(fs.existsSync(tempFile)).toBe(true);

      const code = fs.readFileSync(tempFile, 'utf-8');
      expect(code).toContain('from sentience import');

      // Cleanup
      fs.unlinkSync(tempFile);
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow

  it('should save TypeScript script', async () => {
    const browser = await createTestBrowser();

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle', { timeout: 10000 });

      const rec = record(browser);
      rec.start();
      await rec.recordClick(1);

      const generator = new ScriptGenerator(rec.getTrace());
      const tempFile = path.join(os.tmpdir(), `generated-${Date.now()}.ts`);
      await generator.saveTypeScript(tempFile);

      expect(fs.existsSync(tempFile)).toBe(true);

      const code = fs.readFileSync(tempFile, 'utf-8');
      expect(code).toContain('import');

      // Cleanup
      fs.unlinkSync(tempFile);
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow
});
