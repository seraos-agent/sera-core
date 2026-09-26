import * as fs from 'fs';
import * as path from 'path';
import { SupabaseRestClient } from '../../core/persistence/SupabaseRestClient';

export interface UiMessage {
  id: number;
  clientMessageId?: string;
  role?: 'user' | 'agent';
  type?: 'activity';
  content?: string;
  images?: string[];
  documents?: any[];
  proposal?: any;
  actionLinks?: { label: string; url: string }[];
  observations?: any[];
  cognitiveSteps?: any[];
  durationSeconds?: number;
  hadTools?: boolean;
}

export interface PlatformTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface ChatHistoryState {
  uiMessages: UiMessage[];
  platformMessages?: Record<string, PlatformTurn[]>;
}

export interface ChatHistoryStoreOptions {
  persistLocally?: boolean;
  supabaseClient?: SupabaseRestClient | null;
}

export class ChatHistoryStore {
  private basePath: string;
  private filePath: string;
  private state: ChatHistoryState;
  private readonly persistLocally: boolean;
  private readonly supabaseClient?: SupabaseRestClient | null;
  private readonly sessionId: string;
  private loadPromise: Promise<void> | null = null;

  public static readonly MAX_UI_MESSAGES = 30;
  public static readonly MAX_DETAILED_TURNS = 6;

  constructor(sessionId: string, options: ChatHistoryStoreOptions = {}) {
    this.sessionId = sessionId;
    this.persistLocally = options.persistLocally ?? true;
    this.supabaseClient = options.supabaseClient !== undefined
      ? options.supabaseClient
      : SupabaseRestClient.fromEnvironment();
    this.basePath = path.join(process.cwd(), '.data');
    const safeId = sessionId.toLowerCase().replace(/[^a-z0-9]/g, '');
    this.filePath = path.join(this.basePath, `chat_history_${safeId}.json`);
    this.state = this.loadLocal();
    this.loadPromise = this.loadFromCloud();
  }

  private loadLocal(): ChatHistoryState {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(data) as ChatHistoryState;
        
        // Filter out ephemeral activity messages from older history saves
        if (parsed.uiMessages) {
          parsed.uiMessages = parsed.uiMessages.filter(msg => msg.type !== 'activity');
          if (parsed.uiMessages.length > ChatHistoryStore.MAX_UI_MESSAGES) {
            parsed.uiMessages = parsed.uiMessages.slice(-ChatHistoryStore.MAX_UI_MESSAGES);
          }
        }
        if (!parsed.platformMessages) {
          parsed.platformMessages = {};
        }
        
        return parsed;
      }
    } catch (e) {
      console.error('[ChatHistoryStore] Failed to load local chat history:', e);
    }
    return { uiMessages: [], platformMessages: {} };
  }

  public async ensureLoaded(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
    }
  }

  private async loadFromCloud(): Promise<void> {
    if (!this.supabaseClient) return;
    try {
      const rows = await this.supabaseClient.select<{ session_id: string; snapshot: any }>(
        'sera_memory_snapshots',
        `session_id=eq.${encodeURIComponent(this.sessionId)}`
      );

      if (rows && rows.length > 0 && rows[0].snapshot) {
        const snapshot = rows[0].snapshot;
        let modified = false;

        if (snapshot.uiMessages) {
          let cloudMessages = snapshot.uiMessages.filter((msg: any) => msg.type !== 'activity');
          if (cloudMessages.length > ChatHistoryStore.MAX_UI_MESSAGES) {
            cloudMessages = cloudMessages.slice(-ChatHistoryStore.MAX_UI_MESSAGES);
          }
          if (cloudMessages.length > 0) {
            // If local was empty or cloud has more recent messages, sync from cloud
            if (this.state.uiMessages.length === 0 || cloudMessages.length >= this.state.uiMessages.length) {
              this.state.uiMessages = cloudMessages;
              modified = true;
              console.log(`[ChatHistoryStore] Loaded ${cloudMessages.length} chat messages from Supabase for ${this.sessionId}`);
            }
          }
        }

        if (snapshot.platformMessages && typeof snapshot.platformMessages === 'object') {
          this.state.platformMessages = {
            ...snapshot.platformMessages,
            ...(this.state.platformMessages || {})
          };
          modified = true;
          console.log(`[ChatHistoryStore] Loaded platform conversation history from Supabase for ${this.sessionId}`);
        }

        if (modified) {
          this.saveLocal();
        }
      }
    } catch (e) {
      console.warn('[ChatHistoryStore] Note: Could not fetch chat history from Supabase snapshot:', e instanceof Error ? e.message : e);
    }
  }

  private saveLocal(): void {
    if (!this.persistLocally) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error('[ChatHistoryStore] Failed to save local chat history:', e);
    }
  }

  private async saveCloud(): Promise<void> {
    if (!this.supabaseClient) return;
    try {
      let existingSnapshot: any = {};
      try {
        const rows = await this.supabaseClient.select<{ snapshot: any }>(
          'sera_memory_snapshots',
          `session_id=eq.${encodeURIComponent(this.sessionId)}`
        );
        if (rows && rows.length > 0 && rows[0].snapshot) {
          existingSnapshot = rows[0].snapshot;
        }
      } catch {}

      existingSnapshot.uiMessages = this.state.uiMessages;
      existingSnapshot.platformMessages = this.state.platformMessages || {};

      await this.supabaseClient.upsert('sera_memory_snapshots', {
        session_id: this.sessionId,
        snapshot: existingSnapshot,
        updated_at: new Date().toISOString(),
      }, 'session_id');
    } catch (e) {
      console.warn('[ChatHistoryStore] Failed to persist chat history to Supabase:', e instanceof Error ? e.message : e);
    }
  }

  private save(): void {
    this.saveLocal();
    void this.saveCloud();
  }

  public getPlatformTurns(ctxKey: string): PlatformTurn[] {
    return this.state.platformMessages?.[ctxKey] || [];
  }

  public getAllPlatformMessages(): Record<string, PlatformTurn[]> {
    return this.state.platformMessages || {};
  }

  public appendPlatformTurn(
    platform: string,
    channelId: string,
    role: 'user' | 'assistant',
    content: string
  ): void {
    if (!content || !content.trim()) return;
    const ctxKey = `${platform}:${channelId}`;
    if (!this.state.platformMessages) {
      this.state.platformMessages = {};
    }
    if (!this.state.platformMessages[ctxKey]) {
      this.state.platformMessages[ctxKey] = [];
    }
    const turns = this.state.platformMessages[ctxKey];
    turns.push({
      role,
      content,
      timestamp: Date.now()
    });
    // Retain max 20 turns per channel (10 user + 10 assistant) to prevent unbounded growth
    const MAX_PLATFORM_TURNS = 20;
    while (turns.length > MAX_PLATFORM_TURNS) {
      turns.shift();
    }
    this.save();
  }

  public getUiMessages(): UiMessage[] {
    return this.state.uiMessages;
  }

  public appendUiMessage(msg: UiMessage): void {
    const existingIndex = this.state.uiMessages.findIndex(m => 
      (msg.clientMessageId && m.clientMessageId === msg.clientMessageId) || m.id === msg.id
    );
    if (existingIndex >= 0) {
      this.state.uiMessages[existingIndex] = { ...this.state.uiMessages[existingIndex], ...msg };
    } else {
      this.state.uiMessages.push(msg);
    }

    // Retain maximum UI messages to prevent unbounded memory growth and payload bloat
    while (this.state.uiMessages.length > ChatHistoryStore.MAX_UI_MESSAGES) {
      this.state.uiMessages.shift();
    }

    // Prune bulky transient metadata (cognitiveSteps, observations) from older turns to prevent payload bloating
    const detailedCutoff = Math.max(0, this.state.uiMessages.length - ChatHistoryStore.MAX_DETAILED_TURNS);
    for (let i = 0; i < detailedCutoff; i++) {
      const older = this.state.uiMessages[i];
      if (older.cognitiveSteps && older.cognitiveSteps.length > 0) {
        delete older.cognitiveSteps;
      }
      if (older.observations && older.observations.length > 0) {
        delete older.observations;
      }
    }

    this.save();
  }

  /**
   * Seamlessly migrates messages from an anonymous or prior session if this store is empty.
   */
  public migrateFrom(sourceStore: ChatHistoryStore): boolean {
    const sourceMessages = sourceStore.getUiMessages();
    if (sourceMessages.length === 0) return false;

    if (this.state.uiMessages.length === 0) {
      this.state.uiMessages = [...sourceMessages];
      this.save();
      console.log(`[ChatHistoryStore] Migrated ${sourceMessages.length} messages into session ${this.sessionId}`);
      return true;
    }
    return false;
  }

  public updateProposalStatus(proposalId: string, status: 'APPROVED' | 'REJECTED'): void {
    const msg = this.state.uiMessages.find(m => m.proposal && m.proposal.proposalId === proposalId);
    if (msg && msg.proposal) {
      msg.proposal.status = status;
      this.save();
    }
  }

  public clear(): void {
    this.state = { uiMessages: [], platformMessages: {} };
    this.save();
  }
}
