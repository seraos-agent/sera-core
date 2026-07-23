import { TemporalContext } from '../../core/temporal/types';
import { EventTypes } from '../../core/events/types';
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
import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { ExecutionScheduler } from './ExecutionScheduler';
import { ExecutionTask, ExecutionContext, ExecutionState, ExecutionPolicy } from '../../core/execution/aios_types';
import { CheckpointStore } from '../../core/execution/CheckpointStore';
import { WorkerPool } from '../../core/execution/workers/WorkerPool';
import { ExecutionSupervisor } from '../../core/execution/ExecutionSupervisor';
import { CapabilityExecutor } from '../../core/execution/workers/CapabilityExecutor';
import { ExecutionWorker } from '../../core/execution/workers/ExecutionWorker';
import { EventEmitter } from 'events';

import { CapabilityCatalog } from '../../core/capabilities/CapabilityCatalog';
import { WorkerCapabilityRegistry } from '../../core/work-classification/WorkerCapabilityRegistry';

export class ExecutionCoordinator {
  private logger = new Logger('ExecutionCoordinator');
  private scheduler: ExecutionScheduler;
  private checkpointStore: CheckpointStore;
  private workerPool: WorkerPool;
  private supervisor: ExecutionSupervisor;
  private eventBus: EventEmitter;
  private pendingApprovalTasks: Map<string, { task: ExecutionTask, trace: ExecutionTrace }> = new Map();

  private capabilityCatalog?: CapabilityCatalog;
  private readonly workerRegistry = new WorkerCapabilityRegistry();

  constructor(
    private constitutionEngine: ConstitutionEngine,
    private authorityService: AuthorityService,
    private feedbackPipeline: any | undefined,
    private executionTraceStore: any | undefined,
    private memoryStore: IWorkingMemory,
    eventBus?: EventEmitter,
    persistLocally: boolean = true
  ) {
    this.eventBus = eventBus || new EventEmitter();
    this.workerPool = new WorkerPool();
    this.scheduler = new ExecutionScheduler(this.workerPool, this.eventBus);
    this.checkpointStore = new CheckpointStore({ persistLocally });
    this.supervisor = new ExecutionSupervisor(this.eventBus, this.workerPool, this.scheduler.getActiveInstances());
    
    // Register Default Worker
    const capExecutor = new CapabilityExecutor(this.eventBus, this.checkpointStore);
    const defaultWorker = new ExecutionWorker('worker-default-1', capExecutor);
    this.workerPool.registerWorker(defaultWorker);
    this.workerRegistry.register({ id: 'execution-operational', lane: 'TOOL_EXECUTION', supportedWorkClasses: ['OPERATIONAL'] });
    this.workerRegistry.register({ id: 'execution-governed', lane: 'GOVERNED_EXECUTION', supportedWorkClasses: ['HIGH_RISK'] });

    this.supervisor.start();
  }

  public setCapabilityCatalog(catalog: CapabilityCatalog): void {
    this.capabilityCatalog = catalog;
  }

  public async submitTask(
    goal: Goal,
    plan: Plan,
    scope: DelegationScope,
    executionContext: ExecutionContext
  ): Promise<void> {
    this.logger.debug(`Submitting task for goal ${goal.id} to ExecutionScheduler`);
    const workClass = executionContext.workClass || 'OPERATIONAL';
    if (workClass === 'COMPLEX') {
      throw new Error('WORK-CLASS-BLOCKED: COMPLEX work must use the proposal/swarm review lane, not CapabilityExecutor.');
    }
    if (workClass === 'INSTANT_UI' || workClass === 'CONVERSATION') {
      throw new Error(`WORK-CLASS-BLOCKED: ${workClass} work has no capability execution lane.`);
    }
    const workerLane = workClass === 'HIGH_RISK' ? 'GOVERNED_EXECUTION' : 'TOOL_EXECUTION';
    const worker = this.workerRegistry.require(workClass, workerLane);
    this.eventBus.emit(EventTypes.WORK_CLASSIFIED, { workClass, lane: worker.lane, workerId: worker.id });
    this.eventBus.emit(EventTypes.WORKER_LANE_SELECTED, { workClass, lane: worker.lane, workerId: worker.id });
    

    const temporalContext: TemporalContext = { physicalTime: Date.now(), cognitiveCycleId: 0 };
    
    // 1. Governance Pre-Check before Execution
    let allChecksPassed = true;
    let requiresApproval = workClass === 'HIGH_RISK' && scope.autonomyMode !== 'FULL_ACCESS';
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

      // Check metadata from CapabilityCatalog
      let irreversible = false;
      let unsafe = false;
      
      if (this.capabilityCatalog) {
        const tool = this.capabilityCatalog.getTool(workItem.action);
        if (tool) {
          irreversible = tool.irreversible === true;
          unsafe = tool.unsafe === true;
        }
      }

      // Constitution Check
      const constitutionContext: ConstitutionContext = {
        principalId: scope.principalId,
        goalId: goal.id,
        workItemId: workItem.id,
        action: workItem.action,
        metadata: {
          irreversible,
          unsafe
        }
      };
      
      const constitutionDecision = this.constitutionEngine.evaluate(constitutionContext);
      if (constitutionDecision.status === 'DENIED') {
        this.logger.warn(`Constitution Check DENIED for work item ${workItem.id}`);
        this.eventBus.emit(EventTypes.SECURITY_BLOCKED_ACTION, {
          reason: 'CONSTITUTION_DENIED',
          goalId: goal.id,
          workItemId: workItem.id,
          action: workItem.action,
          timestamp: Date.now()
        });
        allChecksPassed = false;
        break;
      } else if (constitutionDecision.status === 'REQUIRES_CONFIRMATION' && scope.autonomyMode !== 'FULL_ACCESS') {
        this.logger.info(`Constitution check requires confirmation for: ${workItem.action}`);
        requiresApproval = true;
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
        this.eventBus.emit(EventTypes.SECURITY_BLOCKED_ACTION, {
          reason: 'AUTHORITY_DENIED',
          goalId: goal.id,
          workItemId: workItem.id,
          action: workItem.action,
          timestamp: Date.now()
        });
        allChecksPassed = false;
        break;
      } else if (authDecision.status === 'REQUIRES_APPROVAL') {
        this.logger.info(`Action requires approval: ${workItem.action}`);
        requiresApproval = true;
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
      context: { ...executionContext, workClass },
      policySnapshot,
      checkpointId
    };

    // 5. Create Trace and Store it
    const trace = this.createTrace(goal, plan, scope, task.taskId);
    if (this.executionTraceStore) {
      this.executionTraceStore.store(trace);
    }

    // 6. Handle Approval Requirement or Submit
    if (requiresApproval) {
      this.pendingApprovalTasks.set(task.taskId, { task, trace });
      this.logger.info(`Task ${task.taskId} for goal ${goal.id} is WAITING_APPROVAL`);
      this.eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
        id: `evt-speak-${Date.now()}`,
        type: EventTypes.DIALOGUE_AGENT_SPEAK,
        source: 'ExecutionCoordinator',
        timestamp: Date.now(),
        payload: {
          text: `I have prepared an execution proposal that requires manual approval (e.g. transfer funds).\n\nPlease review and click "Approve" on the proposal card to proceed.`
        }
      });

      this.eventBus.emit(EventTypes.GOAL_REQUIRES_APPROVAL, {
        taskId: task.taskId,
        goalId: goal.id,
        planId: plan.id,
        actions: plan.steps.map(s => s.action),
        timestamp: Date.now()
      });
    } else {
      try {
        this.scheduler.submitTask(task);
      } catch (err: any) {
        this.logger.error(`Failed to submit task ${task.taskId}: ${err.message}`);
        this.eventBus.emit(EventTypes.DOMAIN_GOAL_RESULT, {
          id: `evt-goal-fail-${Date.now()}`,
          type: EventTypes.DOMAIN_GOAL_RESULT,
          source: 'ExecutionCoordinator',
          timestamp: Date.now(),
          payload: {
            goalId: goal.id,
            success: false,
            errorMessage: err.message || 'Execution blocked by policy.'
          }
        });
      }
    }
  }

  public approveTask(taskId: string): boolean {
    const pending = this.pendingApprovalTasks.get(taskId);
    if (!pending) return false;
    
    this.logger.info(`Task ${taskId} APPROVED. Submitting to scheduler.`);
    this.pendingApprovalTasks.delete(taskId);
    
    try {
      this.scheduler.submitTask(pending.task);
    } catch (err: any) {
      this.logger.error(`Failed to submit approved task ${taskId}: ${err.message}`);
      this.eventBus.emit(EventTypes.DOMAIN_GOAL_RESULT, {
        id: `evt-goal-fail-${Date.now()}`,
        type: EventTypes.DOMAIN_GOAL_RESULT,
        source: 'ExecutionCoordinator',
        timestamp: Date.now(),
        payload: {
          goalId: pending.task.context.goalId,
          success: false,
          errorMessage: err.message || 'Execution blocked by policy.'
        }
      });
    }
    return true;
  }

  public rejectTask(taskId: string): boolean {
    const pending = this.pendingApprovalTasks.get(taskId);
    if (!pending) return false;
    
    this.logger.warn(`Task ${taskId} REJECTED by human in the loop.`);
    this.pendingApprovalTasks.delete(taskId);
    // You could emit a failure event here if needed
    return true;
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

