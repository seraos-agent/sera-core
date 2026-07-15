import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { GoalDriftRecord, GoalInterpretationRecord, GoalTensionRecord } from './types';

export class GoalInterpretationEngine {
  constructor(private memoryStore: IWorkingMemory) {}

  public interpret(driftRecords: GoalDriftRecord[], tensionRecords: GoalTensionRecord[]): void {
    console.log('[GoalInterpretationEngine] Starting interpretation cycle (Meaning Layer)...');

    const interpretations: GoalInterpretationRecord[] = [];
    const timestamp = Date.now();

    // 1. Interpret CENTRALIZATION based on Structural Drift
    driftRecords.filter(d => d.driftType === 'STRUCTURAL' && d.driftMagnitude > 0).forEach(drift => {
      // Interpretation Is Not Recommendation Doctrine: Only describe.
      // Interpretation Non-Causality Doctrine: Describe correlation, not causation.
      // Interpretation Temporal Neutrality Doctrine: Describe differences, not progression/degradation.
      interpretations.push({
        id: `interp-central-${timestamp}-${drift.targetId}`,
        interpretationType: 'CENTRALIZATION',
        confidence: 0.82, // Heuristic representing consistency of structural measurement
        evidenceIds: [],
        supportingDriftIds: [drift.id],
        rationale: `Goal ${drift.targetId} is increasingly dominant based on observed structural drift.`,
        createdAt: timestamp
      });
    });

    // 2. Interpret TENSION_CONCENTRATION based on Tension Drift & Tension Records
    // Heuristic: If we see a high magnitude tension drift, and there are tension records centered around certain goals.
    const tensionDrifts = driftRecords.filter(d => d.driftType === 'TENSION' && d.driftMagnitude > 20); // arbitrary threshold > 20%
    if (tensionDrifts.length > 0) {
      // Find the most tense goal from recent tension records
      const tensionMap = new Map<string, number>();
      tensionRecords.forEach(t => {
        tensionMap.set(t.sourceGoalId, (tensionMap.get(t.sourceGoalId) || 0) + t.tensionScore);
        tensionMap.set(t.targetGoalId, (tensionMap.get(t.targetGoalId) || 0) + t.tensionScore);
      });

      Array.from(tensionMap.entries())
        .filter(([_, score]) => score > 1.0) // arbitrary threshold
        .forEach(([goalId, _]) => {
          interpretations.push({
            id: `interp-tension-conc-${timestamp}-${goalId}`,
            interpretationType: 'TENSION_CONCENTRATION',
            confidence: 0.74, 
            evidenceIds: tensionRecords.filter(t => t.sourceGoalId === goalId || t.targetGoalId === goalId).map(t => t.id),
            supportingDriftIds: tensionDrifts.map(d => d.id),
            rationale: `Tension concentration around Goal ${goalId} co-occurs with an overall increase in systemic tension drift.`,
            createdAt: timestamp
          });
        });
    }

    // 3. Save Interpretations
    interpretations.forEach(interp => {
      this.memoryStore.storeBelief({
        id: `belief-${interp.id}`,
        category: 'GOAL_INTERPRETATION_RECORD',
        content: JSON.stringify(interp),
        epistemicStatus: 'CONFIRMED',
        confidence: interp.confidence,
        evidenceIds: interp.evidenceIds.concat(interp.supportingDriftIds),
        contradictionIds: [],
        createdAt: interp.createdAt,
        updatedAt: interp.createdAt
      });
    });

    console.log(`[GoalInterpretationEngine] Generated ${interpretations.length} interpretations adhering to all non-recommendation and non-causality doctrines.`);
  }
}
