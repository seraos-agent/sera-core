import { describe, expect, it } from 'vitest';
import { QwenAdapter } from '../src/capabilities/llm/QwenAdapter';

describe('Qwen model profiles', () => {
  it('configures qwen3.8-flash as the single universal high-speed model', () => {
    const previous = process.env.QWEN_API;
    process.env.QWEN_API = 'test-key';
    try {
      const adapter = new QwenAdapter('qwen3.8-flash');
      const capability = adapter.getCapability();

      expect(capability.model).toBe('qwen3.8-flash');
      expect(capability.tiers).toContain('Execution');
      expect(capability.tiers).toContain('Vision');
      expect(capability.tiers).toContain('Social');
      expect(capability.tiers).toContain('Reasoning');
      expect(capability.tiers).toContain('Coding');
      expect(capability.supportsVision).toBe(true);
      expect(capability.supportsFunctionCalling).toBe(true);
      expect(capability.supportsThinking).toBe(false);
      expect(capability.latencyClass).toBe('UltraFast');
    } finally {
      if (previous === undefined) delete process.env.QWEN_API;
      else process.env.QWEN_API = previous;
    }
  });

  it('explicitly sends enable_thinking: false in HTTP request body to eliminate CoT reasoning latency', async () => {
    const originalFetch = global.fetch;
    const previous = process.env.QWEN_API;
    process.env.QWEN_API = 'test-key';

    let capturedBody: any = null;
    global.fetch = async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Halo!' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      } as any;
    };

    try {
      const adapter = new QwenAdapter('qwen3.8-flash');
      await adapter.generate([{ role: 'user', content: 'Test' }]);

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.enable_thinking).toBe(false);
    } finally {
      global.fetch = originalFetch;
      if (previous === undefined) delete process.env.QWEN_API;
      else process.env.QWEN_API = previous;
    }
  });

  it('sends enable_thinking: true when enableThinking is explicitly enabled on adapter', async () => {
    const originalFetch = global.fetch;
    const previous = process.env.QWEN_API;
    process.env.QWEN_API = 'test-key';

    let capturedBody: any = null;
    global.fetch = async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Deep thought answer' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      } as any;
    };

    try {
      const adapter = new QwenAdapter('qwen3.8-flash');
      (adapter as any).enableThinking = true;
      await adapter.generate([{ role: 'user', content: 'Deep math question' }]);

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.enable_thinking).toBe(true);
    } finally {
      global.fetch = originalFetch;
      if (previous === undefined) delete process.env.QWEN_API;
      else process.env.QWEN_API = previous;
    }
  });

  it('forwards calibrated temperature and top_p in HTTP request body when provided', async () => {
    const originalFetch = global.fetch;
    const previous = process.env.QWEN_API;
    process.env.QWEN_API = 'test-key';

    let capturedBody: any = null;
    global.fetch = async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Calibrated execution' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      } as any;
    };

    try {
      const adapter = new QwenAdapter('qwen3.8-flash');
      await adapter.generate(
        [{ role: 'user', content: 'Transfer funds' }],
        undefined,
        undefined,
        { temperature: 0.1, top_p: 0.1 }
      );

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.temperature).toBe(0.1);
      expect(capturedBody.top_p).toBe(0.1);
    } finally {
      global.fetch = originalFetch;
      if (previous === undefined) delete process.env.QWEN_API;
      else process.env.QWEN_API = previous;
    }
  });
});
