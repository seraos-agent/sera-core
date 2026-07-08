import { GovernanceOutcomeRecord, GovernancePattern, GovernanceDecision } from '../cognition/types';
import { EventEmitter } from 'events';
import { EventTypes, StandardEvent } from '../events/types';
import { MemoryService } from '../../core/memory/MemoryService';

export class GovernanceReflectionEngine {
  private readonly PATTERN_CRITICAL_MASS = 5;

  constructor(private memoryService: MemoryService, private eventBus: EventEmitter) {}

  evaluate(): void {
    const allItems = this.memoryService.getAll();
    
    const outcomes = allItems
      .filter(item => item.key.startsWith('governance.outcome.'))
      .map(item => item.value as GovernanceOutcomeRecord);
      
    const decisions = allItems
      .filter(item => item.key.startsWith('governance.decision.'))
      .map(item => item.value as GovernanceDecision);
    
    // Create a map of decisions for easy lookup
    const decisionMap = new Map<string, GovernanceDecision>();
    for (const d of decisions) {
      decisionMap.set(d.id, d);
    }
    
    // Group outcomes by interventionType and contextSignature
    const groups: { [key: string]: GovernanceOutcomeRecord[] } = {};
    
    for (const outcome of outcomes) {
      const decision = decisionMap.get(outcome.governanceDecisionId);
      if (!decision) continue;
      
      const interventionType = decision.governanceContext?.interventionType || 'UNKNOWN';
      const interventionContext = decision.governanceContext?.interventionContext || 'UNKNOWN';
      const contextSignature = `${interventionType}:${interventionContext}`;
      
      // Store the signature temporarily for grouping
      (outcome as any)._interventionType = interventionType;
      (outcome as any)._contextSignature = contextSignature;
      (outcome as any)._decision = decision.decision;
      
      if (!groups[contextSignature]) {
        groups[contextSignature] = [];
      }
      groups[contextSignature].push(outcome);
    }
    
    // Process each group to form patterns
    for (const [signature, groupOutcomes] of Object.entries(groups)) {
      if (groupOutcomes.length >= this.PATTERN_CRITICAL_MASS) {
        
        const interventionType = (groupOutcomes[0] as any)._interventionType;
        let approvedCount = 0;
        let rejectedCount = 0;
        let sumDeltaApproved = 0;
        let sumDeltaRejected = 0;
        let contradictoryObservations = 0;
        
        for (const out of groupOutcomes) {
           const dec = (out as any)._decision;
           // We calculate error delta as: post - pre
           // Since error is usually negative, a positive delta means error got closer to 0 (improved)
           // If error worsened (e.g. -0.2 to -0.3), delta is -0.1 (negative)
           // We will store it as-is to let Phase 5.4 read it accurately.
           // However, absolute values are easier to reason about:
           const preError = Math.abs(out.baselinePredictionError);
           const postError = Math.abs(out.postDecisionPredictionError);
           
           // Positive delta = error increased (bad). Negative delta = error decreased (good).
           const delta = postError - preError;
           
           if (dec === 'APPROVED') {
             approvedCount++;
             sumDeltaApproved += delta;
             if (delta > 0) contradictoryObservations++;
           } else if (dec === 'REJECTED') {
             rejectedCount++;
             sumDeltaRejected += delta;
             if (delta < 0) contradictoryObservations++;
           }
        }
        
        const total = approvedCount + rejectedCount;
        if (total === 0) continue; 
        
        const approvalRate = approvedCount / total;
        const expectedCalibrationErrorDeltaWhenRejected = rejectedCount > 0 ? (sumDeltaRejected / rejectedCount) : 0;
        const expectedCalibrationErrorDeltaWhenApproved = approvedCount > 0 ? (sumDeltaApproved / approvedCount) : 0;
        
        // Calculate driftScore: how stable this pattern is.
        // For Phase 5.3, we assign 1.0 (highly stable). Phase 5.4 will refine this.
        const driftScore = 1.0; 
        
        const existingPatterns = allItems
          .filter(item => item.key.startsWith('governance.pattern.'))
          .map(item => ({ beliefId: item.id, data: item.value as GovernancePattern }));
          
        const existing = existingPatterns.find(p => p.data.contextSignature === signature);
        
        if (existing) {
          const updatedPattern: GovernancePattern = {
            ...existing.data,
            observations: groupOutcomes.length,
            approvalRate,
            expectedCalibrationErrorDeltaWhenRejected,
            expectedCalibrationErrorDeltaWhenApproved,
            contradictoryObservations,
            patternStabilityScore: 1.0,
            driftScore,
            confidence: Math.min(1.0, 0.5 + (groupOutcomes.length * 0.05)),
            lastObservedAt: Date.now()
          };
          // Emit event instead of writing to memory
          const event: StandardEvent<GovernancePattern> = {
            id: `evt-${existing.beliefId}`,
            type: EventTypes.GOVERNANCE_PATTERN_RECORDED,
            source: 'GovernanceReflectionEngine',
            timestamp: Date.now(),
            payload: updatedPattern
          };
          this.eventBus.emit(EventTypes.GOVERNANCE_PATTERN_RECORDED, event);
        } else {
          const pattern: GovernancePattern = {
            id: `gov-pattern-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            interventionType,
            contextSignature: signature,
            context: {},
            observations: groupOutcomes.length,
            approvalRate,
            expectedCalibrationErrorDeltaWhenRejected,
            expectedCalibrationErrorDeltaWhenApproved,
            contradictoryObservations,
            patternStabilityScore: 1.0,
            driftScore,
            confidence: Math.min(1.0, 0.5 + (groupOutcomes.length * 0.05)),
            lastObservedAt: Date.now()
          };
          // Emit event instead of writing to memory
          const event: StandardEvent<GovernancePattern> = {
            id: `evt-${pattern.id}`,
            type: EventTypes.GOVERNANCE_PATTERN_RECORDED,
            source: 'GovernanceReflectionEngine',
            timestamp: Date.now(),
            payload: pattern
          };
          this.eventBus.emit(EventTypes.GOVERNANCE_PATTERN_RECORDED, event);
          console.log(`\n[GovernanceReflectionEngine] Formulated new GovernancePattern for ${signature}`);
        }
      }
    }
  }
}
