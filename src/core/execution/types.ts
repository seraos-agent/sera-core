export interface GovernanceContext {
  delegationScopeId: string;
  constitution?: {
    decision: 'ALLOWED' | 'REQUIRES_CONFIRMATION' | 'DENIED' | 'BYPASSED';
    triggeredRules: string[];
    rationale: string;
  };
  authority?: {
    scopeId: string;
    decision: 'APPROVED' | 'DENIED' | 'BYPASSED';
    rationale: string;
  };
}

export interface DecisionSnapshot {
  stage: 'GOAL_PRIORITIZATION' | 'CONSTITUTION_CHECK' | 'AUTHORITY_CHECK' | 'TREASURY_CHECK' | 'WORKER_SELECTION' | 'TOOL_SELECTION' | 'VERIFICATION_STRATEGY' | 'GOAL_RESOLUTION' | 'GENERAL';
  decision: string;
  rationale: string;
  timestamp: number;
}

export interface ExecutionTrace {
  id: string;
  goalId: string;
  planId?: string;
  planStepId?: string;
  workerId?: string;
  intentSnapshot: any;
  plan: any; // Simplified for now
  workerAssignments: string[];
  toolCalls: string[];
  intermediateResults: any[];
  failures: any[];
  costTracking: number;
  finalOutcome: 'SUCCESS' | 'FAILED' | 'PENDING';
  verificationResult: boolean;
  settlementStatus: 'SETTLED' | 'RELEASED' | 'NONE';
  governanceContext?: GovernanceContext;
  decisionSnapshots: DecisionSnapshot[];
  createdAt: number;
  completedAt?: number;
}

export interface CategoryStats {
  observations: number;
  approvalRate: number;
  confidence: number;
  lastObservedAt: number;
  sampleSize: number;
  evidenceStrength: number;
}

export interface IntentRealizationPattern {
  intentType: string;
  worldContext: Record<string, any>;
  categoryStats: Record<string, CategoryStats>; // E.g., { 'ALIGNED': {...} }
}

export type OutcomeEvaluationWindow = 'IMMEDIATE' | 'SHORT_TERM' | 'LONG_TERM';

export type CalibrationState = 'OVERCONFIDENT' | 'UNDERCONFIDENT' | 'CALIBRATED' | 'UNCALIBRATED' | 'CALIBRATION_DRIFT';

export interface OutcomeCategoryStats {
  observations: number;
  goalSuccessRate: number;
  intentOutcomeScore: number;
  avgSuccessPredictionError: number;
  avgIntentPredictionError: number;
  recentSuccessErrors: number[];
  calibrationState: CalibrationState;
  confidence: number;
  lastObservedAt: number;
  sampleSize: number;
  evidenceStrength: number;
}

export interface OutcomeRealizationPattern {
  intentType: string;
  evaluationWindow: OutcomeEvaluationWindow;
  worldContext: Record<string, any>;
  categoryStats: Record<string, OutcomeCategoryStats>;
}

export interface ProposalTrace {
  id: string;
  proposalSnapshot: any; // Using any to avoid circular import with intents/types for now, or just import it. Let's use any for simplicity.
  worldStateSnapshot: any;
  outcome: 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';
  selectedCandidateId?: string;
  timestamp: number;
}
export * from './aios_types';
