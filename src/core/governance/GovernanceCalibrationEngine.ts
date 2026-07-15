import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { GovernancePattern, MetaCognitiveRecommendation } from '../cognition/types';

/**
 * HARD CONSTRAINT:
 * Communication calibration must not affect:
 * - recommendation confidence
 * - governance decision probability
 * - policy synthesis logic
 *
 * It may only affect:
 * - framing
 * - ordering of evidence
 * - uncertainty disclosure
 */
export class GovernanceCalibrationEngine {
  constructor(private memoryStore: IWorkingMemory) {}

  calibrate(recommendations: MetaCognitiveRecommendation[]): void {
    const allBeliefs = this.memoryStore.getAllBeliefs();
    const patternBeliefs = allBeliefs.filter(b => b.category === 'GOVERNANCE_PATTERN_RECORD');
    const patterns = patternBeliefs.map(b => JSON.parse(b.content) as GovernancePattern);

    for (const rec of recommendations) {
      // Find matching pattern
      // Target and targetContext map to interventionType and contextSignature
      const interventionType = rec.target;
      
      // In a real system, the signature might be more complex, but for now we just use targetContext if it's a string
      // or derive it. For demo purposes, we assume contextSignature is `${rec.target}:${rec.targetContext}`
      const contextSignature = `${rec.target}:${rec.targetContext}`;
      
      const pattern = patterns.find(p => p.contextSignature === contextSignature);

      if (pattern) {
        // Hydrate Institutional Precedent (Decision Layer Enrichment)
        // This MUST NOT change confidence, proposedAction, target, etc.
        rec.institutionalPrecedent = {
          patternId: pattern.id,
          approvalRate: pattern.approvalRate,
          expectedErrorDeltaIfRejected: pattern.expectedCalibrationErrorDeltaWhenRejected,
          contradictoryObservations: pattern.contradictoryObservations,
          patternStabilityScore: pattern.patternStabilityScore
        };

        // Determine Communication Strategy (Communication Layer)
        // Default to STANDARD
        let presentationStrategy: 'STANDARD' | 'CAUTIONARY' | 'ASSERTIVE' = 'STANDARD';
        let evidenceOrdering: 'PRO_FIRST' | 'CONTRA_FIRST' | 'BALANCED' = 'BALANCED';
        let uncertaintyDisclosureLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
        let rationaleFormatting = 'Standard formatting';

        if (pattern.patternStabilityScore > 0.8 && pattern.contradictoryObservations === 0) {
           presentationStrategy = 'ASSERTIVE';
           evidenceOrdering = 'PRO_FIRST';
           uncertaintyDisclosureLevel = 'LOW';
           rationaleFormatting = 'Assertive formatting based on strong historical consistency.';
        } else if (pattern.contradictoryObservations > 2 || pattern.patternStabilityScore < 0.5) {
           presentationStrategy = 'CAUTIONARY';
           evidenceOrdering = 'CONTRA_FIRST';
           uncertaintyDisclosureLevel = 'HIGH';
           rationaleFormatting = 'Cautionary formatting due to historical contradictions or instability.';
        }

        rec.communicationState = {
          presentationStrategy,
          rationaleFormatting,
          evidenceOrdering,
          uncertaintyDisclosureLevel
        };
        
        console.log(`[GovernanceCalibrationEngine] Calibrated recommendation ${rec.id} using pattern ${pattern.id}`);
        console.log(`  -> Strategy: ${presentationStrategy}, Uncertainty: ${uncertaintyDisclosureLevel}`);
      } else {
        // If no pattern exists, fallback to standard neutral presentation
        rec.communicationState = {
          presentationStrategy: 'STANDARD',
          rationaleFormatting: 'Standard formatting (No precedent found)',
          evidenceOrdering: 'BALANCED',
          uncertaintyDisclosureLevel: 'HIGH'
        };
      }
    }
  }
}
