export interface StrategyProfile {
  id: string;
  name: 'AGGRESSIVE_EXPLORATION' | 'BALANCED' | 'RESOURCE_CONSERVATION';
  epochStart: number;
  epochEnd?: number;
  
  // Influences Planner
  planningConstraints: {
    maxStepsPerPlan: number;
    allowUntestedTools: boolean;
  };
  
  // Influences GoalEngine & Feedback & Planner Budget
  behavioralParameters: {
    riskTolerance: number; // 0.0 - 1.0
    costSensitivity: number; // 0.0 - 1.0
    budgetPacing: number; // max budget per plan
  };
}

export interface StrategyTransition {
  id: string;
  previousProfileId?: string;
  newProfileId: string;
  triggerReason: string;
  timestamp: number;
  metaEvaluationSnapshot: any; // snapshot of metrics at time of transition
}
