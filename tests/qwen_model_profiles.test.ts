import { describe, expect, it } from 'vitest';
import { QwenAdapter } from '../src/capabilities/llm/QwenAdapter';

describe('Qwen model profiles', () => {
  it('keeps the light model in routine lanes and Max in reasoning lanes', () => {
    const previous = process.env.QWEN_API;
    process.env.QWEN_API = 'test-key';
    try {
      const light = new QwenAdapter('qwen3.5-flash').getCapability();
      const max = new QwenAdapter('qwen3.7-max').getCapability();

      expect(light.tiers).toEqual(['Execution', 'Social']);
      expect(light.supportsThinking).toBe(false);
      expect(max.tiers).toEqual(['Reasoning', 'Coding']);
      expect(max.supportsThinking).toBe(true);
      expect(max.maxContext).toBe(1_000_000);
    } finally {
      if (previous === undefined) delete process.env.QWEN_API;
      else process.env.QWEN_API = previous;
    }
  });
});
