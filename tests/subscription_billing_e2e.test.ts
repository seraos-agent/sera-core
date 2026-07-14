import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentManager, SubscriptionRequiredError } from '../src/server/AgentManager';
import { SubscriptionService } from '../src/server/billing/SubscriptionService';
import { SubscriptionLedger } from '../src/server/billing/SubscriptionLedger';

describe('Prepaid Subscription Credit (ADR-0007)', () => {
  let manager: AgentManager;

  afterEach(() => {
    manager?.shutdownAll();
  });

  it("'dev' session is always entitled with no top-up", () => {
    manager = new AgentManager();
    expect(() => manager.checkEntitlement('dev')).not.toThrow();
  });

  it('rejects an address with no top-up', () => {
    manager = new AgentManager();
    expect(() => manager.checkEntitlement('0xabc')).toThrow(SubscriptionRequiredError);
  });

  it('grants entitlement after a sufficient top-up, spawns an instance, and consumes it via billing ticks', () => {
    const service = new SubscriptionService(new SubscriptionLedger());
    // 45 USDC at 20 USDC/period => floor(45/20) = 2 periods
    const periods = service.recordTopUp('0xUser1', 45, 20);
    expect(periods).toBe(2);

    manager = new AgentManager(service, 1000);
    expect(() => manager.checkEntitlement('0xUser1')).not.toThrow();

    const instance = manager.getOrCreateInstance('0xUser1');
    expect(instance).toBeDefined();

    manager.runBillingTick(); // consumes period 1 of 2
    expect(service.getRemainingPeriods('0xUser1')).toBe(1);
    expect(() => manager.checkEntitlement('0xUser1')).not.toThrow();

    manager.runBillingTick(); // consumes period 2 of 2 — now exhausted
    expect(service.getRemainingPeriods('0xUser1')).toBe(0);

    // Instance should have been stopped and evicted by the tick that exhausted credit
    expect(manager.getInstance('0xUser1')).toBeUndefined();
    expect(() => manager.checkEntitlement('0xUser1')).toThrow(SubscriptionRequiredError);
  });

  it('rejects a top-up smaller than one period', () => {
    const service = new SubscriptionService(new SubscriptionLedger());
    expect(() => service.recordTopUp('0xUser2', 5, 20)).toThrow(/less than one period/);
  });

  it('never bills or evicts the dev instance during a billing tick', () => {
    const service = new SubscriptionService(new SubscriptionLedger());
    manager = new AgentManager(service, 1000);

    manager.getOrCreateInstance('dev');
    manager.runBillingTick();
    manager.runBillingTick();

    expect(manager.getInstance('dev')).toBeDefined();
  });

  it('additional top-ups accumulate rather than overwrite existing credit', () => {
    const ledger = new SubscriptionLedger();
    const service = new SubscriptionService(ledger);

    service.recordTopUp('0xUser3', 20, 20); // +1 period
    service.recordTopUp('0xUser3', 40, 20); // +2 periods

    expect(service.getRemainingPeriods('0xUser3')).toBe(3);
  });
});
