import { EventEmitter } from 'events';

import { WorkItem } from '../core/work-items/types';
import { WorldStateService } from '../core/world-state/WorldStateService';
import { Goal } from '../core/goals/types';
import { IWorkingMemory } from '../core/memory/IWorkingMemory';
import { WorkingMemory } from '../memory/WorkingMemory';
import { AuthorityService } from '../delegation/AuthorityService';
import { AuthorityContext, DelegationScope } from '../delegation/types';
import { ConstitutionEngine } from '../constitution/ConstitutionEngine';
import { ConstitutionContext } from '../constitution/types';

import { StandardEvent, EventTypes, TriggerFiredPayload } from '../core/events/types';
import { ExecutionTrace } from '../core/execution/types';
import { ExecutionTraceStore } from '../core/execution/ExecutionTraceStore';
import { FeedbackPipeline } from '../core/feedback/FeedbackPipeline';
import { CoherenceMonitor } from '../core/cognition/CoherenceMonitor';
import { CalibrationEvaluationEngine } from '../core/cognition/CalibrationEvaluationEngine';
import { GovernanceOutcomeTracker } from '../core/governance/GovernanceOutcomeTracker';
import { ExecutionReflectionEngine } from '../core/reflection/ExecutionReflectionEngine';
import { GovernanceReflectionEngine } from '../core/governance/GovernanceReflectionEngine';
import { GovernanceCalibrationEngine } from '../core/governance/GovernanceCalibrationEngine';
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
import { ExecutionDispatcher } from './ExecutionDispatcher';
import { DialogueEngine } from '../capabilities/dialogue/DialogueEngine';
import { ModelRegistry } from '../core/llm/ModelRegistry';
import { CapabilityRoutingPolicy } from '../core/llm/CapabilityRoutingPolicy';
import { ModelOrchestrator } from '../core/llm/ModelOrchestrator';
import { QwenAdapter } from '../capabilities/llm/QwenAdapter';
import { CapabilityCatalog } from '../core/capabilities/CapabilityCatalog';
import { WalletToolCapability } from '../capabilities/wallet/WalletToolCapability';
import { CommunicationToolCapability } from '../capabilities/communication/CommunicationToolCapability';
import { ProposalManager } from '../core/governance/ProposalManager';
import { Logger } from '../core/logging/Logger';
import { McpClientAdapter } from '../capabilities/mcp/client/McpClientAdapter';

import { CognitiveCoordinator } from './coordinators/CognitiveCoordinator';
import { IntentCoordinator } from './coordinators/IntentCoordinator';
import { ExecutionCoordinator } from './coordinators/ExecutionCoordinator';

export class Runtime {
  public worldStateService!: WorldStateService;
  public capabilityCatalog!: CapabilityCatalog;
  public dialogueEngine!: DialogueEngine;
  public proposalManager!: ProposalManager;
  public memoryStore: IWorkingMemory;
  public chatHistoryStore: any;
  private authorityService: AuthorityService;
  private constitutionEngine: ConstitutionEngine;
  private feedbackPipeline?: FeedbackPipeline;
  private coherenceMonitor?: CoherenceMonitor;
  private calibrationEvaluationEngine?: CalibrationEvaluationEngine;
  private executionTraceStore?: ExecutionTraceStore;
  private eventBus?: EventEmitter;
  private executionDispatcher?: ExecutionDispatcher;
  
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
  private adaptationPlanner: AdaptationPlanner | undefined;
  private adaptationExecutor: AdaptationExecutor | undefined;
  private executionReflectionEngine: ExecutionReflectionEngine | undefined;

  // Coordinators
  private cognitiveCoordinator: CognitiveCoordinator;
  private intentCoordinator: IntentCoordinator;
  public executionCoordinator: ExecutionCoordinator;

  private logger = new Logger('Runtime');

  private EVICTION_THRESHOLD = 20;
  private cognitiveCycleCount = 0;
  private cycleCount = 0;
  private readonly EVALUATION_INTERVAL = 3;

  constructor(
    constitutionEngine: ConstitutionEngine = new ConstitutionEngine(),
    feedbackPipeline?: FeedbackPipeline,
    coherenceMonitor?: CoherenceMonitor,
    calibrationEvaluationEngine?: CalibrationEvaluationEngine,
    executionTraceStore?: ExecutionTraceStore,
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
    adaptationExecutor?: AdaptationExecutor,
    eventBus?: EventEmitter,
    dispatcher?: ExecutionDispatcher,
    memoryStore?: IWorkingMemory,
    chatHistoryStore?: any
  ) {
    this.memoryStore = memoryStore || new WorkingMemory();
    this.authorityService = new AuthorityService();
    this.constitutionEngine = constitutionEngine;
    this.feedbackPipeline = feedbackPipeline;
    this.coherenceMonitor = coherenceMonitor;
    this.calibrationEvaluationEngine = calibrationEvaluationEngine;
    this.executionTraceStore = executionTraceStore;
    this.eventBus = eventBus;
    this.executionDispatcher = dispatcher;
    this.chatHistoryStore = chatHistoryStore;
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

    // Initialize Coordinators
    // MemoryStore is created exactly ONCE in Runtime and passed by reference
    this.cognitiveCoordinator = new CognitiveCoordinator(
      this.attentionEngine,
      this.goalEngine,
      this.planner,
      this.strategyStore,
      this.memoryStore,
      this.coherenceMonitor
    );

    this.intentCoordinator = new IntentCoordinator(
      this.intentEngine,
      this.intentStore,
      this.proposalStore,
      this.goalSynthesizer,
      this.proposalGovernance,
      this.proposalEvaluator,
      this.eventBus,
      this.feedbackPipeline,
      this.memoryStore
    );

    this.executionCoordinator = new ExecutionCoordinator(
      this.constitutionEngine,
      this.authorityService,
      this.feedbackPipeline,
      this.executionTraceStore,
      this.memoryStore,
      this.eventBus
    );

    if (this.executionTraceStore) {
      this.executionReflectionEngine = new ExecutionReflectionEngine(this.executionTraceStore, this.memoryStore, this.eventBus || new EventEmitter());
    }
  }

  public setAdaptationExecutor(adaptationExecutor: AdaptationExecutor): void {
    this.adaptationExecutor = adaptationExecutor;
  }

  public stop(): void {
    this.executionCoordinator.stop();
  }

  // Replaced by ExecutionDispatcher's direct listening

  public setGlobalEventBus(globalEventBus: any, options?: { disableMcp?: boolean, sessionId?: string }): void {
    this.worldStateService = new WorldStateService(globalEventBus);
    
    this.capabilityCatalog = new CapabilityCatalog();
    const walletCap = new WalletToolCapability();
    const commCap = new CommunicationToolCapability();
    this.capabilityCatalog.registerTools([...walletCap.getTools(), ...commCap.getTools()]);
    
    this.executionCoordinator.setCapabilityCatalog(this.capabilityCatalog);
    
    // Initialize MCP Memory Server for testing/capabilities
    // Using npx -y @modelcontextprotocol/server-memory
    if (!options?.disableMcp) {
      const mcpMemoryClient = new McpClientAdapter(
        'memory-server',
        'npx',
        ['-y', '@modelcontextprotocol/server-memory'],
        globalEventBus,
        this.capabilityCatalog
      );
      mcpMemoryClient.connect().catch(console.error);

      // Initialize MCP Brave Search Server
      // Requires BRAVE_API_KEY in environment variables
      const mcpBraveClient = new McpClientAdapter(
        'brave-search-server',
        'npx',
        ['-y', '@modelcontextprotocol/server-brave-search'],
        globalEventBus,
        this.capabilityCatalog
      );
      mcpBraveClient.connect().catch((e) => {
        this.logger.warn(`Failed to connect to Brave MCP (is BRAVE_API_KEY set?): ${e.message}`);
      });
    }

    this.proposalManager = new ProposalManager(globalEventBus);

    globalEventBus.on(EventTypes.DIALOGUE_PROPOSAL_APPROVED, (event: StandardEvent) => {
      this.approveProposal(event.payload.proposalId, event.payload.candidateId);
    });

    // Initialize Deterministic Multi-Model Orchestrator
    // The current deployment has one provisioned backend model. The routing
    // layer remains capable of multi-model fallback when another adapter is
    // explicitly configured, but must not assume provider entitlement.
    const qwenPlus = new QwenAdapter('qwen-plus');
    const registry = new ModelRegistry([qwenPlus]);
    const routingPolicy = new CapabilityRoutingPolicy();
    const modelOrchestrator = new ModelOrchestrator(registry, routingPolicy, globalEventBus);

    this.dialogueEngine = new DialogueEngine(globalEventBus, this.worldStateService, this.capabilityCatalog, this.memoryStore, this.chatHistoryStore, modelOrchestrator, options?.sessionId || 'default');
    console.log('[Runtime] Global EventBus, CapabilityCatalog, ProposalManager, Orchestrator, and Cognitive Engines Initialized');
  }

  public setExecutionDispatcher(dispatcher: ExecutionDispatcher): void {
    this.executionDispatcher = dispatcher;
  }
  
  getWorldState() {
    if (!this.worldStateService) {
      return { wallet: {}, temporal: {} };
    }
    return {
      wallet: this.worldStateService.getWalletState(),
      temporal: this.worldStateService.getTemporalState()
    };
  }

  private governProposals(temporalContext: TemporalContext): void {
    // Moved to IntentCoordinator
  }
  
  getMemory() {
    return this.memoryStore.getHistory();
  }

  // TriggerFired is now handled directly by ExecutionDispatcher

  async executeCycle(cycleId: number, targetGoalId?: string, scope?: DelegationScope): Promise<void> {
    this.logger.info(`--- Execution Cycle ${cycleId} ---`);
    const temporalContext: TemporalContext = {
      physicalTime: Date.now(),
      cognitiveCycleId: cycleId
    };
    
    // 1. Intent & Proposal Pipeline (managed by IntentCoordinator)
    this.intentCoordinator.runCycle(temporalContext, this.getWorldState());

    // 2. Cognitive Cycle: Allocation, Goal Selection, Planning (managed by CognitiveCoordinator)
    const { goal, plan } = this.cognitiveCoordinator.runCycle(temporalContext, this.getWorldState(), targetGoalId);

    // 3. Execution Cycle: Dispatch, Verification, Feedback (managed by ExecutionCoordinator)
    if (goal && plan) {
      try {
        const defaultScope = scope || {
          id: 'auto-scope',
          principalId: 'system',
          allowedPermissions: [{ action: '*' }],
          requiresApprovalPermissions: []
        };
        
        // Mock ExecutionContext for now until fully propagated
        const executionContext = {
          executionId: `exec-${Date.now()}`,
          goalId: goal.id,
          triggerSource: 'SYSTEM' as any,
          priority: 1, // NORMAL
          createdAt: Date.now()
        };

        this.executionCoordinator.submitTask(goal, plan, defaultScope, executionContext as any);
        
        // Since it's queued asynchronously now, we just mark it as in progress (or let the queue handle it)
        this.goalEngine?.updateStatus(goal.id, 'IN_PROGRESS');
      } catch (err: any) {
        if (err.name === 'IntentInvalidationError') {
           this.goalEngine?.invalidate(goal.id, err.invalidation);
        } else if (err.message && err.message.includes('STRATEGY-ENFORCED')) {
           this.goalEngine?.updateStatus(goal.id, 'ABANDONED', err.message);
        } else {
           this.goalEngine?.updateStatus(goal.id, 'FAILED', err.message);
        }
      }
    }

    if (this.adaptationPlanner) {
      this.adaptationPlanner.removeExpiredProposals();
    }
    
    this.logger.info(`Execution Cycle Terminated. Yielding back to TriggerEngine.`);

    if (this.executionReflectionEngine) {
      this.executionReflectionEngine.evaluate();
    }
  }

  // Phase 4.1: Human Approval Pipeline
  approveProposal(proposalId: string, candidateId: string): void {
    if (!this.proposalStore || !this.goalEngine || !this.intentStore) return;

    const proposal = this.proposalStore.getProposal(proposalId);
    if (!proposal) {
      console.log(`[Runtime] Proposal ${proposalId} not found in Phase 4.1 ProposalStore. Ignoring (likely handled by ProposalManager).`);
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
      // Preserve the reviewed strategy as goal context.  Its steps are
      // deliberately proposal-only; the normal planner still governs any
      // later capability or execution decision.
      targetState: {
        ...(candidate.strategyMetadata || {}),
        strategy: candidate.strategy
      },
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

    this.executeCycle(Date.now(), newGoalId).catch(console.error);
  }

  public submitAdaptationProposal(proposal: AdaptationProposal): AdaptationProposal {
    this.logger.info(`Received AdaptationProposal: ${proposal.id}`);
    this.logger.info(`  -> Target Subsystem: ${proposal.target.subsystem}`);
    this.logger.info(`  -> Scope: ${proposal.target.scope}`);
    
    if (proposal.target.scope === 'PROTECTED') {
      this.logger.error(`FATAL: Adaptation targeting PROTECTED subsystem rejected by Runtime safeguard.`);
      proposal.status = 'REJECTED';
    } else if (proposal.target.scope === 'GOVERNANCE_ONLY') {
      this.logger.info(`INFO: Adaptation requires explicit GOVERNANCE authorization.`);
      proposal.status = 'PENDING_REVIEW';
    } else {
      this.logger.info(`INFO: Adaptation accepted for standard evaluation review.`);
      proposal.status = 'PENDING_REVIEW';
    }
    
    return proposal;
  }
}
