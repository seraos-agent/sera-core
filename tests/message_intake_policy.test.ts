import { describe, expect, it } from 'vitest';
import { MessageIntakePolicy } from '../src/capabilities/dialogue/MessageIntakePolicy';

describe('MessageIntakePolicy', () => {
  const policy = new MessageIntakePolicy();
  it('asks for clarification on ambiguous fragments but keeps greetings valid', () => {
    expect(policy.requiresClarification('e')).toBe(true);
    expect(policy.requiresClarification('awdasd')).toBe(true);
    expect(policy.requiresClarification('')).toBe(true);
    expect(policy.requiresClarification('ok')).toBe(false);
    expect(policy.requiresClarification('cek harga btc')).toBe(false);
  });
});
