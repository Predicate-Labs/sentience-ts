/**
 * Browser backend abstractions for Sentience SDK.
 *
 * This module provides backend protocols and implementations that allow
 * Sentience actions (click, type, scroll) to work with different browser
 * automation frameworks.
 *
 * Supported Backends
 * ------------------
 *
 * **CDPBackend**
 *     Low-level CDP (Chrome DevTools Protocol) backend. Use this when you have
 *     direct access to a CDP client and session.
 *
 * **BrowserUseAdapter**
 *     High-level adapter for browser-use framework. Automatically creates a
 *     CDPBackend from a BrowserSession.
 *
 * Quick Start with browser-use
 * ----------------------------
 *
 *   import { BrowserSession, BrowserProfile } from 'browser-use';
 *   import { getExtensionDir } from 'sentience';
 *   import { BrowserUseAdapter, snapshot, click, typeText } from 'sentience/backends';
 *
 *   // Setup browser-use with Sentience extension
 *   const profile = new BrowserProfile({ args: [`--load-extension=${getExtensionDir()}`] });
 *   const session = new BrowserSession({ browserProfile: profile });
 *   await session.start();
 *
 *   // Create adapter and backend
 *   const adapter = new BrowserUseAdapter(session);
 *   const backend = await adapter.createBackend();
 *
 *   // Take snapshot and interact with elements
 *   const snap = await snapshot(backend);
 *   const searchBox = find(snap, 'role=textbox[name*="Search"]');
 *   await click(backend, searchBox.bbox);
 *   await typeText(backend, 'Sentience AI');
 *
 * Snapshot Caching
 * ----------------
 *
 * Use CachedSnapshot to reduce redundant snapshot calls in action loops:
 *
 *   import { CachedSnapshot } from 'sentience/backends';
 *
 *   const cache = new CachedSnapshot(backend, 2000);
 *
 *   const snap1 = await cache.get();  // Takes fresh snapshot
 *   const snap2 = await cache.get();  // Returns cached if < 2s old
 *
 *   await click(backend, element.bbox);
 *   cache.invalidate();  // Force refresh on next get()
 *
 * Error Handling
 * --------------
 *
 * The module provides specific exceptions for common failure modes:
 *
 * - `ExtensionNotLoadedError`: Extension not loaded in browser launch args
 * - `SnapshotError`: window.sentience.snapshot() failed
 *
 *   import { ExtensionNotLoadedError, snapshot } from 'sentience/backends';
 *
 *   try {
 *     const snap = await snapshot(backend);
 *   } catch (e) {
 *     if (e instanceof ExtensionNotLoadedError) {
 *       console.log(`Fix suggestion: ${e.message}`);
 *     }
 *   }
 */

// Protocol and types
export { BrowserBackend, ViewportInfo, LayoutMetrics, MouseButton, ReadyState } from './protocol';

// CDP Backend
export { CDPTransport, CDPBackend } from './cdp-backend';

// browser-use adapter
export { BrowserUseAdapter, BrowserUseCDPTransport } from './browser-use-adapter';

// Backend-agnostic functions
export {
  snapshot,
  CachedSnapshot,
  SnapshotOptions,
  ScreenshotOptions,
  SnapshotFilter,
  ExtensionNotLoadedError,
  SnapshotError,
  ExtensionDiagnostics,
} from './snapshot';

// Actions
export {
  click,
  typeText,
  scroll,
  scrollToElement,
  waitForStable,
  ClickTarget,
  ScrollBehavior,
  ScrollBlock,
} from './actions';

// SentienceContext (Token-Slasher Context Middleware)
export {
  SentienceContext,
  PredicateContext,
  SentienceContextState,
  SentienceContextOptions,
  TopElementSelector,
  BuildOptions,
} from './sentience-context';
