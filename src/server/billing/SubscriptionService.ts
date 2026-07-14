import { SubscriptionLedger } from './SubscriptionLedger';

const DEV_SESSION_ID = 'dev';

/**
 * Placeholder price — not a business decision made here. Whoever wires
 * recordTopUp() to a real deposit source decides how amountUsdc maps to
 * periods; DEFAULT_PRICE_PER_PERIOD_USDC is only the fallback used when a
 * caller doesn't specify one explicitly.
 */
const DEFAULT_PRICE_PER_PERIOD_USDC = 20;

export class SubscriptionService {
  constructor(private ledger: SubscriptionLedger = new SubscriptionLedger()) {}

  /**
   * Explicit top-up — NOT wired to any on-chain listener. In production
   * this needs a caller: something that watches a treasury address for
   * incoming USDC transfers and matches sender to `address`. That watcher
   * does not exist yet (see ADR-0007) — this method is the entrypoint it
   * would call once built.
   */
  recordTopUp(address: string, amountUsdc: number, pricePerPeriodUsdc: number = DEFAULT_PRICE_PER_PERIOD_USDC): number {
    const periods = Math.floor(amountUsdc / pricePerPeriodUsdc);
    if (periods <= 0) {
      throw new Error(
        `Top-up of ${amountUsdc} USDC is less than one period (${pricePerPeriodUsdc} USDC/period) — no credit granted.`
      );
    }
    const entry = this.ledger.credit(address, periods, pricePerPeriodUsdc);
    return entry.creditPeriods;
  }

  /** 'dev' is always entitled, matching its existing special-cased status elsewhere in the server. */
  hasActiveEntitlement(address: string): boolean {
    if (address.toLowerCase() === DEV_SESSION_ID) return true;
    return this.ledger.hasCredit(address);
  }

  /** Called on each billing tick for every currently active instance. */
  deductPeriod(address: string): boolean {
    if (address.toLowerCase() === DEV_SESSION_ID) return true;
    return this.ledger.debitOnePeriod(address);
  }

  getRemainingPeriods(address: string): number {
    if (address.toLowerCase() === DEV_SESSION_ID) return Infinity;
    return this.ledger.get(address)?.creditPeriods ?? 0;
  }
}
