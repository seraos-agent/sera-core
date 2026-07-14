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
import { IMemoryStore } from '../../core/memory/IMemoryStore';
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
    private memoryStore: IMemoryStore,
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

    // 3. Define Immutable Policy Snapshot (Merging with Adaptive Policies)
    let policySnapshot: ExecutionPolicy = {
      id: 'DefaultPolicy-v1',
      retry: { maxRetries: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 10000 },
      timeout: { timeoutMs: 30000 }
    };

    // Find tools used in this plan to check for policy adaptations
    const toolsUsed = plan.steps.map(s => s.payload?.toolId).filter(Boolean);
    
    for (const tool of toolsUsed) {
      const adaptations = this.memoryStore.getBeliefsByCategory('EXECUTION_POLICY_ADAPTATION');
      const adaptation = adaptations.find(b => b.key === `adaptation:${tool}`);
      if (adaptation) {
        try {
          const parsed = JSON.parse(adaptation.content);
          if (parsed.policy) {
            this.logger.info(`Applying Adaptive Execution Policy for tool ${tool} (Reason: ${parsed.reason})`);
            
            policySnapshot = {
              ...policySnapshot,
              id: `AdaptivePolicy-${tool}-${Date.now()}`,
              retry: { ...policySnapshot.retry, ...parsed.policy.retry },
              timeout: { ...policySnapshot.timeout, ...parsed.policy.timeout }
            };
          }
        } catch (e) {
          this.logger.warn(`Failed to parse adaptation for ${tool}: ${e}`);
        }
      }
    }

    // 4. Create Immutable Task Definition
    const task: ExecutionTask = {
      taskId: `task-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      context: executionContext,
      policySnapshot,
      checkpointId
    };

    // 5. Create Trace and Store it
    const trace = this.createTrace(goal, plan, scope, task.taskId);
    if (this.executionTraceStore) {
      this.executionTraceStore.store(trace);
    }

    // 6. Submit to Scheduler
    this.scheduler.submitTask(task);
  }

  private createTrace(goal: Goal, plan: Plan, scope: DelegationScope, taskId: string): ExecutionTrace {
    return {
      id: `trace-${Date.now()}`,
      taskId,
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
      timeline: [],
      decisionSnapshots: []
    };
  }

  public getEventBus(): EventEmitter {
    return this.eventBus;
  }

  public stop(): void {
    this.supervisor.stop();
  }
}
