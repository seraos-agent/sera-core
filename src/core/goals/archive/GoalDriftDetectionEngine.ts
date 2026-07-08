import { MemoryStore } from '../../memory/MemoryStore';
import { GoalGraph, GoalDriftRecord, GoalTensionRecord } from './types';

export class GoalDriftDetectionEngine {
  constructor(private memoryStore: MemoryStore) {}

  public detectStructuralDrift(baselineGraph: GoalGraph, currentGraph: GoalGraph, targetGoalId: string): void {
    console.log('[GoalDriftDetectionEngine] Detecting STRUCTURAL Drift...');

    // Temporal Baseline Stability Doctrine enforced by passing explicit distinct snapshots
    const baselineEdges = baselineGraph.relationships.filter(e => e.sourceGoalId === targetGoalId || e.targetGoalId === targetGoalId).length;
    const currentEdges = currentGraph.relationships.filter(e => e.sourceGoalId === targetGoalId || e.targetGoalId === targetGoalId).length;

    const driftMagnitude = currentEdges - baselineEdges; // Positive means more connections, negative means fewer

    if (driftMagnitude !== 0) {
      const record: GoalDriftRecord = {
        id: `drift-struct-${Date.now()}`,
        driftType: 'STRUCTURAL',
        driftProvenance: 'GRAPH_COMPARISON',
        targetId: targetGoalId,
        baselineSnapshotId: `graph-${baselineGraph.generatedAt}`,
        currentSnapshotId: `graph-${currentGraph.generatedAt}`,
        driftMagnitude,
        evidenceIds: [],
        observedAt: Date.now()
      };

      this.saveRecord(record);
      console.log(`[GoalDriftDetectionEngine] STRUCTURAL drift recorded for ${targetGoalId}. Magnitude: ${driftMagnitude}`);
    }
  }

  public detectTensionDrift(
    baselineTensions: GoalTensionRecord[],
    currentTensions: GoalTensionRecord[],
    baselineGraphNodeCount: number,
    currentGraphNodeCount: number,
    targetContext: string
  ): void {
    console.log('[GoalDriftDetectionEngine] Detecting TENSION Drift...');

    const getDensity = (tensions: GoalTensionRecord[], nodeCount: number) => {
      const maxEdges = (nodeCount * (nodeCount - 1)) / 2;
      return maxEdges > 0 ? (tensions.length / maxEdges) * 100 : 0;
    };

    const baselineDensity = getDensity(baselineTensions, baselineGraphNodeCount);
    const currentDensity = getDensity(currentTensions, currentGraphNodeCount);

    const driftMagnitude = currentDensity - baselineDensity;

    if (driftMagnitude !== 0) {
      const record: GoalDriftRecord = {
        id: `drift-tension-${Date.now()}`,
        driftType: 'TENSION',
        driftProvenance: 'TENSION_COMPARISON',
        targetId: targetContext, // e.g. 'global_graph'
        baselineSnapshotId: `tension-baseline`,
        currentSnapshotId: `tension-current`,
        driftMagnitude,
        evidenceIds: [],
        observedAt: Date.now()
      };

      this.saveRecord(record);
      console.log(`[GoalDriftDetectionEngine] TENSION drift recorded for ${targetContext}. Magnitude: ${driftMagnitude.toFixed(2)}%`);
    }
  }

  private saveRecord(record: GoalDriftRecord) {
    // Goal Drift Doctrine: "Drift is not evidence of error, degradation, improvement, or misalignment."
    // No value judgements are assigned before saving.
    this.memoryStore.storeBelief({
      id: `belief-${record.id}`,
      category: 'GOAL_DRIFT_RECORD',
      content: JSON.stringify(record),
      epistemicStatus: 'CONFIRMED',
      confidence: 1.0,
      evidenceIds: record.evidenceIds,
      contradictionIds: [],
      createdAt: record.observedAt,
      updatedAt: record.observedAt
    });
  }
}
