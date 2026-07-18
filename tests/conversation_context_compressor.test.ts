import { describe, expect, it } from 'vitest';
import { ConversationContextCompressor } from '../src/capabilities/dialogue/ConversationContextCompressor';

describe('ConversationContextCompressor', () => {
  it('preserves recent turn order while bounding long conversation history', () => {
    const compressor = new ConversationContextCompressor();
    const result = compressor.compress([
      { role: 'user', content: `older request ${'x'.repeat(500)}` },
      { role: 'assistant', content: `older answer ${'y'.repeat(500)}` },
      { role: 'user', content: 'recent question about the deployment' },
      { role: 'assistant', content: 'recent deployment answer' }
    ], { tokenBudget: 90, maxRecentTurns: 2 });

    expect(result.estimatedTokens).toBeLessThanOrEqual(90);
    expect(result.truncated).toBe(true);
    expect(result.messages.at(-2)).toMatchObject({ role: 'user', content: 'recent question about the deployment' });
    expect(result.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'recent deployment answer' });
    expect(result.messages.some(message => message.content.startsWith('[Earlier context, condensed]'))).toBe(true);
  });
});
