export type GoalStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface Goal {
  id: string;
  description: string;
  targetState: Record<string, any>;
  status: GoalStatus;
  createdAt: number;
}
