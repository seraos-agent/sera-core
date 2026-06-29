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

export interface Goal {
  id: string;
  description: string;
  targetState: Record<string, any>;
  status: GoalStatus;
  priority: number;
  stabilityIndex: number;
  createdAt: number;
  intentId?: string;
  intentContract?: IntentContract;
  invalidation?: GoalInvalidation;
}
