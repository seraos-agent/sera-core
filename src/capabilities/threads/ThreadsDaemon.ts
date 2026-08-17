import { EventEmitter } from 'events';
import { EventTypes } from '../../core/events/types';
import { ThreadsAPI, ThreadsMention } from './ThreadsAPI';
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
    private readonly sessionId: string = 'default'
  ) {
    this.loadWatermark();
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

  private async pollMentions() {
    if (!this.isRunning) return;

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

  private async pollReplies() {
    if (!this.isRunning) return;

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

  private async handleReply(reply: ThreadsMention, originalPostText: string) {
    if (this.processedIds.has(reply.id)) return;
    this.markProcessed(reply.id);

    const vipUsersStr = process.env.THREADS_VIP_USERS || '';
    const vipUsers = vipUsersStr.split(',').map(u => u.trim().toLowerCase()).filter(Boolean);

    const replyUsername = (reply.username || '').toLowerCase();
    
    // Ignore self-reply from the bot account itself
    const botUsername = (process.env.THREADS_BOT_USERNAME || 'sera.agent').toLowerCase();
    if (replyUsername === botUsername) {
      console.log(`[ThreadsDaemon] Ignoring self-reply from @${reply.username}`);
      return;
    }

    const isVip = vipUsers.includes(replyUsername);

    if (!isVip) {
      console.log(`[ThreadsDaemon] Ignoring non-VIP reply from @${reply.username} on our post.`);
      return;
    }

    console.log(`[ThreadsDaemon] New VIP reply detected from @${reply.username} on our post. Waking up AI...`);

    const message = `[SYSTEM_NOTIFICATION] VIP user @${reply.username} replied to YOUR post on Threads:
Your original post: "${originalPostText}"
Their reply: "${reply.text}"

Please analyze this. 
[INTERNAL SYSTEM ROUTING]: To reply to this user on Threads, please invoke the THREADS_REPLY tool with replyToId: ${reply.id}. This is a background automation task. Do NOT ask the user for permission. Do NOT discuss this with the user. You MUST execute the tool immediately and autonomously.

[RECENT TIMELINE CONTEXT]:
Here are your recent posts so you know what you've been talking about lately. DO NOT repeat yourself. Maintain consistency.
${this.timelineContext}

[PERSONA INSTRUCTION FOR THREADS]: The culture on Threads is different from X/Twitter. Your tone should be light, brief, humorous, cheeky, and fun. Do not be overly technical. However, if the user's mention is serious or highly technical, adapt and answer professionally. Always match the context.`;

    this.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, {
      id: `evt-threads-reply-${Date.now()}`,
      type: EventTypes.DIALOGUE_USER_OBSERVED,
      source: 'ThreadsDaemon',
      payload: { message },
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

    console.log(`[ThreadsDaemon] New mention detected from @${mention.username}: ${mention.text}`);

    const vipUsersStr = process.env.THREADS_VIP_USERS || '';
    const vipUsers = vipUsersStr.split(',').map(u => u.trim().toLowerCase()).filter(Boolean);

    const isVip = vipUsers.includes(mentionUsername);

    if (isVip) {
      console.log(`[ThreadsDaemon] @${mention.username} is VIP. Waking up AI...`);
      
      let parentPostContext = '';
      try {
        const mentionDetails = await this.api.getPost(this.sessionId, mention.id);
        
        if (mentionDetails.is_reply && mentionDetails.replied_to?.id) {
          console.log(`[ThreadsDaemon] Mention is a reply. Fetching parent post context for ${mentionDetails.replied_to.id}...`);
          const parentPost = await this.api.getPost(this.sessionId, mentionDetails.replied_to.id);
          parentPostContext = `\n[PARENT POST CONTEXT]: They are replying to a post by @${parentPost.username} which says:\n"${parentPost.text}"\n`;
        }
      } catch (err: any) {
        console.error(`[ThreadsDaemon] Failed to fetch parent post context:`, err.message);
      }

      const message = `[SYSTEM_NOTIFICATION] You received a new mention on Threads from VIP user @${mention.username}: "${mention.text}". Please analyze this.${parentPostContext}
[INTERNAL SYSTEM ROUTING]: To reply to this user on Threads, please invoke the THREADS_REPLY tool with replyToId: ${mention.id}. This is a background automation task. Do NOT ask the user for permission. Do NOT discuss this with the user. You MUST execute the tool immediately and autonomously.

[RECENT TIMELINE CONTEXT]:
Here are your recent posts so you know what you've been talking about lately. DO NOT repeat yourself.
${this.timelineContext || '(No recent posts)'}

[PERSONA INSTRUCTION FOR THREADS]: The culture on Threads is different from X/Twitter. Your tone should be light, brief, humorous, cheeky, and fun. Do not be overly technical. However, if the user's mention is serious or highly technical, adapt and answer professionally. Always match the context.`;

      this.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, {
        id: `evt-threads-${Date.now()}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'ThreadsDaemon',
        payload: { message },
        timestamp: Date.now()
      });
    } else {
      console.log(`[ThreadsDaemon] @${mention.username} is not VIP. Sending gatekeeper reply...`);
      try {
        const replyText = `Hello @${mention.username}! Great question. However, I am currently only serving registered users. Join us at seraos.xyz (or check the link in my bio) so we can chat! 🚀`;
        await this.api.publishPost(this.sessionId, replyText, mention.id);
        console.log(`[ThreadsDaemon] Gatekeeper reply sent to @${mention.username}`);
      } catch (err: any) {
        console.error(`[ThreadsDaemon] Failed to send gatekeeper reply to @${mention.username}:`, err.message);
      }
    }
  }
}
