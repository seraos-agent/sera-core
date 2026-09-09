import { describe, it, expect } from 'vitest';

describe('Passive Acknowledgment Suppression', () => {
  const isPassiveAck = (text: string) =>
    /^(?:ok|okay|k|got it|noted|roger|cool|great|all good|thx|thanks|thank you|sip|siap|mantap|yoi|oke|okee|👍|👌|🙏)$/i.test(text.trim());

  it('matches standalone universal passive acknowledgments', () => {
    const validCases = [
      'ok', 'OK', 'okay', 'Okay', 'k',
      'got it', 'Noted', 'roger', 'cool', 'great', 'all good',
      'thx', 'thanks', 'Thank you',
      'sip', 'siap', 'mantap', 'yoi', 'oke', 'okee',
      '👍', '👌', '🙏'
    ];

    for (const phrase of validCases) {
      expect(isPassiveAck(phrase)).toBe(true);
    }
  });

  it('does NOT match actionable requests starting with acknowledgment words', () => {
    const actionCases = [
      'ok tolong tambahin produk shampoo',
      'siap tolong ubah harganya',
      'mantap sekarang tolong buat chart',
      'oke buatkan contoh sheet barber',
      'thanks, can you export this to excel?',
      'noted, let us also add 5 more items'
    ];

    for (const phrase of actionCases) {
      expect(isPassiveAck(phrase)).toBe(false);
    }
  });
});
