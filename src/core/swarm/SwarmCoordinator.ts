import { EventEmitter } from 'node:events';
import { EventTypes, StandardEvent, SwarmRunEventPayload, SwarmTaskEventPayload } from '../events/types';
import { ProposalGovernance } from '../intents/ProposalGovernance';
import { CandidatePlanStep, CandidateStrategy } from '../intents/types';
import {
  roleForStep,
  SwarmBlackboardEntry,
  SwarmRole,
  SwarmRunOptions,
  SwarmRunResult,
  SwarmTaskResult,
  SwarmTaskStatus,
  SwarmWorkerRegistry
} from './types';

/**
 * Runs only reviewable strategy steps in dependency-aware parallel batches.
 * It is deliberately isolated from capabilities and execution: a completed
 * swarm produces a review artifact, never a real-world action.
 */
export class SwarmCoordinator {
  constructor(
    private workers: SwarmWorkerRegistry,
    private governance: ProposalGovernance = new ProposalGovernance(),
    private eventBus?: EventEmitter
  ) {}

  public async run(strategy: CandidateStrategy, options: SwarmRunOptions = {}): Promise<SwarmRunResult> {
    const policyReasons = this.governance.evaluateStrategy(strategy);
    if (policyReasons.length > 0) {
      throw new Error(`Swarm strategy rejected by governance: ${policyReasons.join(' ')}`);
    }

    const runId = options.runId || `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const maxConcurrency = Math.max(1, Math.floor(options.maxConcurrency ?? 3));
    const states = new Map<string, SwarmTaskStatus>(strategy.steps.map(step => [step.id, 'PENDING']));
    const results = new Map<string, SwarmTaskResult>();
    const blackboard: SwarmBlackboardEntry[] = [];

    while (true) {
      this.blockTasksWithFailedDependencies(runId, strategy.steps, states, results);
      const ready = strategy.steps.filter(step =>
        states.get(step.id) === 'PENDING' && step.dependsOn.every(dependency => states.get(dependency) === 'COMPLETED')
      );
      if (ready.length === 0) break;

      for (let start = 0; start < ready.length; start += maxConcurrency) {
        const batch = ready.slice(start, start + maxConcurrency);
        await Promise.all(batch.map(step => this.runTask(runId, step, states, results, blackboard)));
      }
    }

    // A valid DAG must have made every remaining pending task ready. This is a
    // defensive terminal state in case a future caller bypasses governance.
    for (const step of strategy.steps) {
      if (states.get(step.id) === 'PENDING') {
        this.recordResult(runId, step.id, roleForStep(step.kind), 'BLOCKED', states, results, 'Unresolved dependency state.');
      }
    }

    const taskResults = strategy.steps.map(step => results.get(step.id) || {
      taskId: step.id,
      role: roleForStep(step.kind),
      status: states.get(step.id) || 'BLOCKED'
    });
    const completedTaskCount = taskResults.filter(task => task.status === 'COMPLETED').length;
    const failedTaskCount = taskResults.filter(task => task.status === 'FAILED').length;
    const blockedTaskCount = taskResults.filter(task => task.status === 'BLOCKED').length;
    const status = failedTaskCount === 0 && blockedTaskCount === 0 ? 'COMPLETED' : 'PARTIAL';

    this.emit(EventTypes.SWARM_RUN_COMPLETED, runId, {
      runId,
      status,
      completedTaskCount,
      failedTaskCount,
      blockedTaskCount,
      requiresHumanApproval: true
    } satisfies SwarmRunEventPayload);

    return {
      runId,
      strategy,
      status,
      tasks: taskResults,
      blackboard: [...blackboard],
      requiresHumanApproval: true
    };
  }

  private async runTask(
    runId: string,
    step: CandidatePlanStep,
    states: Map<string, SwarmTaskStatus>,
    results: Map<string, SwarmTaskResult>,
    blackboard: SwarmBlackboardEntry[]
  ): Promise<void> {
    const role = roleForStep(step.kind);
    const worker = this.workers[role];
    states.set(step.id, 'RUNNING');
    this.emit(EventTypes.SWARM_TASK_STARTED, runId, { runId, taskId: step.id, role, status: 'RUNNING' });

    if (!worker) {
      this.recordResult(runId, step.id, role, 'FAILED', states, results, `No ${role} worker is registered.`);
      return;
    }

    try {
      const value = await worker({
        runId,
        task: step,
        role,
        blackboard: this.blackboardSnapshot(blackboard)
      });
      blackboard.push({ taskId: step.id, role, value: structuredClone(value), createdAt: Date.now() });
      this.recordResult(runId, step.id, role, 'COMPLETED', states, results);
    } catch (error) {
      this.recordResult(
        runId,
        step.id,
        role,
        'FAILED',
        states,
        results,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private blockTasksWithFailedDependencies(
    runId: string,
    steps: CandidatePlanStep[],
    states: Map<string, SwarmTaskStatus>,
    results: Map<string, SwarmTaskResult>
  ): void {
    for (const step of steps) {
      if (states.get(step.id) !== 'PENDING') continue;
      if (step.dependsOn.some(dependency => ['FAILED', 'BLOCKED'].includes(states.get(dependency) || ''))) {
        this.recordResult(runId, step.id, roleForStep(step.kind), 'BLOCKED', states, results, 'A dependency did not complete.');
      }
    }
  }

  private recordResult(
    runId: string,
    taskId: string,
    role: SwarmRole,
    status: SwarmTaskStatus,
    states: Map<string, SwarmTaskStatus>,
    results: Map<string, SwarmTaskResult>,
    errorMessage?: string
  ): void {
    states.set(taskId, status);
    results.set(taskId, { taskId, role, status, ...(errorMessage ? { errorMessage } : {}) });
    const eventType = status === 'COMPLETED' ? EventTypes.SWARM_TASK_COMPLETED : EventTypes.SWARM_TASK_FAILED;
    this.emit(eventType, runId, { runId, taskId, role, status, ...(errorMessage ? { errorMessage } : {}) });
  }

  private blackboardSnapshot(blackboard: SwarmBlackboardEntry[]): readonly SwarmBlackboardEntry[] {
    return Object.freeze(blackboard.map(entry => Object.freeze({
      ...entry,
      value: structuredClone(entry.value)
    })));
  }

  private emit(type: string, runId: string, payload: SwarmTaskEventPayload | SwarmRunEventPayload): void {
    this.eventBus?.emit(type, {
      id: `evt-${runId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      source: 'SwarmCoordinator',
      correlationId: runId,
      timestamp: Date.now(),
      payload
    } as StandardEvent);
  }
}
