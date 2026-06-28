export type WorkItemStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface WorkItem {
  id: string;
  goalId: string;
  action: string;
  payload: Record<string, any>;
  status: WorkItemStatus;
  createdAt: number;
}
