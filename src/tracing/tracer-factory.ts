/**
 * Tracer Factory with Automatic Tier Detection
 *
 * Provides convenient factory function for creating tracers with cloud upload support
 *
 * PRODUCTION HARDENING:
 * - Recovers orphaned traces from previous crashes on SDK init (Risk #3)
 * - Passes runId to CloudTraceSink for persistent cache naming (Risk #1)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { randomUUID } from 'crypto';
import { Tracer } from './tracer';
import { CloudTraceSink, SentienceLogger } from './cloud-sink';
import { JsonlTraceSink } from './jsonl-sink';

/**
 * Sentience API base URL (constant)
 */
export const SENTIENCE_API_URL = 'https://api.sentienceapi.com';

/**
 * Get persistent cache directory for traces
 */
function getPersistentCacheDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.sentience', 'traces', 'pending');
}

/**
 * Recover orphaned traces from previous crashes
 * PRODUCTION FIX: Risk #3 - Upload traces from crashed sessions
 * 
 * Note: Silently skips in test environments to avoid test noise
 */
async function recoverOrphanedTraces(apiKey: string, apiUrl: string = SENTIENCE_API_URL): Promise<void> {
  // Skip orphan recovery in test environments (CI, Jest, etc.)
  // This prevents test failures from orphan recovery attempts
  const isTestEnv = process.env.CI === 'true' || 
                    process.env.NODE_ENV === 'test' ||
                    process.env.JEST_WORKER_ID !== undefined ||
                    (typeof global !== 'undefined' && (global as any).__JEST__);
  
  if (isTestEnv) {
    return;
  }

  const cacheDir = getPersistentCacheDir();

  if (!fs.existsSync(cacheDir)) {
    return;
  }

  let orphanedFiles: string[];
  try {
    orphanedFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('.jsonl'));
  } catch (error) {
    // Silently fail if directory read fails (permissions, etc.)
    return;
  }

  if (orphanedFiles.length === 0) {
    return;
  }

  console.log(`⚠️  [Sentience] Found ${orphanedFiles.length} un-uploaded trace(s) from previous run(s)`);
  console.log('   Attempting to upload now...');

  for (const file of orphanedFiles) {
    const filePath = path.join(cacheDir, file);
    const runId = path.basename(file, '.jsonl');

    try {
      // Request upload URL for this orphaned trace
      // Use a shorter timeout for orphan recovery to avoid blocking
      const response = await Promise.race([
        httpPost(
          `${apiUrl}/v1/traces/init`,
          { run_id: runId },
          { Authorization: `Bearer ${apiKey}` }
        ),
        new Promise<{ status: number; data: any }>((resolve) => 
          setTimeout(() => resolve({ status: 500, data: {} }), 5000)
        )
      ]);

      if (response.status === 200 && response.data.upload_url) {
        // Create a temporary CloudTraceSink to upload this orphaned trace
        const sink = new CloudTraceSink(response.data.upload_url, runId);
        await sink.close(); // This will upload the existing file
        console.log(`✅ [Sentience] Uploaded orphaned trace: ${runId}`);
      }
      // Silently skip failures - don't log errors for orphan recovery
      // These are expected in many scenarios (network issues, invalid API keys, etc.)
    } catch (error: any) {
      // Silently skip failures - don't log errors for orphan recovery
      // These are expected in many scenarios (network issues, invalid API keys, etc.)
    }
  }
}

/**
 * Make HTTP/HTTPS POST request using built-in Node modules
 */
function httpPost(url: string, data: any, headers: Record<string, string>): Promise<{
  status: number;
  data: any;
}> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const body = JSON.stringify(data);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
      timeout: 10000, // 10 second timeout
    };

    const req = protocol.request(options, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = responseBody ? JSON.parse(responseBody) : {};
          resolve({ status: res.statusCode || 500, data: parsed });
        } catch (error) {
          resolve({ status: res.statusCode || 500, data: {} });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Create tracer with automatic tier detection
 *
 * Tier Detection:
 * - If apiKey is provided AND uploadTrace is true: Try to initialize CloudTraceSink (Pro/Enterprise)
 * - If cloud init fails, no apiKey, or uploadTrace is false: Fall back to JsonlTraceSink (Free tier)
 *
 * @param options - Configuration options
 * @param options.apiKey - Sentience API key (e.g., "sk_pro_xxxxx")
 * @param options.runId - Unique identifier for this agent run (generates UUID if not provided)
 * @param options.apiUrl - Sentience API base URL (default: https://api.sentienceapi.com)
 * @param options.logger - Optional logger instance for logging file sizes and errors
 * @param options.uploadTrace - Enable cloud trace upload (default: true for backward compatibility)
 * @returns Tracer configured with appropriate sink
 *
 * @example
 * ```typescript
 * // Pro tier user with cloud upload
 * const tracer = await createTracer({ apiKey: "sk_pro_xyz", runId: "demo", uploadTrace: true });
 * // Returns: Tracer with CloudTraceSink
 *
 * // Pro tier user with local-only tracing
 * const tracer = await createTracer({ apiKey: "sk_pro_xyz", runId: "demo", uploadTrace: false });
 * // Returns: Tracer with JsonlTraceSink (local-only)
 *
 * // Free tier user
 * const tracer = await createTracer({ runId: "demo" });
 * // Returns: Tracer with JsonlTraceSink (local-only)
 *
 * // Use with agent
 * const agent = new SentienceAgent(browser, llm, 50, true, tracer);
 * await agent.act("Click search");
 * await tracer.close(); // Uploads to cloud if uploadTrace: true and Pro tier
 * ```
 */
export async function createTracer(options: {
  apiKey?: string;
  runId?: string;
  apiUrl?: string;
  logger?: SentienceLogger;
  uploadTrace?: boolean;
}): Promise<Tracer> {
  const runId = options.runId || randomUUID();
  const apiUrl = options.apiUrl || SENTIENCE_API_URL;
  // Default uploadTrace to true for backward compatibility
  const uploadTrace = options.uploadTrace !== false;

  // PRODUCTION FIX: Recover orphaned traces from previous crashes
  // Note: This is skipped in test environments (see recoverOrphanedTraces function)
  // Run in background to avoid blocking tracer creation
  // Only recover if uploadTrace is enabled
  if (options.apiKey && uploadTrace) {
    // Don't await - run in background to avoid blocking
    recoverOrphanedTraces(options.apiKey, apiUrl).catch(() => {
      // Silently fail - orphan recovery should not block tracer creation
    });
  }

  // 1. Try to initialize Cloud Sink (Pro/Enterprise tier)
  // Only attempt cloud init if uploadTrace is enabled
  if (options.apiKey && uploadTrace) {
    try {
      // Request pre-signed upload URL from backend
      const response = await httpPost(
        `${apiUrl}/v1/traces/init`,
        { run_id: runId },
        { Authorization: `Bearer ${options.apiKey}` }
      );

      if (response.status === 200 && response.data.upload_url) {
        const uploadUrl = response.data.upload_url;

        console.log('☁️  [Sentience] Cloud tracing enabled (Pro tier)');
        // PRODUCTION FIX: Pass runId for persistent cache naming
        return new Tracer(
          runId,
          new CloudTraceSink(uploadUrl, runId, options.apiKey, apiUrl, options.logger)
        );
      } else if (response.status === 403) {
        console.log('⚠️  [Sentience] Cloud tracing requires Pro tier');
        console.log('   Falling back to local-only tracing');
      } else {
        console.log(`⚠️  [Sentience] Cloud init failed: HTTP ${response.status}`);
        console.log('   Falling back to local-only tracing');
      }
    } catch (error: any) {
      if (error.message?.includes('timeout')) {
        console.log('⚠️  [Sentience] Cloud init timeout');
      } else if (error.code === 'ECONNREFUSED' || error.message?.includes('connect')) {
        console.log('⚠️  [Sentience] Cloud init connection error');
      } else {
        console.log(`⚠️  [Sentience] Cloud init error: ${error.message}`);
      }
      console.log('   Falling back to local-only tracing');
    }
  }

  // 2. Fallback to Local Sink (Free tier / Offline mode)
  const tracesDir = path.join(process.cwd(), 'traces');

  // Create traces directory if it doesn't exist
  if (!fs.existsSync(tracesDir)) {
    fs.mkdirSync(tracesDir, { recursive: true });
  }

  const localPath = path.join(tracesDir, `${runId}.jsonl`);
  console.log(`💾 [Sentience] Local tracing: ${localPath}`);

  return new Tracer(runId, new JsonlTraceSink(localPath));
}

/**
 * Synchronous version of createTracer for non-async contexts
 * Always returns local JsonlTraceSink (no cloud upload)
 *
 * @param runId - Unique identifier for this agent run (generates UUID if not provided)
 * @returns Tracer with JsonlTraceSink
 */
export function createLocalTracer(runId?: string): Tracer {
  const traceRunId = runId || randomUUID();
  const tracesDir = path.join(process.cwd(), 'traces');

  if (!fs.existsSync(tracesDir)) {
    fs.mkdirSync(tracesDir, { recursive: true });
  }

  const localPath = path.join(tracesDir, `${traceRunId}.jsonl`);
  console.log(`💾 [Sentience] Local tracing: ${localPath}`);

  return new Tracer(traceRunId, new JsonlTraceSink(localPath));
}
