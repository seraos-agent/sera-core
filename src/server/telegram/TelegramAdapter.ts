import { Telegraf } from 'telegraf';
import { AgentManager } from '../AgentManager';
import { SeraAgentInstance } from '../SeraAgentInstance';
import { EventTypes, StandardEvent } from '../../core/events/types';
import { SecretManager } from '../../core/secrets/SecretManager';

export class TelegramAdapter {
  private bot: Telegraf | null = null;
  private agentManager: AgentManager;
  private secretManager: SecretManager;

  // Track which instances we've already bound listeners to
  private boundInstances: Set<string> = new Set();

  constructor(agentManager: AgentManager, secretManager: SecretManager, botToken?: string) {
    this.agentManager = agentManager;
    this.secretManager = secretManager;

    if (botToken) {
      this.bot = new Telegraf(botToken);
      this.initializeBot();
    } else {
      console.log('[TelegramAdapter] No TELEGRAM_BOT_TOKEN provided. Telegram integration disabled.');
    }

    // Listen to new instances spawning
    this.agentManager.onInstanceCreated((instance) => {
      this.bindToInstance(instance);
    });
  }

  public isEnabled(): boolean {
    return this.bot !== null;
  }

  private initializeBot() {
    if (!this.bot) return;

    this.bot.start(async (ctx) => {
      const code = ctx.message.text.split(' ')[1]; // /start code123
      if (code) {
        const sessionId = await this.secretManager.getSecret(`TG_LINK_${code}`);
        if (sessionId) {
          await this.secretManager.setSecret(`TG_USER_${ctx.from.id}`, sessionId);
          await this.secretManager.setSecret(`TG_SESSION_${sessionId}`, ctx.from.id.toString());
          await this.secretManager.deleteSecret(`TG_LINK_${code}`); // one-time use
          
          try {
            const instance = this.agentManager.getOrCreateInstance(sessionId);
            if (instance?.runtime?.capabilityCatalog) {
              instance.runtime.capabilityCatalog.activateConnector('telegram');
            }
          } catch (err) {
            console.error('[TelegramAdapter] Failed to activate telegram connector on link:', err);
          }

          ctx.reply('✅ Success! Your Telegram account has been connected to SERA OS. You can now chat directly with your Agent here.');
        } else {
          ctx.reply('❌ Invalid or expired connection code. Please try again from the SERA Web Workspace.');
        }
      } else {
        ctx.reply('Unrecognized account. Please authenticate via your SERA Web Workspace to proceed.');
      }
    });

    this.bot.on('text', async (ctx) => {
      // Find the session associated with this Telegram user
      const sessionId = await this.secretManager.getSecret(`TG_USER_${ctx.from.id}`);
      
      if (!sessionId) {
        return ctx.reply('Unrecognized account. Please authenticate via your SERA Web Workspace to proceed.');
      }

      const instance = this.agentManager.getOrCreateInstance(sessionId);
      
      const event: StandardEvent = {
        id: `evt-${Date.now()}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'TelegramAdapter',
        payload: { message: ctx.message.text },
        timestamp: Date.now(),
      };

      instance.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);
      
      instance.chatHistoryStore.appendUiMessage({
        id: event.timestamp,
        role: 'user',
        content: ctx.message.text,
      });
    });

    this.bot.on('callback_query', async (ctx) => {
      const sessionId = await this.secretManager.getSecret(`TG_USER_${ctx.from.id}`);
      if (!sessionId) return ctx.answerCbQuery('Unauthorized');

      const data = (ctx.callbackQuery as any).data;
      if (!data) return;

      const instance = this.agentManager.getOrCreateInstance(sessionId);

      if (data.startsWith('approve_')) {
        const intentId = data.replace('approve_', '');
        instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_APPROVED, { intentId });
        ctx.answerCbQuery('Approved!');
        const textMsg = (ctx.callbackQuery.message as any)?.text;
        if (textMsg) ctx.editMessageText(textMsg + '\n\n✅ **Approved by you**', { parse_mode: 'Markdown' });
      } else if (data.startsWith('reject_')) {
        const intentId = data.replace('reject_', '');
        instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_REJECTED, { intentId });
        ctx.answerCbQuery('Rejected.');
        const textMsg = (ctx.callbackQuery.message as any)?.text;
        if (textMsg) ctx.editMessageText(textMsg + '\n\n❌ **Rejected by you**', { parse_mode: 'Markdown' });
      }
    });

    this.bot.launch().then(() => {
      console.log('[TelegramAdapter] Telegraf bot successfully launched and listening.');
    }).catch(err => {
      console.error('[TelegramAdapter] Failed to launch Telegraf bot:', err);
    });

    process.once('SIGINT', () => this.bot?.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot?.stop('SIGTERM'));
  }

  private bindToInstance(instance: SeraAgentInstance) {
    if (this.boundInstances.has(instance.sessionId)) return;
    this.boundInstances.add(instance.sessionId);

    instance.eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, async (event: StandardEvent) => {
      if (!this.bot) return;
      const text = event.payload?.message || event.payload?.text || event.payload;
      if (typeof text !== 'string') return;

      const tgId = await this.getTelegramIdForSession(instance.sessionId);
      if (tgId) {


        try {
          // Convert standard **bold** to Telegram *bold*
          let cleanText = text.replace(/\*\*(.*?)\*\*/g, '*$1*');
          // Escape some chars if needed, but standard Markdown usually handles it well.
          await this.bot.telegram.sendMessage(tgId, cleanText, { parse_mode: 'Markdown' });
        } catch (e) {
          console.warn(`[TelegramAdapter] Markdown parsing failed, falling back to plain text for ${tgId}`);
          try {
            await this.bot.telegram.sendMessage(tgId, text);
          } catch (err) {
             console.error(`[TelegramAdapter] Failed to send message to ${tgId}:`, err);
          }
        }
      }
    });

    instance.eventBus.on(EventTypes.GOAL_REQUIRES_APPROVAL, async (payload: any) => {
      if (!this.bot) return;
      
      const tgId = await this.getTelegramIdForSession(instance.sessionId);
      if (tgId) {


        try {
          let description = 'Unknown Action';
          if (payload.action?.type === 'TRANSFER_FUNDS') {
            description = `Transfer ${payload.action.payload.amount} ${payload.action.payload.asset?.toUpperCase()} to ${payload.action.payload.recipient?.address}`;
          } else if (payload.action?.type === 'THREADS_PUBLISH') {
            description = `Publish to Threads: "${payload.action.payload.text}"`;
          }

          const messageText = `🔔 *ACTION PROPOSAL*\n\nYour Agent is requesting approval for the following action:\n\n*Action:* ${description}`;
          
          await this.bot.telegram.sendMessage(tgId, messageText, {
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
        } catch (e) {
          console.error(`[TelegramAdapter] Failed to send proposal to ${tgId}:`, e);
        }
      }
    });

    instance.eventBus.on(EventTypes.DIALOGUE_ACTIVITY, async (event: StandardEvent) => {
      if (!this.bot) return;

      const tgId = await this.getTelegramIdForSession(instance.sessionId);
      if (tgId) {
        try {
          await this.bot.telegram.sendChatAction(tgId, 'typing');
        } catch (e) {
          // ignore rate limits for chat action
        }
      }
    });
  }

  public async getTelegramIdForSession(sessionId: string): Promise<string | null> {
    return await this.secretManager.getSecret(`TG_SESSION_${sessionId}`);
  }

  public async getStatus(sessionId: string): Promise<{ provider: 'TELEGRAM', status: 'CONNECTED' | 'NOT_CONNECTED' | 'UNAVAILABLE' }> {
    if (!this.bot) return { provider: 'TELEGRAM', status: 'UNAVAILABLE' };
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
