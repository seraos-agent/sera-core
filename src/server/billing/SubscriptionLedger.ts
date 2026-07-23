export interface SubscriptionEntry {
  address: string;
  agentCredits: number; // Non-expiring Agent Computation Credits ($1 USDC = 200,000 credits)
  totalTopUpUsdc: number;
  lastDeductedAt: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Data store for user Agent Credits (non-expiring utility token model).
 */
export class SubscriptionLedger {
  private entries: Map<string, SubscriptionEntry> = new Map();

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
    return true;
  }

  hasCredit(address: string): boolean {
    const entry = this.entries.get(address.toLowerCase());
    return !!entry && entry.agentCredits > 0;
  }
}
