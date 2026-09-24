import { ICommunicationAdapter, CommunicationAction } from '../types';
import { EventTypes } from '../../../core/events/types';
import { EventEmitter } from 'events';
import { XAITextToSpeechService } from '../../audio/XAITextToSpeechService';
import { WhatsAppCatalogService } from '../services/WhatsAppCatalogService';

export interface WhatsAppAdapterConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
  catalogService?: WhatsAppCatalogService;
}

export class WhatsAppAdapter implements ICommunicationAdapter {
  public readonly platform = 'whatsapp';

  private phoneNumberId: string;
  private accessToken: string;
  private apiVersion: string;
  private catalogService: WhatsAppCatalogService;

  constructor(
    private sessionId: string,
    config: WhatsAppAdapterConfig,
    private eventBus: EventEmitter
  ) {
    this.phoneNumberId = config.phoneNumberId;
    this.accessToken = config.accessToken;
    this.apiVersion = config.apiVersion || 'v21.0';
    this.catalogService = config.catalogService || new WhatsAppCatalogService();
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

    // 2. Convert Markdown bullet lists using asterisks (* Item) to bullet dots (• Item)
    // This is CRITICAL: prevents WhatsApp from treating bullet asterisks as unclosed bold formatting!
    formatted = formatted.replace(/^\s*[*]\s+/gm, '• ');

    // 3. Convert Markdown bold-italic (***bold-italic***) to WhatsApp (_*bold-italic*_)
    formatted = formatted.replace(/\*\*\*([^*\n]+?)\*\*\*/g, '_*$1*_');

    // 4. Convert standard Markdown bold (**bold**) to WhatsApp bold (*bold*)
    // Must NOT span across newlines, as WhatsApp bold is strictly single-line!
    formatted = formatted.replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');

    // 5. Ensure proper spacing inside bold asterisks: WhatsApp ignores "* word *" (space immediately after/before *)
    formatted = formatted.replace(/(?<=^|[\s(])\*\s+([^*\n]+?)\s+\*(?=$|[\s),.?!:;])/g, '*$1*');

    // 6. Convert Markdown links [Text](URL) to "Text: URL"
    formatted = formatted.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '$1: $2');

    // 7. Convert Markdown horizontal rules (--- or ***) into clean separator
    formatted = formatted.replace(/^(\s*[-*_]\s*){3,}$/gm, '──────────');

    // 8. Sanitize long em dashes (—) to clean en dashes (–) with spacing to avoid artificial AI tone
    formatted = formatted.replace(/\s*—\s*/g, ' – ');
    formatted = formatted.replace(/—/g, ' – ');

    // 9. Strip Markdown blockquotes (> text) so WhatsApp does not render artificial quote bars
    formatted = formatted.replace(/^>\s*/gm, '');

    // 10. Sanitize HTML line breaks (<br>, <br/>) and rogue HTML tags (<p>, <span>, etc.)
    formatted = formatted.replace(/<\/?br\s*\/?>/gi, '\n');
    formatted = formatted.replace(/&nbsp;/gi, ' ');
    formatted = formatted.replace(/<\/?[a-z][a-z0-9]*[^<>]*>/gi, '');

    // 11. Sanitize leaked CJK tokens from model generation when conversing in non-Chinese languages
    const cjkMatches = formatted.match(/[\u4e00-\u9fa5]/g);
    const totalChars = formatted.trim().length;
    if (cjkMatches && totalChars > 0 && (cjkMatches.length / totalChars) < 0.25) {
      formatted = formatted
        .replace(/语音\s*call/gi, 'voice call')
        .replace(/语音\s*note/gi, 'voice note')
        .replace(/语音/g, 'suara')
        .replace(/[\u4e00-\u9fa5]+/g, '');
    }

    // 12. Normalize excessive blank lines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted.trim();
  }

  /**
   * Ensures markdown tags (* for bold, ` for code, ``` for codeblocks) are properly balanced within a single bubble.
   * WhatsApp parses rich formatting per message bubble; unclosed tags break rendering for that entire bubble.
   */
  public static balanceMarkdownTags(bubble: string): string {
    if (!bubble) return '';
    let result = bubble;

    // 1. Check code blocks ```
    const codeBlockCount = (result.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      result += '\n```';
    }

    // 2. Check inline backticks `
    const codeBlockStripped = result.replace(/```.*?```/gs, '');
    const inlineCodeCount = (codeBlockStripped.match(/`/g) || []).length;
    if (inlineCodeCount % 2 !== 0) {
      result += '`';
    }

    // 3. Check bold asterisks *
    const totalAsterisks = (result.match(/\*/g) || []).length;
    if (totalAsterisks % 2 !== 0) {
      const lastAsteriskIdx = result.lastIndexOf('*');
      if (lastAsteriskIdx !== -1) {
        const charAfter = result[lastAsteriskIdx + 1];
        if (charAfter && /\S/.test(charAfter)) {
          // It was an opening bold tag (e.g. "*important text"); close it at the end
          result += '*';
        } else {
          // Standalone or trailing asterisk without opening intent, strip it
          result = result.substring(0, lastAsteriskIdx) + result.substring(lastAsteriskIdx + 1);
        }
      }
    }

    return result;
  }

  /**
   * Safely chunks an oversized text block (exceeding 3,800 chars) strictly at paragraph,
   * line break, or sentence boundaries without chopping mid-word.
   */
  private static chunkOversizedBlock(text: string, maxLen: number = 3800): string[] {
    const result: string[] = [];
    let remaining = text.trim();

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        result.push(remaining);
        break;
      }

      // 1. Try paragraph break
      let splitIdx = remaining.lastIndexOf('\n\n', maxLen);
      let stepForward = 2;

      // 2. Try single line break
      if (splitIdx === -1 || splitIdx < maxLen * 0.4) {
        splitIdx = remaining.lastIndexOf('\n', maxLen);
        stepForward = 1;
      }

      // 3. Try sentence boundary (period, question, exclamation + space)
      if (splitIdx === -1 || splitIdx < maxLen * 0.4) {
        const sentenceMatch = remaining.substring(0, maxLen).match(/.*[.?!](\s+)/s);
        if (sentenceMatch && sentenceMatch[0].length >= maxLen * 0.4) {
          splitIdx = sentenceMatch[0].length - sentenceMatch[1].length;
          stepForward = sentenceMatch[1].length;
        }
      }

      // 4. Fallback: space boundary
      if (splitIdx === -1 || splitIdx < maxLen * 0.4) {
        splitIdx = remaining.lastIndexOf(' ', maxLen);
        stepForward = 1;
      }

      // 5. Absolute emergency fallback
      if (splitIdx === -1 || splitIdx < maxLen * 0.4) {
        splitIdx = maxLen;
        stepForward = 0;
      }

      const chunk = remaining.substring(0, splitIdx).trim();
      if (chunk) {
        result.push(chunk);
      }
      remaining = remaining.substring(splitIdx + stepForward).trim();
    }

    return result;
  }

  /**
   * Splits a formatted response into natural conversational chat bubbles on WhatsApp.
   * - 1 bubble for casual chats, direct answers, or single cohesive topics.
   * - Option 2 (2 bubbles) for structured summaries, reports, or digests:
   *   Bubble 1 = The Substance (Opening Lead-in + All Points/Content).
   *   Bubble 2 = The Takeaway & Discussion starter.
   * - Multi-point long-form explanations partition strictly on paragraph/item boundaries (never mid-sentence).
   * - Merges orphan/dangling intro paragraphs (e.g. short intro ending with :) so they never become isolated bubbles.
   * - Balances formatting tags (*bold*, `code`, ```block```) across all emitted bubbles.
   * - Strictly respects Meta API's 4,096-character limit per message (clamps at 3,800 chars).
   */
  public static splitIntoBubbles(text: string): string[] {
    if (!text || !text.trim()) return [];

    const trimmed = text.trim();
    const MAX_BUBBLE_LENGTH = 3800;
    const COMFORTABLE_BODY_BUBBLE_LENGTH = 2600;

    // 1. Single paragraph answers under safe length limit remain 1 single bubble
    if (!trimmed.includes('\n\n') && trimmed.length <= MAX_BUBBLE_LENGTH) {
      return [WhatsAppAdapter.balanceMarkdownTags(trimmed)];
    }

    // 2. Split by distinct paragraphs (separated by 2 or more newlines)
    const rawParagraphs = trimmed
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (rawParagraphs.length <= 1) {
      return WhatsAppAdapter.chunkOversizedBlock(trimmed, MAX_BUBBLE_LENGTH)
        .map(b => WhatsAppAdapter.balanceMarkdownTags(b));
    }

    // 3. Merge orphan/dangling intro paragraphs so they never become a lonely, awkward 1-line bubble
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
      return WhatsAppAdapter.chunkOversizedBlock(normalizedParagraphs[0], MAX_BUBBLE_LENGTH)
        .map(b => WhatsAppAdapter.balanceMarkdownTags(b));
    }

    let intermediateBubbles: string[] = [];

    if (normalizedParagraphs.length === 2) {
      // 2 clean blocks: Bubble 1 (Deliverable/Result/Substance) + Bubble 2 (Follow-up/Takeaway)
      const p1IsListItem = /^(\*?\d+[\.\)]|\*?[-•])\s+/.test(normalizedParagraphs[1]);
      if (p1IsListItem && (normalizedParagraphs[0].length + normalizedParagraphs[1].length + 2) <= COMFORTABLE_BODY_BUBBLE_LENGTH) {
        intermediateBubbles = [normalizedParagraphs.join('\n\n')];
      } else {
        intermediateBubbles = [normalizedParagraphs[0], normalizedParagraphs[1]];
      }
    } else if (normalizedParagraphs.length === 3) {
      // Check if this is an operational deliverable with link (Bubble 1: Link preview, Bubble 2: Insight, Bubble 3: Action)
      const hasUrl = /https?:\/\/[^\s\)]+/.test(normalizedParagraphs[0]);
      if (hasUrl) {
        intermediateBubbles = [normalizedParagraphs[0], normalizedParagraphs[1], normalizedParagraphs[2]];
      } else {
        const lastIsListItem = /^(\*?\d+[\.\)]|\*?[-•])\s+/.test(normalizedParagraphs[2]);
        if (lastIsListItem && (normalizedParagraphs[0].length + normalizedParagraphs[1].length + normalizedParagraphs[2].length + 4) <= COMFORTABLE_BODY_BUBBLE_LENGTH) {
          intermediateBubbles = [normalizedParagraphs.join('\n\n')];
        } else {
          intermediateBubbles = [
            normalizedParagraphs.slice(0, 2).join('\n\n'),
            normalizedParagraphs[2]
          ];
        }
      }
    } else {
      // 4 or more paragraphs:
      // Group substantive body paragraphs cleanly by paragraph boundaries without overflowing 2,600 chars!
      // A paragraph is only separated as a closing Bubble 2 if it is a genuine non-list closing inquiry/takeaway!
      const lastIndex = normalizedParagraphs.length - 1;
      const lastPara = normalizedParagraphs[lastIndex];
      const lastIsListItem = /^(\*?\d+[\.\)]|\*?[-•])\s+/.test(lastPara);

      let bodyParagraphs: string[];
      let closingParagraph: string | null = null;

      if (!lastIsListItem) {
        // Last paragraph is a true standalone takeaway or discussion inquiry
        bodyParagraphs = normalizedParagraphs.slice(0, lastIndex);
        closingParagraph = lastPara;
      } else {
        // All paragraphs are substantive list items or sections without separate closing
        bodyParagraphs = normalizedParagraphs;
      }

      const bodyBubbles: string[] = [];
      let currentGroup: string[] = [];
      let currentLen = 0;

      for (const p of bodyParagraphs) {
        const addedLen = currentGroup.length > 0 ? (p.length + 2) : p.length;
        if (currentGroup.length > 0 && (currentLen + addedLen) > COMFORTABLE_BODY_BUBBLE_LENGTH) {
          bodyBubbles.push(currentGroup.join('\n\n'));
          currentGroup = [p];
          currentLen = p.length;
        } else {
          currentGroup.push(p);
          currentLen += addedLen;
        }
      }
      if (currentGroup.length > 0) {
        bodyBubbles.push(currentGroup.join('\n\n'));
      }

      if (closingParagraph) {
        intermediateBubbles = [...bodyBubbles, closingParagraph];
      } else {
        intermediateBubbles = bodyBubbles;
      }
    }

    // 4. Safety Guard: If any single bubble still exceeds MAX_BUBBLE_LENGTH,
    // chunk safely without cutting words, and balance markdown tags on all final bubbles.
    const finalBubbles: string[] = [];
    for (const b of intermediateBubbles) {
      if (b.length <= MAX_BUBBLE_LENGTH) {
        finalBubbles.push(WhatsAppAdapter.balanceMarkdownTags(b));
      } else {
        const chunks = WhatsAppAdapter.chunkOversizedBlock(b, MAX_BUBBLE_LENGTH);
        for (const ch of chunks) {
          finalBubbles.push(WhatsAppAdapter.balanceMarkdownTags(ch));
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

    // 2b. Native WhatsApp Single Product Message (SPM)
    if (action.richContent?.product && this.catalogService) {
      const { retailerId, bodyText, footerText } = action.richContent.product;
      const effectiveBody = action.text
        ? WhatsAppAdapter.formatToWhatsApp(action.text)
        : (bodyText || `${retailerId}`);
      const spmPayload = this.catalogService.buildSingleProductPayload(
        cleanRecipient,
        retailerId,
        effectiveBody,
        footerText
      );
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(spmPayload)
        });

        if (response.ok) {
          const data = await response.json() as any;
          return { success: true, platformMessageId: data?.messages?.[0]?.id };
        }

        const errText = await response.text();
        console.warn(`[WhatsAppAdapter] Interactive Single Product Message rejected (${response.status}): ${errText}. Falling back to conversational text.`);
      } catch (err: any) {
        console.warn('[WhatsAppAdapter] Single Product Message exception, falling back to text:', err.message);
      }
    }

    // 2c. Native WhatsApp Multi-Product Message (MPM / Product List)
    if (action.richContent?.productList && this.catalogService) {
      const { sections, headerText, bodyText, footerText } = action.richContent.productList;
      const isTechnicalNoise = !action.text || /WHATSAPP_SEND_CATALOG|tindakan yang diminta telah berhasil dijalankan|selesai\./i.test(action.text);
      const rawBody = isTechnicalNoise
        ? (bodyText || '🛍️ Silakan pilih menu yang ingin dipesan:')
        : WhatsAppAdapter.formatToWhatsApp(action.text);
      const effectiveBody = (!rawBody || /WHATSAPP_SEND_CATALOG|tindakan yang diminta telah berhasil dijalankan/i.test(rawBody))
        ? '🛍️ Silakan pilih menu yang ingin dipesan:'
        : rawBody;

      const mpmPayload = this.catalogService.buildMultiProductPayload(
        cleanRecipient,
        sections || [],
        headerText,
        effectiveBody,
        footerText || 'SERA Mart'
      );
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(mpmPayload)
        });

        if (response.ok) {
          const data = await response.json() as any;
          return { success: true, platformMessageId: data?.messages?.[0]?.id };
        }

        const errText = await response.text();
        console.warn(`[WhatsAppAdapter] Interactive Multi-Product Message rejected (${response.status}): ${errText}. Falling back to conversational text.`);
      } catch (err: any) {
        console.warn('[WhatsAppAdapter] Multi-Product Message exception, falling back to text:', err.message);
      }
    }

    // 2d. Native WhatsApp Full Catalog Link Message
    if (action.richContent?.catalog && this.catalogService) {
      const { bodyText, footerText, thumbnailRetailerId } = action.richContent.catalog;
      const effectiveBody = action.text
        ? WhatsAppAdapter.formatToWhatsApp(action.text)
        : (bodyText || 'Jelajahi seluruh katalog produk kami langsung di WhatsApp.');
      const catPayload = this.catalogService.buildCatalogPayload(
        cleanRecipient,
        effectiveBody,
        footerText,
        thumbnailRetailerId
      );
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(catPayload)
        });

        if (response.ok) {
          const data = await response.json() as any;
          return { success: true, platformMessageId: data?.messages?.[0]?.id };
        }

        const errText = await response.text();
        console.warn(`[WhatsAppAdapter] Interactive Catalog Message rejected (${response.status}): ${errText}. Falling back to conversational text.`);
      } catch (err: any) {
        console.warn('[WhatsAppAdapter] Catalog Message exception, falling back to text:', err.message);
      }
    }

    // 2e. Native WhatsApp Interactive Store List Message (Bottom Sheet)
    if (action.richContent?.storeList && this.catalogService) {
      const { stores, headerText, bodyText, buttonText } = action.richContent.storeList;
      const effectiveBody = action.text
        ? WhatsAppAdapter.formatToWhatsApp(action.text)
        : (bodyText || 'Pilih toko untuk melihat daftar menu dan memesan langsung di WhatsApp:');
      const storeListPayload = this.catalogService.buildInteractiveStoreListPayload(
        cleanRecipient,
        stores || [],
        headerText,
        effectiveBody,
        buttonText
      );
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(storeListPayload)
        });

        if (response.ok) {
          const data = await response.json() as any;
          return { success: true, platformMessageId: data?.messages?.[0]?.id };
        }

        const errText = await response.text();
        console.warn(`[WhatsAppAdapter] Interactive Store List rejected (${response.status}): ${errText}. Falling back to conversational text.`);
      } catch (err: any) {
        console.warn('[WhatsAppAdapter] Interactive Store List exception, falling back to text:', err.message);
      }
    }

    // 2f. Native WhatsApp Interactive Category List Message (Level 1 Categories)
    if (action.richContent?.categoryList && this.catalogService) {
      const { headerText, bodyText } = action.richContent.categoryList;
      const effectiveBody = action.text
        ? WhatsAppAdapter.formatToWhatsApp(action.text)
        : (bodyText || 'Pilih kategori kebutuhan belanja atau layanan yang Anda cari:');
      const catListPayload = this.catalogService.buildCategoryListPayload(
        cleanRecipient,
        headerText,
        effectiveBody
      );
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(catListPayload)
        });

        if (response.ok) {
          const data = await response.json() as any;
          return { success: true, platformMessageId: data?.messages?.[0]?.id };
        }

        const errText = await response.text();
        console.warn(`[WhatsAppAdapter] Interactive Category List rejected (${response.status}): ${errText}. Falling back to conversational text.`);
      } catch (err: any) {
        console.warn('[WhatsAppAdapter] Interactive Category List exception, falling back to text:', err.message);
      }
    }

    // 2g. Native WhatsApp Quick Reply Buttons (Category / Action Shortcuts)
    if ((action.richContent?.buttons || action.richContent?.quickReplies) && this.catalogService) {
      const buttons = action.richContent.buttons || action.richContent.quickReplies;
      if (Array.isArray(buttons) && buttons.length > 0) {
        const effectiveBody = action.text
          ? WhatsAppAdapter.formatToWhatsApp(action.text)
          : 'Silakan pilih opsi di bawah ini:';
        const buttonsPayload = this.catalogService.buildQuickReplyButtonsPayload(
          cleanRecipient,
          effectiveBody,
          buttons,
          action.richContent.footerText
        );
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(buttonsPayload)
          });

          if (response.ok) {
            const data = await response.json() as any;
            return { success: true, platformMessageId: data?.messages?.[0]?.id };
          }

          const errText = await response.text();
          console.warn(`[WhatsAppAdapter] Interactive Buttons rejected (${response.status}): ${errText}. Falling back to conversational text.`);
        } catch (err: any) {
          console.warn('[WhatsAppAdapter] Interactive Buttons exception, falling back to text:', err.message);
        }
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

