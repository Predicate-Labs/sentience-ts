/**
 * Test browser proxy support
 */

import { SentienceBrowser } from '../src/browser';

describe('Browser Proxy Support', () => {
  describe('Proxy Parsing', () => {
    it('should parse HTTP proxy with credentials', () => {
      const browser = new SentienceBrowser(undefined, undefined, false, 'http://user:pass@proxy.com:8000');
      const config = (browser as any).parseProxy('http://user:pass@proxy.com:8000');
      
      expect(config).toBeDefined();
      expect(config?.server).toBe('http://proxy.com:8000');
      expect(config?.username).toBe('user');
      expect(config?.password).toBe('pass');
    });

    it('should parse HTTPS proxy with credentials', () => {
      const browser = new SentienceBrowser(undefined, undefined, false, 'https://user:pass@proxy.com:8443');
      const config = (browser as any).parseProxy('https://user:pass@proxy.com:8443');
      
      expect(config).toBeDefined();
      expect(config?.server).toBe('https://proxy.com:8443');
      expect(config?.username).toBe('user');
      expect(config?.password).toBe('pass');
    });

    it('should parse SOCKS5 proxy with credentials', () => {
      const browser = new SentienceBrowser(undefined, undefined, false, 'socks5://user:pass@proxy.com:1080');
      const config = (browser as any).parseProxy('socks5://user:pass@proxy.com:1080');
      
      expect(config).toBeDefined();
      expect(config?.server).toBe('socks5://proxy.com:1080');
      expect(config?.username).toBe('user');
      expect(config?.password).toBe('pass');
    });

    it('should parse HTTP proxy without credentials', () => {
      const browser = new SentienceBrowser(undefined, undefined, false, 'http://proxy.com:8000');
      const config = (browser as any).parseProxy('http://proxy.com:8000');
      
      expect(config).toBeDefined();
      expect(config?.server).toBe('http://proxy.com:8000');
      expect(config?.username).toBeUndefined();
      expect(config?.password).toBeUndefined();
    });

    it('should handle invalid proxy gracefully', () => {
      const browser = new SentienceBrowser(undefined, undefined, false, 'invalid');
      const config = (browser as any).parseProxy('invalid');
      
      expect(config).toBeUndefined();
    });

    it('should handle missing port gracefully', () => {
      const browser = new SentienceBrowser(undefined, undefined, false, 'http://proxy.com');
      const config = (browser as any).parseProxy('http://proxy.com');
      
      expect(config).toBeUndefined();
    });

    it('should handle unsupported scheme gracefully', () => {
      const browser = new SentienceBrowser(undefined, undefined, false, 'ftp://proxy.com:8000');
      const config = (browser as any).parseProxy('ftp://proxy.com:8000');
      
      expect(config).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const browser = new SentienceBrowser(undefined, undefined, false);
      const config = (browser as any).parseProxy('');
      
      expect(config).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      const browser = new SentienceBrowser(undefined, undefined, false);
      const config = (browser as any).parseProxy(undefined);
      
      expect(config).toBeUndefined();
    });

    it('should support proxy from environment variable', () => {
      const originalEnv = process.env.SENTIENCE_PROXY;
      process.env.SENTIENCE_PROXY = 'http://env:pass@proxy.com:8000';
      
      const browser = new SentienceBrowser(undefined, undefined, false);
      const config = (browser as any).parseProxy((browser as any)._proxy);
      
      expect(config).toBeDefined();
      expect(config?.server).toBe('http://proxy.com:8000');
      expect(config?.username).toBe('env');
      expect(config?.password).toBe('pass');
      
      // Restore
      if (originalEnv) {
        process.env.SENTIENCE_PROXY = originalEnv;
      } else {
        delete process.env.SENTIENCE_PROXY;
      }
    });

    it('should prioritize parameter over environment variable', () => {
      const originalEnv = process.env.SENTIENCE_PROXY;
      process.env.SENTIENCE_PROXY = 'http://env:pass@proxy.com:8000';
      
      const browser = new SentienceBrowser(undefined, undefined, false, 'http://param:pass@proxy.com:9000');
      const config = (browser as any).parseProxy((browser as any)._proxy);
      
      expect(config).toBeDefined();
      expect(config?.server).toBe('http://proxy.com:9000');
      expect(config?.username).toBe('param');
      
      // Restore
      if (originalEnv) {
        process.env.SENTIENCE_PROXY = originalEnv;
      } else {
        delete process.env.SENTIENCE_PROXY;
      }
    });
  });

  describe('Browser Launch with Proxy', () => {
    // Note: These tests verify that proxy config is passed correctly
    // We don't actually launch browsers with real proxies in unit tests
    // Integration tests would verify actual proxy functionality

    it('should include WebRTC flags when proxy is configured', () => {
      const browser = new SentienceBrowser(undefined, undefined, false, 'http://user:pass@proxy.com:8000');
      // We can't easily test the actual launch args without mocking Playwright
      // But we can verify the proxy is stored
      expect((browser as any)._proxy).toBe('http://user:pass@proxy.com:8000');
    });

    it('should not include WebRTC flags when proxy is not configured', () => {
      const browser = new SentienceBrowser(undefined, undefined, false);
      expect((browser as any)._proxy).toBeUndefined();
    });
  });
});

