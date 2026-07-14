import { EventEmitter } from 'events';
import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { Belief } from '../../core/memory/types';
import { LiquidityExecutionReceipt } from './types';

interface ReputationRecord {
  nodeId: string;
  successCount: number;
  failureCount: number;
  lastOutcome: 'SUCCESS' | 'FAILED';
  lastUpdatedAt: number;
}

/**
 * Reputation hook per ADR-0006 — deliberately NOT a new reputation engine.
 * This only listens for liquidity execution outcomes and folds them into a
 * `REPUTATION` belief in MemoryStore, following the same pattern already
 * used for `EXECUTION_POLICY_ADAPTATION` beliefs (adaptation:${tool} keys,
 * see ExecutionReflectionEngine). Anything that wants to reason about node
 * trustworthiness reads this belief the normal way —
 * memoryStore.getBeliefsByCategory('REPUTATION') — same as every other
 * consumer of memory.
 */
export class LiquidityReputationBridge {
  constructor(private eventBus: EventEmitter, private memoryStore: IWorkingMemory) {
    this.eventBus.on('liquidity.execution.completed', (e: { payload: LiquidityExecutionReceipt }) =>
      this.record(e.payload.nodeId, 'SUCCESS')
    );
    this.eventBus.on('liquidity.execution.failed', (e: { payload: LiquidityExecutionReceipt }) =>
      this.record(e.payload.nodeId, 'FAILED')
    );
  }

  private record(nodeId: string, outcome: 'SUCCESS' | 'FAILED'): void {
    if (!nodeId) return;

    const key = `reputation:${nodeId}`;
    const existing = this.memoryStore.getBeliefByKey(key);

    const record: ReputationRecord = existing
      ? (JSON.parse(existing.content) as ReputationRecord)
      : { nodeId, successCount: 0, failureCount: 0, lastOutcome: outcome, lastUpdatedAt: Date.now() };

    if (outcome === 'SUCCESS') {
      record.successCount += 1;
    } else {
      record.failureCount += 1;
    }
    record.lastOutcome = outcome;
    record.lastUpdatedAt = Date.now();

    const belief: Belief = {
      id: existing?.id || `belief-reputation-${nodeId}`,
      category: 'REPUTATION',
      key,
      content: JSON.stringify(record),
      epistemicStatus: 'CONFIRMED',
      confidence: 1.0,
      evidenceIds: [],
      contradictionIds: [],
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    this.memoryStore.storeBelief(belief);
  }
}
