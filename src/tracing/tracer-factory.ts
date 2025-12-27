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
import { CloudTraceSink } from './cloud-sink';
import { JsonlTraceSink } from './jsonl-sink';

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
 */
async function recoverOrphanedTraces(apiKey: string, apiUrl: string): Promise<void> {
  const cacheDir = getPersistentCacheDir();

  if (!fs.existsSync(cacheDir)) {
    return;
  }

  const orphanedFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('.jsonl'));

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
      const response = await httpPost(
        `${apiUrl}/v1/traces/init`,
        { run_id: runId },
        { Authorization: `Bearer ${apiKey}` }
      );

      if (response.status === 200 && response.data.upload_url) {
        // Create a temporary CloudTraceSink to upload this orphaned trace
        const sink = new CloudTraceSink(response.data.upload_url, runId);
        await sink.close(); // This will upload the existing file
        console.log(`✅ [Sentience] Uploaded orphaned trace: ${runId}`);
      } else {
        console.log(`❌ [Sentience] Failed to get upload URL for ${runId}`);
      }
    } catch (error: any) {
      console.log(`❌ [Sentience] Failed to upload ${runId}: ${error.message}`);
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
 * - If apiKey is provided: Try to initialize CloudTraceSink (Pro/Enterprise)
 * - If cloud init fails or no apiKey: Fall back to JsonlTraceSink (Free tier)
 *
 * @param options - Configuration options
 * @param options.apiKey - Sentience API key (e.g., "sk_pro_xxxxx")
 * @param options.runId - Unique identifier for this agent run (generates UUID if not provided)
 * @param options.apiUrl - Sentience API base URL (default: https://api.sentienceapi.com)
 * @returns Tracer configured with appropriate sink
 *
 * @example
 * ```typescript
 * // Pro tier user
 * const tracer = await createTracer({ apiKey: "sk_pro_xyz", runId: "demo" });
 * // Returns: Tracer with CloudTraceSink
 *
 * // Free tier user
 * const tracer = await createTracer({ runId: "demo" });
 * // Returns: Tracer with JsonlTraceSink (local-only)
 *
 * // Use with agent
 * const agent = new SentienceAgent(browser, llm, 50, true, tracer);
 * await agent.act("Click search");
 * await tracer.close(); // Uploads to cloud if Pro tier
 * ```
 */
export async function createTracer(options: {
  apiKey?: string;
  runId?: string;
  apiUrl?: string;
}): Promise<Tracer> {
  const runId = options.runId || randomUUID();
  const apiUrl = options.apiUrl || 'https://api.sentienceapi.com';

  // PRODUCTION FIX: Recover orphaned traces from previous crashes
  if (options.apiKey) {
    try {
      await recoverOrphanedTraces(options.apiKey, apiUrl);
    } catch (error) {
      // Don't fail SDK init if orphaned trace recovery fails
      console.log('⚠️  [Sentience] Orphaned trace recovery failed (non-critical)');
    }
  }

  // 1. Try to initialize Cloud Sink (Pro/Enterprise tier)
  if (options.apiKey) {
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
        return new Tracer(runId, new CloudTraceSink(uploadUrl, runId));
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
