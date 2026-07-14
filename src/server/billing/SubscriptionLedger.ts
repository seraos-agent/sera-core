export interface SubscriptionEntry {
  address: string;
  creditPeriods: number; // whole periods remaining, e.g. 3 = 3 more billing cycles
  pricePerPeriodUsdc: number;
  lastDeductedAt: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Pure data store — no pricing/product policy here. That belongs in
 * SubscriptionService. This class only knows how to store, credit, and
 * debit whole periods per address.
 */
export class SubscriptionLedger {
  private entries: Map<string, SubscriptionEntry> = new Map();

  get(address: string): SubscriptionEntry | undefined {
    return this.entries.get(address.toLowerCase());
  }

  /** Creates the ledger entry on first top-up if it doesn't exist yet. */
  credit(address: string, periods: number, pricePerPeriodUsdc: number): SubscriptionEntry {
    const key = address.toLowerCase();
    const now = Date.now();
    const existing = this.entries.get(key);

    const entry: SubscriptionEntry = existing
      ? { ...existing, creditPeriods: existing.creditPeriods + periods, updatedAt: now }
      : {
          address: key,
          creditPeriods: periods,
          pricePerPeriodUsdc,
          lastDeductedAt: now,
          createdAt: now,
          updatedAt: now,
        };

    this.entries.set(key, entry);
    return entry;
  }

  /** Returns true if a period was available and consumed, false if the account was already empty. */
  debitOnePeriod(address: string): boolean {
    const key = address.toLowerCase();
    const entry = this.entries.get(key);
    if (!entry || entry.creditPeriods <= 0) return false;

    entry.creditPeriods -= 1;
    entry.lastDeductedAt = Date.now();
    entry.updatedAt = Date.now();
    return true;
  }

  hasCredit(address: string): boolean {
    const entry = this.entries.get(address.toLowerCase());
    return !!entry && entry.creditPeriods > 0;
  }
}
