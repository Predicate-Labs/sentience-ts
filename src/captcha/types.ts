import { CaptchaDiagnostics } from '../types';

export type CaptchaPolicy = 'abort' | 'callback';
export type CaptchaAction = 'abort' | 'retry_new_session' | 'wait_until_cleared';

export type CaptchaSource = 'extension' | 'gateway' | 'runtime';

export interface CaptchaContext {
  runId: string;
  stepIndex: number;
  url: string;
  source: CaptchaSource;
  captcha: CaptchaDiagnostics | null;
  screenshotPath?: string;
  framesDir?: string;
  snapshotPath?: string;
  liveSessionUrl?: string;
  meta?: Record<string, string>;
  evaluateJs?: (code: string) => Promise<any>;
  pageControl?: PageControlHook;
}

export interface CaptchaResolution {
  action: CaptchaAction;
  message?: string;
  handledBy?: 'human' | 'customer_system' | 'unknown';
  timeoutMs?: number;
  pollMs?: number;
}

export interface PageControlHook {
  evaluateJs: (code: string) => Promise<any>;
  getUrl?: () => Promise<string>;
}

export type CaptchaHandler = (
  ctx: CaptchaContext
) => CaptchaResolution | Promise<CaptchaResolution>;

export interface CaptchaOptions {
  policy?: CaptchaPolicy;
  minConfidence?: number;
  timeoutMs?: number;
  pollMs?: number;
  maxRetriesNewSession?: number;
  handler?: CaptchaHandler;
  resetSession?: () => Promise<void>;
}

export class CaptchaHandlingError extends Error {
  reasonCode: string;
  details?: Record<string, any>;

  constructor(reasonCode: string, message: string, details?: Record<string, any>) {
    super(message);
    this.reasonCode = reasonCode;
    this.details = details;
  }
}
