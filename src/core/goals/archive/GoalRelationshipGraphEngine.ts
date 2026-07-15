import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { GoalProfile, GoalRelationship, GoalGraph, GoalNode, GoalEdge } from './types';

export class GoalRelationshipGraphEngine {
  constructor(private memoryStore: IWorkingMemory) {}

  public buildGraph(profiles: GoalProfile[], relationships: GoalRelationship[]): GoalGraph {
    console.log('[GoalRelationshipGraphEngine] Assembling Goal Relationship Graph...');

    const nodes: GoalNode[] = profiles.map(p => ({
      goalId: p.goalId,
      profileId: p.goalId // Usually there'd be a distinct profile ID, simplified for demo
    }));

    const edges: GoalEdge[] = relationships.map(r => ({
      sourceGoalId: r.sourceGoalId,
      targetGoalId: r.targetGoalId,
      relationshipType: r.relationshipType,
      confidence: r.confidence,
      evidenceIds: r.evidenceIds,
      relationshipOrigin: r.relationshipOrigin
    }));

    const graph: GoalGraph = {
      goals: nodes,
      relationships: edges,
      generatedAt: Date.now()
    };

    // Calculate Observational Metrics
    this.computeMetrics(graph);

    // Save Graph Snapshot
    this.saveSnapshot(graph);

    return graph;
  }

  private computeMetrics(graph: GoalGraph) {
    console.log('\n--- Graph Observational Metrics ---');

    // 1. Degree Centrality
    const centralityMap = new Map<string, number>();
    graph.goals.forEach(n => centralityMap.set(n.goalId, 0));

    graph.relationships.forEach(edge => {
      centralityMap.set(edge.sourceGoalId, (centralityMap.get(edge.sourceGoalId) || 0) + 1);
      centralityMap.set(edge.targetGoalId, (centralityMap.get(edge.targetGoalId) || 0) + 1);
    });

    console.log('[Degree Centrality]');
    centralityMap.forEach((count, goalId) => {
      console.log(` - ${goalId}: ${count} connections`);
    });

    // 2. Orphan Goal Detection
    const orphans = Array.from(centralityMap.entries())
      .filter(([_, count]) => count === 0)
      .map(([goalId]) => goalId);

    console.log(`[Orphan Goals]: ${orphans.length > 0 ? orphans.join(', ') : 'None'}`);

    // 3. Conflict Density
    const conflictEdges = graph.relationships.filter(e => e.relationshipType === 'CONFLICTS_WITH');
    const density = graph.relationships.length > 0 
      ? (conflictEdges.length / graph.relationships.length) * 100 
      : 0;
    
    console.log(`[Conflict Density]: ${density.toFixed(2)}% (${conflictEdges.length}/${graph.relationships.length} edges)`);
  }

  private saveSnapshot(graph: GoalGraph) {
    this.memoryStore.storeBelief({
      id: `goal-graph-${graph.generatedAt}`,
      category: 'GOAL_GRAPH_RECORD',
      content: JSON.stringify(graph),
      epistemicStatus: 'CONFIRMED',
      confidence: 1.0,
      evidenceIds: [],
      contradictionIds: [],
      createdAt: graph.generatedAt,
      updatedAt: graph.generatedAt
    });
    console.log(`\n[GoalRelationshipGraphEngine] GoalGraph snapshot saved as GOAL_GRAPH_RECORD (Graph Temporal Neutrality Doctrine respected).`);
  }
}
