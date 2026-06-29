export type RecommendationTarget = 'GOVERNANCE_POLICY' | 'CONSTITUTION_WEIGHTS' | 'HUMAN_REVIEW' | 'TREASURY_ALLOCATION';

export interface MetaCognitiveRecommendation {
  id: string;
  target: RecommendationTarget;
  targetContext: string;
  proposedAction: string;
  rationale: string;
  supportingBeliefIds: string[];
  confidence: number;
  evidenceCount: number;
  status: 'PENDING_GOVERNANCE_REVIEW' | 'APPROVED' | 'REJECTED';
  createdAt: number;
}

export interface GovernanceDecision {
  id: string;
  recommendationId: string;
  decision: 'APPROVED' | 'REJECTED' | 'MODIFIED';
  rationale?: string;
  governanceContext?: {
    calibrationState?: string;
    evidenceCount?: number;
    recommendationConfidence?: number;
    [key: string]: any;
  };
  timestamp: number;
}
