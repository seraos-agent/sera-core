import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QwenAudioTranscriber } from '../src/capabilities/audio/QwenAudioTranscriber';
import { XAITextToSpeechService } from '../src/capabilities/audio/XAITextToSpeechService';
import { WhatsAppAdapter } from '../src/capabilities/communication/adapters/WhatsAppAdapter';
import { EventEmitter } from 'events';

describe('Audio Capabilities & WhatsApp Multimodal Integration', () => {
  describe('XAITextToSpeechService.prepareSpokenText', () => {
    it('strips markdown formatting and raw URLs for natural speech', () => {
      const markdown = `### Laporan Penjualan
Berikut adalah rekap:
* Beras: 50kg
* Minyak: 20 liter
Dokumen lengkap: [Buka Google Drive](https://drive.google.com/open?id=123)
\`\`\`
code block
\`\`\`
Silakan cek!`;

      const spoken = XAITextToSpeechService.prepareSpokenText(markdown);
      expect(spoken).not.toContain('###');
      expect(spoken).not.toContain('https://');
      expect(spoken).not.toContain('code block');
      expect(spoken).toContain('Beras: 50kg');
      expect(spoken).toContain('Minyak: 20 liter');
      expect(spoken).toContain('Buka Google Drive');
    });

    it('clamps long texts to concise voice note length', () => {
      const longText = 'Ini adalah kalimat pertama yang sangat penting. ' + 'Kalimat pengulangan yang sangat panjang sekali demi menguji batas maksimal karakter yang diizinkan untuk voice note. '.repeat(10);
      const spoken = XAITextToSpeechService.prepareSpokenText(longText);
      expect(spoken.length).toBeLessThanOrEqual(455);
    });
  });

  describe('QwenAudioTranscriber', () => {
    it('returns null if audio buffer is empty', async () => {
      const result = await QwenAudioTranscriber.transcribe(Buffer.from(''), 'audio/ogg');
      expect(result).toBeNull();
    });

    it('parses valid sentence transcription correctly', async () => {
      const prevKey = process.env.QWEN_API;
      process.env.QWEN_API = 'sk-mock-test-key';
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output: {
            output: {
              text: 'Halo Sera tolong catat stok sembako ya.'
            }
          }
        })
      } as any);

      try {
        const dummyBuffer = Buffer.from('dummy audio data');
        const result = await QwenAudioTranscriber.transcribe(dummyBuffer, 'audio/ogg');
        expect(result).toBe('Halo Sera tolong catat stok sembako ya.');
      } finally {
        global.fetch = originalFetch;
        process.env.QWEN_API = prevKey;
      }
    });
  });

  describe('WhatsAppAdapter Multimodal Delivery', () => {
    it('dispatches native image message when markdown image is detected', async () => {
      const fetchCalls: any[] = [];
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: any, options: any) => {
        const parsedBody = options?.body ? JSON.parse(options.body) : {};
        fetchCalls.push({ url, body: parsedBody });
        return {
          ok: true,
          json: async () => ({ messages: [{ id: 'wamid.123' }] })
        } as any;
      });

      try {
        const eventBus = new EventEmitter();
        const adapter = new WhatsAppAdapter('test-session', {
          phoneNumberId: '123456',
          accessToken: 'fake_token'
        }, eventBus);

        const action = {
          platform: 'whatsapp',
          channelId: '628123456789',
          text: 'Berikut adalah grafik penjualan kamu:\n\n![Grafik Mingguan](https://images.seraos.xyz/chart.png)\n\nSemua data sudah sinkron ya!'
        };

        const result = await adapter.sendMessage(action);
        expect(result.success).toBe(true);

        // Verify image call was dispatched
        const imageCall = fetchCalls.find(c => c.body?.type === 'image');
        expect(imageCall).toBeDefined();
        expect(imageCall.body.image.link).toBe('https://images.seraos.xyz/chart.png');
        expect(imageCall.body.image.caption).toBe('Grafik Mingguan');

        // Verify text call was dispatched without the raw markdown image tag
        const textCall = fetchCalls.find(c => c.body?.type === 'text');
        expect(textCall).toBeDefined();
        expect(textCall.body.text.body).not.toContain('![Grafik Mingguan]');
        expect(textCall.body.text.body).toContain('Berikut adalah grafik penjualan kamu');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('synthesizes and uploads voice note when isVoiceMessage is true', async () => {
      const originalSynthesize = XAITextToSpeechService.synthesize;
      const originalUpload = WhatsAppAdapter.prototype.uploadMedia;
      const fetchCalls: any[] = [];
      const originalFetch = global.fetch;

      XAITextToSpeechService.synthesize = vi.fn().mockResolvedValue({
        buffer: Buffer.from('fake mp3 audio'),
        mimeType: 'audio/mpeg'
      });

      WhatsAppAdapter.prototype.uploadMedia = vi.fn().mockResolvedValue('media-voice-12345');

      global.fetch = vi.fn().mockImplementation(async (url: any, options: any) => {
        const parsedBody = options?.body ? JSON.parse(options.body) : {};
        fetchCalls.push({ url, body: parsedBody });
        return {
          ok: true,
          json: async () => ({ messages: [{ id: 'wamid.audio.123' }] })
        } as any;
      });

      try {
        const eventBus = new EventEmitter();
        const adapter = new WhatsAppAdapter('test-session', {
          phoneNumberId: '123456',
          accessToken: 'fake_token'
        }, eventBus);

        const action = {
          platform: 'whatsapp',
          channelId: '628123456789',
          text: 'Halo! Laporan spreadsheet sembako sudah selesai aku perbarui ya.',
          isVoiceMessage: true
        };

        const result = await adapter.sendMessage(action);
        expect(result.success).toBe(true);
        expect(XAITextToSpeechService.synthesize).toHaveBeenCalledWith(action.text);
        expect(WhatsAppAdapter.prototype.uploadMedia).toHaveBeenCalled();

        // Verify audio call was dispatched
        const audioCall = fetchCalls.find(c => c.body?.type === 'audio');
        expect(audioCall).toBeDefined();
        expect(audioCall.body.audio.id).toBe('media-voice-12345');
      } finally {
        XAITextToSpeechService.synthesize = originalSynthesize;
        WhatsAppAdapter.prototype.uploadMedia = originalUpload;
        global.fetch = originalFetch;
      }
    });
  });

  describe('WhatsAppAdapter.formatToWhatsApp CJK Sanitization', () => {
    it('sanitizes leaked Chinese tokens like 语音 and 语音 call', () => {
      const dirty = 'Nggak usah gitu dong, nanti kayak teman yang diajak语音 call ngilang wkwk';
      const clean = WhatsAppAdapter.formatToWhatsApp(dirty);
      expect(clean).not.toContain('语音');
      expect(clean).toContain('voice call');
    });

    it('removes stray Chinese characters from Indonesian and English sentences', () => {
      const dirty = 'Halo ini adalah pesan测试 yang sangat penting.';
      const clean = WhatsAppAdapter.formatToWhatsApp(dirty);
      expect(clean).toBe('Halo ini adalah pesan yang sangat penting.');
    });

    it('preserves intentional Chinese messages', () => {
      const chineseMsg = '你好！我是SERA，很高兴认识你。';
      const clean = WhatsAppAdapter.formatToWhatsApp(chineseMsg);
      expect(clean).toBe('你好！我是SERA，很高兴认识你。');
    });
  });
});
