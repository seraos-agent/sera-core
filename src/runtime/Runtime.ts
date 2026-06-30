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
import { MetaEvaluationEngine } from '../core/cognition/MetaEvaluationEngine';
import { GovernanceOutcomeTracker } from '../core/governance/GovernanceOutcomeTracker';
import { GovernanceReflectionEngine } from '../core/governance/GovernanceReflectionEngine';
import { GovernanceCalibrationEngine } from '../core/governance/GovernanceCalibrationEngine';
import { ReflectionScheduler } from '../core/reflection/ReflectionScheduler';
import { TemporalContext } from '../core/temporal/types';
import { AttentionEngine } from '../core/attention/AttentionEngine';
import { GoalEngine } from '../core/goals/GoalEngine';
import { Planner } from '../core/planner/Planner';
import { AdaptationPlanner } from '../core/cognition/AdaptationPlanner';
import { AdaptationExecutor } from '../core/cognition/AdaptationExecutor';
import { StrategyProfile } from '../core/strategy/types';
import { AdaptationProposal } from '../core/cognition/types';
import { StrategyStore } from '../core/strategy/StrategyStore';
import { StrategyEngine } from '../core/strategy/StrategyEngine';
import { Plan, PlanStep } from '../core/planner/types';
import { IntentEngine } from '../core/intents/IntentEngine';
import { ProposalStore } from '../core/intents/ProposalStore';
import { GoalSynthesizer } from '../core/intents/GoalSynthesizer';
import { IntentStore } from '../core/intents/IntentStore';
import { ProposalGovernance } from '../core/intents/ProposalGovernance';

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
  public intentStore?: IntentStore;
  public proposalStore?: ProposalStore;
  public goalSynthesizer?: GoalSynthesizer;
  public proposalGovernance?: ProposalGovernance;
  public proposalEvaluator?: any;
  public governanceOutcomeTracker?: GovernanceOutcomeTracker;
  public governanceReflectionEngine?: GovernanceReflectionEngine;
  public governanceCalibrationEngine?: GovernanceCalibrationEngine;
  public adaptationPlanner?: AdaptationPlanner;
  public adaptationExecutor?: AdaptationExecutor;

  private EVICTION_THRESHOLD = 20;
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
    goalSynthesizer?: GoalSynthesizer,
    proposalGovernance?: ProposalGovernance,
    proposalEvaluator?: any,
    governanceOutcomeTracker?: GovernanceOutcomeTracker,
    governanceReflectionEngine?: GovernanceReflectionEngine,
    governanceCalibrationEngine?: GovernanceCalibrationEngine,
    adaptationPlanner?: AdaptationPlanner,
    adaptationExecutor?: AdaptationExecutor
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
    this.proposalGovernance = proposalGovernance;
    this.proposalEvaluator = proposalEvaluator;
    this.governanceOutcomeTracker = governanceOutcomeTracker;
    this.governanceReflectionEngine = governanceReflectionEngine;
    this.governanceCalibrationEngine = governanceCalibrationEngine;
    this.adaptationPlanner = adaptationPlanner;
    this.adaptationExecutor = adaptationExecutor;
  }
  
  getWorldState() {
    return this.worldStateService.getState();
  }

  private governProposals(temporalContext: TemporalContext): void {
    if (!this.proposalStore) return;
    const staleProposals = this.proposalStore.getStaleProposals(temporalContext.physicalTime);
    
    for (const proposal of staleProposals) {
      console.log(`[Runtime] Proposal ${proposal.id} for Intent ${proposal.parentIntentId} has EXPIRED due to age.`);
      this.proposalStore.updateStatus(proposal.id, 'EXPIRED');
      
      if (this.feedbackPipeline) {
        this.feedbackPipeline.processProposalTrace({
          id: `ptrace-${Date.now()}`,
          proposalSnapshot: proposal,
          worldStateSnapshot: this.getWorldState(),
          outcome: 'EXPIRED',
          timestamp: temporalContext.physicalTime
        });
      }
    }
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
      
      this.governProposals(temporalContext);

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
          let proposal = this.goalSynthesizer.generateProposal(intent, gap, this.getWorldState());
          
          if (this.proposalEvaluator) {
            proposal = this.proposalEvaluator.evaluate(proposal);
          }

          if (this.proposalGovernance) {
            const govResult = this.proposalGovernance.evaluate(proposal);
            if (!govResult.valid) {
              console.log(`[ProposalPipeline] Proposal rejected by Governance:`, govResult.reasons);
              continue; // Do not register
            }
          }

          this.proposalStore.register(proposal);
          
          // Apply cooldown (e.g. 1 hour = 3600000ms. For demo, we use a mock value like 5000ms)
          intent.lastProposalAt = temporalContext.physicalTime;
          intent.proposalCooldownUntil = temporalContext.physicalTime + 5000;

          console.log(`\n[ProposalPipeline] *** NEW PROPOSAL GENERATED ***`);
          console.log(`Intent: ${intent.id}`);
          console.log(`Proposal ID: ${proposal.id}`);
          console.log(`Candidates:`);
          proposal.candidates.forEach((c: any, idx: number) => {
            console.log(`  ${idx + 1}. [${c.id}] ${c.title}`);
            if (c.evaluationVector) {
              console.log(`     Acceptance History: ${(c.evaluationVector.acceptanceProbability * 100).toFixed(0)}%`);
              console.log(`     Outcome Effectiveness: ${(c.evaluationVector.historicalOutcomeEffectiveness * 100).toFixed(0)}%`);
              console.log(`     [Align: ${c.evaluationVector.intentAlignment}, Quality: ${c.evaluationVector.outcomeQuality}, Div: ${c.evaluationVector.diversityContribution}]`);
            }
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
    
    if (this.metaEvaluationEngine) {
      this.metaEvaluationEngine.evaluate();
      const recommendations = this.metaEvaluationEngine.getRecommendations();

      if (recommendations.length > 0 && this.governanceCalibrationEngine) {
        this.governanceCalibrationEngine.calibrate(recommendations);
      }

      for (const rec of recommendations) {
        console.log(`[MetaCognition] Generated Recommendation: ${rec.proposedAction} (Confidence: ${rec.confidence})`);
      }
    }
    
    if (this.governanceOutcomeTracker) {
      this.governanceOutcomeTracker.evaluate();
    }

    if (this.governanceReflectionEngine) {
      this.governanceReflectionEngine.evaluate();
    }
    
    if (this.adaptationPlanner) {
      this.adaptationPlanner.removeExpiredProposals();
      // AdaptationPlanner would normally scan anomalies here to generate proposals.
      // Generation logic happens independently via evaluate loop.
    }
    
    // AdaptationExecutor would read approved proposals and execute them here.

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

    // Old meta evaluation logic was removed here. The new MetaEvaluationEngine is executed at the end of startAutonomousLoop.
    
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

    // Construct Prediction from Candidate Evaluation Vector
    const prediction = candidate.evaluationVector ? {
      expectedSuccessProbability: candidate.evaluationVector.historicalOutcomeEffectiveness,
      expectedIntentProgress: candidate.evaluationVector.historicalOutcomeEffectiveness, // proxy for now
      confidence: 0.8 // default confidence for now
    } : undefined;

    // Convert candidate to Goal (GoalFactory logic)
    const newGoalId = `goal-${Date.now()}`;
    this.goalEngine.registerGoal({
      id: newGoalId,
      intentId: proposal.parentIntentId,
      originCandidateCategory: candidate.category,
      description: candidate.title,
      targetState: candidate.strategyMetadata || {}, // Simplified mapping
      status: 'PENDING',
      priority: 0.8,
      stabilityIndex: 1.0,
      createdAt: Date.now(),
      prediction
    });

    this.proposalStore.updateStatus(proposalId, 'APPROVED', candidateId);
    console.log(`\n[Human] Approved Proposal ${proposalId}, selected candidate ${candidateId}.`);
    console.log(`[Runtime] Registered new tactical Goal: ${newGoalId}\n`);
    
    if (this.feedbackPipeline) {
      this.feedbackPipeline.processProposalTrace({
        id: `ptrace-${Date.now()}`,
        proposalSnapshot: proposal,
        worldStateSnapshot: this.getWorldState(),
        outcome: 'APPROVED',
        selectedCandidateId: candidateId,
        timestamp: Date.now()
      });
    }
  }

  public submitAdaptationProposal(proposal: AdaptationProposal): AdaptationProposal {
    console.log(`\n[Runtime] Received AdaptationProposal: ${proposal.id}`);
    console.log(`  -> Target Subsystem: ${proposal.target.subsystem}`);
    console.log(`  -> Scope: ${proposal.target.scope}`);
    
    if (proposal.target.scope === 'PROTECTED') {
      console.log(`[Runtime] FATAL: Adaptation targeting PROTECTED subsystem rejected by Runtime safeguard.`);
      proposal.status = 'REJECTED';
    } else if (proposal.target.scope === 'GOVERNANCE_ONLY') {
      console.log(`[Runtime] INFO: Adaptation requires explicit GOVERNANCE authorization.`);
      proposal.status = 'PENDING_REVIEW';
    } else {
      console.log(`[Runtime] INFO: Adaptation accepted for standard evaluation review.`);
      proposal.status = 'PENDING_REVIEW';
    }
    
    return proposal;
  }
}
