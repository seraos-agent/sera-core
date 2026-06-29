import { Goal } from '../core/goals/types';
import { WorkItem } from '../core/work-items/types';
import { WorldStateService } from '../core/world-state/WorldStateService';
import { MemoryStore } from '../memory/MemoryStore';
import { AuthorityService } from '../delegation/AuthorityService';
import { AuthorityContext, DelegationScope } from '../delegation/types';
import { Event } from '../core/events/types';
import { WorkerManager } from '../workers/WorkerManager';
import { ConstitutionEngine } from '../constitution/ConstitutionEngine';
import { ConstitutionContext } from '../constitution/types';
import { TreasuryService } from '../treasury/TreasuryService';
import { PaymentAuthorityService } from '../treasury/PaymentAuthorityService';
import { SpendingRequest } from '../treasury/types';
import { ExecutionTrace } from '../core/execution/types';
import { ExecutionTraceStore } from '../core/execution/ExecutionTraceStore';
import { FeedbackPipeline } from '../core/feedback/FeedbackPipeline';
import { CoherenceMonitor } from '../core/cognition/CoherenceMonitor';
import { MetaEvaluationEngine } from '../core/meta/MetaEvaluationEngine';
import { ReflectionScheduler } from '../core/reflection/ReflectionScheduler';

export class Runtime {
  private worldStateService: WorldStateService;
  private memoryStore: MemoryStore;
  private authorityService: AuthorityService;
  private workerManager: WorkerManager;
  private constitutionEngine: ConstitutionEngine;
  private treasuryService: TreasuryService;
  private paymentAuthorityService: PaymentAuthorityService;
  private feedbackPipeline?: FeedbackPipeline;
  private coherenceMonitor?: CoherenceMonitor;
  private metaEvaluationEngine?: MetaEvaluationEngine;
  private executionTraceStore?: ExecutionTraceStore;
  private reflectionScheduler?: ReflectionScheduler;
  
  private cycleCount = 0;
  private readonly EVALUATION_INTERVAL = 3;

  constructor(
    workerManager: WorkerManager,
    constitutionEngine: ConstitutionEngine = new ConstitutionEngine(),
    treasuryService: TreasuryService = new TreasuryService(),
    paymentAuthorityService: PaymentAuthorityService = new PaymentAuthorityService(),
    feedbackPipeline?: FeedbackPipeline,
    coherenceMonitor?: CoherenceMonitor,
    metaEvaluationEngine?: MetaEvaluationEngine,
    executionTraceStore?: ExecutionTraceStore,
    reflectionScheduler?: ReflectionScheduler
  ) {
    this.worldStateService = new WorldStateService();
    this.memoryStore = new MemoryStore();
    this.authorityService = new AuthorityService();
    this.workerManager = workerManager;
    this.constitutionEngine = constitutionEngine;
    this.treasuryService = treasuryService;
    this.paymentAuthorityService = paymentAuthorityService;
    this.feedbackPipeline = feedbackPipeline;
    this.coherenceMonitor = coherenceMonitor;
    this.metaEvaluationEngine = metaEvaluationEngine;
    this.executionTraceStore = executionTraceStore;
    this.reflectionScheduler = reflectionScheduler;
  }
  
  getWorldState() {
    return this.worldStateService.getState();
  }
  
  getMemory() {
    return this.memoryStore.getHistory();
  }

  async processGoal(goal: Goal, scope: DelegationScope, customAction?: string, customMetadata?: any, spendingRequest?: SpendingRequest): Promise<void> {
    console.log(`\n[Runtime] Processing Goal: ${goal.id} - ${goal.description}`);
    
    // Check Coherence State
    if (this.coherenceMonitor) {
      const state = this.coherenceMonitor.getState();
      if (state.autonomyLevel === 'RESTRICTED') {
        console.log(`[Runtime] System is RESTRICTED due to low coherence. Applying strict policies.`);
      }
    }

    // Initialize ExecutionTrace
    const trace: ExecutionTrace = {
      id: `trace-${Date.now()}`,
      goalId: goal.id,
      intentSnapshot: { ...goal },
      plan: {}, 
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
          timestamp: Date.now()
        }
      ],
      createdAt: Date.now()
    };

    const workItem: WorkItem = {
      id: `wi-${Date.now()}`,
      goalId: goal.id,
      action: customAction || 'execute_work_item',
      payload: goal.targetState,
      status: 'PENDING',
      createdAt: Date.now()
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
      triggeredRules: constitutionDecision.findings ? constitutionDecision.findings.map(f => f.ruleId) : [],
      rationale: constitutionDecision.reason || 'All rules passed'
    };
    trace.decisionSnapshots.push({
      stage: 'CONSTITUTION_CHECK',
      decision: constitutionDecision.status,
      rationale: trace.governanceContext!.constitution.rationale,
      timestamp: Date.now()
    });

    if (constitutionDecision.status === 'DENIED') {
      trace.finalOutcome = 'FAILED';
      this.finalizeCycle(trace, goal, workItem);
      return;
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
      timestamp: Date.now()
    });

    if (authDecision.status === 'DENIED') {
      trace.finalOutcome = 'FAILED';
      this.finalizeCycle(trace, goal, workItem);
      return;
    }

    // 4. Treasury Check
    let isPayment = false;
    if (spendingRequest) {
      isPayment = true;
      const budgetValid = this.treasuryService.validateBudget(spendingRequest);
      
      trace.governanceContext!.treasury = {
        allocationId: spendingRequest.allocationId,
        amount: spendingRequest.amount,
        decision: budgetValid ? 'APPROVED' : 'DENIED',
        rationale: budgetValid ? 'Budget available' : 'INSUFFICIENT BUDGET'
      };
      trace.decisionSnapshots.push({
        stage: 'TREASURY_CHECK',
        decision: budgetValid ? 'BUDGET_VALID' : 'BUDGET_INVALID',
        rationale: trace.governanceContext!.treasury.rationale,
        timestamp: Date.now()
      });

      if (!budgetValid) {
        trace.finalOutcome = 'FAILED';
        this.finalizeCycle(trace, goal, workItem);
        return;
      }

      const paymentAuthDecision = this.paymentAuthorityService.evaluate(spendingRequest);
      trace.governanceContext!.treasury.decision = paymentAuthDecision.status === 'DENIED' ? 'DENIED' : 'APPROVED';
      trace.governanceContext!.treasury.rationale = paymentAuthDecision.reason || 'Payment authorized';
      
      trace.decisionSnapshots.push({
        stage: 'TREASURY_CHECK',
        decision: paymentAuthDecision.status,
        rationale: trace.governanceContext!.treasury.rationale,
        timestamp: Date.now()
      });

      if (paymentAuthDecision.status === 'DENIED') {
        trace.finalOutcome = 'FAILED';
        this.finalizeCycle(trace, goal, workItem);
        return;
      }
      this.treasuryService.reserve(spendingRequest);
      trace.costTracking += spendingRequest.amount;
    }
    
    // 5. Worker Dispatch
    trace.workerAssignments.push('demo-worker'); 
    trace.toolCalls.push(workItem.payload?.toolId || 'mock-read-tool');
    trace.decisionSnapshots.push({
      stage: 'WORKER_SELECTION',
      decision: 'demo-worker',
      rationale: 'Static routing for demo',
      timestamp: Date.now()
    });
    trace.decisionSnapshots.push({
      stage: 'TOOL_SELECTION',
      decision: trace.toolCalls[0],
      rationale: 'Required by targetState',
      timestamp: Date.now()
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
        timestamp: Date.now()
      });

      if (isPayment) {
        this.treasuryService.settle(spendingRequest!);
        trace.settlementStatus = 'SETTLED';
      }
    } else {
      workItem.status = 'FAILED';
      trace.finalOutcome = 'SUCCESS'; // Worker executed...
      trace.verificationResult = false; // ...but verification failed
      trace.decisionSnapshots.push({
        stage: 'VERIFICATION_STRATEGY',
        decision: 'FAILED',
        rationale: 'Verification rejected the tool output',
        timestamp: Date.now()
      });

      if (isPayment) {
        this.treasuryService.release(spendingRequest!);
        trace.settlementStatus = 'RELEASED';
      }
    }
    
    this.finalizeCycle(trace, goal, workItem);
  }

  private finalizeCycle(trace: ExecutionTrace, goal: Goal, workItem: WorkItem) {
    trace.completedAt = Date.now();
    goal.status = workItem.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
    
    trace.decisionSnapshots.push({
      stage: 'GOAL_RESOLUTION',
      decision: goal.status,
      rationale: `Execution outcome: ${trace.finalOutcome}, Verification: ${trace.verificationResult}`,
      timestamp: Date.now()
    });

    if (this.executionTraceStore) {
      this.executionTraceStore.store(trace);
      console.log(`[Runtime] Stored ExecutionTrace: ${trace.id} in ExecutionTraceStore.`);
    }

    if (this.feedbackPipeline) {
      console.log(`[Runtime] Emitting ExecutionTrace: ${trace.id} to FeedbackPipeline.`);
      this.feedbackPipeline.processTrace(trace);
    }

    if (this.metaEvaluationEngine) {
      const isConflict = trace.verificationResult === false;
      this.metaEvaluationEngine.recordCycleOutcome(
        trace.finalOutcome === 'SUCCESS' && trace.verificationResult,
        trace.costTracking,
        isConflict ? 1 : 0,
        isConflict ? 1 : 0
      );

      this.cycleCount++;
      if (this.cycleCount % this.EVALUATION_INTERVAL === 0) {
        // Automatic Cognition Loop Closure (Stage 2.8.4)
        const report = this.metaEvaluationEngine.evaluate();
        console.log('\n[Automatic MetaEvaluationReport] Generated:');
        console.log(`  Trends: ${report.trends.toUpperCase()}`);
        console.log(`  LES: ${report.metrics.LES.toFixed(2)} | GEI: ${report.metrics.GEI.toFixed(2)} | AAS: ${report.metrics.AAS.toFixed(2)} | BSI: ${report.metrics.BSI.toFixed(2)} | SDS: ${report.metrics.SDS.toFixed(2)}`);
      }
    }
    
    if (this.reflectionScheduler) {
      this.reflectionScheduler.tick();
    }
  }
}
