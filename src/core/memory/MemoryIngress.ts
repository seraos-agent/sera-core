import { EventEmitter } from 'events';
import { EventTypes, StandardEvent } from '../events/types';
import { MemoryProposal, MemoryOperation } from './MemoryProposal';
import { MemoryPolicyEngine } from './MemoryPolicyEngine';
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
    private policyEngine: MemoryPolicyEngine
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
        confidence: 1.0 // Objective fact that this decision occurred
      };
      this.policyEngine.evaluate(proposal);
    });

    this.eventBus.on(EventTypes.GOVERNANCE_OUTCOME_RECORDED, (event: StandardEvent) => {
      const proposal: MemoryProposal = {
        operation: MemoryOperation.CREATE,
        key: `governance.outcome.${event.payload.id}`,
        value: event.payload,
        source: MemorySource.REFLECTION_INFERENCE,
        evidence: { type: EvidenceType.DOMAIN_EVENT, referenceId: event.id, timestamp: event.timestamp },
        confidence: event.payload.confidence || 0.85 
      };
      this.policyEngine.evaluate(proposal);
    });

    this.eventBus.on(EventTypes.GOVERNANCE_PATTERN_RECORDED, (event: StandardEvent) => {
      // Use UPDATE to allow superseding of older pattern records with same key
      const proposal: MemoryProposal = {
        operation: MemoryOperation.UPDATE,
        key: `governance.pattern.${event.payload.contextSignature}`,
        value: event.payload,
        source: MemorySource.REFLECTION_INFERENCE,
        evidence: { type: EvidenceType.REFLECTION_PATTERN, referenceId: event.id, timestamp: event.timestamp },
        confidence: event.payload.confidence || 1.0
      };
      this.policyEngine.evaluate(proposal);
    });
  }
}
