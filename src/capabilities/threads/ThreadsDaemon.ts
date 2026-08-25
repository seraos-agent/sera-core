import { EventEmitter } from 'events';
import { EventTypes } from '../../core/events/types';
import { ThreadsAPI, ThreadsMention } from './ThreadsAPI';
import { SecretManager } from '../../core/secrets/SecretManager';
import * as fs from 'fs';
import * as path from 'path';

export class ThreadsDaemon {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private lastProcessedMentionId?: string;
  private lastProcessedReplyIds = new Map<string, string>(); // threadId -> lastReplyId
  private timelineContext: string = ''; // Caches recent posts for AI context
  private processedIds = new Set<string>();

  private readonly watermarkFile = path.join(process.cwd(), '.data', 'threads_watermark.json');

  constructor(
    private readonly api: ThreadsAPI,
    private readonly eventBus: EventEmitter,
    private readonly sessionId: string = 'default',
    private readonly secretManager?: SecretManager
  ) {
    this.loadWatermark();
  }

  private async getSettings() {
    if (!this.secretManager) return { vipReplies: true, gatekeeper: true };
    try {
      const settingsStr = await this.secretManager.getSecret(`THREADS_SETTINGS_${this.sessionId}`);
      if (settingsStr) return JSON.parse(settingsStr);
    } catch (e) {
      // ignore
    }
    return { vipReplies: true, gatekeeper: true };
  }

  private loadWatermark() {
    try {
      if (fs.existsSync(this.watermarkFile)) {
        const data = fs.readFileSync(this.watermarkFile, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed.lastProcessedMentionId) {
          this.lastProcessedMentionId = parsed.lastProcessedMentionId;
          this.processedIds.add(parsed.lastProcessedMentionId);
          console.log(`[ThreadsDaemon] Loaded watermark. Starting from Mention ID: ${this.lastProcessedMentionId}`);
        }
      }
    } catch (err: any) {
      console.warn(`[ThreadsDaemon] Failed to load watermark: ${err.message}`);
    }
  }

  private saveWatermark(mentionId: string) {
    try {
      this.lastProcessedMentionId = mentionId;
      this.processedIds.add(mentionId);
      const dir = path.dirname(this.watermarkFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.watermarkFile, JSON.stringify({ lastProcessedMentionId: mentionId }, null, 2), 'utf8');
    } catch (err: any) {
      console.error(`[ThreadsDaemon] Failed to save watermark: ${err.message}`);
    }
  }

  private markProcessed(id: string) {
    this.processedIds.add(id);
    // Keep memory clean
    if (this.processedIds.size > 2000) {
      const iter = this.processedIds.values();
      for (let i = 0; i < 500; i++) {
        const next = iter.next();
        if (next.done) break;
        this.processedIds.delete(next.value);
      }
    }
  }

  start(intervalMs: number = 5 * 60 * 1000) { // Default 5 minutes
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[ThreadsDaemon] Started autonomous polling every ${intervalMs / 1000} seconds.`);
    
    // Initial poll immediately
    this.pollMentions();
    this.pollReplies();

    this.intervalId = setInterval(() => {
      this.pollMentions();
      this.pollReplies();
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

  public async pollNow(): Promise<void> {
    await Promise.allSettled([
      this.pollMentions(true),
      this.pollReplies(true)
    ]);
  }

  public async pollMentions(force: boolean = false) {
    if (!this.isRunning && !force) return;

    try {
      const mentions = await this.api.getMentions(this.sessionId, 20);
      if (!mentions || mentions.length === 0) {
        return;
      }

      // Ensure mentions are sorted newest-first
      mentions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // FIRST RUN GUARD: If watermark is empty (e.g. cold start), record the latest ID and skip past backlog
      if (!this.lastProcessedMentionId) {
        this.saveWatermark(mentions[0].id);
        mentions.forEach(m => this.markProcessed(m.id));
        console.log(`[ThreadsDaemon] Initialized mention watermark to ID: ${mentions[0].id}. Skipping historical backlog.`);
        return;
      }

      // Find new mentions
      const newMentions: ThreadsMention[] = [];
      for (const mention of mentions) {
        if (mention.id === this.lastProcessedMentionId || this.processedIds.has(mention.id)) break;
        newMentions.push(mention);
      }
      
      if (newMentions.length > 0) {
        console.log(`[ThreadsDaemon] Found ${newMentions.length} new mentions.`);
        this.saveWatermark(newMentions[0].id);
      }

      // Process from oldest to newest
      for (const mention of newMentions.reverse()) {
        await this.handleMention(mention);
      }
    } catch (err: any) {
      if (!err.message.includes('active access token')) {
        console.error('[ThreadsDaemon] Error polling mentions:', err.message);
      }
    }
  }

  public async pollReplies(force: boolean = false) {
    if (!this.isRunning && !force) return;

    try {
      // 1. Get recent threads (Timeline Context)
      const threads = await this.api.getUserThreads(this.sessionId, 5);
      if (!threads || threads.length === 0) return;

      // Caches recent posts to inject into the AI context
      this.timelineContext = threads.map(t => `[${t.timestamp}] ${t.text}`).join('\n');

      // 2. Filter threads to only poll those created in the last 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentThreads = threads.filter(t => new Date(t.timestamp).getTime() > sevenDaysAgo);

      // 3. For each recent thread, poll replies
      for (const thread of recentThreads) {
        const replies = await this.api.getThreadReplies(this.sessionId, thread.id, 20);
        if (!replies || replies.length === 0) continue;

        // Ensure replies are sorted newest-first
        replies.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const newReplies: ThreadsMention[] = [];
        const lastProcessedId = this.lastProcessedReplyIds.get(thread.id);

        for (const reply of replies) {
          if (reply.id === lastProcessedId || this.processedIds.has(reply.id)) break;
          newReplies.push(reply);
        }

        if (newReplies.length > 0) {
          this.lastProcessedReplyIds.set(thread.id, newReplies[0].id);
        }

        // First run initialization, don't trigger backlog replies
        if (!lastProcessedId) {
          newReplies.forEach(r => this.markProcessed(r.id));
          continue;
        }

        // Process from oldest to newest
        for (const reply of newReplies.reverse()) {
          await this.handleReply(reply, thread.text);
        }
      }
    } catch (err: any) {
      if (!err.message.includes('active access token')) {
        console.error('[ThreadsDaemon] Error polling replies:', err.message);
      }
    }
  }

  private userActivityMap = new Map<string, { count: number; windowStart: number }>();

  /**
   * Enforces a rate limit per Threads user to prevent abuse and spam (e.g. max 3 responses per 15 mins).
   */
  private checkRateLimit(username: string): boolean {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const maxRequests = 3;

    const activity = this.userActivityMap.get(username);
    if (!activity || (now - activity.windowStart) > windowMs) {
      this.userActivityMap.set(username, { count: 1, windowStart: now });
      return true;
    }

    if (activity.count >= maxRequests) {
      return false;
    }

    activity.count++;
    return true;
  }

  private isSpamOrScam(text: string): boolean {
    if (!text) return false;
    const spamPatterns = [
      /t\.me\//i,
      /bit\.ly\//i,
      /wa\.me\//i,
      /whatsapp/i,
      /airdrop/i,
      /dm me/i,
      /dm for promo/i,
      /send me a message/i,
      /join my channel/i,
      /telegram/i,
      /giveaway.*crypto/i
    ];
    return spamPatterns.some(p => p.test(text));
  }

  private async handleReply(reply: ThreadsMention, originalPostText: string) {
    if (this.processedIds.has(reply.id)) return;
    this.markProcessed(reply.id);

    const replyUsername = (reply.username || '').toLowerCase();
    const botUsername = (process.env.THREADS_BOT_USERNAME || 'sera.agent').toLowerCase();
    
    // Ignore self-reply from the bot account itself
    if (replyUsername === botUsername) {
      console.log(`[ThreadsDaemon] Ignoring self-reply from @${reply.username}`);
      return;
    }

    // Filter spam / scam links
    if (this.isSpamOrScam(reply.text || '')) {
      console.log(`[ThreadsDaemon] Ignoring spam reply from @${reply.username}: "${reply.text}"`);
      return;
    }

    // Rate-limit check per user
    if (!this.checkRateLimit(replyUsername)) {
      console.log(`[ThreadsDaemon] Rate limit exceeded for @${reply.username}. Skipping reply.`);
      return;
    }

    console.log(`[ThreadsDaemon] New public reply detected from @${reply.username} on our post. Waking up AI...`);

    const message = `[SYSTEM_NOTIFICATION] User @${reply.username} commented on YOUR post on Threads:
Your original post: "${originalPostText}"
Their comment: "${reply.text}"

[PERSONA & STYLE GUIDELINES]:
- Craft a natural, witty, engaging, or thought-provoking response (1-3 sentences).
- Match the language of the comment (Indonesian -> Indonesian, English -> English).
- Do NOT hard-sell, pitch products, or drop generic links. Keep it 100% organic and conversational.
- Be curious, clever, slightly playful, and friendly.

[INTERNAL SYSTEM ROUTING]:
To post your reply directly to Threads, you MUST call the tool THREADS_REPLY with:
{
  "replyToId": "${reply.id}",
  "text": "<your generated reply>"
}
This is an autonomous background task. Execute the tool immediately without asking for confirmation.`;

    this.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, {
      id: `evt-threads-reply-${Date.now()}`,
      type: EventTypes.DIALOGUE_USER_OBSERVED,
      source: 'ThreadsDaemon',
      payload: { 
        message,
        userMessage: message,
        _seraWorkClass: 'CONVERSATION'
      },
      timestamp: Date.now()
    });
  }

  private async handleMention(mention: ThreadsMention) {
    if (this.processedIds.has(mention.id)) return;
    this.markProcessed(mention.id);

    const mentionUsername = (mention.username || '').toLowerCase();
    const botUsername = (process.env.THREADS_BOT_USERNAME || 'sera.agent').toLowerCase();

    // Ignore self-mentions
    if (mentionUsername === botUsername) {
      console.log(`[ThreadsDaemon] Ignoring self-mention from @${mention.username}`);
      return;
    }

    // Filter spam / scam links
    if (this.isSpamOrScam(mention.text || '')) {
      console.log(`[ThreadsDaemon] Ignoring spam mention from @${mention.username}: "${mention.text}"`);
      return;
    }

    // Rate-limit check per user
    if (!this.checkRateLimit(mentionUsername)) {
      console.log(`[ThreadsDaemon] Rate limit exceeded for @${mentionUsername}. Skipping mention.`);
      return;
    }

    console.log(`[ThreadsDaemon] New public mention detected from @${mention.username}: "${mention.text}"`);

    let parentPostContext = '';
    try {
      const mentionDetails = await this.api.getPost(this.sessionId, mention.id);
      
      if (mentionDetails.is_reply && mentionDetails.replied_to?.id) {
        console.log(`[ThreadsDaemon] Mention is a reply. Fetching parent post context for ${mentionDetails.replied_to.id}...`);
        const parentPost = await this.api.getPost(this.sessionId, mentionDetails.replied_to.id);
        parentPostContext = `\n[PARENT POST CONTEXT]: They are replying in a thread under @${parentPost.username}'s post: "${parentPost.text}"\n`;
      }
    } catch (err: any) {
      console.warn(`[ThreadsDaemon] Could not fetch parent post context:`, err.message);
    }

    const message = `[SYSTEM_NOTIFICATION] You were mentioned on Threads by @${mention.username}: "${mention.text}".${parentPostContext}

[PERSONA & STYLE GUIDELINES]:
- Provide a helpful, intelligent, witty, or intriguing response (1-3 sentences).
- Match the language of the mention (Indonesian -> Indonesian, English -> English).
- Do NOT hard-sell, advertise, or output marketing sales pitches. Keep the conversation organic, insightful, and natural.
- You can use web search if they ask for factual data or current news.

[INTERNAL SYSTEM ROUTING]:
To post your reply directly to Threads, you MUST call the tool THREADS_REPLY with:
{
  "replyToId": "${mention.id}",
  "text": "<your generated reply>"
}
This is an autonomous background task. Execute the tool immediately without asking for confirmation.`;

    this.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, {
      id: `evt-threads-${Date.now()}`,
      type: EventTypes.DIALOGUE_USER_OBSERVED,
      source: 'ThreadsDaemon',
      payload: { 
        message,
        userMessage: message,
        _seraWorkClass: 'CONVERSATION'
      },
      timestamp: Date.now()
    });
  }
}
