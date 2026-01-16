import { LocalLLMProvider, LocalVisionLLMProvider } from '../src/llm-provider';

describe('LocalLLMProvider (OpenAI-compatible)', () => {
  const originalFetch = (globalThis as any).fetch;

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it('should call /chat/completions and parse response', async () => {
    (globalThis as any).fetch = jest.fn(async () => {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            model: 'local-model',
            choices: [{ message: { content: 'hello' } }],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          }),
      };
    });

    const llm = new LocalLLMProvider({
      baseUrl: 'http://localhost:11434/v1',
      model: 'local-model',
    });
    const resp = await llm.generate('sys', 'user', { temperature: 0.0 });

    expect(resp.content).toBe('hello');
    expect(resp.modelName).toBe('local-model');
    expect(resp.totalTokens).toBe(3);
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
    expect(((globalThis as any).fetch as any).mock.calls[0][0]).toBe(
      'http://localhost:11434/v1/chat/completions'
    );
  });
});

describe('LocalVisionLLMProvider (OpenAI-compatible)', () => {
  const originalFetch = (globalThis as any).fetch;

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it('should send image_url message content', async () => {
    let capturedBody: any = null;
    (globalThis as any).fetch = jest.fn(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            model: 'local-vision',
            choices: [{ message: { content: 'YES' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
      };
    });

    const llm = new LocalVisionLLMProvider({
      baseUrl: 'http://localhost:1234/v1',
      model: 'local-vision',
    });

    const resp = await llm.generateWithImage('sys', 'is there a button?', 'AAAA', {});
    expect(resp.content).toBe('YES');
    expect(capturedBody.messages[1].content[1].type).toBe('image_url');
    expect(capturedBody.messages[1].content[1].image_url.url).toContain(
      'data:image/png;base64,AAAA'
    );
  });
});
