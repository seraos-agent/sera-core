import * as fs from 'fs';
import * as path from 'path';

export interface SubscriptionEntry {
  address: string;
  agentCredits: number; // Non-expiring Agent Computation Credits ($1 USDC = 100,000 credits)
  totalTopUpUsdc: number;
  lastDeductedAt: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Data store for user Agent Credits (non-expiring utility token model).
 * Automatically persists entries to .data/subscriptions.json across server restarts.
 */
export class SubscriptionLedger {
  private entries: Map<string, SubscriptionEntry> = new Map();
  private filePath: string;
  private isCustomPath: boolean;

  constructor(customPath?: string) {
    this.isCustomPath = Boolean(customPath);
    this.filePath = customPath || path.join(process.cwd(), '.data', 'subscriptions.json');
    if (!process.env.VITEST || this.isCustomPath) {
      this.loadFromFile();
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

  private saveToFile(): void {
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
