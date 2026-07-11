import { TemporalContext } from '../../core/temporal/types';
import { Plan, PlanStep } from '../../core/planner/types';
import { Goal } from '../../core/goals/types';
import { WorkItem } from '../../core/work-items/types';
import { ExecutionTrace } from '../../core/execution/types';
import { DelegationScope, AuthorityContext } from '../../delegation/types';
import { ConstitutionContext } from '../../constitution/types';


import { ConstitutionEngine } from '../../constitution/ConstitutionEngine';
import { AuthorityService } from '../../delegation/AuthorityService';
import { FeedbackPipeline } from '../../core/feedback/FeedbackPipeline';
import { ExecutionTraceStore } from '../../core/execution/ExecutionTraceStore';
import { Logger } from '../../core/logging/Logger';
import { MemoryStore } from '../../memory/MemoryStore';
import { ExecutionScheduler } from './ExecutionScheduler';
import { ExecutionTask, ExecutionContext, ExecutionState, ExecutionPolicy } from '../../core/execution/aios_types';
import { CheckpointStore } from '../../core/execution/CheckpointStore';
import { WorkerPool } from '../../core/execution/workers/WorkerPool';
import { ExecutionSupervisor } from '../../core/execution/ExecutionSupervisor';
import { CapabilityExecutor } from '../../core/execution/workers/CapabilityExecutor';
import { ExecutionWorker } from '../../core/execution/workers/ExecutionWorker';
import { EventEmitter } from 'events';

export class ExecutionCoordinator {
  private logger = new Logger('ExecutionCoordinator');
  private scheduler: ExecutionScheduler;
  private checkpointStore: CheckpointStore;
  private workerPool: WorkerPool;
  private supervisor: ExecutionSupervisor;
  private eventBus: EventEmitter;

  constructor(
    private constitutionEngine: ConstitutionEngine,
    private authorityService: AuthorityService,
    private feedbackPipeline: FeedbackPipeline | undefined,
    private executionTraceStore: ExecutionTraceStore | undefined,
    private memoryStore: MemoryStore,
    eventBus?: EventEmitter
  ) {
    this.eventBus = eventBus || new EventEmitter();
    this.workerPool = new WorkerPool();
    this.scheduler = new ExecutionScheduler(this.workerPool, this.eventBus);
    this.checkpointStore = new CheckpointStore();
    this.supervisor = new ExecutionSupervisor(this.eventBus, this.workerPool, this.scheduler.getActiveInstances());
    
    // Register Default Worker
    const capExecutor = new CapabilityExecutor(this.eventBus, this.checkpointStore);
    const defaultWorker = new ExecutionWorker('worker-default-1', capExecutor);
    this.workerPool.registerWorker(defaultWorker);

    this.supervisor.start();
  }

  public async submitTask(
    goal: Goal,
    plan: Plan,
    scope: DelegationScope,
    executionContext: ExecutionContext
  ): Promise<void> {
    this.logger.debug(`Submitting task for goal ${goal.id} to ExecutionScheduler`);
    
    const trace = this.createTrace(goal, plan, scope);
    const temporalContext: TemporalContext = { physicalTime: Date.now(), cognitiveCycleId: 0 };
    
    // 1. Governance Pre-Check before Execution
    let allChecksPassed = true;
    for (const step of plan.steps) {
      const workItem: WorkItem = {
        id: `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        goalId: goal.id,
        planId: plan.id,
        planStepId: step.id,
        action: step.action,
        payload: step.payload,
        status: 'PENDING',
        createdAt: Date.now()
      };

      // Constitution Check
      const constitutionContext: ConstitutionContext = {
        principalId: scope.principalId,
        goalId: goal.id,
        workItemId: workItem.id,
        action: workItem.action,
        metadata: {}
      };
      
      const constitutionDecision = this.constitutionEngine.evaluate(constitutionContext);
      if (constitutionDecision.status === 'DENIED') {
        this.logger.warn(`Constitution Check DENIED for work item ${workItem.id}`);
        allChecksPassed = false;
        break;
      }

      // Authority Check
      const authorityContext: AuthorityContext = {
        principalId: scope.principalId,
        goalId: goal.id,
        workItemId: workItem.id,
        action: workItem.action,
      };

      const authDecision = this.authorityService.evaluate(authorityContext, scope);
      if (authDecision.status === 'DENIED') {
        this.logger.warn(`Authority Check DENIED for work item ${workItem.id}`);
        allChecksPassed = false;
        break;
      }
    }

    if (!allChecksPassed) {
      this.logger.error(`Task for goal ${goal.id} rejected by Governance. Task will not be scheduled.`);
      // Emit failure back up...
      return;
    }

    // 2. Create a Checkpoint for the payload
    const checkpointId = `chkpt-${Date.now()}`;
    await this.checkpointStore.save(checkpointId, { plan, scope });

    // 3. Define Immutable Policy Snapshot
    const policySnapshot: ExecutionPolicy = {
      id: 'DefaultPolicy-v1',
      retry: { maxRetries: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 10000 },
      timeout: { timeoutMs: 30000 }
    };

    // 4. Create Immutable Task Definition
    const task: ExecutionTask = {
      taskId: `task-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      context: executionContext,
      policySnapshot,
      checkpointId
    };

    // 5. Submit to Scheduler
    this.scheduler.submitTask(task);
  }

  private createTrace(goal: Goal, plan: Plan, scope: DelegationScope): ExecutionTrace {
    return {
      id: `trace-${Date.now()}`,
      goalId: goal.id,
      planId: plan.id,
      intentSnapshot: { ...goal },
      plan: { ...plan }, 
      workerAssignments: [],
      toolCalls: [],
      intermediateResults: [],
      failures: [],
      costTracking: 0,
      finalOutcome: 'PENDING',
      verificationResult: false,
      settlementStatus: 'NONE',
      createdAt: Date.now(),
      decisionSnapshots: []
    };
  }

  public getEventBus(): EventEmitter {
    return this.eventBus;
  }
}
