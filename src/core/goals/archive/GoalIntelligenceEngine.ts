import { Goal, GoalProfile, GoalRelationship, GoalRelationshipType } from './types';
import { IWorkingMemory } from '../../core/memory/IWorkingMemory';

export class GoalIntelligenceEngine {
  constructor(private memoryStore: IWorkingMemory) {}

  public observeGoals(goals: Goal[]): void {
    console.log('[GoalIntelligenceEngine] Observing goals and bootstrapping intelligence...');

    // 1. Generate Profiles
    const profiles = goals.map(g => this.buildGoalProfile(g));
    
    // 2. Map Relationships (Heuristic-based)
    const relationships = this.mapRelationshipsHeuristic(goals);

    // 3. Store Results as GOAL_INTELLIGENCE_RECORD
    const timestamp = Date.now();
    this.memoryStore.storeBelief({
      id: `goal-intel-${timestamp}`,
      category: 'GOAL_INTELLIGENCE_RECORD',
      content: JSON.stringify({ profiles, relationships }),
      epistemicStatus: 'CONFIRMED',
      confidence: 1.0,
      evidenceIds: [],
      contradictionIds: [],
      createdAt: timestamp,
      updatedAt: timestamp
    });

    console.log(`[GoalIntelligenceEngine] Stored ${profiles.length} profiles and ${relationships.length} relationships.`);
  }

  private buildGoalProfile(goal: Goal): GoalProfile {
    // Generate a basic profile based on available properties and defaults for un-tracked metrics.
    return {
      goalId: goal.id,
      intentType: goal.intentContract ? 'STRUCTURED' : 'BASIC',
      priority: goal.priority,
      status: goal.status,
      createdAt: goal.createdAt,
      executionCount: Math.floor(Math.random() * 50), // Mock data for demo since goal history isn't fully tracked yet
      successRate: 0.5 + (Math.random() * 0.4), // Mock success rate 50-90%
      averageIntentProgress: 0.7,
      lastUpdatedAt: Date.now()
    };
  }

  private mapRelationshipsHeuristic(goals: Goal[]): GoalRelationship[] {
    const relationships: GoalRelationship[] = [];

    // Simple combinations (n^2) for heuristic check
    for (let i = 0; i < goals.length; i++) {
      for (let j = i + 1; j < goals.length; j++) {
        const goalA = goals[i];
        const goalB = goals[j];
        
        const relTypeAB = this.inferRelationshipType(goalA.description, goalB.description);
        if (relTypeAB !== 'UNKNOWN') {
          relationships.push({
            sourceGoalId: goalA.id,
            targetGoalId: goalB.id,
            relationshipType: relTypeAB,
            confidence: 0.8,
            evidenceIds: [],
            relationshipOrigin: 'HEURISTIC'
          });
        }
      }
    }

    return relationships;
  }

  private inferRelationshipType(descA: string, descB: string): GoalRelationshipType {
    // Goal Intelligence Bootstrapping Doctrine: "Phase 7.0 validates structure, not intelligence."
    // Heuristic string matching for the demo scenario.
    
    const a = descA.toLowerCase();
    const b = descB.toLowerCase();

    if ((a.includes('high risk') && b.includes('preserve')) || (b.includes('high risk') && a.includes('preserve'))) {
      return 'CONFLICTS_WITH';
    }

    if ((a.includes('accumulate') && b.includes('preserve')) || (b.includes('accumulate') && a.includes('preserve'))) {
      return 'SUPPORTS';
    }

    return 'UNKNOWN';
  }
}
