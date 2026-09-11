/**
 * XAITextToSpeechService.ts
 *
 * Expressive Text-to-Speech (TTS) actuation capability powered by xAI TTS API.
 * Synthesizes Sera's spoken voice using the signature 'ara' voice (or configurable via SERA_TTS_VOICE).
 *
 * Prepares conversational spoken audio for delivery as native WhatsApp Voice Notes (.mp3/opus).
 */

export interface SynthesizeOptions {
  voiceId?: string;
  language?: string;
  sampleRate?: number;
  bitRate?: number;
  timeoutMs?: number;
}

export interface SynthesizeResult {
  buffer: Buffer;
  mimeType: string;
}

export class XAITextToSpeechService {
  private static readonly ENDPOINT = 'https://api.x.ai/v1/tts';

  /**
   * Synthesizes plain or markdown text into natural human-like speech.
   *
   * @param rawText Text to be spoken by Sera.
   * @param options Optional voiceId, language, and audio bitrate settings.
   * @returns Audio binary buffer and MIME type, or null on failure.
   */
  public static async synthesize(
    rawText: string,
    options: SynthesizeOptions = {}
  ): Promise<SynthesizeResult | null> {
    const apiKey =
      process.env['Sera-core-XAI'] ||
      process.env.XAI_API_KEY ||
      process.env.SERA_CORE_XAI;

    if (!apiKey) {
      console.warn('[XAITextToSpeechService] Missing xAI API key (Sera-core-XAI / XAI_API_KEY). Cannot synthesize voice.');
      return null;
    }

    if (!rawText || !rawText.trim()) {
      return null;
    }

    const voiceId = options.voiceId || process.env.SERA_TTS_VOICE || 'ara';
    const language = options.language || 'id';
    const sampleRate = options.sampleRate || 44100;
    const bitRate = options.bitRate || 128000;
    const timeoutMs = options.timeoutMs || 20_000;

    // Clean text for speech delivery (remove URLs, code snippets, and markdown artifacts)
    const spokenText = this.prepareSpokenText(rawText);
    if (!spokenText) return null;

    const payload = {
      text: spokenText,
      voice_id: voiceId,
      output_format: {
        codec: 'mp3',
        sample_rate: sampleRate,
        bit_rate: bitRate
      },
      language
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[XAITextToSpeechService] xAI TTS error (${response.status}): ${errorText}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        console.warn('[XAITextToSpeechService] Received empty audio buffer from xAI TTS.');
        return null;
      }

      return {
        buffer,
        mimeType: 'audio/mpeg'
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.error(`[XAITextToSpeechService] Speech synthesis timed out after ${timeoutMs}ms.`);
      } else {
        console.error('[XAITextToSpeechService] Network error during speech synthesis:', err.message);
      }
      return null;
    }
  }

  /**
   * Cleans text to make it sound conversational and natural when spoken.
   * Strips out raw markdown syntax, URLs, table lines, and excessive list numbers.
   * Limits speech to ~450 characters (concise WhatsApp voice note summary).
   */
  public static prepareSpokenText(text: string): string {
    if (!text) return '';

    let cleaned = text;

    // 1. Remove code blocks
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

    // 2. Remove markdown images and links
    cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // 3. Remove raw URLs so the TTS does not spell out 'h-t-t-p-s-colon-slash-slash'
    cleaned = cleaned.replace(/https?:\/\/[^\s\)]+/g, 'link yang sudah aku sertakan di chat');

    // 4. Remove Markdown headers and decorative separators
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    cleaned = cleaned.replace(/^(\s*[-*_]\s*){3,}$/gm, '');

    // 5. Remove bullet markers at line start
    cleaned = cleaned.replace(/^[\s*•\-–]+\s*/gm, '');

    // 6. Normalize whitespace
    cleaned = cleaned.replace(/\n+/g, ' [pause] ');
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    // 7. Clamp to ~450 characters for crisp, elegant voice notes
    if (cleaned.length > 450) {
      // Find the last sentence end before 450 chars
      const slice = cleaned.slice(0, 450);
      const lastPeriod = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
      if (lastPeriod > 200) {
        cleaned = slice.slice(0, lastPeriod + 1);
      } else {
        cleaned = slice + '...';
      }
    }

    return cleaned;
  }
}
