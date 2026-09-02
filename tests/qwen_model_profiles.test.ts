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
});
