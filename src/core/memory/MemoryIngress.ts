import { EventEmitter } from 'events';
import { EventTypes, StandardEvent } from '../events/types';
import { MemoryProposal, MemoryOperation } from './MemoryProposal';
import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { MemorySource } from './MemorySource';
import { EvidenceType } from './MemoryEvidence';

/**
 * MemoryIngress — The Universal Gate to Memory
 * 
 * "Nothing stores beliefs. Everything proposes beliefs. Memory decides beliefs."
 * 
 * This component listens to events from across the OS (e.g. Governance, Reflection)
 * and translates them into MemoryProposals. It holds NO authority to write.
 */
export class MemoryIngress {
  constructor(
    private eventBus: EventEmitter,
    private memoryStore: IWorkingMemory
  ) {
    this.setupListeners();
    console.log('[MemoryIngress] Initialized. Listening for domain events to propose.');
  }

  private setupListeners() {
    this.eventBus.on(EventTypes.GOVERNANCE_DECISION_RECORDED, (event: StandardEvent) => {
      const proposal: MemoryProposal = {
        operation: MemoryOperation.CREATE,
        key: `governance.decision.${event.payload.id}`,
        value: event.payload,
        source: MemorySource.REFLECTION_INFERENCE,
        evidence: { type: EvidenceType.DOMAIN_EVENT, referenceId: event.id, timestamp: event.timestamp },
        confidence: 1.0, // Objective fact that this decision occurred
        category: 'GOVERNANCE_DECISION_RECORD'
      };
      this.memoryStore.proposeBelief(proposal);
    });

    this.eventBus.on(EventTypes.GOVERNANCE_OUTCOME_RECORDED, (event: StandardEvent) => {
      const proposal: MemoryProposal = {
        operation: MemoryOperation.CREATE,
        key: `governance.outcome.${event.payload.id}`,
        value: event.payload,
        source: MemorySource.REFLECTION_INFERENCE,
        evidence: { type: EvidenceType.DOMAIN_EVENT, referenceId: event.id, timestamp: event.timestamp },
        confidence: event.payload.confidence || 0.85,
        category: 'GOVERNANCE_OUTCOME_RECORD'
      };
      this.memoryStore.proposeBelief(proposal);
    });

    this.eventBus.on(EventTypes.GOVERNANCE_PATTERN_RECORDED, (event: StandardEvent) => {
      // Use UPDATE to allow superseding of older pattern records with same key
      const proposal: MemoryProposal = {
        operation: MemoryOperation.UPDATE,
        key: `governance.pattern.${event.payload.contextSignature}`,
        value: event.payload,
        source: MemorySource.REFLECTION_INFERENCE,
        evidence: { type: EvidenceType.REFLECTION_PATTERN, referenceId: event.id, timestamp: event.timestamp },
        confidence: event.payload.confidence || 1.0,
        category: 'GOVERNANCE_PATTERN_RECORD'
      };
      this.memoryStore.proposeBelief(proposal);
    });

    this.eventBus.on(EventTypes.COMMUNICATION_OBSERVED, (event: StandardEvent) => {
      const observation = event.payload; // CommunicationObservation
      
      // Extremely naive fact extraction for demonstration.
      // In reality, this would be routed through a Cognitive Compressor or LLM intent check
      // to determine if the message is stating a fact worth remembering.
      const msg = observation.message.toLowerCase();
      if (msg.includes('is ') || msg.includes('are ')) {
        const proposal: MemoryProposal = {
          operation: MemoryOperation.CREATE,
          key: `workspace.fact.${Date.now()}`, // Would be semantic extracted key
          value: observation.message,
          source: MemorySource.USER_STATEMENT,
          evidence: { type: EvidenceType.USER_MESSAGE, referenceId: event.id, timestamp: event.timestamp },
          confidence: 0.5, // Unverified claim
          category: 'SEMANTIC'
        };
        this.memoryStore.proposeBelief(proposal);
      }
    });
  }
}
