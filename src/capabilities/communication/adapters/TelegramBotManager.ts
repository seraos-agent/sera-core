import { Telegraf } from 'telegraf';
import { AgentManager } from '../../../server/AgentManager';
import { SecretManager } from '../../../core/secrets/SecretManager';
import { EventTypes, StandardEvent } from '../../../core/events/types';
import { ResponseContext } from '../types';

export class TelegramBotManager {
  private bot: Telegraf | null = null;
  
  constructor(private agentManager: AgentManager, private secretManager: SecretManager, botToken?: string) {
    if (botToken) {
      this.bot = new Telegraf(botToken);
      this.initializeBot();
    } else {
      console.warn('[TelegramBotManager] TELEGRAM_BOT_TOKEN is not set. Telegram capability is disabled.');
    }
  }

  public isEnabled(): boolean {
    return this.bot !== null;
  }

  public getBot(): Telegraf | null {
    return this.bot;
  }

  private initializeBot() {
    if (!this.bot) return;

    this.bot.command('start', async (ctx) => {
      const code = ctx.message.text.split(' ')[1];
      const tgId = ctx.message.from.id.toString();

      if (code) {
        // Pairing flow
        const sessionId = await this.secretManager.getSecret(`TG_LINK_${code}`);
        if (sessionId) {
          await this.secretManager.setSecret(`TG_USER_${tgId}`, sessionId);
          await this.secretManager.setSecret(`TG_SESSION_${sessionId}`, tgId);
          await this.secretManager.deleteSecret(`TG_LINK_${code}`);
          ctx.reply('✅ Successfully linked to your SERA Identity.');
          return;
        }
      }

      const linkedSessionId = await this.secretManager.getSecret(`TG_USER_${tgId}`);
      if (!linkedSessionId) {
        ctx.reply('Welcome to SERA OS. To use this bot, you must link it to your SERA Identity. Go to the SERA Web Dashboard, open Connections, and generate a pairing code. Then send: /start <CODE>');
      } else {
        ctx.reply('You are already linked to your SERA Identity.');
      }
    });

    this.bot.on('text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;
      const tgId = ctx.message.from.id.toString();
      const sessionId = await this.secretManager.getSecret(`TG_USER_${tgId}`);
      
      if (!sessionId) {
        ctx.reply('You are not linked. Go to the SERA Dashboard and generate a pairing code. Then send: /start <CODE>');
        return;
      }

      // Route the message to the correct Agent Instance
      const instance = this.agentManager.getOrCreateInstance(sessionId);
      
      const responseContext: ResponseContext = {
        platform: 'telegram',
        channelId: tgId,
        senderId: tgId,
      };

      const event: StandardEvent = {
        id: `evt-tg-${Date.now()}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'TelegramAdapter',
        payload: { 
          message: ctx.message.text,
          _responseContext: responseContext,
          responseContext 
        },
        timestamp: Date.now(),
      };

      instance.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);
    });

    // Handle GOAL_REQUIRES_APPROVAL callbacks
    this.bot.on('callback_query', async (ctx: any) => {
      const data = ctx.callbackQuery.data;
      const tgId = ctx.from.id.toString();
      const sessionId = await this.secretManager.getSecret(`TG_USER_${tgId}`);
      
      if (!sessionId) return;
      
      const instance = this.agentManager.getOrCreateInstance(sessionId);

      if (data.startsWith('approve_')) {
        const intentId = data.replace('approve_', '');
        instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_APPROVED, { intentId });
        await ctx.editMessageText(`✅ Action Approved.`);
      } else if (data.startsWith('reject_')) {
        const intentId = data.replace('reject_', '');
        instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_REJECTED, { intentId, reason: 'Rejected via Telegram inline button' });
        await ctx.editMessageText(`❌ Action Rejected.`);
      }
    });

    this.bot.launch().catch(err => console.error('[TelegramBotManager] Bot failed to launch:', err));
    console.log('[TelegramBotManager] Global Bot Started (Polling)');
  }

  public async getTelegramIdForSession(sessionId: string): Promise<string | null> {
    return await this.secretManager.getSecret(`TG_SESSION_${sessionId}`);
  }

  public async getStatus(sessionId: string): Promise<{ provider: 'TELEGRAM', status: 'CONNECTED' | 'NOT_CONNECTED' | 'UNAVAILABLE' }> {
    if (!this.isEnabled()) return { provider: 'TELEGRAM', status: 'UNAVAILABLE' };
    const tgId = await this.getTelegramIdForSession(sessionId);
    return {
      provider: 'TELEGRAM',
      status: tgId ? 'CONNECTED' : 'NOT_CONNECTED'
    };
  }

  public async generateLinkCode(sessionId: string): Promise<string> {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await this.secretManager.setSecret(`TG_LINK_${code}`, sessionId);
    setTimeout(() => {
      this.secretManager.deleteSecret(`TG_LINK_${code}`).catch(() => {});
    }, 15 * 60 * 1000);
    return code;
  }
}
