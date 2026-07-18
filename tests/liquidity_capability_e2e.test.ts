import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { LiquidityDirectory } from '../src/capabilities/liquidity/LiquidityDirectory';
import { LiquidityExecutor, PricingSource } from '../src/capabilities/liquidity/LiquidityExecutor';
import { LiquidityReputationBridge } from '../src/capabilities/liquidity/LiquidityReputationBridge';
import { LiquidityNode } from '../src/capabilities/liquidity/types';
import { WorkingMemory } from '../src/memory/WorkingMemory';
import { IWorkingMemory } from '../src/core/memory/IWorkingMemory';
import { MemoryIngress } from '../src/core/memory/MemoryIngress';

const flatPricing: PricingSource = {
  getUnitPrice: (asset: string, fiat?: string) => {
    if (fiat) return asset === 'USDC' ? 0.79 : 2500; // e.g. USDC/GBP, ETH/GBP
    return 1; // crypto-to-crypto reference unit
  },
};

function makeNode(overrides: Partial<LiquidityNode> = {}): LiquidityNode {
  return {
    nodeId: 'node-a',
    agentId: 'agent-a',
    supportedAssets: ['USDC'],
    limits: { minAmount: 10, maxAmount: 1000 },
    availability: 'ONLINE',
    readiness: 'AVAILABLE',
    reputationRef: 'reputation:node-a',
    registeredAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('Liquidity Capability E2E', () => {
  let eventBus: EventEmitter;
  let directory: LiquidityDirectory;
  let memoryStore: IWorkingMemory;

  beforeEach(() => {
    eventBus = new EventEmitter();
    directory = new LiquidityDirectory();
    memoryStore = new WorkingMemory(eventBus);
    new MemoryIngress(eventBus, memoryStore);
    new LiquidityReputationBridge(eventBus, memoryStore);
  });

  it('discovers a crypto-native node without the fiat rail enabled', async () => {
    const executor = new LiquidityExecutor(directory, flatPricing, eventBus, false);
    executor.registerNode(makeNode());

    const results = await executor.discover({ asset: 'USDC', amount: 500 });
    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe('node-a');
  });

  it('quotes and executes a crypto-native transfer, then updates the REPUTATION belief', async () => {
    const executor = new LiquidityExecutor(directory, flatPricing, eventBus, false);
    executor.registerNode(makeNode());

    const q = await executor.quote({ nodeId: 'node-a', asset: 'USDC', amount: 500, idempotencyKey: 'k1' });
    expect(q.price).toBe(1);
    expect(q.fee).toBeCloseTo(500 * 0.005); // default 50 bps

    const receipt = await executor.execute({ quoteId: q.quoteId, idempotencyKey: 'exec-1' });
    expect(receipt.status).toBe('SUCCESS');
    expect(receipt.amountExecuted).toBe(500);

    // Allow the event listener (LiquidityReputationBridge) to process
    await new Promise((r) => setTimeout(r, 100));

    const belief = memoryStore.getBeliefByKey('reputation:node-a');
    expect(belief, 'reputation belief should exist after a completed execution').toBeDefined();
    expect(belief?.epistemicStatus).toBe('CONFIRMED');
    expect(belief?.evidenceIds).toContain(receipt.executionId);
    const record = JSON.parse(belief!.content);
    expect(record.successCount).toBe(1);
    expect(record.failureCount).toBe(0);
  });

  it('rejects a fiat-denominated discovery when FIAT_RAIL_ENABLED is false, even for a fiat-capable node', async () => {
    const executor = new LiquidityExecutor(directory, flatPricing, eventBus, false);
    executor.registerNode(
      makeNode({ nodeId: 'node-fiat', supportedFiatCurrencies: ['GBP'], supportedPaymentMethods: ['bank_transfer'] })
    );

    const results = await executor.discover({ asset: 'USDC', amount: 500, fiat: 'GBP' });
    expect(results).toHaveLength(0);

    await expect(
      executor.quote({ nodeId: 'node-fiat', asset: 'USDC', amount: 500, fiat: 'GBP', idempotencyKey: 'k2' })
    ).rejects.toThrow(/Fiat rail is not enabled/);
  });

  it('allows fiat quoting once FIAT_RAIL_ENABLED is explicitly true', async () => {
    const executor = new LiquidityExecutor(directory, flatPricing, eventBus, true);
    executor.registerNode(
      makeNode({ nodeId: 'node-fiat', supportedFiatCurrencies: ['GBP'], supportedPaymentMethods: ['bank_transfer'] })
    );

    const results = await executor.discover({ asset: 'USDC', amount: 500, fiat: 'GBP' });
    expect(results).toHaveLength(1);

    const q = await executor.quote({ nodeId: 'node-fiat', asset: 'USDC', amount: 500, fiat: 'GBP', idempotencyKey: 'k3' });
    expect(q.price).toBe(0.79);
  });

  it('records a FAILED outcome in reputation when the node goes offline before execution', async () => {
    const executor = new LiquidityExecutor(directory, flatPricing, eventBus, false);
    executor.registerNode(makeNode({ nodeId: 'node-b' }));

    const q = await executor.quote({ nodeId: 'node-b', asset: 'USDC', amount: 100, idempotencyKey: 'k4' });
    executor.updateStatus('node-b', 'OFFLINE', 'UNAVAILABLE');

    const receipt = await executor.execute({ quoteId: q.quoteId, idempotencyKey: 'exec-2' });
    expect(receipt.status).toBe('FAILED');

    await new Promise((r) => setTimeout(r, 100));
    const belief = memoryStore.getBeliefByKey('reputation:node-b');
    const record = JSON.parse(belief!.content);
    expect(record.failureCount).toBe(1);
  });

  it('rejects a replayed idempotency key on execute', async () => {
    const executor = new LiquidityExecutor(directory, flatPricing, eventBus, false);
    executor.registerNode(makeNode({ nodeId: 'node-c' }));

    const q1 = await executor.quote({ nodeId: 'node-c', asset: 'USDC', amount: 50, idempotencyKey: 'k5' });
    const first = await executor.execute({ quoteId: q1.quoteId, idempotencyKey: 'exec-dup' });
    expect(first.status).toBe('SUCCESS');

    const q2 = await executor.quote({ nodeId: 'node-c', asset: 'USDC', amount: 50, idempotencyKey: 'k6' });
    const second = await executor.execute({ quoteId: q2.quoteId, idempotencyKey: 'exec-dup' });
    expect(second.status).toBe('REJECTED');
  });
});
