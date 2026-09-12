import { ICommunicationAdapter, CommunicationAction } from '../types';
import { EventTypes } from '../../../core/events/types';
import { EventEmitter } from 'events';
import { XAITextToSpeechService } from '../../audio/XAITextToSpeechService';

export interface WhatsAppAdapterConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
}

export class WhatsAppAdapter implements ICommunicationAdapter {
  public readonly platform = 'whatsapp';

  private phoneNumberId: string;
  private accessToken: string;
  private apiVersion: string;

  constructor(
    private sessionId: string,
    config: WhatsAppAdapterConfig,
    private eventBus: EventEmitter
  ) {
    this.phoneNumberId = config.phoneNumberId;
    this.accessToken = config.accessToken;
    this.apiVersion = config.apiVersion || 'v21.0';
  }

  async start(): Promise<void> {
    if (!this.phoneNumberId || !this.accessToken) {
      console.warn(`[WhatsAppAdapter] WhatsApp credentials missing for session ${this.sessionId}. Outbound disabled.`);
      return;
    }

    // Bind agent-specific outbound events if approval is required
    this.eventBus.on(EventTypes.GOAL_REQUIRES_APPROVAL, async (payload: any) => {
      // Outbound approval request notification via WhatsApp if applicable
    });

    console.log(`[WhatsAppAdapter] Started WhatsApp adapter for session ${this.sessionId}`);
  }

  async stop(): Promise<void> {
    // Graceful teardown
  }

  /**
   * Converts standard Markdown formatting into WhatsApp-native rich formatting markers.
   */
  public static formatToWhatsApp(text: string): string {
    if (!text) return '';

    let formatted = text;

    // 1. Convert Markdown headers (# Header) to bold text (*Header*)
    formatted = formatted.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

    // 2. Convert standard Markdown bold (**bold**) to WhatsApp bold (*bold*)
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '*$1*');

    // 3. Convert Markdown links [Text](URL) to "Text: URL"
    formatted = formatted.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '$1: $2');

    // 4. Convert Markdown horizontal rules (--- or ***) into clean separator
    formatted = formatted.replace(/^(\s*[-*_]\s*){3,}$/gm, '──────────');

    // 5. Sanitize long em dashes (—) to clean en dashes (–) with spacing to avoid artificial AI tone
    formatted = formatted.replace(/\s*—\s*/g, ' – ');
    formatted = formatted.replace(/—/g, ' – ');

    // 6. Strip Markdown blockquotes (> text) so WhatsApp does not render artificial quote bars
    formatted = formatted.replace(/^>\s*/gm, '');

    // 7. Sanitize HTML line breaks (<br>, <br/>) and rogue HTML tags (<p>, <span>, etc.)
    formatted = formatted.replace(/<\/?br\s*\/?>/gi, '\n');
    formatted = formatted.replace(/&nbsp;/gi, ' ');
    formatted = formatted.replace(/<\/?[a-z][a-z0-9]*[^<>]*>/gi, '');

    // 8. Sanitize leaked CJK tokens from model generation when conversing in non-Chinese languages
    const cjkMatches = formatted.match(/[\u4e00-\u9fa5]/g);
    const totalChars = formatted.trim().length;
    if (cjkMatches && totalChars > 0 && (cjkMatches.length / totalChars) < 0.25) {
      formatted = formatted
        .replace(/语音\s*call/gi, 'voice call')
        .replace(/语音\s*note/gi, 'voice note')
        .replace(/语音/g, 'suara')
        .replace(/[\u4e00-\u9fa5]+/g, '');
    }

    // 9. Normalize excessive blank lines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted.trim();
  }

  /**
   * Splits a formatted response into natural conversational chat bubbles on WhatsApp.
   * - 1 bubble for casual chats, direct answers, or single cohesive topics.
   * - Option 2 (2 bubbles) for structured summaries, reports, or digests:
   *   Bubble 1 = The Substance (Opening Lead-in + All Points/Content).
   *   Bubble 2 = The Takeaway & Discussion starter.
   * - Merges orphan/dangling intro paragraphs (e.g. short intro ending with :) so they never become isolated bubbles.
   * - Strictly respects Meta API's 4,096-character limit per message (clamps at 3,800 chars).
   */
  public static splitIntoBubbles(text: string): string[] {
    if (!text || !text.trim()) return [];

    const trimmed = text.trim();

    // 1. Single paragraph answers under safe length limit remain 1 single bubble
    if (!trimmed.includes('\n\n') && trimmed.length <= 3800) {
      return [trimmed];
    }

    // 2. Split by distinct paragraphs (separated by 2 or more newlines)
    const rawParagraphs = trimmed
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    let bubbles: string[] = [];

    if (rawParagraphs.length <= 1) {
      bubbles = [trimmed];
    } else {
      // 3. Merge orphan/dangling intro paragraphs so they never become a lonely, awkward 1-line bubble
      // An intro is considered dangling if:
      // a) It does NOT contain a URL (URLs are deliverables / external resources), AND
      // b) Either:
      //    - It ends with a colon (:) or ellipsis (...), indicating it points to the following text, OR
      //    - It is short (< 160 chars) and the next paragraph starts with a list marker (*1, 1., -, •)
      const normalizedParagraphs: string[] = [];
      for (let i = 0; i < rawParagraphs.length; i++) {
        const p = rawParagraphs[i];
        if (
          i === 0 &&
          rawParagraphs.length > 1 &&
          !/https?:\/\//i.test(p) &&
          (
            /[:：…]\s*$/.test(p) ||
            (p.length < 160 && /^(\*?\d+[\.\)]|\*?[-•])/.test(rawParagraphs[1]))
          )
        ) {
          rawParagraphs[1] = p + '\n\n' + rawParagraphs[1];
          continue;
        }
        normalizedParagraphs.push(p);
      }

      if (normalizedParagraphs.length <= 1) {
        bubbles = [normalizedParagraphs[0]];
      } else if (normalizedParagraphs.length === 2) {
        // 2 clean blocks: Bubble 1 (Deliverable/Result/Substance) + Bubble 2 (Follow-up/Takeaway)
        bubbles = [normalizedParagraphs[0], normalizedParagraphs[1]];
      } else if (normalizedParagraphs.length === 3) {
        // Check if this is an operational deliverable with link (Bubble 1: Link preview, Bubble 2: Insight, Bubble 3: Action)
        const hasUrl = /https?:\/\/[^\s\)]+/.test(normalizedParagraphs[0]);
        if (hasUrl) {
          bubbles = [normalizedParagraphs[0], normalizedParagraphs[1], normalizedParagraphs[2]];
        } else {
          // Standard multi-point summary: Option 2 (Bubble 1: Points combined, Bubble 2: Takeaway/Closing)
          bubbles = [
            normalizedParagraphs.slice(0, 2).join('\n\n'),
            normalizedParagraphs[2]
          ];
        }
      } else {
        // 4 or more paragraphs: Option 2 (2 bubbles)
        // Bubble 1: All substantive body points combined with comfortable spacing
        // Bubble 2: Closing takeaway / follow-up question
        bubbles = [
          normalizedParagraphs.slice(0, normalizedParagraphs.length - 1).join('\n\n'),
          normalizedParagraphs[normalizedParagraphs.length - 1]
        ];
      }
    }

    // 3. Safety Clamp: Meta API allows up to 4,096 characters per text message.
    // If any bubble exceeds 3,800 chars, chunk it safely at paragraph or sentence boundaries.
    const finalBubbles: string[] = [];
    const MAX_BUBBLE_LENGTH = 3800;

    for (const b of bubbles) {
      if (b.length <= MAX_BUBBLE_LENGTH) {
        finalBubbles.push(b);
      } else {
        let remaining = b;
        while (remaining.length > 0) {
          if (remaining.length <= MAX_BUBBLE_LENGTH) {
            finalBubbles.push(remaining);
            break;
          }
          let splitIdx = remaining.lastIndexOf('\n', MAX_BUBBLE_LENGTH);
          if (splitIdx === -1 || splitIdx < MAX_BUBBLE_LENGTH / 2) {
            splitIdx = remaining.lastIndexOf('. ', MAX_BUBBLE_LENGTH);
          }
          if (splitIdx === -1 || splitIdx < MAX_BUBBLE_LENGTH / 2) {
            splitIdx = MAX_BUBBLE_LENGTH;
          } else {
            splitIdx += (remaining[splitIdx] === '.' ? 2 : 1);
          }
          finalBubbles.push(remaining.substring(0, splitIdx).trim());
          remaining = remaining.substring(splitIdx).trim();
        }
      }
    }

    return finalBubbles;
  }

  /**
   * Sends an outbound text message to a WhatsApp recipient with human-like sequential pacing.
   */
  async sendMessage(action: CommunicationAction): Promise<{ success: boolean; platformMessageId?: string }> {
    if (!this.phoneNumberId || !this.accessToken) {
      console.warn('[WhatsAppAdapter] Cannot send message: missing phoneNumberId or accessToken');
      return { success: false };
    }

    const recipient = action.channelId; // WhatsApp phone number in international format e.g. 628...
    if (!recipient) {
      console.warn('[WhatsAppAdapter] Cannot send message: empty recipient');
      return { success: false };
    }

    const cleanRecipient = recipient.replace(/[^0-9]/g, '');
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    let voiceNoteDispatched = false;

    // 1. Native Outbound Audio (Voice Note via xAI TTS)
    if (action.isVoiceMessage && action.text) {
      try {
        const audioResult = await XAITextToSpeechService.synthesize(action.text);
        if (audioResult) {
          const mediaId = await this.uploadMedia(audioResult.buffer, audioResult.mimeType, 'voice_note.ogg');
          if (mediaId) {
            const sendRes = await fetch(url, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: cleanRecipient,
                type: 'audio',
                audio: { id: mediaId }
              })
            });
            if (sendRes.ok) {
              console.log(`[WhatsAppAdapter] Dispatched native voice note to +${cleanRecipient}`);
              voiceNoteDispatched = true;
            } else {
              const errTxt = await sendRes.text();
              console.error(`[WhatsAppAdapter] Failed to dispatch audio message (${sendRes.status}): ${errTxt}`);
            }
          }
        }
      } catch (err: any) {
        console.error('[WhatsAppAdapter] Failed to send voice note:', err.message);
      }
    }

    // 2. Native WhatsApp Interactive Proposal Buttons (Conversational Quick Reply)
    if (action.richContent?.proposal) {
      const { proposalId, intent, isIndonesian } = action.richContent.proposal;
      const isId = isIndonesian !== false;
      const cancelTitle = isId ? 'Batal' : 'Cancel';
      const approveTitle = intent === 'THREADS_DELETE'
        ? (isId ? 'Hapus' : 'Delete')
        : intent === 'TRANSFER_FUNDS'
        ? (isId ? 'Kirim' : 'Send')
        : (isId ? 'Lanjut' : 'Proceed');

      const rawBody = action.text || (isId ? 'Mau dilanjut sekarang?' : 'Should we proceed?');
      const bodyText = WhatsAppAdapter.formatToWhatsApp(rawBody);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanRecipient,
            type: 'interactive',
            interactive: {
              type: 'button',
              body: {
                text: bodyText.slice(0, 1024)
              },
              action: {
                buttons: [
                  {
                    type: 'reply',
                    reply: {
                      id: `reject_prop_${proposalId}`,
                      title: cancelTitle
                    }
                  },
                  {
                    type: 'reply',
                    reply: {
                      id: `approve_prop_${proposalId}`,
                      title: approveTitle
                    }
                  }
                ]
              }
            }
          })
        });

        if (response.ok) {
          const data = await response.json() as any;
          return { success: true, platformMessageId: data?.messages?.[0]?.id };
        }

        const errText = await response.text();
        console.warn(`[WhatsAppAdapter] Interactive proposal button rejected (${response.status}): ${errText}. Falling back to conversational text bubbles.`);
      } catch (err: any) {
        console.warn('[WhatsAppAdapter] Interactive proposal exception, falling back to text:', err.message);
      }
    }

    // 3. Native Outbound Image Delivery (e.g. Generated Charts, Diagrams, Visuals)
    let rawText = action.text || '';
    const imagesToSend: Array<{ url: string; caption?: string }> = [];

    // 3a. Explicit image attachments from action
    if (action.images && Array.isArray(action.images)) {
      for (const img of action.images) {
        if (typeof img === 'string' && img.startsWith('http')) {
          imagesToSend.push({ url: img });
        }
      }
    }

    // 3b. Extract markdown images: ![caption](url)
    const markdownImgRegex = /!\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = markdownImgRegex.exec(rawText)) !== null) {
      imagesToSend.push({ caption: match[1], url: match[2] });
    }

    // Strip markdown image syntax from text body so raw URLs aren't duplicated in text bubbles
    rawText = rawText.replace(markdownImgRegex, '').trim();

    // Dispatch native WhatsApp images
    for (const imgItem of imagesToSend) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanRecipient,
            type: 'image',
            image: {
              link: imgItem.url,
              caption: imgItem.caption ? WhatsAppAdapter.formatToWhatsApp(imgItem.caption).slice(0, 1024) : undefined
            }
          })
        });
        console.log(`[WhatsAppAdapter] Dispatched native image to +${cleanRecipient}: ${imgItem.url}`);
      } catch (imgErr: any) {
        console.error('[WhatsAppAdapter] Failed to dispatch native image:', imgErr.message);
      }
    }

    // 3c. If native voice note was dispatched and no links/proposals/images exist,
    // skip duplicate text bubbles ONLY for short casual banters (< 200 chars).
    // For substantive reports, post drafts, or long deliverables (>= 200 chars),
    // ALWAYS send the formatted text bubbles so the user can read and reference the full content!
    const hasExternalUrl = /https?:\/\/[^\s\)]+/.test(rawText);
    const isShortCasualBanter = rawText.trim().length < 200;
    if (voiceNoteDispatched && isShortCasualBanter && !hasExternalUrl && !action.richContent?.proposal && imagesToSend.length === 0) {
      return { success: true };
    }

    const formattedBody = WhatsAppAdapter.formatToWhatsApp(rawText);
    const bubbles = WhatsAppAdapter.splitIntoBubbles(formattedBody);

    if (bubbles.length === 0) {
      return { success: true };
    }

    let lastMessageId: string | undefined;

    try {
      for (let i = 0; i < bubbles.length; i++) {
        const bubbleText = bubbles[i];

        // Replicate natural human typing cadence between sequential bubbles
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }

        const hasUrl = /https?:\/\/[^\s\)]+/.test(bubbleText);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanRecipient,
            type: 'text',
            text: {
              preview_url: hasUrl,
              body: bubbleText
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`[WhatsAppAdapter] Meta API error on bubble ${i + 1}/${bubbles.length} (${response.status}):`, errText);
          return { success: false };
        }

        const data = await response.json() as any;
        lastMessageId = data?.messages?.[0]?.id;
      }

      return { success: true, platformMessageId: lastMessageId };
    } catch (err: any) {
      console.error('[WhatsAppAdapter] Failed to send WhatsApp message:', err.message);
      return { success: false };
    }
  }

  /**
   * Uploads outbound media binary to Meta Graph API and returns mediaId.
   */
  public async uploadMedia(
    buffer: Buffer,
    mimeType: string,
    filename: string = 'media'
  ): Promise<string | null> {
    if (!this.phoneNumberId || !this.accessToken || !buffer || buffer.length === 0) return null;

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/media`;

    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      formData.append('file', blob, filename);
      formData.append('type', mimeType);
      formData.append('messaging_product', 'whatsapp');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: formData
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[WhatsAppAdapter] Media upload error (${response.status}): ${errText}`);
        return null;
      }

      const data = await response.json() as any;
      return data?.id || null;
    } catch (err: any) {
      console.error('[WhatsAppAdapter] Media upload exception:', err.message);
      return null;
    }
  }
}

