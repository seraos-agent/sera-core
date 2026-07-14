import { SeraAgentInstance } from './SeraAgentInstance';
import { SubscriptionService } from './billing/SubscriptionService';

/** Thrown by checkEntitlement() — callers (e.g. server/index.ts) catch this explicitly. */
export class SubscriptionRequiredError extends Error {
  constructor(sessionId: string) {
    super(`No active subscription entitlement for ${sessionId}`);
    this.name = 'SubscriptionRequiredError';
  }
}

export class AgentManager {
  private instances: Map<string, SeraAgentInstance> = new Map();
  private billingTickHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private subscriptionService: SubscriptionService = new SubscriptionService(),
    private billingPeriodMs: number = 30 * 24 * 60 * 60 * 1000 // 30 days, override in tests
  ) {}

  /**
   * Explicit gate — NOT called automatically inside getOrCreateInstance.
   * Callers must check this first (see server/index.ts auth:login handler)
   * so the entitlement check stays visible rather than hidden inside
   * instance creation. Throws SubscriptionRequiredError if not entitled.
   */
  public checkEntitlement(sessionId: string): void {
    if (!this.subscriptionService.hasActiveEntitlement(sessionId)) {
      throw new SubscriptionRequiredError(sessionId);
    }
  }

  public getOrCreateInstance(sessionId: string): SeraAgentInstance {
    const id = sessionId.toLowerCase();
    let instance = this.instances.get(id);
    
    if (!instance) {
      console.log(`[AgentManager] Spawning new Sera Agent Instance for ${id}`);
      instance = new SeraAgentInstance(id);
      instance.start();
      this.instances.set(id, instance);
    }
    
    return instance;
  }

  public getInstance(sessionId: string): SeraAgentInstance | undefined {
    return this.instances.get(sessionId.toLowerCase());
  }

  public getSubscriptionService(): SubscriptionService {
    return this.subscriptionService;
  }

  /**
   * Deducts one period from every currently active instance and stops +
   * evicts any whose credit has run out. Call once to start the interval;
   * safe to call startBillingTick/stopBillingTick repeatedly in tests
   * without leaking timers (see the MCP stdio process-leak lesson from the
   * Liquidity Capability test migration — don't repeat that here).
   */
  public startBillingTick(): void {
    if (this.billingTickHandle) return;
    this.billingTickHandle = setInterval(() => this.runBillingTick(), this.billingPeriodMs);
  }

  public stopBillingTick(): void {
    if (this.billingTickHandle) {
      clearInterval(this.billingTickHandle);
      this.billingTickHandle = undefined;
    }
  }

  public runBillingTick(): void {
    for (const [id, instance] of this.instances.entries()) {
      if (id === 'dev') continue; // dev session is exempt, never billed or evicted
      const debited = this.subscriptionService.deductPeriod(id);
      const stillHasCredit = debited && this.subscriptionService.getRemainingPeriods(id) > 0;
      if (!stillHasCredit) {
        console.log(`[AgentManager] Credit exhausted for ${id} — stopping and evicting instance`);
        instance.stop();
        this.instances.delete(id);
      }
    }
  }

  public shutdownAll(): void {
    this.stopBillingTick();
    for (const instance of this.instances.values()) {
      instance.stop();
    }
    this.instances.clear();
  }
}

export const agentManager = new AgentManager();
