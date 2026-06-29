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
  treasury?: {
    allocationId: string;
    amount: number;
    decision: 'APPROVED' | 'DENIED';
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
