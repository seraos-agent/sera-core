import { describe, it, expect } from 'vitest';
import { SubscriptionService } from '../src/server/billing/SubscriptionService';
import { TreasuryDepositWatcher } from '../src/server/billing/TreasuryDepositWatcher';

describe('TreasuryDepositWatcher & Non-Expiring Agent Token Credits', () => {
  it('credits 1,000,000 Agent Credits for $5 USDC deposit', () => {
    const service = new SubscriptionService();
    const watcher = new TreasuryDepositWatcher(service);

    const userAddress = '0x1234567890123456789012345678901234567890';
    const credits = watcher.processDeposit(userAddress, 5);

    expect(credits).toBe(1_200_000); // 5 * 200,000 * 1.2
    expect(service.getAgentCredits(userAddress)).toBe(1_200_000);
    expect(service.hasActiveEntitlement(userAddress)).toBe(true);
  });

  it('credits 3,800,000 Agent Credits for $19 USDC deposit', () => {
    const service = new SubscriptionService();
    const watcher = new TreasuryDepositWatcher(service);

    const userAddress = '0x9876543210987654321098765432109876543210';
    const credits = watcher.processDeposit(userAddress, 19);

    expect(credits).toBe(4_940_000); // 19 * 200,000 * 1.3
    expect(service.hasActiveEntitlement(userAddress)).toBe(true);
  });

  it('allows deducting credits upon agent reasoning steps', () => {
    const service = new SubscriptionService();
    const userAddress = '0xuser123';
    service.recordTopUp(userAddress, 5); // 1,000,000 credits

    const deducted = service.consumeCredits(userAddress, 50_000);
    expect(deducted).toBe(true);
    expect(service.getAgentCredits(userAddress)).toBe(1_150_000); // 1.2M - 50k
  });

  it('rejects deposits less than $1 USDC minimum', () => {
    const service = new SubscriptionService();
    const watcher = new TreasuryDepositWatcher(service);

    expect(() => watcher.processDeposit('0xuser', 0.5)).toThrowError(/less than the minimum required/);
  });
});
