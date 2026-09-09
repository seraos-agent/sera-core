import { ICommunicationAdapter, CommunicationAction } from '../types';
import { EventTypes } from '../../../core/events/types';
import { EventEmitter } from 'events';

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

    // 5. Normalize excessive blank lines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted.trim();
  }

  /**
   * Splits a formatted response into 1 to 3 natural conversational chat bubbles (Option B).
   * Enforces a hard cap of 3 bubbles to prevent notification spam, while respecting
   * paragraph breaks and Meta API's 4,096-character limit per message.
   */
  public static splitIntoBubbles(text: string): string[] {
    if (!text || !text.trim()) return [];

    const trimmed = text.trim();

    // 1. Single-paragraph answers under safe length limit remain 1 single bubble
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
      // Single paragraph
      bubbles = [trimmed];
    } else if (rawParagraphs.length === 2) {
      // 2 thought blocks: Bubble 1 (Deliverable/Result) + Bubble 2 (Follow-up)
      bubbles = [rawParagraphs[0], rawParagraphs[1]];
    } else if (rawParagraphs.length === 3) {
      // 3 thought blocks: Bubble 1 (Deliverable) + Bubble 2 (Insight) + Bubble 3 (Closing/Next step)
      bubbles = [rawParagraphs[0], rawParagraphs[1], rawParagraphs[2]];
    } else {
      // More than 3 paragraphs: strictly enforce hard limit of 3 bubbles
      // Bubble 1: First paragraph (Opening/Lead)
      // Bubble 2: Middle paragraphs combined
      // Bubble 3: Last paragraph (Closing/Follow-up)
      bubbles = [
        rawParagraphs[0],
        rawParagraphs.slice(1, rawParagraphs.length - 1).join('\n\n'),
        rawParagraphs[rawParagraphs.length - 1]
      ];
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
    const formattedBody = WhatsAppAdapter.formatToWhatsApp(action.text || '');
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
}
