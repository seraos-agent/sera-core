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

  it('grants entitlement after a sufficient top-up, spawns an instance, and manages credits', () => {
    const service = new SubscriptionService(new SubscriptionLedger());
    // 45 USDC => 45 * 200,000 = 9,000,000 Agent Credits
    const credits = service.recordTopUp('0xUser1', 45);
    expect(credits).toBe(9_000_000);

    manager = new AgentManager(service, 1000);
    expect(() => manager.checkEntitlement('0xUser1')).not.toThrow();

    const instance = manager.getOrCreateInstance('0xUser1');
    expect(instance).toBeDefined();

    service.consumeCredits('0xUser1', 1_000_000);
    expect(service.getAgentCredits('0xUser1')).toBe(8_000_000);
    expect(() => manager.checkEntitlement('0xUser1')).not.toThrow();
  });

  it('rejects a top-up smaller than minimum 1 USDC', () => {
    const service = new SubscriptionService(new SubscriptionLedger());
    expect(() => service.recordTopUp('0xUser2', 0.5)).toThrow(/less than the minimum/);
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

    service.recordTopUp('0xUser3', 20); // +4,000,000 credits
    service.recordTopUp('0xUser3', 40); // +8,000,000 credits

    expect(service.getAgentCredits('0xUser3')).toBe(12_000_000);
  });
});
