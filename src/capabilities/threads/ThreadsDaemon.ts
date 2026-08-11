import { EventEmitter } from 'events';
import { EventTypes } from '../../core/events/types';
import { ThreadsAPI, ThreadsMention } from './ThreadsAPI';

export class ThreadsDaemon {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private lastProcessedMentionId?: string;

  constructor(
    private readonly api: ThreadsAPI,
    private readonly eventBus: EventEmitter,
    private readonly sessionId: string = 'dev'
  ) {}

  start(intervalMs: number = 5 * 60 * 1000) { // Default 5 minutes
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[ThreadsDaemon] Started autonomous polling every ${intervalMs / 1000} seconds.`);
    
    // Initial poll immediately
    this.pollMentions();

    this.intervalId = setInterval(() => {
      this.pollMentions();
    }, intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.log('[ThreadsDaemon] Stopped.');
  }

  private async pollMentions() {
    if (!this.isRunning) return;

    try {
      const mentions = await this.api.getMentions(10);
      if (!mentions || mentions.length === 0) return;

      // Find new mentions
      const newMentions: ThreadsMention[] = [];
      for (const mention of mentions) {
        if (mention.id === this.lastProcessedMentionId) break;
        newMentions.push(mention);
      }

      // If this is the first run, just set the watermark and don't process old mentions
      if (!this.lastProcessedMentionId) {
        if (newMentions.length > 0) {
          this.lastProcessedMentionId = newMentions[0].id;
        }
        return;
      }

      if (newMentions.length === 0) return;

      // Update watermark
      this.lastProcessedMentionId = newMentions[0].id;

      // Process from oldest to newest
      for (const mention of newMentions.reverse()) {
        await this.handleMention(mention);
      }
    } catch (err: any) {
      // API block or no token yet, ignore quietly
      if (!err.message.includes('active access token')) {
        console.error('[ThreadsDaemon] Error polling mentions:', err.message);
      }
    }
  }

  private async handleMention(mention: ThreadsMention) {
    console.log(`[ThreadsDaemon] New mention detected from @${mention.username}: ${mention.text}`);

    const vipUsersStr = process.env.THREADS_VIP_USERS || '';
    const vipUsers = vipUsersStr.split(',').map(u => u.trim().toLowerCase());

    const isVip = vipUsers.includes(mention.username.toLowerCase());

    if (isVip) {
      console.log(`[ThreadsDaemon] @${mention.username} is VIP. Waking up AI...`);
      // Emit DIALOGUE_USER_OBSERVED to wake up the DialogueEngine
      this.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, {
        id: `evt-threads-${Date.now()}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'ThreadsDaemon',
        payload: {
          message: `[SYSTEM_NOTIFICATION] You received a new mention on Threads from VIP user @${mention.username}: "${mention.text}". Please analyze this and use the THREADS_REPLY tool to reply directly to mention ID: ${mention.id}. You have permission to reply directly.\n\n[PERSONA INSTRUCTION FOR THREADS]: The culture on Threads is different from X/Twitter. Your tone should be light, brief, humorous, cheeky, and fun. Do not be overly technical. However, if the user's mention is serious or highly technical, adapt and answer professionally. Always match the context.`
        },
        timestamp: Date.now()
      });
    } else {
      console.log(`[ThreadsDaemon] @${mention.username} is not VIP. Sending gatekeeper reply...`);
      // Auto-reply directly bypassing AI
      try {
        const replyText = `Hello @${mention.username}! Great question. However, I am currently only serving registered users. Join us at seraos.xyz (or check the link in my bio) so we can chat! 🚀`;
        await this.api.publishPost(replyText, mention.id);
        console.log(`[ThreadsDaemon] Gatekeeper reply sent to @${mention.username}`);
      } catch (err: any) {
        console.error(`[ThreadsDaemon] Failed to send gatekeeper reply to @${mention.username}:`, err.message);
      }
    }
  }
}
