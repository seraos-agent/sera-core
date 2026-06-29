export type IntentStatus = 'ALIVE' | 'SATISFIED' | 'REVOKED';
export type IntentTerminality = 'DISCRETE' | 'CONTINUOUS';

export interface Intent {
  id: string;
  description: string;
  status: IntentStatus;
  terminality: IntentTerminality;
  createdAt: number;
  lastProposalAt?: number;
  proposalCooldownUntil?: number;
}

export type GoalProposalStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';

export interface GoalCandidate {
  id: string;
  title: string;
  rationale: string;
  confidence: number;
  strategyMetadata?: Record<string, any>;
}

export interface GoalProposal {
  id: string;
  parentIntentId: string;
  candidates: GoalCandidate[];
  status: GoalProposalStatus;
  createdAt: number;
  selectedCandidateId?: string;
}

export interface RepresentationGap {
  intentId: string;
  reason: 'NO_ACTIVE_REPRESENTATION';
  detectedAt: number;
}

export interface IntentCoverage {
  intentId: string;
  activeGoals: number;
  blockedGoals: number;
  dormantGoals: number;
  represented: boolean;
}

export interface RepresentationAuditReport {
  timestamp: number;
  coverage: IntentCoverage[];
  gaps: RepresentationGap[];
}
