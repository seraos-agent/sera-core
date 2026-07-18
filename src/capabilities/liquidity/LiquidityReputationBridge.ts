import { EventEmitter } from 'events';
import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { EventTypes, StandardEvent } from '../../core/events/types';
import { MemoryOperation, MemoryProposal } from '../../core/memory/MemoryProposal';
import { MemorySource } from '../../core/memory/MemorySource';
import { EvidenceType } from '../../core/memory/MemoryEvidence';
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
    this.eventBus.on('liquidity.execution.completed', (e: { id?: string; timestamp?: number; payload: LiquidityExecutionReceipt }) =>
      this.record(e.payload.nodeId, 'SUCCESS', e.payload.executionId || e.id || `liquidity-${Date.now()}`, e.timestamp || Date.now())
    );
    this.eventBus.on('liquidity.execution.failed', (e: { id?: string; timestamp?: number; payload: LiquidityExecutionReceipt }) =>
      this.record(e.payload.nodeId, 'FAILED', e.payload.executionId || e.id || `liquidity-${Date.now()}`, e.timestamp || Date.now())
    );
  }

  private record(nodeId: string, outcome: 'SUCCESS' | 'FAILED', executionId: string, timestamp: number): void {
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

    const proposal: MemoryProposal = {
      operation: existing ? MemoryOperation.UPDATE : MemoryOperation.CREATE,
      key,
      value: JSON.stringify(record),
      source: MemorySource.SYSTEM_EVENT,
      confidence: 1.0,
      category: 'REPUTATION',
      evidence: { type: EvidenceType.EXECUTION_TRACE, referenceId: executionId, timestamp }
    };

    this.eventBus.emit(EventTypes.MEMORY_PROPOSAL_REQUESTED, {
      id: `evt-liquidity-reputation-${executionId}`,
      type: EventTypes.MEMORY_PROPOSAL_REQUESTED,
      source: 'LiquidityReputationBridge',
      timestamp,
      payload: proposal
    } as StandardEvent<MemoryProposal>);
  }
}
