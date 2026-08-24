import { Trigger, TriggerStore } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { SupabaseRestClient } from '../persistence/SupabaseRestClient';

export interface InMemoryTriggerStoreOptions {
  persistLocally?: boolean;
  supabaseClient?: SupabaseRestClient | null;
}

export class InMemoryTriggerStore implements TriggerStore {
  private triggers: Map<string, Trigger> = new Map();
  private basePath: string;
  private filePath: string;
  private readonly persistLocally: boolean;
  private readonly supabaseClient?: SupabaseRestClient | null;
  private readonly sessionId: string;
  private loadPromise: Promise<void> | null = null;

  constructor(sessionId: string = 'dev', options: InMemoryTriggerStoreOptions = {}) {
    this.sessionId = sessionId;
    this.persistLocally = options.persistLocally ?? true;
    this.supabaseClient = options.supabaseClient !== undefined
      ? options.supabaseClient
      : SupabaseRestClient.fromEnvironment();
    this.basePath = path.join(process.cwd(), '.data');
    const safeId = sessionId.toLowerCase().replace(/[^a-z0-9]/g, '');
    this.filePath = path.join(this.basePath, `triggers_${safeId}.json`);
    this.loadLocal();
    this.loadPromise = this.loadFromCloud();
  }

  public async ensureLoaded(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
    }
  }

  private loadLocal(): void {
    if (!this.persistLocally) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(data) as Trigger[];
        parsed.forEach(t => this.triggers.set(t.id, t));
      }
    } catch (e) {
      console.error('[InMemoryTriggerStore] Failed to load local triggers:', e);
    }
  }

  private async loadFromCloud(): Promise<void> {
    if (!this.supabaseClient) return;
    try {
      const rows = await this.supabaseClient.select<{ session_id: string; snapshot: any }>(
        'sera_memory_snapshots',
        `session_id=eq.${encodeURIComponent(this.sessionId)}`
      );

      if (rows && rows.length > 0 && Array.isArray(rows[0].snapshot?.triggers)) {
        const cloudTriggers = rows[0].snapshot.triggers as Trigger[];
        if (cloudTriggers.length > 0) {
          cloudTriggers.forEach(t => this.triggers.set(t.id, t));
          this.persistLocal();
          console.log(`[InMemoryTriggerStore] Loaded ${cloudTriggers.length} triggers from Supabase for ${this.sessionId}`);
        }
      }
    } catch (e) {
      console.warn('[InMemoryTriggerStore] Note: Could not fetch triggers from Supabase snapshot:', e instanceof Error ? e.message : e);
    }
  }

  private persistLocal(): void {
    if (!this.persistLocally) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.getAll(), null, 2));
    } catch (e) {
      console.error('[InMemoryTriggerStore] Failed to save local triggers:', e);
    }
  }

  private async persistCloud(): Promise<void> {
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

      existingSnapshot.triggers = this.getAll();

      await this.supabaseClient.upsert('sera_memory_snapshots', {
        session_id: this.sessionId,
        snapshot: existingSnapshot,
        updated_at: new Date().toISOString(),
      }, 'session_id');
    } catch (e) {
      console.warn('[InMemoryTriggerStore] Failed to persist triggers to Supabase:', e instanceof Error ? e.message : e);
    }
  }

  private persist(): void {
    this.persistLocal();
    void this.persistCloud();
  }

  save(trigger: Trigger): void {
    this.triggers.set(trigger.id, trigger);
    this.persist();
  }

  delete(id: string): void {
    this.triggers.delete(id);
    this.persist();
  }

  get(id: string): Trigger | undefined {
    return this.triggers.get(id);
  }

  getActiveTriggers(): Trigger[] {
    return Array.from(this.triggers.values()).filter(t => t.state === 'ACTIVE');
  }

  getAll(): Trigger[] {
    return Array.from(this.triggers.values());
  }
}
