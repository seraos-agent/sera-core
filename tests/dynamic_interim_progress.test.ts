import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppAdapter } from '../src/capabilities/communication/adapters/WhatsAppAdapter';
import { CommunicationBridge } from '../src/capabilities/communication/CommunicationBridge';
import { EventEmitter } from 'events';
import { EventTypes } from '../src/core/events/types';
import { XAITextToSpeechService } from '../src/capabilities/audio/XAITextToSpeechService';

describe('Dynamic Interim Progress & Deliverable Text Protection', () => {
  describe('WhatsAppAdapter Delivery Integrity', () => {
    let adapter: WhatsAppAdapter;

    beforeEach(() => {
      const eventBus = new EventEmitter();
      adapter = new WhatsAppAdapter('test_session', {
        phoneNumberId: '123456789',
        accessToken: 'test-access-token'
      }, eventBus);
      // Mock uploadMedia to succeed
      vi.spyOn(adapter, 'uploadMedia').mockResolvedValue('media-mock-123');
      // Mock XAITextToSpeechService
      vi.spyOn(XAITextToSpeechService, 'synthesize').mockResolvedValue({
        buffer: Buffer.from('fake-audio'),
        mimeType: 'audio/ogg; codecs=opus'
      });
    });

    it('skips duplicate text bubbles for short casual banters (< 200 chars) when voice note succeeds', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.123' }] })
      });
      global.fetch = fetchMock;

      const shortCasualText = 'Halo! Iya ada yang bisa aku bantu malam ini?';
      expect(shortCasualText.length).toBeLessThan(200);

      const result = await adapter.sendMessage({
        platform: 'whatsapp',
        channelId: '628123456789',
        text: shortCasualText,
        isVoiceMessage: true
      });

      expect(result.success).toBe(true);
      // Fetch called once for the audio message only (type: 'audio')
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody.type).toBe('audio');
    });

    it('ALWAYS delivers formatted text bubbles for substantive deliverables (>= 200 chars) alongside voice notes', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.123' }] })
      });
      global.fetch = fetchMock;

      const longSubstantiveText = `Udah kebaca semua datanya, menarik ternyata!

1. Post juara: "AI runs on data? No, electricity" tembus 321 views.
2. Santai ngalahin formal: versi lowercase 321 views, huruf rapi 183 views.
3. Terlalu niche = sepi: Bitcoin 17 views.

Ini 3 opsinya:
Opsi A: Relatable malam minggu.
Opsi B: Bahasa Inggris gaya juara.
Opsi C: POV agent nyentrik.

Pilih mana nih, A, B, atau C?`;

      expect(longSubstantiveText.length).toBeGreaterThan(200);

      const result = await adapter.sendMessage({
        platform: 'whatsapp',
        channelId: '628123456789',
        text: longSubstantiveText,
        isVoiceMessage: true
      });

      expect(result.success).toBe(true);
      // Fetch called for the audio message AND the text message bubbles!
      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
      const firstCall = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(firstCall.type).toBe('audio');

      // Subsequent calls are text bubbles
      const textCalls = fetchMock.mock.calls.slice(1).map(call => JSON.parse(call[1].body));
      expect(textCalls.some(call => call.type === 'text')).toBe(true);
    });
  });

  describe('CommunicationBridge Interim Routing', () => {
    let eventBus: EventEmitter;
    let bridge: CommunicationBridge;
    let mockAdapter: any;

    beforeEach(() => {
      eventBus = new EventEmitter();
      bridge = new CommunicationBridge(eventBus);
      mockAdapter = {
        platform: 'whatsapp',
        sendMessage: vi.fn().mockResolvedValue({ success: true, platformMessageId: 'msg-1' }),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined)
      };
      bridge.registerAdapter('whatsapp', mockAdapter);
    });

    it('forces isVoiceMessage: false for interim progress messages to ensure instant text delivery', async () => {
      // Simulate an interim progress event where the origin conversation was a voice message
      eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
        id: 'evt-interim-1',
        type: EventTypes.DIALOGUE_AGENT_SPEAK,
        payload: {
          text: 'Bentar ya, aku buka dan tarik data performa postingan Threads kamu dulu...',
          isInterim: true,
          responseContext: {
            platform: 'whatsapp',
            channelId: '628123456789',
            isVoiceMessage: true // user sent voice message
          }
        }
      });

      // Allow microtask ticks for event handling
      await new Promise(r => setTimeout(r, 10));

      expect(mockAdapter.sendMessage).toHaveBeenCalledTimes(1);
      const actionPassed = mockAdapter.sendMessage.mock.calls[0][0];
      expect(actionPassed.text).toContain('Bentar ya');
      // Crucial: isVoiceMessage MUST be false so it doesn't wait for TTS synthesis!
      expect(actionPassed.isVoiceMessage).toBe(false);
    });
  });
});
