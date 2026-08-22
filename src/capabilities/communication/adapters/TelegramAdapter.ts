import { ICommunicationAdapter, CommunicationAction } from '../types';
import { TelegramBotManager } from './TelegramBotManager';
import { EventTypes } from '../../../core/events/types';
import { EventEmitter } from 'events';

export class TelegramAdapter implements ICommunicationAdapter {
  public readonly platform = 'telegram';

  constructor(
    private sessionId: string, 
    private botManager: TelegramBotManager,
    private eventBus: EventEmitter
  ) {}

  async start(): Promise<void> {
    if (!this.botManager.isEnabled()) {
      console.warn(`[TelegramAdapter] Bot manager not enabled. Telegram features for ${this.sessionId} disabled.`);
      return;
    }
    
    // Bind agent-specific outbound events (GOAL_REQUIRES_APPROVAL is not handled by CommunicationBridge yet)
    this.eventBus.on(EventTypes.GOAL_REQUIRES_APPROVAL, async (payload: any) => {
      const tgId = await this.botManager.getTelegramIdForSession(this.sessionId);
      if (tgId) {
        try {
          let description = 'Unknown Action';
          if (payload.action?.type === 'TRANSFER_FUNDS') {
            description = `Transfer ${payload.action.payload.amount} ${payload.action.payload.asset?.toUpperCase()} to ${payload.action.payload.recipient?.address}`;
          } else if (payload.action?.type === 'THREADS_PUBLISH') {
            description = `Publish to Threads: "${payload.action.payload.text}"`;
          }

          const messageText = `🔔 *ACTION PROPOSAL*\n\nYour Agent is requesting approval for the following action:\n\n*Action:* ${description}`;
          
          const bot = this.botManager.getBot();
          if (bot) {
            await bot.telegram.sendMessage(tgId, messageText, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Approve', callback_data: `approve_${payload.intentId}` },
                    { text: '❌ Reject', callback_data: `reject_${payload.intentId}` }
                  ]
                ]
              }
            });
          }
        } catch (e) {
          console.error(`[TelegramAdapter] Failed to send proposal to ${tgId}:`, e);
        }
      }
    });

    this.eventBus.on(EventTypes.DIALOGUE_ACTIVITY, async () => {
      const tgId = await this.botManager.getTelegramIdForSession(this.sessionId);
      if (tgId) {
        try {
          const bot = this.botManager.getBot();
          if (bot) {
            await bot.telegram.sendChatAction(tgId, 'typing');
          }
        } catch (e) {
          // ignore rate limits
        }
      }
    });
  }

  async stop(): Promise<void> {
    // The global bot manager handles Telegraf polling. We don't stop it here.
  }

  async sendMessage(action: CommunicationAction): Promise<{ success: boolean; platformMessageId?: string }> {
    if (!this.botManager.isEnabled()) throw new Error('Telegram bot is not configured');
    
    const tgId = await this.botManager.getTelegramIdForSession(this.sessionId);
    if (!tgId) throw new Error('No Telegram account linked to this session');

    const bot = this.botManager.getBot()!;
    let cleanText = action.text.replace(/\*\*(.*?)\*\*/g, '*$1*');
    
    try {
      const res = await bot.telegram.sendMessage(tgId, cleanText, { parse_mode: 'Markdown' });
      return { success: true, platformMessageId: res.message_id.toString() };
    } catch (e: any) {
      // Fallback without markdown if there's a parsing error
      const res = await bot.telegram.sendMessage(tgId, action.text);
      return { success: true, platformMessageId: res.message_id.toString() };
    }
  }

  public async getStatus(): Promise<{ provider: 'TELEGRAM', status: 'CONNECTED' | 'NOT_CONNECTED' | 'UNAVAILABLE' }> {
    if (!this.botManager.isEnabled()) return { provider: 'TELEGRAM', status: 'UNAVAILABLE' };
    const tgId = await this.botManager.getTelegramIdForSession(this.sessionId);
    return {
      provider: 'TELEGRAM',
      status: tgId ? 'CONNECTED' : 'NOT_CONNECTED'
    };
  }
}
