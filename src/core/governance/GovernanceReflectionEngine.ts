import { MemoryStore } from '../../memory/MemoryStore';
import { GovernanceOutcomeRecord, GovernancePattern, GovernanceDecision } from '../cognition/types';

export class GovernanceReflectionEngine {
  private readonly PATTERN_CRITICAL_MASS = 5;

  constructor(private memoryStore: MemoryStore) {}

  evaluate(): void {
    const allBeliefs = this.memoryStore.getAllBeliefs();
    
    const outcomeBeliefs = allBeliefs.filter(b => b.category === 'GOVERNANCE_OUTCOME_RECORD');
    const decisionBeliefs = allBeliefs.filter(b => b.category === 'GOVERNANCE_DECISION_RECORD');
    
    const outcomes = outcomeBeliefs.map(b => JSON.parse(b.content) as GovernanceOutcomeRecord);
    const decisions = decisionBeliefs.map(b => JSON.parse(b.content) as GovernanceDecision);
    
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
        
        const existingPatterns = allBeliefs
          .filter(b => b.category === 'GOVERNANCE_PATTERN_RECORD')
          .map(b => ({ beliefId: b.id, data: JSON.parse(b.content) as GovernancePattern }));
          
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
          this.memoryStore.updateBelief({
            id: existing.beliefId,
            category: 'GOVERNANCE_PATTERN_RECORD',
            content: JSON.stringify(updatedPattern),
            epistemicStatus: 'CONFIRMED',
            confidence: updatedPattern.confidence,
            evidenceIds: groupOutcomes.map(o => `belief-${o.id}`),
            contradictionIds: [],
            createdAt: existing.data.lastObservedAt, // keep original
            updatedAt: Date.now()
          });
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
          this.memoryStore.storeBelief({
            id: `belief-${pattern.id}`,
            category: 'GOVERNANCE_PATTERN_RECORD',
            content: JSON.stringify(pattern),
            epistemicStatus: 'CONFIRMED',
            confidence: pattern.confidence,
            evidenceIds: groupOutcomes.map(o => `belief-${o.id}`),
            contradictionIds: [],
            createdAt: pattern.lastObservedAt,
            updatedAt: pattern.lastObservedAt
          });
          console.log(`\n[GovernanceReflectionEngine] Formulated new GovernancePattern for ${signature}`);
        }
      }
    }
  }
}
