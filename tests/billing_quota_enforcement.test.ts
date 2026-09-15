import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SubscriptionService } from '../src/server/billing/SubscriptionService';
import { SubscriptionLedger } from '../src/server/billing/SubscriptionLedger';

const TEST_LEDGER_PATH = path.join(process.cwd(), '.data', 'test_billing_enforcement.json');

describe('Computation Credits & One-Time Welcome Quota Enforcement', () => {
  let service: SubscriptionService;

  const cleanFile = () => {
    try {
      if (fs.existsSync(TEST_LEDGER_PATH)) {
        fs.unlinkSync(TEST_LEDGER_PATH);
      }
    } catch {}
  };

  beforeEach(() => {
    cleanFile();
    service = new SubscriptionService(new SubscriptionLedger(TEST_LEDGER_PATH));
  });

  afterEach(() => {
    cleanFile();
  });

  it('brand new account is not in ledger initially and receives 1,000,000 welcome credits once', () => {
    const userId = 'user-brand-new-1';

    // 1. Initially user has no entry
    expect(service.hasEntry(userId)).toBe(false);
    expect(service.getAgentCredits(userId)).toBe(0);

    // 2. Grant welcome credits on initial registration
    service.addCreditsDirectly(userId, 1_000_000);
    expect(service.hasEntry(userId)).toBe(true);
    expect(service.getAgentCredits(userId)).toBe(1_000_000);
    expect(service.hasActiveEntitlement(userId)).toBe(true);
  });

  it('STRICT ENFORCEMENT: when user consumes all credits (balance 0), they do NOT get auto-refilled', () => {
    const userId = 'user-depleted-2';

    // 1. Initial grant
    service.addCreditsDirectly(userId, 1_000_000);
    expect(service.getAgentCredits(userId)).toBe(1_000_000);

    // 2. Consume all credits
    const debited = service.consumeCredits(userId, 1_000_000);
    expect(debited).toBe(true);
    expect(service.getAgentCredits(userId)).toBe(0);

    // 3. User still has an entry, but entitlement is false
    expect(service.hasEntry(userId)).toBe(true);
    expect(service.hasActiveEntitlement(userId)).toBe(false);

    // 4. Simulate login/reconnect check: hasEntry is true, so no auto-refill is triggered!
    const hasExistingEntry = service.hasEntry(userId);
    expect(hasExistingEntry).toBe(true);

    // Even if re-checked, balance remains strictly 0
    expect(service.getAgentCredits(userId)).toBe(0);
  });

  it('top-up via USDC properly adds utility tokens with tiered bonuses and restores entitlement', () => {
    const userId = 'user-topup-3';

    // 1. User is at 0 credits
    service.addCreditsDirectly(userId, 1_000_000);
    service.consumeCredits(userId, 1_000_000);
    expect(service.getAgentCredits(userId)).toBe(0);
    expect(service.hasActiveEntitlement(userId)).toBe(false);

    // 2. User tops up $5 USDC (gets 1M base + 20% bonus = 1,200,000 tokens)
    const newBalance = service.recordTopUp(userId, 5);
    expect(newBalance).toBe(1_200_000);
    expect(service.getAgentCredits(userId)).toBe(1_200_000);
    expect(service.hasActiveEntitlement(userId)).toBe(true);

    // 3. Tokens can be consumed normally
    service.consumeCredits(userId, 200_000);
    expect(service.getAgentCredits(userId)).toBe(1_000_000);
  });

  it('dev session always has infinite credits and active entitlement', () => {
    expect(service.hasActiveEntitlement('dev')).toBe(true);
    expect(service.getAgentCredits('dev')).toBe(Infinity);
    expect(service.consumeCredits('dev', 50_000_000)).toBe(true);
  });
});
