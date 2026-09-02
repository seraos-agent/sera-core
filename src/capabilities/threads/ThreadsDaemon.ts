import { EventEmitter } from 'events';
import { EventTypes } from '../../core/events/types';
import { ThreadsAPI, ThreadsMention } from './ThreadsAPI';
import { SecretManager } from '../../core/secrets/SecretManager';
import { QwenAdapter, QwenMessage } from '../llm/QwenAdapter';
import * as fs from 'fs';
import * as path from 'path';

export class ThreadsDaemon {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private lastProcessedMentionId?: string;
  private lastProcessedReplyIds = new Map<string, string>(); // threadId -> lastReplyId
  private timelineContext: string = ''; // Caches recent posts for AI context
  private processedIds = new Set<string>();
  private llmAdapter?: QwenAdapter;

  private readonly watermarkFile = path.join(process.cwd(), '.data', 'threads_watermark.json');

  constructor(
    private readonly api: ThreadsAPI,
    private readonly eventBus: EventEmitter,
    private readonly sessionId: string = 'default',
    private readonly secretManager?: SecretManager,
    private readonly getSessionsCallback?: () => string[]
  ) {
    this.loadWatermark();
  }

  private getLLM(): QwenAdapter {
    if (!this.llmAdapter) {
      this.llmAdapter = new QwenAdapter(process.env.QWEN_LIGHT_MODEL || 'qwen3.8-flash');
    }
    return this.llmAdapter;
  }

  private getTargetSessions(): string[] {
    const sessions = new Set<string>();
    if (this.sessionId) sessions.add(this.sessionId);
    if (this.getSessionsCallback) {
      try {
        const extra = this.getSessionsCallback();
        if (Array.isArray(extra)) {
          extra.forEach(s => { if (s) sessions.add(s); });
        }
      } catch (e: any) {
        console.warn('[ThreadsDaemon] Failed to get session list from callback:', e.message);
      }
    }
    return Array.from(sessions);
  }

  private async getSettings(sessionId: string) {
    if (!this.secretManager) return { allowPublishing: true, vipReplies: true, gatekeeper: true };
    try {
      const settingsStr = await this.secretManager.getSecret(`THREADS_SETTINGS_${sessionId}`);
      if (settingsStr) return JSON.parse(settingsStr);
    } catch (e) {
      // ignore
    }
    return { allowPublishing: true, vipReplies: true, gatekeeper: true };
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
        if (parsed.lastProcessedReplyIds && typeof parsed.lastProcessedReplyIds === 'object') {
          for (const [k, v] of Object.entries(parsed.lastProcessedReplyIds)) {
            if (typeof v === 'string') {
              this.lastProcessedReplyIds.set(k, v);
              this.processedIds.add(v);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[ThreadsDaemon] Failed to load watermark: ${err.message}`);
    }
  }

  private saveWatermark(mentionId?: string) {
    try {
      if (mentionId) {
        this.lastProcessedMentionId = mentionId;
        this.processedIds.add(mentionId);
      }
      const dir = path.dirname(this.watermarkFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const replyObj: Record<string, string> = {};
      for (const [k, v] of this.lastProcessedReplyIds.entries()) {
        replyObj[k] = v;
      }
      fs.writeFileSync(
        this.watermarkFile,
        JSON.stringify({
          lastProcessedMentionId: this.lastProcessedMentionId,
          lastProcessedReplyIds: replyObj
        }, null, 2),
        'utf8'
      );
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

    const sessions = this.getTargetSessions();
    for (const sessionId of sessions) {
      try {
        const token = await this.api.getAccessToken(sessionId);
        if (!token) continue;

        const settings = await this.getSettings(sessionId);
        if (settings.vipReplies === false && settings.gatekeeper === false) continue;

        const mentions = await this.api.getMentions(sessionId, 20);
        if (!mentions || mentions.length === 0) continue;

        // Ensure mentions are sorted newest-first
        mentions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // FIRST RUN GUARD: If watermark is empty, record latest ID and skip backlog
        if (!this.lastProcessedMentionId) {
          this.saveWatermark(mentions[0].id);
          mentions.forEach(m => this.markProcessed(m.id));
          console.log(`[ThreadsDaemon] Initialized mention watermark to ID: ${mentions[0].id} for ${sessionId}`);
          continue;
        }

        // Find new mentions
        const newMentions: ThreadsMention[] = [];
        for (const mention of mentions) {
          if (mention.id === this.lastProcessedMentionId || this.processedIds.has(mention.id)) break;
          newMentions.push(mention);
        }
        
        if (newMentions.length > 0) {
          console.log(`[ThreadsDaemon] Found ${newMentions.length} new mentions for session ${sessionId}.`);
          this.saveWatermark(newMentions[0].id);
        }

        // Process from oldest to newest
        for (const mention of newMentions.reverse()) {
          await this.handleMention(sessionId, mention);
        }
      } catch (err: any) {
        if (!err.message?.includes('active access token')) {
          console.error(`[ThreadsDaemon] Error polling mentions for ${sessionId}:`, err.message);
        }
      }
    }
  }

  public async pollReplies(force: boolean = false) {
    if (!this.isRunning && !force) return;

    const sessions = this.getTargetSessions();
    for (const sessionId of sessions) {
      try {
        const token = await this.api.getAccessToken(sessionId);
        if (!token) continue;

        const settings = await this.getSettings(sessionId);
        if (settings.vipReplies === false && settings.gatekeeper === false) continue;

        // 1. Get recent threads (Timeline Context)
        const threads = await this.api.getUserThreads(sessionId, 5);
        if (!threads || threads.length === 0) continue;

        this.timelineContext = threads.map(t => `[${t.timestamp}] ${t.text}`).join('\n');

        // 2. Filter threads to only poll those created in the last 7 days
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const recentThreads = threads.filter(t => new Date(t.timestamp).getTime() > sevenDaysAgo);

        // 3. For each recent thread, poll replies
        for (const thread of recentThreads) {
          const replies = await this.api.getThreadReplies(sessionId, thread.id, 20);
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
            this.saveWatermark();
          }

          // First run initialization for a new thread
          if (!lastProcessedId) {
            newReplies.forEach(r => this.markProcessed(r.id));
            continue;
          }

          // Process from oldest to newest
          for (const reply of newReplies.reverse()) {
            await this.handleReply(sessionId, reply, thread.text);
          }
        }
      } catch (err: any) {
        if (!err.message?.includes('active access token')) {
          console.error(`[ThreadsDaemon] Error polling replies for ${sessionId}:`, err.message);
        }
      }
    }
  }

  private userActivityMap = new Map<string, { count: number; windowStart: number }>();

  /**
   * Enforces a rate limit per Threads user to prevent abuse and spam (max 3 responses per 15 mins).
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

  private async handleReply(sessionId: string, reply: ThreadsMention, originalPostText: string) {
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

    console.log(`[ThreadsDaemon] Processing comment from @${reply.username} for session ${sessionId}...`);

    try {
      // Assemble contextual synthesis prompt
      const messages: QwenMessage[] = [
        {
          role: 'system',
          content: `You are an elite, highly authentic, witty, and helpful AI assistant on Meta Threads.
Your goal is to reply to a user who commented on your post.

CRITICAL REPLY GUIDELINES:
1. DYNAMIC CONTEXTUAL LENGTH:
   - For casual greetings, jokes, slang, or simple compliments (e.g. "keren", "mantap", "lol"): Reply in 1 concise, punchy, natural line.
   - For questions asking for explanations, facts, guides, or data (e.g. "maksudnya gimana?", "kenapa bisa naik?", "how does it work?"): Provide a concise, clear explanation with brief helpful data (strict 2-3 short sentences max). Never write long essay paragraphs.
2. ZERO HASHTAGS: NEVER use hashtags or the "#" symbol. Threads users despise hashtag spam.
3. NO QUOTES OR PREAMBLE: Return ONLY the exact reply text without quotation marks or preamble like "Here is the reply:".
4. AUTHENTIC & ORGANIC: Match the language of the comment (Indonesian -> casual Indonesian, English -> casual English). Be friendly, clever, and engaging.`
        },
        {
          role: 'user',
          content: `[CONTEXT]
Your original Threads post: "${originalPostText}"
User @${reply.username} commented: "${reply.text}"

Write the ideal contextual reply:`
        }
      ];

      const llm = this.getLLM();
      const response = await llm.generate(messages);
      let replyText = response.text.trim();

      // Clean quotes, code blocks, and hashtags
      replyText = replyText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      if (replyText.startsWith('"') && replyText.endsWith('"') && replyText.length > 2) {
        replyText = replyText.slice(1, -1).trim();
      }
      replyText = replyText.replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s{2,}/g, ' ').trim();

      if (!replyText) {
        console.warn(`[ThreadsDaemon] Empty reply generated for comment ${reply.id}`);
        return;
      }

      console.log(`[ThreadsDaemon] Generated reply for @${reply.username}: "${replyText}"`);

      // Directly publish reply via Meta Threads API
      const publishId = await this.api.publishPost(sessionId, replyText, reply.id);
      console.log(`[ThreadsDaemon] Published reply to @${reply.username} on Threads (Post ID: ${publishId})`);

      // Emit telemetry observation
      this.eventBus.emit(EventTypes.COGNITIVE_OBSERVATION, {
        title: 'Threads Comment Auto-Reply Sent',
        desc: `Replied to @${reply.username}: "${replyText}"`,
        signal: 'ACTION',
        color: '#10b981',
        timestamp: Date.now()
      });
    } catch (err: any) {
      console.error(`[ThreadsDaemon] Failed to execute auto-reply to @${reply.username}:`, err.message);
    }
  }

  private async handleMention(sessionId: string, mention: ThreadsMention) {
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

    console.log(`[ThreadsDaemon] Processing mention from @${mention.username} for session ${sessionId}...`);

    let parentPostContext = '';
    try {
      const mentionDetails = await this.api.getPost(sessionId, mention.id);
      
      if (mentionDetails.is_reply && mentionDetails.replied_to?.id) {
        const parentPost = await this.api.getPost(sessionId, mentionDetails.replied_to.id);
        parentPostContext = `\n[PARENT POST CONTEXT]: They mentioned you in a thread under @${parentPost.username}'s post: "${parentPost.text}"\n`;
      }
    } catch (err: any) {
      console.warn(`[ThreadsDaemon] Could not fetch parent post context:`, err.message);
    }

    try {
      const messages: QwenMessage[] = [
        {
          role: 'system',
          content: `You are an elite, highly authentic, witty, and helpful AI assistant on Meta Threads.
Your goal is to reply to a user who mentioned/tagged you in a post or comment.

CRITICAL REPLY GUIDELINES:
1. DYNAMIC CONTEXTUAL LENGTH:
   - For casual greetings, jokes, or quick mentions: Reply in 1 concise, punchy, natural line.
   - For questions asking for explanations, facts, or data: Provide a concise, clear explanation with brief helpful data (strict 2-3 short sentences max). Never write long essay paragraphs.
2. ZERO HASHTAGS: NEVER use hashtags or the "#" symbol.
3. NO QUOTES OR PREAMBLE: Return ONLY the exact reply text without quotation marks.
4. AUTHENTIC & ORGANIC: Match the language of the mention (Indonesian -> casual Indonesian, English -> casual English).`
        },
        {
          role: 'user',
          content: `[CONTEXT]
User @${mention.username} mentioned you: "${mention.text}"${parentPostContext}

Write the ideal contextual reply:`
        }
      ];

      const llm = this.getLLM();
      const response = await llm.generate(messages);
      let replyText = response.text.trim();

      // Clean quotes, code blocks, and hashtags
      replyText = replyText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      if (replyText.startsWith('"') && replyText.endsWith('"') && replyText.length > 2) {
        replyText = replyText.slice(1, -1).trim();
      }
      replyText = replyText.replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s{2,}/g, ' ').trim();

      if (!replyText) return;

      console.log(`[ThreadsDaemon] Generated reply for mention @${mention.username}: "${replyText}"`);

      // Directly publish reply via Meta Threads API
      const publishId = await this.api.publishPost(sessionId, replyText, mention.id);
      console.log(`[ThreadsDaemon] Published reply to mention @${mention.username} on Threads (Post ID: ${publishId})`);

      // Emit telemetry observation
      this.eventBus.emit(EventTypes.COGNITIVE_OBSERVATION, {
        title: 'Threads Mention Auto-Reply Sent',
        desc: `Replied to mention by @${mention.username}: "${replyText}"`,
        signal: 'ACTION',
        color: '#10b981',
        timestamp: Date.now()
      });
    } catch (err: any) {
      console.error(`[ThreadsDaemon] Failed to execute auto-reply to mention @${mention.username}:`, err.message);
    }
  }
}
