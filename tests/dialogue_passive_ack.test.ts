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

  it('differentiates user appreciation/praise from pure trailing closures', () => {
    const isAppreciation = (text: string) =>
      /^(?:mantap|keren|cool|great|thx|thanks|thank you|terima kasih|makasih|alhamdulillah|top)$/i.test(text.trim());
    const isPureTrailingClosure = (text: string) =>
      /^(?:ok|okay|k|got it|noted|roger|sip|siap|yoi|oke|okee|👍|👌|🙏)$/i.test(text.trim());

    expect(isAppreciation('Mantap')).toBe(true);
    expect(isAppreciation('Keren')).toBe(true);
    expect(isAppreciation('Makasih')).toBe(true);
    expect(isAppreciation('Thank you')).toBe(true);
    expect(isAppreciation('ok')).toBe(false);

    expect(isPureTrailingClosure('ok')).toBe(true);
    expect(isPureTrailingClosure('👍')).toBe(true);
    expect(isPureTrailingClosure('Mantap')).toBe(false);
  });

  it('evaluates contextual suppression correctly (suppresses closure after pleasantry, preserves praise after content)', () => {
    const shouldSuppress = (
      userMsg: string,
      isTaskInProgress: boolean,
      lastAssistantText: string
    ) => {
      const isPassive = /^(?:ok|okay|k|got it|noted|roger|cool|great|all good|thx|thanks|thank you|sip|siap|mantap|yoi|oke|okee|👍|👌|🙏)$/i.test(userMsg.trim());
      if (!isPassive) return false;
      if (isTaskInProgress) return true;

      const isAppreciation = /^(?:mantap|keren|cool|great|thx|thanks|thank you|terima kasih|makasih|alhamdulillah|top)$/i.test(userMsg.trim());
      const isPureTrailingClosure = /^(?:ok|okay|k|got it|noted|roger|sip|siap|yoi|oke|okee|👍|👌|🙏)$/i.test(userMsg.trim());

      const lastAssistantWasShortClosure = lastAssistantText.length < 160 && (
        /^(?:sama-sama|siap|baik|terima kasih|senang bisa bantu|you're welcome|anytime|kapan pun|ready|standby)/i.test(lastAssistantText.trim()) ||
        /ada yang bisa dibantu lagi|ada yang mau dibahas lagi/i.test(lastAssistantText.trim())
      );

      if (!isAppreciation && isPureTrailingClosure && lastAssistantWasShortClosure) {
        return true;
      }
      return false;
    };

    // User says "Mantap" after substantive 500-char tech news digest -> NOT suppressed!
    const techNewsResponse = 'Ini lima berita teknologi yang paling hangat sekarang, Kak 👇 ... [5 items]';
    expect(shouldSuppress('Mantap', false, techNewsResponse)).toBe(false);

    // User says "ok" during background task -> SUPPRESSED!
    expect(shouldSuppress('ok', true, '')).toBe(true);

    // User says "ok" after assistant already gave closing pleasantry -> SUPPRESSED!
    const pleasantry = 'Siap Kak! Ada lagi yang bisa dibantu?';
    expect(shouldSuppress('ok', false, pleasantry)).toBe(true);
    expect(shouldSuppress('👍', false, pleasantry)).toBe(true);

    // User says "Keren" or "Terima kasih" even after pleasantry -> NOT suppressed (warm engagement)
    expect(shouldSuppress('Keren', false, pleasantry)).toBe(false);
  });
});
