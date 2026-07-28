import { SubscriptionLedger } from './SubscriptionLedger';

const DEV_SESSION_ID = 'dev';

/** Base rate: $1 USDC = 200,000 Agent Computation Credits */
export const CREDITS_PER_USDC = 200_000;
const MINIMUM_TOPUP_USDC = 1;

export class SubscriptionService {
  constructor(private ledger: SubscriptionLedger = new SubscriptionLedger()) {}

  /**
   * Calculates tokens based on tiered bonuses:
   * - $1 = 200,000
   * - $5 = 1,200,000 (1M + 20% bonus)
   * - $10 = 2,600,000 (2M + 30% bonus)
   * - $20 = 6,000,000 (4M + 50% bonus)
   */
  public calculateTokens(amountUsdc: number): number {
    const baseTokens = amountUsdc * CREDITS_PER_USDC;
    if (amountUsdc >= 20) return baseTokens * 1.5;
    if (amountUsdc >= 10) return baseTokens * 1.3;
    if (amountUsdc >= 5) return baseTokens * 1.2;
    return baseTokens;
  }

  /**
   * Top-up Agent Computation Credits (Non-Expiring Utility Token Model).
   */
  recordTopUp(address: string, amountUsdc: number): number {
    if (amountUsdc < MINIMUM_TOPUP_USDC) {
      throw new Error(
        `Top-up of ${amountUsdc} USDC is less than the minimum required (${MINIMUM_TOPUP_USDC} USDC) — no credits granted.`
      );
    }

    const addedCredits = this.calculateTokens(amountUsdc);
    const entry = this.ledger.credit(address, addedCredits, amountUsdc);
    return entry.agentCredits;
  }

  /** 'dev' is always entitled with unlimited credits. */
  hasActiveEntitlement(address: string): boolean {
    if (address.toLowerCase() === DEV_SESSION_ID) return true;
    return this.ledger.hasCredit(address);
  }

  /** Consumes agent computation credits for AI reasoning/tool execution steps. */
  consumeCredits(address: string, creditAmount: number = 1000): boolean {
    if (address.toLowerCase() === DEV_SESSION_ID) return true;
    return this.ledger.debitCredits(address, creditAmount);
  }

  getAgentCredits(address: string): number {
    if (address.toLowerCase() === DEV_SESSION_ID) return Infinity;
    return this.ledger.get(address)?.agentCredits ?? 0;
  }

  /** Backward compatibility helper for period count */
  getRemainingPeriods(address: string): number {
    if (address.toLowerCase() === DEV_SESSION_ID) return Infinity;
    const credits = this.getAgentCredits(address);
    return credits > 0 ? 1 : 0;
  }

  deductPeriod(address: string): boolean {
    if (address.toLowerCase() === DEV_SESSION_ID) return true;
    return this.hasActiveEntitlement(address);
  }
}
