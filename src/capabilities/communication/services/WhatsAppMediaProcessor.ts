import { WhatsAppManager } from '../adapters/WhatsAppManager';
import { DocumentParserService, ParsedDocumentResult } from '../../../core/ingestion/DocumentParserService';
import { QwenAudioTranscriber } from '../../audio/QwenAudioTranscriber';

export interface ProcessedMediaResult {
  textContent: string;
  imagesList?: string[];
  documentsList?: ParsedDocumentResult[];
  isVoiceMessage: boolean;
}

/**
 * Handles incoming multimodal media attachments from WhatsApp:
 * - Safe download via Meta CDN with file size and timeout caps.
 * - Base64 image payload preparation for multimodal vision models.
 * - Document parsing (Excel/CSV/PDF) via DocumentParserService.
 * - Voice note transcription via Qwen ASR with voice reply intent detection.
 */
export class WhatsAppMediaProcessor {
  /**
   * Processes incoming image attachment from WhatsApp.
   */
  public async processImage(
    mediaId: string,
    caption: string,
    whatsAppManager?: WhatsAppManager
  ): Promise<{ imagesList?: string[]; textContent: string }> {
    let imagesList: string[] | undefined;
    let textContent = caption || '';

    if (!mediaId || !whatsAppManager) {
      return { imagesList, textContent };
    }

    try {
      const downloaded = await whatsAppManager.downloadMedia(mediaId, {
        maxSizeBytes: 15 * 1024 * 1024, // 15MB limit for images
        timeoutMs: 30_000 // 30s timeout
      });

      if (downloaded) {
        const base64Str = downloaded.buffer.toString('base64');
        imagesList = [`data:${downloaded.mimeType || 'image/jpeg'};base64,${base64Str}`];
        if (!textContent.trim()) {
          textContent = 'Tolong analisa foto/gambar ini secara detail.';
        }
      } else {
        if (!textContent.trim()) {
          textContent = '[Gambar tidak dapat diunduh dari WhatsApp atau melebihi batas 15MB]';
        }
      }
    } catch (err: any) {
      console.error('[WhatsAppMediaProcessor] Failed to download image:', err.message);
      if (!textContent.trim()) {
        textContent = '[Gagal memproses gambar dari WhatsApp]';
      }
    }

    return { imagesList, textContent };
  }

  /**
   * Processes incoming document attachment (e.g. CSV, XLSX) from WhatsApp.
   */
  public async processDocument(
    mediaId: string,
    rawFileName: string,
    caption: string,
    mimeType: string,
    whatsAppManager?: WhatsAppManager
  ): Promise<{ documentsList?: ParsedDocumentResult[]; textContent: string }> {
    let documentsList: ParsedDocumentResult[] | undefined;
    let textContent = caption || '';
    const fileName = rawFileName || 'document.csv';

    if (!mediaId || !whatsAppManager) {
      return { documentsList, textContent };
    }

    try {
      const downloaded = await whatsAppManager.downloadMedia(mediaId, {
        maxSizeBytes: 20 * 1024 * 1024, // 20MB limit for documents
        timeoutMs: 30_000 // 30s timeout
      });

      if (downloaded) {
        const parsedDoc = await DocumentParserService.parseDocument(
          downloaded.buffer,
          fileName,
          downloaded.mimeType || mimeType || 'application/octet-stream'
        );
        documentsList = [parsedDoc];
        if (!textContent.trim()) {
          textContent = `Saya mengunggah dokumen: ${fileName}. Tolong analisa data dan angka kuncinya.`;
        }
      } else {
        if (!textContent.trim()) {
          textContent = `[Dokumen ${fileName} tidak dapat diunduh dari WhatsApp atau melebihi batas 20MB]`;
        }
      }
    } catch (err: any) {
      console.error('[WhatsAppMediaProcessor] Failed to download/parse document:', err.message);
      if (!textContent.trim()) {
        textContent = `[Gagal memproses dokumen ${fileName}]`;
      }
    }

    return { documentsList, textContent };
  }

  /**
   * Processes incoming voice note or audio file from WhatsApp and transcribes via Qwen ASR.
   */
  public async processAudio(
    mediaId: string,
    mimeType: string,
    from: string,
    whatsAppManager?: WhatsAppManager
  ): Promise<{ textContent: string; isVoiceMessage: boolean }> {
    let textContent = '';
    let isVoiceMessage = true;

    if (!mediaId || !whatsAppManager) {
      return { textContent: '[File audio tidak dapat diakses]', isVoiceMessage };
    }

    try {
      const downloaded = await whatsAppManager.downloadMedia(mediaId, {
        maxSizeBytes: 25 * 1024 * 1024, // 25MB limit for audio
        timeoutMs: 30_000
      });

      if (downloaded) {
        const transcribed = await QwenAudioTranscriber.transcribe(
          downloaded.buffer,
          downloaded.mimeType || mimeType || 'audio/ogg'
        );

        if (transcribed) {
          textContent = transcribed;
          console.log(`[WhatsApp Webhook] Voice note from +${from} transcribed: "${transcribed.slice(0, 80)}..."`);
          // If user speaks in a VN but explicitly asks to reply in text
          if (
            /\b(balas|jawab|kirim|tulis)\b.*?\b(teks|tulisan|chat|ketik)\b/i.test(transcribed) ||
            /\b(jangan\s+vn|jangan\s+suara|jangan\s+pake\s+vn|jangan\s+kirim\s+vn)\b/i.test(transcribed)
          ) {
            isVoiceMessage = false;
          }
        } else {
          textContent = '[Voice Note tidak dapat ditranskrip dengan jelas. Mohon ulangi kembali atau ketik pesan Anda.]';
        }
      } else {
        textContent = '[File audio tidak dapat diunduh dari WhatsApp]';
      }
    } catch (err: any) {
      console.error('[WhatsAppMediaProcessor] Failed to transcribe audio:', err.message);
      textContent = '[Gagal memproses voice note dari WhatsApp]';
    }

    return { textContent, isVoiceMessage };
  }
}
