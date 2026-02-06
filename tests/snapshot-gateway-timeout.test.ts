import { snapshot } from '../src';
import { BrowserEvaluator } from '../src/utils/browser-evaluator';

jest.mock('../src/utils/browser-evaluator', () => ({
  BrowserEvaluator: {
    waitForCondition: jest.fn().mockResolvedValue(true),
    evaluate: jest.fn(),
  },
}));

const mockedBrowserEvaluator = BrowserEvaluator as jest.Mocked<typeof BrowserEvaluator>;

function makeBrowser() {
  return {
    getApiKey: () => 'sk_test',
    getApiUrl: () => 'https://api.sentienceapi.com',
    getPage: () => ({}),
  } as any;
}

describe('Snapshot gateway timeout', () => {
  const rawResult = {
    raw_elements: [],
    url: 'https://example.com',
    viewport: { width: 800, height: 600 },
    diagnostics: {},
  };

  beforeEach(() => {
    mockedBrowserEvaluator.evaluate.mockResolvedValue(rawResult as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses default gateway timeout when not provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', elements: [], url: 'https://example.com' }),
      headers: new Headers(),
    });
    (global as any).fetch = fetchMock;

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      fn: (...args: any[]) => void,
      _ms?: number
    ) => {
      return 123 as any;
    }) as any);
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});

    await snapshot(makeBrowser(), { screenshot: false, limit: 10 });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(123);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.sentienceapi.com/v1/snapshot',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('uses custom gateway timeout when provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', elements: [], url: 'https://example.com' }),
      headers: new Headers(),
    });
    (global as any).fetch = fetchMock;

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      fn: (...args: any[]) => void,
      _ms?: number
    ) => {
      return 456 as any;
    }) as any);
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});

    await snapshot(makeBrowser(), { screenshot: false, limit: 10, gatewayTimeoutMs: 12345 });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 12345);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(456);
  });
});
