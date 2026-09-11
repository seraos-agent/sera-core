import * as fs from 'fs';
import * as path from 'path';
import { SupabaseRestClient } from '../../core/persistence/SupabaseRestClient';

export interface SubscriptionEntry {
  address: string;
  agentCredits: number; // Non-expiring Agent Computation Credits ($1 USDC = 100,000 credits)
  totalTopUpUsdc: number;
  lastDeductedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface SubscriptionLedgerOptions {
  supabaseClient?: SupabaseRestClient | null;
}

/**
 * Data store for user Agent Credits (non-expiring utility token model).
 * Automatically persists entries to .data/subscriptions.json and mirrors to
 * Supabase `sera_memory_snapshots` (session_id: global:subscriptions) to survive Cloud Run container restarts.
 */
export class SubscriptionLedger {
  private entries: Map<string, SubscriptionEntry> = new Map();
  private filePath: string;
  private isCustomPath: boolean;
  private readonly supabaseClient?: SupabaseRestClient | null;
  private loadPromise: Promise<void> | null = null;
  private cloudSaveTimer: NodeJS.Timeout | null = null;

  constructor(customPath?: string, options: SubscriptionLedgerOptions = {}) {
    this.isCustomPath = Boolean(customPath);
    this.filePath = customPath || path.join(process.cwd(), '.data', 'subscriptions.json');
    this.supabaseClient = options.supabaseClient !== undefined
      ? options.supabaseClient
      : SupabaseRestClient.fromEnvironment();

    if (!process.env.VITEST || this.isCustomPath) {
      this.loadFromFile();
      this.loadPromise = this.loadFromCloud();
    }
  }

  public async ensureLoaded(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
    }
  }

  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (typeof data === 'object' && data !== null) {
          for (const [key, value] of Object.entries(data)) {
            this.entries.set(key.toLowerCase(), value as SubscriptionEntry);
          }
        }
      }
    } catch (err) {
      console.warn('[SubscriptionLedger] Could not load persisted subscriptions, starting with empty map:', err);
    }
  }

  private async loadFromCloud(): Promise<void> {
    if (!this.supabaseClient) return;
    try {
      const rows = await this.supabaseClient.select<{ session_id: string; snapshot: any }>(
        'sera_memory_snapshots',
        `session_id=eq.global%3Asubscriptions`
      );

      if (rows && rows.length > 0 && rows[0].snapshot?.entries) {
        const cloudEntries = rows[0].snapshot.entries as Record<string, SubscriptionEntry>;
        let modified = false;

        for (const [key, cloudEntry] of Object.entries(cloudEntries)) {
          const lowerKey = key.toLowerCase();
          const existing = this.entries.get(lowerKey);
          if (!existing || (cloudEntry.updatedAt && cloudEntry.updatedAt >= (existing.updatedAt || 0))) {
            this.entries.set(lowerKey, cloudEntry);
            modified = true;
          }
        }

        if (modified) {
          console.log(`[SubscriptionLedger] Restored ${this.entries.size} subscription entries from Supabase.`);
          this.saveToFileLocalOnly();
        }
      }
    } catch (err) {
      console.warn('[SubscriptionLedger] Note: Could not fetch subscriptions from Supabase snapshot:', err instanceof Error ? err.message : err);
    }
  }

  private saveToFileLocalOnly(): void {
    if (process.env.VITEST && !this.isCustomPath) {
      return;
    }
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const obj: Record<string, SubscriptionEntry> = {};
      for (const [key, value] of this.entries.entries()) {
        obj[key] = value;
      }

      const tmp = this.filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.warn('[SubscriptionLedger] Could not persist subscriptions to disk:', err);
    }
  }

  private saveToFile(): void {
    this.saveToFileLocalOnly();
    this.scheduleCloudSave();
  }

  private scheduleCloudSave(): void {
    if (!this.supabaseClient || (process.env.VITEST && !this.isCustomPath)) return;
    if (this.cloudSaveTimer) clearTimeout(this.cloudSaveTimer);

    this.cloudSaveTimer = setTimeout(() => {
      void this.saveToCloud();
    }, 1000);
  }

  private async saveToCloud(): Promise<void> {
    if (!this.supabaseClient) return;
    try {
      const obj: Record<string, SubscriptionEntry> = {};
      for (const [key, value] of this.entries.entries()) {
        obj[key] = value;
      }

      await this.supabaseClient.upsert('sera_memory_snapshots', {
        session_id: 'global:subscriptions',
        snapshot: { entries: obj },
        updated_at: new Date().toISOString(),
      }, 'session_id');
      console.log(`[SubscriptionLedger] Synced ${this.entries.size} subscription entries to Supabase.`);
    } catch (err) {
      console.warn('[SubscriptionLedger] Failed to persist subscriptions to Supabase:', err instanceof Error ? err.message : err);
    }
  }

  get(address: string): SubscriptionEntry | undefined {
    return this.entries.get(address.toLowerCase());
  }

  /** Credits agent tokens on top-up. Credits never expire. */
  credit(address: string, credits: number, amountUsdc: number): SubscriptionEntry {
    const key = address.toLowerCase();
    const now = Date.now();
    const existing = this.entries.get(key);

    const entry: SubscriptionEntry = existing
      ? {
          ...existing,
          agentCredits: existing.agentCredits + credits,
          totalTopUpUsdc: existing.totalTopUpUsdc + amountUsdc,
          updatedAt: now
        }
      : {
          address: key,
          agentCredits: credits,
          totalTopUpUsdc: amountUsdc,
          lastDeductedAt: now,
          createdAt: now,
          updatedAt: now,
        };

    this.entries.set(key, entry);
    this.saveToFile();
    return entry;
  }

  /** Deducts a specified amount of agent credits. */
  debitCredits(address: string, amount: number): boolean {
    const key = address.toLowerCase();
    const entry = this.entries.get(key);
    if (!entry || entry.agentCredits < amount) return false;

    entry.agentCredits -= amount;
    entry.lastDeductedAt = Date.now();
    entry.updatedAt = Date.now();
    this.saveToFile();
    return true;
  }

  hasCredit(address: string): boolean {
    const key = address.toLowerCase();
    let entry = this.entries.get(key);
    
    if (!entry) return false;
    
    return entry.agentCredits > 0;
  }
}
