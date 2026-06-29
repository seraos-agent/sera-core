export interface AttentionAllocation {
  id: string;
  epochId: string;
  focusedGoalId: string | null;
  deferredGoalIds: string[];
  dormantGoalIds: string[];
  timestamp: number;
}
