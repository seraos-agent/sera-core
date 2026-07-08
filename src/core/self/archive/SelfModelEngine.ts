import { MemoryStore } from '../../memory/MemoryStore';
import { SelfModelSnapshot } from './types';
import { GoalGraph, GoalTensionRecord, GoalDriftRecord, GoalInterpretationRecord } from '../goals/types';

export class SelfModelEngine {
  constructor(private memoryStore: MemoryStore) {}

  public generateSnapshot(
    graph: GoalGraph,
    tensions: GoalTensionRecord[],
    drifts: GoalDriftRecord[],
    interpretations: GoalInterpretationRecord[]
  ): void {
    console.log('[SelfModelEngine] Generating Cognitive Kernel Closure Snapshot...');

    // Self Snapshot Is Not Identity Doctrine:
    // This snapshot is an observation of self at time T. It is not a permanent identity.
    // It must not be interpreted as "I am X", but rather "At this moment, my state is X".
    
    const timestamp = Date.now();

    // Calculate aggregate metrics
    const activeGoalCount = graph.goals.length;
    
    // Find orphan goals (goals with no edges)
    const connectedGoalIds = new Set<string>();
    graph.relationships.forEach(edge => {
      connectedGoalIds.add(edge.sourceGoalId);
      connectedGoalIds.add(edge.targetGoalId);
    });
    const orphanGoalCount = graph.goals.filter(g => !connectedGoalIds.has(g.goalId)).length;

    // Dominant goals (from CENTRALIZATION interpretations)
    const dominantGoalIds = interpretations
      .filter(i => i.interpretationType === 'CENTRALIZATION')
      .map(i => {
        // Simple heuristic for demo: extract goal ID from rationale or evidence.
        // In reality, GoalInterpretationRecord should probably have a targetGoalId.
        // For now, we will mock it based on the rationale string or assume the caller handles it.
        const match = i.rationale.match(/Goal ([\w-]+)/);
        return match ? match[1] : 'unknown';
      });

    // Systemic Friction
    const nodeCount = graph.goals.length;
    const maxEdges = (nodeCount * (nodeCount - 1)) / 2;
    const globalTensionDensity = maxEdges > 0 ? (tensions.length / maxEdges) * 100 : 0;

    const snapshot: SelfModelSnapshot = {
      id: `self-snap-${timestamp}`,
      activeGoalCount,
      orphanGoalCount,
      dominantGoalIds,
      globalTensionDensity,
      recentDriftIds: drifts.map(d => d.id),
      activeInterpretationIds: interpretations.map(i => i.id),
      snapshotTimestamp: timestamp
    };

    // Save to Memory
    this.memoryStore.storeBelief({
      id: `belief-${snapshot.id}`,
      category: 'SELF_MODEL_SNAPSHOT',
      content: JSON.stringify(snapshot),
      epistemicStatus: 'CONFIRMED',
      confidence: 1.0,
      evidenceIds: [],
      contradictionIds: [],
      createdAt: timestamp,
      updatedAt: timestamp
    });

    console.log(`[SelfModelEngine] SelfModelSnapshot generated. Active Goals: ${activeGoalCount}, Tension Density: ${globalTensionDensity.toFixed(2)}%`);
  }
}
