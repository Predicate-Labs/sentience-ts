/**
 * Tests for recorder functionality
 */

import { SentienceBrowser, record, Recorder } from '../src';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createTestBrowser } from './test-utils';

describe('Recorder', () => {
  it('should start and stop', async () => {
    const browser = await createTestBrowser(false);

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle');

      const rec = record(browser);
      rec.start();

      expect(rec.getTrace()).toBeDefined();
      expect(rec.getTrace().steps.length).toBe(0);

      rec.stop();
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow

  it('should record click events', async () => {
    const browser = await createTestBrowser(false);

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle');

      const rec = record(browser);
      rec.start();

      await rec.recordClick(1, 'role=button');

      const trace = rec.getTrace();
      expect(trace.steps.length).toBe(1);
      expect(trace.steps[0].type).toBe('click');
      expect(trace.steps[0].element_id).toBe(1);
      expect(trace.steps[0].selector).toBe('role=button');

      rec.stop();
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow

  it('should record type events', async () => {
    const browser = await createTestBrowser(false);

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle');

      const rec = record(browser);
      rec.start();

      await rec.recordType(10, 'hello world', 'role=textbox');

      const trace = rec.getTrace();
      expect(trace.steps.length).toBe(1);
      expect(trace.steps[0].type).toBe('type');
      expect(trace.steps[0].element_id).toBe(10);
      expect(trace.steps[0].text).toBe('hello world');

      rec.stop();
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow

  it('should mask sensitive text', async () => {
    const browser = await createTestBrowser(false);

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle');

      const rec = record(browser);
      rec.start();
      rec.addMaskPattern('password');

      await rec.recordType(10, 'mypassword123', 'role=textbox');

      const trace = rec.getTrace();
      expect(trace.steps[0].text).toBe('***'); // Should be masked

      rec.stop();
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow

  it('should save and load trace', async () => {
    const browser = await createTestBrowser(false);

    try {
      await browser.getPage().goto('https://example.com');
      await browser.getPage().waitForLoadState('networkidle');

      const rec = record(browser);
      rec.start();
      rec.recordNavigation('https://example.com');
      await rec.recordClick(1, 'role=button');

      const tempFile = path.join(os.tmpdir(), `trace-${Date.now()}.json`);
      await rec.save(tempFile);

      expect(fs.existsSync(tempFile)).toBe(true);

      const loadedTrace = await Recorder.load(tempFile);
      expect(loadedTrace.version).toBe('1.0.0');
      expect(loadedTrace.steps.length).toBe(2);

      // Cleanup
      fs.unlinkSync(tempFile);
    } finally {
      await browser.close();
    }
  }, 60000); // 60 seconds - browser startup can be slow
});

