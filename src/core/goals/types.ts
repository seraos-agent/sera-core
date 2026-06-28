export type GoalStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface Goal {
  id: string;
  description: string;
  targetState: Record<string, any>;
  status: GoalStatus;
  priority: number;
  stabilityIndex: number;
  createdAt: number;
}
