import { CandidatePlanStep, CandidatePlanStepKind, CandidateStrategy } from '../intents/types';

export type SwarmRole = 'RESEARCHER' | 'PLANNER' | 'CRITIC' | 'SYNTHESIZER';
export type SwarmTaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'BLOCKED';

export interface SwarmBlackboardEntry {
  taskId: string;
  role: SwarmRole;
  value: unknown;
  createdAt: number;
}

export interface SwarmWorkerInput {
  runId: string;
  task: CandidatePlanStep;
  role: SwarmRole;
  /** Immutable snapshot. Workers cannot mutate shared state directly. */
  blackboard: readonly SwarmBlackboardEntry[];
}

export type SwarmWorker = (input: SwarmWorkerInput) => Promise<unknown> | unknown;

export interface SwarmWorkerRegistry {
  RESEARCHER?: SwarmWorker;
  PLANNER?: SwarmWorker;
  CRITIC?: SwarmWorker;
  SYNTHESIZER?: SwarmWorker;
}

export interface SwarmRunOptions {
  maxConcurrency?: number;
  runId?: string;
}

export interface SwarmTaskResult {
  taskId: string;
  role: SwarmRole;
  status: SwarmTaskStatus;
  errorMessage?: string;
}

export interface SwarmRunResult {
  runId: string;
  strategy: CandidateStrategy;
  status: 'COMPLETED' | 'PARTIAL';
  tasks: SwarmTaskResult[];
  blackboard: SwarmBlackboardEntry[];
  requiresHumanApproval: true;
}

export const roleForStep = (kind: CandidatePlanStepKind): SwarmRole => {
  switch (kind) {
    case 'OBSERVE': return 'RESEARCHER';
    case 'ANALYZE': return 'PLANNER';
    case 'COMPARE': return 'CRITIC';
    case 'PROPOSE': return 'SYNTHESIZER';
  }
};
