export type GoalStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'DORMANT' | 'ABANDONED' | 'CANCELLED' | 'INVALIDATED';

export interface IntentContract {
  assumptions: Record<string, any>;
  constraints: Record<string, any>;
}

export interface GoalInvalidation {
  type: string;
  field: string;
  expected: any;
  actual: any;
  timestamp: number;
}

export class IntentInvalidationError extends Error {
  constructor(public invalidation: GoalInvalidation) {
    super(`INTENT_INVALIDATED: ${invalidation.field} expected ${invalidation.expected} but got ${invalidation.actual}`);
    this.name = 'IntentInvalidationError';
  }
}

export interface GoalPrediction {
  expectedSuccessProbability: number;
  expectedIntentProgress: number;
  confidence: number;
}

export interface Goal {
  id: string;
  description: string;
  targetState: Record<string, any>;
  status: GoalStatus;
  priority: number;
  stabilityIndex: number;
  createdAt: number;
  intentId?: string;
  originCandidateCategory?: string;
  prediction?: GoalPrediction;
  intentContract?: IntentContract;
  invalidation?: GoalInvalidation;
}

export interface GoalProfile {
  goalId: string;
  parentGoalId?: string;
  intentType: string;
  priority: number;
  status: string;
  createdAt: number;
  executionCount: number;
  successRate: number;
  averageIntentProgress: number;
  lastUpdatedAt: number;
}

export type GoalRelationshipType =
  | 'SUPPORTS'
  | 'CONFLICTS_WITH'
  | 'DEPENDS_ON'
  | 'DUPLICATES'
  | 'UNKNOWN';

export type GoalRelationshipOrigin = 'HEURISTIC' | 'HISTORICAL' | 'MANUAL' | 'INFERRED';

export interface GoalRelationship {
  sourceGoalId: string;
  targetGoalId: string;
  relationshipType: GoalRelationshipType;
  confidence: number;
  evidenceIds: string[];
  relationshipOrigin: GoalRelationshipOrigin;
}

export interface GoalNode {
  goalId: string;
  profileId: string;
}

export interface GoalEdge {
  sourceGoalId: string;
  targetGoalId: string;
  relationshipType: GoalRelationshipType;
  confidence: number;
  evidenceIds: string[];
  relationshipOrigin: GoalRelationshipOrigin;
}

export interface GoalGraph {
  goals: GoalNode[];
  relationships: GoalEdge[];
  generatedAt: number;
}

export interface GoalTensionRecord {
  id: string;
  sourceGoalId: string;
  targetGoalId: string;
  tensionType: 'RESOURCE' | 'ATTENTION' | 'EXECUTION' | 'TEMPORAL';
  tensionScore: number;
  evidenceIds: string[];
  observedAt: number;
}

export interface GoalDriftRecord {
  id: string;
  driftType: 'STRUCTURAL' | 'RELATIONAL' | 'TENSION' | 'ATTENTION';
  driftProvenance: 'GRAPH_COMPARISON' | 'TENSION_COMPARISON' | 'ATTENTION_COMPARISON' | 'RELATIONSHIP_COMPARISON';
  targetId: string; // The subsystem, goal, or graph ID being measured
  baselineSnapshotId: string;
  currentSnapshotId: string;
  driftMagnitude: number;
  evidenceIds: string[];
  observedAt: number;
}

export interface GoalInterpretationRecord {
  id: string;
  interpretationType: 'CENTRALIZATION' | 'FRAGMENTATION' | 'TENSION_CONCENTRATION' | 'ATTENTION_REDISTRIBUTION' | 'RELATIONSHIP_REALIGNMENT';
  confidence: number;
  evidenceIds: string[];
  supportingDriftIds: string[];
  rationale: string;
  createdAt: number;
}
