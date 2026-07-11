import { TemporalContext } from '../../core/temporal/types';
import { Plan, PlanStep } from '../../core/planner/types';
import { Goal } from '../../core/goals/types';
import { WorkItem } from '../../core/work-items/types';
import { ExecutionTrace } from '../../core/execution/types';
import { DelegationScope, AuthorityContext } from '../../delegation/types';
import { ConstitutionContext } from '../../constitution/types';

import { WorkerManager } from '../../workers/WorkerManager';
import { ConstitutionEngine } from '../../constitution/ConstitutionEngine';
import { AuthorityService } from '../../delegation/AuthorityService';
import { FeedbackPipeline } from '../../core/feedback/FeedbackPipeline';
import { ExecutionTraceStore } from '../../core/execution/ExecutionTraceStore';
import { Logger } from '../../core/logging/Logger';

export class ExecutionCoordinator {
  private logger = new Logger('ExecutionCoordinator');

  constructor(
    private workerManager: WorkerManager,
    private constitutionEngine: ConstitutionEngine,
    private authorityService: AuthorityService,
    private feedbackPipeline: FeedbackPipeline | undefined,
    private executionTraceStore: ExecutionTraceStore | undefined
  ) {}

  public async runCycle(
    goal: Goal,
    plan: Plan,
    scope: DelegationScope,
    temporalContext: TemporalContext,
    customMetadata?: any,
    spendingRequest?: any
  ): Promise<boolean> {
    this.logger.debug(`Running execution cycle for goal ${goal.id}`);
    
    let allSuccess = true;
    for (const step of plan.steps) {
      step.status = 'IN_PROGRESS';
      
      const workItem: WorkItem = {
        id: `wi-${temporalContext?.physicalTime || Date.now()}`,
        goalId: goal.id,
        planId: plan.id,
        planStepId: step.id,
        action: step.action,
        payload: step.payload,
        status: 'PENDING',
        createdAt: temporalContext?.physicalTime || Date.now()
      };
      
      const stepSuccess = await this.executeWorkItem(workItem, plan, step, goal, scope, temporalContext, customMetadata, spendingRequest);
      if (!stepSuccess) {
         step.status = 'FAILED';
         allSuccess = false;
         break;
      } else {
         step.status = 'COMPLETED';
      }
    }
    
    return allSuccess;
  }

  private async executeWorkItem(
    workItem: WorkItem, 
    plan: Plan,
    step: PlanStep,
    goal: Goal, 
    scope: DelegationScope, 
    temporalContext: TemporalContext,
    customMetadata?: any, 
    spendingRequest?: any
  ): Promise<boolean> {
    const trace: ExecutionTrace = {
      id: `trace-${temporalContext?.physicalTime || Date.now()}`,
      goalId: goal.id,
      planId: plan.id,
      planStepId: step.id,
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
      governanceContext: {
        delegationScopeId: scope.id
      },
      decisionSnapshots: [
        {
          stage: 'GOAL_PRIORITIZATION',
          decision: 'PROCEED',
          rationale: 'Goal selected based on priority and system coherence state.',
          timestamp: temporalContext?.physicalTime || Date.now()
        }
      ],
      createdAt: temporalContext?.physicalTime || Date.now()
    };

    // 2. Constitution Check
    const constitutionContext: ConstitutionContext = {
      principalId: scope.principalId,
      goalId: goal.id,
      workItemId: workItem.id,
      action: workItem.action,
      metadata: customMetadata
    };

    const constitutionDecision = this.constitutionEngine.evaluate(constitutionContext);
    trace.governanceContext!.constitution = {
      decision: constitutionDecision.status as any,
      triggeredRules: constitutionDecision.findings ? constitutionDecision.findings.map((f: any) => f.ruleId) : [],
      rationale: constitutionDecision.reason || 'All rules passed'
    };
    trace.decisionSnapshots.push({
      stage: 'CONSTITUTION_CHECK',
      decision: constitutionDecision.status,
      rationale: trace.governanceContext!.constitution.rationale,
      timestamp: temporalContext?.physicalTime || Date.now()
    });

    if (constitutionDecision.status === 'DENIED') {
      trace.finalOutcome = 'FAILED';
      this.logger.warn(`Constitution Check DENIED for work item ${workItem.id}`);
      this.finalizeCycle(trace, goal, workItem);
      return false;
    }

    // 3. Authority Check
    const authorityContext: AuthorityContext = {
      principalId: scope.principalId,
      goalId: goal.id,
      workItemId: workItem.id,
      action: workItem.action,
    };

    const authDecision = this.authorityService.evaluate(authorityContext, scope);
    trace.governanceContext!.authority = {
      scopeId: scope.id,
      decision: authDecision.status as any,
      rationale: authDecision.reason || 'Delegation scope grants necessary authority'
    };
    trace.decisionSnapshots.push({
      stage: 'AUTHORITY_CHECK',
      decision: authDecision.status,
      rationale: trace.governanceContext!.authority.rationale,
      timestamp: temporalContext?.physicalTime || Date.now()
    });

    if (authDecision.status === 'DENIED') {
      trace.finalOutcome = 'FAILED';
      this.logger.warn(`Authority Check DENIED for work item ${workItem.id}`);
      this.finalizeCycle(trace, goal, workItem);
      return false;
    }

    // 5. Worker Dispatch
    trace.workerAssignments.push('demo-worker'); 
    trace.toolCalls.push(workItem.payload?.toolId || 'mock-read-tool');
    trace.decisionSnapshots.push({
      stage: 'WORKER_SELECTION',
      decision: 'demo-worker',
      rationale: 'Static routing for demo',
      timestamp: temporalContext?.physicalTime || Date.now()
    });
    trace.decisionSnapshots.push({
      stage: 'TOOL_SELECTION',
      decision: trace.toolCalls[0],
      rationale: 'Required by targetState',
      timestamp: temporalContext?.physicalTime || Date.now()
    });

    const result = await this.workerManager.dispatch(workItem);
    
    // 6. Process WorkerResult
    if (result.status === 'SUCCESS') {
      workItem.status = 'COMPLETED';
      trace.finalOutcome = 'SUCCESS';
      trace.verificationResult = true; // Inferred from worker SUCCESS
      trace.decisionSnapshots.push({
        stage: 'VERIFICATION_STRATEGY',
        decision: 'SUCCESS',
        rationale: 'Worker executed and verified tool successfully',
        timestamp: temporalContext?.physicalTime || Date.now()
      });
    } else {
      workItem.status = 'FAILED';
      trace.finalOutcome = 'FAILED'; // Worker failed or verification failed
      trace.verificationResult = false; // ...but verification failed
      trace.decisionSnapshots.push({
        stage: 'VERIFICATION_STRATEGY',
        decision: 'FAILED',
        rationale: 'Verification rejected the tool output',
        timestamp: temporalContext?.physicalTime || Date.now()
      });
    }
    
    this.finalizeCycle(trace, goal, workItem);
    return trace.finalOutcome === 'SUCCESS' && trace.verificationResult;
  }

  private finalizeCycle(trace: ExecutionTrace, goal: Goal, workItem: WorkItem) {
    trace.completedAt = Date.now();
    
    trace.decisionSnapshots.push({
      stage: 'GOAL_RESOLUTION',
      decision: workItem.status,
      rationale: `Execution outcome: ${trace.finalOutcome}, Verification: ${trace.verificationResult}`,
      timestamp: Date.now()
    });

    if (this.executionTraceStore) {
      this.executionTraceStore.store(trace);
      this.logger.debug(`Stored ExecutionTrace: ${trace.id}`);
    }

    if (this.feedbackPipeline) {
      this.logger.debug(`Emitting ExecutionTrace: ${trace.id} to FeedbackPipeline.`);
      this.feedbackPipeline.processTrace(trace);
    }
  }
}
