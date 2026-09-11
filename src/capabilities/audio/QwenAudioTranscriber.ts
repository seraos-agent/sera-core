/**
 * QwenAudioTranscriber.ts
 *
 * Sensory Speech-to-Text (ASR) capability powered by Alibaba DashScope / Qwen Cloud
 * using the high-performance 'qwen-audio-3.0-asr-flash' model.
 *
 * Converts incoming WhatsApp voice notes (.ogg) and audio binaries into normalized,
 * punctuated text for the SERA DialogueEngine without mutating cognitive state.
 */

export interface TranscribeOptions {
  sampleRate?: number;
  timeoutMs?: number;
}

export class QwenAudioTranscriber {
  private static readonly ENDPOINT =
    'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  /**
   * Transcribes an audio buffer into natural text.
   *
   * @param audioBuffer Binary buffer of the audio file.
   * @param mimeType MIME type of the audio (e.g. 'audio/ogg', 'audio/mpeg', 'audio/wav').
   * @param options Optional configuration for sample rate and timeout.
   * @returns Transcribed text string, or null if transcription failed or empty.
   */
  public static async transcribe(
    audioBuffer: Buffer,
    mimeType: string = 'audio/ogg',
    options: TranscribeOptions = {}
  ): Promise<string | null> {
    const apiKey =
      process.env.QWEN_API ||
      process.env.DASHSCOPE_API_KEY ||
      process.env.QWEN_API_KEY;

    if (!apiKey) {
      console.warn('[QwenAudioTranscriber] Missing QWEN_API / DASHSCOPE_API_KEY. Cannot transcribe audio.');
      return null;
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      console.warn('[QwenAudioTranscriber] Empty audio buffer received.');
      return null;
    }

    const detectedFormat = this.resolveFormat(mimeType);
    const sampleRate = options.sampleRate || (detectedFormat === 'mp3' ? 44100 : 16000);
    const timeoutMs = options.timeoutMs || 25_000;

    const base64Data = audioBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64Data}`;

    const payload = {
      model: 'qwen-audio-3.0-asr-flash',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: dataUri
                }
              }
            ]
          }
        ]
      },
      parameters: {
        format: detectedFormat,
        sample_rate: String(sampleRate)
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-SSE': 'disable'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[QwenAudioTranscriber] ASR API error (${response.status}): ${errorText}`);
        return null;
      }

      const json = await response.json() as any;
      const text =
        json.output?.output?.text ||
        json.output?.text ||
        json.output?.output?.sentence?.text ||
        json.output?.sentence?.text;

      if (text && typeof text === 'string') {
        const trimmed = text.trim();
        return trimmed.length > 0 ? trimmed : null;
      }

      console.warn('[QwenAudioTranscriber] No transcription text found in response payload:', JSON.stringify(json).slice(0, 300));
      return null;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.error(`[QwenAudioTranscriber] Transcription timed out after ${timeoutMs}ms.`);
      } else {
        console.error('[QwenAudioTranscriber] Network error during transcription:', err.message);
      }
      return null;
    }
  }

  /**
   * Normalizes MIME types into the exact format string expected by Qwen ASR.
   */
  private static resolveFormat(mimeType: string): string {
    const lower = mimeType.toLowerCase();
    if (lower.includes('ogg') || lower.includes('opus')) return 'ogg';
    if (lower.includes('mp3') || lower.includes('mpeg')) return 'mp3';
    if (lower.includes('wav')) return 'wav';
    if (lower.includes('m4a') || lower.includes('mp4')) return 'm4a';
    if (lower.includes('aac')) return 'aac';
    return 'ogg';
  }
}
