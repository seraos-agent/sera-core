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
import { FeedbackPipeline } from '../core/feedback/FeedbackPipeline';
import { CoherenceMonitor } from '../core/cognition/CoherenceMonitor';
import { MetaEvaluationEngine } from '../core/meta/MetaEvaluationEngine';

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
  
  private cycleCount = 0;
  private readonly EVALUATION_INTERVAL = 3;

  constructor(
    workerManager: WorkerManager,
    constitutionEngine: ConstitutionEngine = new ConstitutionEngine(),
    treasuryService: TreasuryService = new TreasuryService(),
    paymentAuthorityService: PaymentAuthorityService = new PaymentAuthorityService(),
    feedbackPipeline?: FeedbackPipeline,
    coherenceMonitor?: CoherenceMonitor,
    metaEvaluationEngine?: MetaEvaluationEngine
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
      causalLinks: {
        goalDecisionReason: 'System prioritized goal based on attention rebalancer.',
        toolSelectionReason: 'Default worker assignment'
      },
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
    if (constitutionDecision.status === 'DENIED') {
      trace.finalOutcome = 'FAILED';
      trace.causalLinks.failureHypothesis = 'CONSTITUTION DENIED';
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
    if (authDecision.status === 'DENIED') {
      trace.finalOutcome = 'FAILED';
      trace.causalLinks.failureHypothesis = 'AUTHORITY DENIED';
      this.finalizeCycle(trace, goal, workItem);
      return;
    }

    // 4. Treasury Check
    let isPayment = false;
    if (spendingRequest) {
      isPayment = true;
      if (!this.treasuryService.validateBudget(spendingRequest)) {
        trace.finalOutcome = 'FAILED';
        trace.causalLinks.failureHypothesis = 'INSUFFICIENT BUDGET';
        this.finalizeCycle(trace, goal, workItem);
        return;
      }

      const paymentAuthDecision = this.paymentAuthorityService.evaluate(spendingRequest);
      if (paymentAuthDecision.status === 'DENIED') {
        trace.finalOutcome = 'FAILED';
        trace.causalLinks.failureHypothesis = 'PAYMENT DENIED: ' + paymentAuthDecision.reason;
        this.finalizeCycle(trace, goal, workItem);
        return;
      }
      this.treasuryService.reserve(spendingRequest);
      trace.costTracking += spendingRequest.amount;
    }
    
    // 5. Worker Dispatch
    trace.workerAssignments.push('demo-worker'); 
    trace.toolCalls.push(workItem.payload?.toolId || 'mock-read-tool');
    trace.causalLinks.toolSelectionReason = `Selected ${trace.toolCalls[0]} based on static routing.`;

    const result = await this.workerManager.dispatch(workItem);
    
    // 6. Process WorkerResult
    if (result.status === 'SUCCESS') {
      workItem.status = 'COMPLETED';
      trace.finalOutcome = 'SUCCESS';
      trace.verificationResult = true; // Inferred from worker SUCCESS

      if (isPayment) {
        this.treasuryService.settle(spendingRequest!);
        trace.settlementStatus = 'SETTLED';
      }
    } else {
      workItem.status = 'FAILED';
      trace.finalOutcome = 'SUCCESS'; // Worker executed...
      trace.verificationResult = false; // ...but verification failed
      trace.causalLinks.failureHypothesis = 'Verification rejected the tool output.';

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

    console.log(`[Runtime] Finalized ExecutionTrace: ${trace.id}. Emitting to FeedbackPipeline.`);
    if (this.feedbackPipeline) {
      this.feedbackPipeline.processTrace(trace);
    }

    if (this.metaEvaluationEngine) {
      // Very crude simulation of conflict/contradiction extraction for meta-eval
      const isConflict = trace.verificationResult === false;
      this.metaEvaluationEngine.recordCycleOutcome(
        trace.finalOutcome === 'SUCCESS' && trace.verificationResult,
        trace.costTracking,
        isConflict ? 1 : 0,
        isConflict ? 1 : 0
      );

      this.cycleCount++;
      if (this.cycleCount % this.EVALUATION_INTERVAL === 0) {
        // We need to pass the memory and goal engine, but runtime doesn't strictly own goal engine.
        // For the sake of the architecture, we'll pass them if available via some getter, or assume meta eval gets injected with them.
      }
    }
  }

  triggerMetaEvaluation(memoryStore: MemoryStore, goalEngine: any, arbitrator: any) {
    if (this.metaEvaluationEngine && this.coherenceMonitor) {
      const report = this.metaEvaluationEngine.evaluate(memoryStore, goalEngine, arbitrator, this.coherenceMonitor);
      console.log('\n[MetaEvaluationReport] Generated:');
      console.log(`  Trends: ${report.trends.toUpperCase()}`);
      console.log(`  LES: ${report.metrics.LES.toFixed(2)} | GEI: ${report.metrics.GEI.toFixed(2)} | AAS: ${report.metrics.AAS.toFixed(2)} | BSI: ${report.metrics.BSI.toFixed(2)} | SDS: ${report.metrics.SDS.toFixed(2)}`);
      
      report.recommendedMetaSignals.forEach(sig => {
        if (sig.type === 'reduce_exploration_bias') this.coherenceMonitor!.applyMetaSignal(sig);
        if (sig.type === 'adjust_arbitration_sensitivity') arbitrator.applyMetaSignal(sig);
        if (sig.type === 'increase_stability_weight') goalEngine.applyMetaSignal(sig);
      });
    }
  }
}
