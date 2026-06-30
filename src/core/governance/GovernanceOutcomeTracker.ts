import { MemoryStore } from '../../memory/MemoryStore';
import { GovernanceDecision, GovernanceOutcomeRecord } from '../cognition/types';
import { CalibrationState } from '../execution/types';

export class GovernanceOutcomeTracker {
  private readonly OBSERVATION_WINDOW_CYCLES = 3;

  constructor(private memoryStore: MemoryStore) {}

  evaluate(): GovernanceOutcomeRecord[] {
    const outcomes: GovernanceOutcomeRecord[] = [];
    
    // Retrieve all governance decisions
    const allBeliefs = this.memoryStore.getAllBeliefs();
    const decisionRecords = allBeliefs
      .filter(b => b.category === 'GOVERNANCE_DECISION_RECORD')
      .map(b => JSON.parse(b.content) as GovernanceDecision);
    
    // Retrieve already tracked outcomes to avoid duplicate tracking
    const trackedOutcomeBeliefs = allBeliefs
      .filter(b => b.category === 'GOVERNANCE_OUTCOME_RECORD')
      .map(b => JSON.parse(b.content) as GovernanceOutcomeRecord);
    const trackedDecisionIds = new Set(trackedOutcomeBeliefs.map(o => o.governanceDecisionId));

    const calibrationRecords = allBeliefs
      .filter(b => b.category === 'CALIBRATION')
      .map(b => JSON.parse(b.content));

    for (const decision of decisionRecords) {
      if (trackedDecisionIds.has(decision.id)) continue;
      
      // Get the latest calibration record BEFORE the decision
      const preDecision = calibrationRecords
        .filter(c => c.timestamp <= decision.timestamp)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
        
      // Get all calibration records AFTER the decision
      const postDecisions = calibrationRecords
        .filter(c => c.timestamp > decision.timestamp)
        .sort((a, b) => a.timestamp - b.timestamp);

      // Outcome is only considered valid if the change is temporally stable
      // (minimum N cycles of observation post-decision)
      if (preDecision && postDecisions.length >= this.OBSERVATION_WINDOW_CYCLES) {
        const postDecision = postDecisions[postDecisions.length - 1]; // latest after window
        
        // Did the error worsen or improve?
        const preError = Math.abs(preDecision.avgSuccessError || 0);
        const postError = Math.abs(postDecision.avgSuccessError || 0);
        
        let assessment: 'BENEFICIAL' | 'HARMFUL' | 'INCONCLUSIVE' = 'INCONCLUSIVE';
        // If error increased by at least 0.05, it's harmful. If it decreased, beneficial.
        if (postError > preError + 0.05) {
           assessment = 'HARMFUL';
        } else if (postError < preError - 0.05) {
           assessment = 'BENEFICIAL';
        }
        
        const outcome: GovernanceOutcomeRecord = {
          id: `gov-outcome-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          recommendationId: decision.recommendationId,
          governanceDecisionId: decision.id,
          baselineCalibrationState: preDecision.calibrationState,
          postDecisionCalibrationState: postDecision.calibrationState,
          baselinePredictionError: preDecision.avgSuccessError,
          postDecisionPredictionError: postDecision.avgSuccessError,
          outcomeAssessment: assessment,
          evidenceWindowSize: postDecisions.length,
          confidence: 0.85, // Computed confidence based on variance could go here
          timestamp: Date.now()
        };
        
        outcomes.push(outcome);
        
        this.memoryStore.storeBelief({
          id: `belief-${outcome.id}`,
          category: 'GOVERNANCE_OUTCOME_RECORD',
          content: JSON.stringify(outcome),
          epistemicStatus: 'CONFIRMED',
          confidence: outcome.confidence,
          evidenceIds: [`belief-${decision.id}`], // Linking back to the decision
          contradictionIds: [],
          createdAt: outcome.timestamp,
          updatedAt: outcome.timestamp
        });
        
        console.log(`\n[GovernanceOutcomeTracker] Evaluated outcome for decision ${decision.id}`);
        console.log(`  -> Baseline Error: ${outcome.baselinePredictionError}`);
        console.log(`  -> Post-Decision Error: ${outcome.postDecisionPredictionError}`);
        console.log(`  -> Empirical Assessment: ${assessment}`);
      }
    }
    
    return outcomes;
  }
}
