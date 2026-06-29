export interface PlanStep {
  id: string;
  description: string;
  action: string;
  payload: any;
  status: 'PENDING' | 'IN_PROGRESS' | 'FAILED' | 'COMPLETED';
}

export interface Plan {
  id: string;
  goalId: string;
  status: 'PROPOSED' | 'APPROVED' | 'IN_PROGRESS' | 'FAILED' | 'COMPLETED';
  steps: PlanStep[];
  createdAt: number;
}
