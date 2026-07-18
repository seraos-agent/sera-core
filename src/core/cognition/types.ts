import { CalibrationState } from '../execution/types';

export type RecommendationTarget = 'GOVERNANCE_POLICY' | 'CONSTITUTION_WEIGHTS' | 'HUMAN_REVIEW' | 'TREASURY_ALLOCATION';

export interface MetaCognitiveRecommendation {
  id: string;
  target: string; // the component to mutate, e.g. 'STRATEGY_BALANCED', 'GOVERNANCE_POLICY'
  targetContext: any;
  proposedAction: string; // description of what to do
  rationale: string;
  supportingBeliefIds: string[];

  // 1. Decision Layer (FORBIDDEN TO INFLUENCE VIA COMMUNICATION)
  confidence: number;
  evidenceCount: number;
  institutionalPrecedent?: {
    patternId: string;
    approvalRate: number;
    expectedErrorDeltaIfRejected: number;
    contradictoryObservations: number;
    patternStabilityScore: number;
  };
  
  // 2. Communication Layer (SAFE TO MODIFY)
  communicationState?: {
    presentationStrategy: 'STANDARD' | 'CAUTIONARY' | 'ASSERTIVE';
    rationaleFormatting: string;
    evidenceOrdering: 'PRO_FIRST' | 'CONTRA_FIRST' | 'BALANCED';
    uncertaintyDisclosureLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  };
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

export interface GovernanceOutcomeRecord {
  id: string;
  recommendationId: string;
  governanceDecisionId: string;
  /** Decision attribution is required to distinguish false positives from false negatives. */
  governanceDecision?: GovernanceDecision['decision'];

  baselineCalibrationState: CalibrationState;
  postDecisionCalibrationState: CalibrationState;

  baselinePredictionError: number;
  postDecisionPredictionError: number;

  outcomeAssessment: 'BENEFICIAL' | 'HARMFUL' | 'INCONCLUSIVE';

  evidenceWindowSize: number;
  confidence: number;
  timestamp: number;
}

export interface GovernancePattern {
  id: string;
  interventionType: string;
  contextSignature: string;
  context: {
    calibrationState?: string;
    [key: string]: any;
  };
  
  observations: number;
  approvalRate: number; 

  expectedCalibrationErrorDeltaWhenRejected: number;
  expectedCalibrationErrorDeltaWhenApproved: number;

  contradictoryObservations: number;
  patternStabilityScore: number;

  driftScore: number;
  confidence: number;
  lastObservedAt: number;
}

export type AdaptationScope = 'ADAPTIVE' | 'PROTECTED' | 'GOVERNANCE_ONLY';

export type SubsystemId =
  | 'MEMORY'
  | 'RUNTIME'
  | 'GOAL_ENGINE'
  | 'REFLECTION'
  | 'GOVERNANCE'
  | 'CALIBRATION'
  | 'COGNITION';

export interface AdaptationTarget {
  subsystem: SubsystemId;
  scope: AdaptationScope;
}

export interface AdaptationProposal {
  id: string;
  target: AdaptationTarget;
  proposedChange: string;
  rationale: string;
  supportingBeliefIds: string[];
  
  evidenceSnapshot: {
    patternIds: string[];
    calibrationStates: string[];
    observationCount: number;
  };
  
  proposalFingerprint: string;
  problemSignature: string;

  expectedBenefit: string;
  riskAssessment: string;
  confidence: number;
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'STALE_REQUIRES_REEVALUATION' | 'EXECUTED' | 'EXECUTION_FAILED';
  createdAt: number;
  expiresAt: number;
}

export interface MutationContext {
  subsystem: string;
  configKey: string;
  proposedValue: any;
  originalValue: any;
  proposalId: string;
}

export interface ExecutionTrace {
  id: string;
  proposalId: string;
  timestamp: number;
  status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  mutations: MutationContext[];
  error?: string;
}
