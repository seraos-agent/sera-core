export interface ResponseContext {
  platform: string;
  channelId?: string;
  threadRef?: string;
  senderId?: string;
  [key: string]: any;
}

export enum ExecutionState {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  WAITING_CONDITION = 'WAITING_CONDITION',
  WAITING_APPROVAL = 'WAITING_APPROVAL',
  RETRYING = 'RETRYING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  ARCHIVED = 'ARCHIVED'
}

export class ExecutionCancellationToken {
  private _cancelled: boolean = false;

  constructor(public readonly id: string) {}

  public cancel(): void {
    this._cancelled = true;
  }

  public isCancelled(): boolean {
    return this._cancelled;
  }
}

export interface ExecutionContext {
  executionId: string;
  parentExecutionId?: string;
  origin: string; // e.g., 'slack', 'cron', 'api'
  conversationId?: string;
  goalId?: string;
  planId?: string;
  proposalId?: string;
  authorityId?: string;
  priority: number; // Integer scale (1000 = Critical, 500 = Normal)
  deadline?: number;
  cancellationToken?: ExecutionCancellationToken;
  responseContext?: ResponseContext;
  createdAt: number;
}

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

export interface TimeoutPolicy {
  timeoutMs: number;
}

export interface ExecutionPolicy {
  id: string; // e.g., 'WalletPolicy-v3'
  retry: RetryPolicy;
  timeout: TimeoutPolicy;
}

export interface ExecutionTask {
  readonly taskId: string;
  readonly context: ExecutionContext;
  readonly policySnapshot: ExecutionPolicy; // Immutable snapshot
  readonly checkpointId?: string;
}

export interface ExecutionInstance {
  readonly task: ExecutionTask;
  state: ExecutionState;
  retryCount: number;
  lastRetryAt?: number;
  nextRetryAt?: number;
  startedAt?: number;
  completedAt?: number;
  workerId?: string;
}

export type ExecutionEventType = 
  | 'system.execution.started'
  | 'system.execution.progress'
  | 'system.execution.paused'
  | 'system.execution.resumed'
  | 'system.execution.completed'
  | 'system.execution.failed'
  | 'system.execution.cancelled'
  | 'system.execution.timeout_detected';

export interface ExecutionEvent {
  type: ExecutionEventType;
  taskId: string;
  timestamp: number;
  payload?: any;
}

export class ExecutionStateMachine {
  private static readonly VALID_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
    [ExecutionState.QUEUED]: [ExecutionState.RUNNING, ExecutionState.CANCELLED],
    [ExecutionState.RUNNING]: [
      ExecutionState.COMPLETED, 
      ExecutionState.FAILED, 
      ExecutionState.WAITING_CONDITION, 
      ExecutionState.WAITING_APPROVAL,
      ExecutionState.CANCELLED,
      ExecutionState.PAUSED // Added for paused state
    ],
    [ExecutionState.PAUSED]: [ExecutionState.RUNNING, ExecutionState.CANCELLED],
    [ExecutionState.WAITING_CONDITION]: [ExecutionState.RUNNING, ExecutionState.CANCELLED],
    [ExecutionState.WAITING_APPROVAL]: [ExecutionState.RUNNING, ExecutionState.CANCELLED, ExecutionState.FAILED],
    [ExecutionState.RETRYING]: [ExecutionState.RUNNING, ExecutionState.CANCELLED, ExecutionState.FAILED],
    [ExecutionState.COMPLETED]: [ExecutionState.ARCHIVED],
    [ExecutionState.FAILED]: [ExecutionState.RETRYING, ExecutionState.ARCHIVED],
    [ExecutionState.CANCELLED]: [ExecutionState.ARCHIVED],
    [ExecutionState.ARCHIVED]: []
  };

  public static canTransition(from: ExecutionState, to: ExecutionState): boolean {
    const allowed = this.VALID_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }
}
