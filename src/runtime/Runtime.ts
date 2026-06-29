import { WorkerManager } from '../workers/WorkerManager';
import { WorkItem } from '../core/work-items/types';
import { WorldStateService } from '../core/world-state/WorldStateService';
import { Goal } from '../core/goals/types';
import { MemoryStore } from '../memory/MemoryStore';
import { AuthorityService } from '../delegation/AuthorityService';
import { AuthorityContext, DelegationScope } from '../delegation/types';
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
import { TemporalContext } from '../core/temporal/types';
import { AttentionEngine } from '../core/attention/AttentionEngine';
import { GoalEngine } from '../core/goals/GoalEngine';
import { Planner } from '../core/planner/Planner';
import { StrategyStore } from '../core/strategy/StrategyStore';
import { StrategyEngine } from '../core/strategy/StrategyEngine';
import { Plan, PlanStep } from '../core/planner/types';
import { IntentEngine } from '../core/intents/IntentEngine';
import { ProposalStore } from '../core/intents/ProposalStore';
import { GoalSynthesizer } from '../core/intents/GoalSynthesizer';
import { IntentStore } from '../core/intents/IntentStore';

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
  
  private planner?: Planner;
  private strategyStore?: StrategyStore;
  private strategyEngine?: StrategyEngine;
  private attentionEngine?: AttentionEngine;
  private goalEngine?: GoalEngine;
  private intentEngine?: IntentEngine;
  private intentStore?: IntentStore;
  private proposalStore?: ProposalStore;
  private goalSynthesizer?: GoalSynthesizer;
  
  private cognitiveCycleCount = 0;
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
    reflectionScheduler?: ReflectionScheduler,
    planner?: Planner,
    strategyStore?: StrategyStore,
    strategyEngine?: StrategyEngine,
    attentionEngine?: AttentionEngine,
    goalEngine?: GoalEngine,
    intentEngine?: IntentEngine,
    intentStore?: IntentStore,
    proposalStore?: ProposalStore,
    goalSynthesizer?: GoalSynthesizer
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
    this.planner = planner;
    this.strategyStore = strategyStore;
    this.strategyEngine = strategyEngine;
    this.attentionEngine = attentionEngine;
    this.goalEngine = goalEngine;
    this.intentEngine = intentEngine;
    this.intentStore = intentStore;
    this.proposalStore = proposalStore;
    this.goalSynthesizer = goalSynthesizer;
  }
  
  getWorldState() {
    return this.worldStateService.getState();
  }
  
  getMemory() {
    return this.memoryStore.getHistory();
  }

  async startAutonomousLoop(maxCycles: number = 10, scope?: DelegationScope): Promise<void> {
    if (!this.attentionEngine || !this.goalEngine) {
      throw new Error("AttentionEngine and GoalEngine are required for autonomous mode.");
    }

    console.log(`\n[Runtime] Starting Autonomous Main Loop (Max Cycles: ${maxCycles})`);
    
    for (let i = 0; i < maxCycles; i++) {
      console.log(`\n--- Autonomous Cycle ${i + 1}/${maxCycles} ---`);
      
      this.cognitiveCycleCount++;
      const temporalContext: TemporalContext = {
        physicalTime: Date.now(),
        cognitiveCycleId: this.cognitiveCycleCount
      };

      const auditReport = this.intentEngine ? this.intentEngine.auditRepresentations(temporalContext) : null;
      
      // Phase 4.1: Proposal Pipeline
      if (auditReport && this.intentStore && this.proposalStore && this.goalSynthesizer) {
        for (const gap of auditReport.gaps) {
          const intent = this.intentStore.getIntent(gap.intentId);
          if (!intent) continue;

          // Check cooldown
          if (intent.proposalCooldownUntil && intent.proposalCooldownUntil > temporalContext.physicalTime) {
            console.log(`[ProposalPipeline] Intent ${intent.id} gap ignored (Cooldown active).`);
            continue;
          }

          // Check for existing pending proposal
          const pending = this.proposalStore.getActiveProposalForIntent(intent.id);
          if (pending) {
            console.log(`[ProposalPipeline] Intent ${intent.id} already has a PENDING_REVIEW proposal.`);
            continue;
          }

          // Generate new proposal
          const proposal = this.goalSynthesizer.generateProposal(intent, gap, this.getWorldState());
          this.proposalStore.register(proposal);
          
          // Apply cooldown (e.g. 1 hour = 3600000ms. For demo, we use a mock value like 5000ms)
          intent.lastProposalAt = temporalContext.physicalTime;
          intent.proposalCooldownUntil = temporalContext.physicalTime + 5000;

          console.log(`\n[ProposalPipeline] *** NEW PROPOSAL GENERATED ***`);
          console.log(`Intent: ${intent.id}`);
          console.log(`Proposal ID: ${proposal.id}`);
          console.log(`Candidates:`);
          proposal.candidates.forEach((c: any, idx: number) => {
            console.log(`  ${idx + 1}. [${c.id}] ${c.title} (Confidence: ${c.confidence})`);
            console.log(`     Rationale: ${c.rationale}`);
          });
          console.log(`Awaiting Human Review.\n`);
        }
      }

      const allocation = this.attentionEngine.allocate(temporalContext);
      
      if (!allocation.focusedGoalId) {
        console.log(`[Runtime] No focused goal. System sleeping...`);
        continue;
      }
      
      const goalToProcess = this.goalEngine.getGoal(allocation.focusedGoalId);
      if (!goalToProcess) {
        console.error(`[Runtime] Focused goal ${allocation.focusedGoalId} not found in GoalEngine!`);
        continue;
      }

      console.log(`[Runtime] Autonomous Loop executing Goal: ${goalToProcess.id}`);
      this.goalEngine.updateStatus(goalToProcess.id, 'IN_PROGRESS');
      
      try {
        const success = await this.processGoal(goalToProcess, scope || {
          id: 'auto-scope',
          principalId: 'system',
          allowedPermissions: [{ action: '*' }],
          requiresApprovalPermissions: []
        }, undefined, undefined, undefined, temporalContext);
        
        if (success) {
          this.goalEngine.updateStatus(goalToProcess.id, 'COMPLETED');
        } else {
          if (goalToProcess.status === 'IN_PROGRESS') {
             this.goalEngine.updateStatus(goalToProcess.id, 'FAILED', 'Runtime execution failed');
          }
        }
      } catch (err: any) {
        if (err.name === 'IntentInvalidationError') {
           this.goalEngine.invalidate(goalToProcess.id, err.invalidation);
        } else if (err.message && err.message.includes('STRATEGY-ENFORCED')) {
           this.goalEngine.updateStatus(goalToProcess.id, 'ABANDONED', err.message);
        } else {
           this.goalEngine.updateStatus(goalToProcess.id, 'FAILED', err.message);
        }
      }
    }
    
    console.log(`\n[Runtime] Autonomous Main Loop Terminated.`);
  }

  async processGoal(goal: Goal, scope: DelegationScope, customAction?: string, customMetadata?: any, spendingRequest?: SpendingRequest, temporalContext?: TemporalContext): Promise<boolean> {
    console.log(`\n[Runtime] Processing Goal: ${goal.id} - ${goal.description}`);
    
    if (this.coherenceMonitor) {
      const state = this.coherenceMonitor.getState();
      if (state.autonomyLevel === 'RESTRICTED') {
        console.log(`[Runtime] System is RESTRICTED due to low coherence. Applying strict policies.`);
      }
    }

    if (!this.planner || !this.strategyStore) {
      console.log(`[Runtime] Error: Planner or StrategyStore is not injected.`);
      return false;
    }

    const activeProfile = this.strategyStore.getActiveProfile();
    const plan = this.planner.generatePlan(goal, this.worldStateService.getState(), this.memoryStore.getAllBeliefs(), activeProfile, temporalContext);
    
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
    temporalContext?: TemporalContext,
    customMetadata?: any, 
    spendingRequest?: SpendingRequest
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
      this.finalizeCycle(trace, goal, workItem);
      return false;
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
        timestamp: temporalContext?.physicalTime || Date.now()
      });

      if (!budgetValid) {
        trace.finalOutcome = 'FAILED';
        this.finalizeCycle(trace, goal, workItem);
        return false;
      }

      const paymentAuthDecision = this.paymentAuthorityService.evaluate(spendingRequest);
      trace.governanceContext!.treasury.decision = paymentAuthDecision.status === 'DENIED' ? 'DENIED' : 'APPROVED';
      trace.governanceContext!.treasury.rationale = paymentAuthDecision.reason || 'Payment authorized';
      
      trace.decisionSnapshots.push({
        stage: 'TREASURY_CHECK',
        decision: paymentAuthDecision.status,
        rationale: trace.governanceContext!.treasury.rationale,
        timestamp: temporalContext?.physicalTime || Date.now()
      });

      if (paymentAuthDecision.status === 'DENIED') {
        trace.finalOutcome = 'FAILED';
        this.finalizeCycle(trace, goal, workItem);
        return false;
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
        timestamp: temporalContext?.physicalTime || Date.now()
      });

      if (isPayment) {
        this.treasuryService.release(spendingRequest!);
        trace.settlementStatus = 'RELEASED';
      }
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
        // Automatic Cognition Loop Closure
        const report = this.metaEvaluationEngine.evaluate();
        console.log('\n[Automatic MetaEvaluationReport] Generated:');
        console.log(`  Trends: ${report.trends.toUpperCase()}`);
        console.log(`  LES: ${report.metrics.LES.toFixed(2)} | GEI: ${report.metrics.GEI.toFixed(2)} | AAS: ${report.metrics.AAS.toFixed(2)} | BSI: ${report.metrics.BSI.toFixed(2)} | SDS: ${report.metrics.SDS.toFixed(2)}`);
        
        const history = this.metaEvaluationEngine.getHistory();
        if (this.strategyEngine && history) {
          // Passing temporalContext here would require passing it through finalizeCycle,
          // Since finalizeCycle happens at the end, we can use a fresh one or pass it down.
          // For simplicity, we just use the current time for evaluateEpoch.
          this.strategyEngine.evaluateEpoch(history, { physicalTime: Date.now(), cognitiveCycleId: this.cognitiveCycleCount });
        }
      }
    }
    
    if (this.reflectionScheduler) {
      this.reflectionScheduler.tick();
    }
  }

  // Phase 4.1: Human Approval Pipeline
  approveProposal(proposalId: string, candidateId: string): void {
    if (!this.proposalStore || !this.goalEngine || !this.intentStore) return;

    const proposal = this.proposalStore.getProposal(proposalId);
    if (!proposal) {
      console.log(`[Runtime] Proposal ${proposalId} not found.`);
      return;
    }
    
    if (proposal.status !== 'PENDING_REVIEW') {
      console.log(`[Runtime] Proposal ${proposalId} is already ${proposal.status}.`);
      return;
    }

    const candidate = proposal.candidates.find(c => c.id === candidateId);
    if (!candidate) {
      console.log(`[Runtime] Candidate ${candidateId} not found in Proposal ${proposalId}.`);
      return;
    }

    // Convert candidate to Goal (GoalFactory logic)
    const newGoalId = `goal-${Date.now()}`;
    this.goalEngine.registerGoal({
      id: newGoalId,
      intentId: proposal.parentIntentId,
      description: candidate.title,
      targetState: candidate.strategyMetadata || {}, // Simplified mapping
      status: 'PENDING',
      priority: 0.8,
      stabilityIndex: 1.0,
      createdAt: Date.now()
    });

    this.proposalStore.updateStatus(proposalId, 'APPROVED', candidateId);
    console.log(`\n[Human] Approved Proposal ${proposalId}, selected candidate ${candidateId}.`);
    console.log(`[Runtime] Registered new tactical Goal: ${newGoalId}\n`);
  }
}
