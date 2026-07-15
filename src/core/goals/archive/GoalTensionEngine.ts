import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { GoalGraph, GoalTensionRecord } from './types';

// Mock interface for operational data passed from runtime
export interface OperationalData {
  resourceUsage: Record<string, string[]>; // resourceId -> array of goalIds competing for it
  attentionUsage: Record<string, string[]>; // contextId -> array of goalIds competing for it
}

export class GoalTensionEngine {
  constructor(private memoryStore: IWorkingMemory) {}

  public observeTension(graph: GoalGraph, opData: OperationalData): void {
    console.log('[GoalTensionEngine] Observing operational tension dynamics...');

    const tensionRecords: GoalTensionRecord[] = [];
    const timestamp = Date.now();

    // 1. Detect RESOURCE Tension
    for (const [resourceId, goalIds] of Object.entries(opData.resourceUsage)) {
      if (goalIds.length > 1) {
        // Pairs of goals competing for the same resource
        for (let i = 0; i < goalIds.length; i++) {
          for (let j = i + 1; j < goalIds.length; j++) {
            tensionRecords.push({
              id: `tension-res-${timestamp}-${i}-${j}`,
              sourceGoalId: goalIds[i],
              targetGoalId: goalIds[j],
              tensionType: 'RESOURCE',
              tensionScore: 0.8, // Arbitrary heuristic score for demo
              evidenceIds: [`res-competition-${resourceId}`],
              observedAt: timestamp
            });
          }
        }
      }
    }

    // 2. Detect ATTENTION Tension
    for (const [contextId, goalIds] of Object.entries(opData.attentionUsage)) {
      if (goalIds.length > 1) {
        for (let i = 0; i < goalIds.length; i++) {
          for (let j = i + 1; j < goalIds.length; j++) {
            tensionRecords.push({
              id: `tension-att-${timestamp}-${i}-${j}`,
              sourceGoalId: goalIds[i],
              targetGoalId: goalIds[j],
              tensionType: 'ATTENTION',
              tensionScore: 0.6,
              evidenceIds: [`att-competition-${contextId}`],
              observedAt: timestamp
            });
          }
        }
      }
    }

    // 3. Save to Memory
    tensionRecords.forEach(record => {
      this.memoryStore.storeBelief({
        id: `belief-${record.id}`,
        category: 'GOAL_TENSION_RECORD',
        content: JSON.stringify(record),
        epistemicStatus: 'CONFIRMED',
        confidence: 1.0,
        evidenceIds: record.evidenceIds,
        contradictionIds: [],
        createdAt: timestamp,
        updatedAt: timestamp
      });
    });

    console.log(`[GoalTensionEngine] Generated and saved ${tensionRecords.length} GoalTensionRecords.`);

    // 4. Compute and log metrics (Tension Non-Resolution Doctrine applies here)
    this.computeMetrics(graph, tensionRecords);
  }

  private computeMetrics(graph: GoalGraph, records: GoalTensionRecord[]) {
    console.log('\n--- Goal Tension Metrics ---');
    console.log('Tension Non-Resolution Doctrine: These metrics describe pressure distribution only. They do not dictate prioritization or resolution.');

    // Graph Tension Density
    // Formula: (Number of tension edges / Total possible edges) * 100
    const nodeCount = graph.goals.length;
    const maxEdges = (nodeCount * (nodeCount - 1)) / 2;
    const density = maxEdges > 0 ? (records.length / maxEdges) * 100 : 0;
    
    console.log(`[Graph Tension Density]: ${density.toFixed(2)}% (${records.length} tensions across ${nodeCount} goals)`);

    // High-Tension Cluster Detection
    // Tension Structural Non-Entity Doctrine: Clusters are analytical groupings only. 
    // They must not be interpreted as entities, actors, or optimization targets.
    const tensionMap = new Map<string, number>();
    records.forEach(r => {
      tensionMap.set(r.sourceGoalId, (tensionMap.get(r.sourceGoalId) || 0) + r.tensionScore);
      tensionMap.set(r.targetGoalId, (tensionMap.get(r.targetGoalId) || 0) + r.tensionScore);
    });

    console.log('[High-Tension Clusters]');
    // Note: This is an observational output, no action is taken based on these clusters.
    Array.from(tensionMap.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by tension score descending
      .forEach(([goalId, score]) => {
        if (score >= 0.5) {
          console.log(` - ${goalId}: Aggregate Tension Score = ${score.toFixed(2)}`);
        }
      });
  }
}
