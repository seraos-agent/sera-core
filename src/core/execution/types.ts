export interface ExecutionTrace {
  id: string;
  goalId: string;
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
  causalLinks: {
    goalDecisionReason: string;
    toolSelectionReason: string;
    failureHypothesis?: string;
  };
  createdAt: number;
  completedAt?: number;
}
