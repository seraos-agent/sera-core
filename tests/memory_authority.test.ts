import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
import { EventTypes, StandardEvent } from '../src/core/events/types';
import { MemoryIngress } from '../src/core/memory/MemoryIngress';
import { MemoryOperation, MemoryProposal } from '../src/core/memory/MemoryProposal';
import { EvidenceType } from '../src/core/memory/MemoryEvidence';
import { MemorySource } from '../src/core/memory/MemorySource';
import { WorkingMemory } from '../src/memory/WorkingMemory';

function emitProposal(eventBus: EventEmitter, proposal: MemoryProposal): void {
  eventBus.emit(EventTypes.MEMORY_PROPOSAL_REQUESTED, {
    id: `evt-${proposal.evidence.referenceId}`,
    type: EventTypes.MEMORY_PROPOSAL_REQUESTED,
    source: 'MemoryAuthorityTest',
    timestamp: proposal.evidence.timestamp,
    payload: proposal
  } as StandardEvent<MemoryProposal>);
}

describe('Memory authority', () => {
  it('accepts external memory proposals only through MemoryIngress', () => {
    const eventBus = new EventEmitter();
    const memoryStore = new WorkingMemory(eventBus);
    new MemoryIngress(eventBus, memoryStore);

    emitProposal(eventBus, {
      operation: MemoryOperation.CREATE,
      key: 'workspace.fact.retention-policy',
      value: 'Keep project records for 30 days.',
      source: MemorySource.USER_DIRECT_INSTRUCTION,
      evidence: { type: EvidenceType.USER_MESSAGE, referenceId: 'user-1', timestamp: 1 },
      confidence: 1,
      category: 'SEMANTIC'
    });

    const belief = memoryStore.getBeliefByKey('workspace.fact.retention-policy');
    expect(belief?.content).toBe('Keep project records for 30 days.');
    expect(belief?.epistemicStatus).toBe('CONFIRMED');
  });

  it('keeps reflection-derived memory as a hypothesis until independent evidence repeats', () => {
    const eventBus = new EventEmitter();
    const memoryStore = new WorkingMemory(eventBus);
    new MemoryIngress(eventBus, memoryStore);

    for (let i = 1; i <= 3; i++) {
      emitProposal(eventBus, {
        operation: i === 1 ? MemoryOperation.CREATE : MemoryOperation.UPDATE,
        key: 'semantic.tool-failure.example-tool',
        value: "Tool 'example-tool' failed consistently during execution.",
        source: MemorySource.REFLECTION_INFERENCE,
        evidence: { type: EvidenceType.REFLECTION_PATTERN, referenceId: `episode-${i}`, timestamp: i },
        confidence: Math.min(0.3 + (i * 0.2), 0.95),
        category: 'SEMANTIC'
      });

      const belief = memoryStore.getBeliefByKey('semantic.tool-failure.example-tool');
      expect(belief?.evidenceIds).toHaveLength(i);
      expect(belief?.epistemicStatus).toBe(i < 3 ? 'HYPOTHESIS' : 'CONFIRMED');
    }
  });

  it('does not allow an unverified statement to become confirmed merely by entering the ingress', () => {
    const eventBus = new EventEmitter();
    const memoryStore = new WorkingMemory(eventBus);
    new MemoryIngress(eventBus, memoryStore);

    emitProposal(eventBus, {
      operation: MemoryOperation.CREATE,
      key: 'workspace.fact.unverified-cost',
      value: 'The server costs $800 per month.',
      source: MemorySource.USER_STATEMENT,
      evidence: { type: EvidenceType.USER_MESSAGE, referenceId: 'message-1', timestamp: 1 },
      confidence: 0.5,
      category: 'SEMANTIC'
    });

    const belief = memoryStore.getBeliefByKey('workspace.fact.unverified-cost');
    expect(belief?.status).toBe('PENDING');
    expect(belief?.epistemicStatus).toBe('HYPOTHESIS');
  });
});
