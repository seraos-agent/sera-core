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
  proposal?: any;
  actionLinks?: { label: string; url: string }[];
  observations?: any[];
}

export interface ChatHistoryState {
  uiMessages: UiMessage[];
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
        }
        
        return parsed;
      }
    } catch (e) {
      console.error('[ChatHistoryStore] Failed to load local chat history:', e);
    }
    return { uiMessages: [] };
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

      if (rows && rows.length > 0 && rows[0].snapshot?.uiMessages) {
        const cloudMessages = rows[0].snapshot.uiMessages.filter((msg: any) => msg.type !== 'activity');
        if (cloudMessages.length > 0) {
          // If local was empty or cloud has more recent messages, sync from cloud
          if (this.state.uiMessages.length === 0 || cloudMessages.length >= this.state.uiMessages.length) {
            this.state.uiMessages = cloudMessages;
            this.saveLocal();
            console.log(`[ChatHistoryStore] Loaded ${cloudMessages.length} chat messages from Supabase for ${this.sessionId}`);
          }
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
    this.state = { uiMessages: [] };
    this.save();
  }
}
