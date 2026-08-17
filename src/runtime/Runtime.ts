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
import { ConnectorActivationStore } from '../core/capabilities/ConnectorActivationStore';
import { WalletToolCapability } from '../capabilities/wallet/WalletToolCapability';
import { CommunicationToolCapability } from '../capabilities/communication/CommunicationToolCapability';

import { ThreadsAPI } from '../capabilities/threads/ThreadsAPI';
import { ThreadsCapability } from '../capabilities/threads/ThreadsCapability';
import { ThreadsDaemon } from '../capabilities/threads/ThreadsDaemon';
import { AutonomyAgreementCapability } from '../capabilities/autonomy/AutonomyAgreementCapability';
import { ImageGenerationCapability } from '../capabilities/media/ImageGenerationCapability';

import { SeraArenaToolCapability } from '../capabilities/predictions/SeraArenaToolCapability';
import { SecretManager } from '../core/secrets/SecretManager';
import { EncryptedDatabaseSecretStore } from '../core/secrets/stores/EncryptedDatabaseSecretStore';
import { ProposalManager } from '../core/governance/ProposalManager';
import { Logger } from '../core/logging/Logger';
import { McpClientAdapter } from '../capabilities/mcp/client/McpClientAdapter';
import { SwarmCoordinator } from '../core/swarm/SwarmCoordinator';
import { DomainProductContractRegistry } from '../core/products/DomainProductContractRegistry';
import { AutonomyAgreementStore } from '../core/autonomy/AutonomyAgreementStore';
import { predictionEngine } from '../server/predictionEngine';

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

  public readonly productContracts = new DomainProductContractRegistry();
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
  private static globalThreadsDaemon?: ThreadsDaemon;

  // Coordinators
  private cognitiveCoordinator: CognitiveCoordinator;
  private intentCoordinator: IntentCoordinator;
  public executionCoordinator: ExecutionCoordinator;
  public secretManager!: SecretManager;

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
    chatHistoryStore?: any,
    swarmCoordinator?: SwarmCoordinator,
    private readonly autonomyAgreementStore?: AutonomyAgreementStore,
    private readonly persistUserData: boolean = true,
    private readonly subscriptionService?: any
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
      this.memoryStore,
      swarmCoordinator
    );

    this.executionCoordinator = new ExecutionCoordinator(
      this.constitutionEngine,
      this.authorityService,
      this.feedbackPipeline,
      this.executionTraceStore,
      this.memoryStore,
      this.eventBus,
      this.persistUserData
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
    Runtime.globalThreadsDaemon?.stop();
  }

  // Replaced by ExecutionDispatcher's direct listening

  public setGlobalEventBus(globalEventBus: any, options?: { disableMcp?: boolean, sessionId?: string, persistUserData?: boolean }): void {
    const persistUserData = options?.persistUserData ?? this.persistUserData;
    this.worldStateService = new WorldStateService(globalEventBus, options?.sessionId || 'default', { persistLocally: persistUserData });

    const activationStore = new ConnectorActivationStore(persistUserData);
    this.capabilityCatalog = new CapabilityCatalog(activationStore);
    const walletCap = new WalletToolCapability();
    const commCap = new CommunicationToolCapability();

    const autonomyAgreementCap = new AutonomyAgreementCapability();

    this.secretManager = new SecretManager(new EncryptedDatabaseSecretStore());

    const seraArenaCap = new SeraArenaToolCapability(predictionEngine);

    const threadsApi = new ThreadsAPI(this.secretManager);
    const threadsCap = new ThreadsCapability(threadsApi);
    const imageGenCap = new ImageGenerationCapability();

    // Initialize and start the autonomous daemon for Threads as a singleton worker
    if (process.env.THREADS_APP_ID && !Runtime.globalThreadsDaemon) {
      Runtime.globalThreadsDaemon = new ThreadsDaemon(threadsApi, globalEventBus, 'default');
      Runtime.globalThreadsDaemon.start(5 * 60 * 1000); // 5-minute autonomous polling
    }



    // ── Register Connectors with full metadata ─────────────────────────────
    // Always-on connectors: available from boot, cannot be deactivated
    this.capabilityCatalog.registerConnector({
      id: 'wallet',
      name: 'Base Network',
      category: 'finance',
      description: 'On-chain USDC/ETH transfers & Agent Vault',
      riskSummary: 'Core wallet functionality for managing on-chain assets on the Base network. This connector is always active as it provides fundamental asset management capabilities.',
      network: 'Base',
      alwaysActive: true,
      tools: walletCap.getTools(),
    });


    this.capabilityCatalog.registerConnector({
      id: 'communication',
      name: 'Agent Comm',
      category: 'connectors',
      description: 'Send messages to other AI Agents via XMT',
      riskSummary: 'Inter-agent communication network (XMT). Used to send and receive text messages or payloads directly to other autonomous entities. Always active to allow cross-agent coordination.',
      alwaysActive: true,
      tools: commCap.getTools(),
    });

    this.capabilityCatalog.registerConnector({
      id: 'media_generation',
      name: 'Media Studio',
      category: 'connectors',
      description: 'Generate high-quality images from text',
      riskSummary: 'Uses Qwen-Image/Wanx to generate images. This consumes AI credits but is safe to be always active.',
      alwaysActive: true,
      tools: imageGenCap.getTools(),
      executeTool: imageGenCap.executeTool.bind(imageGenCap),
    });

    // ── On-demand connectors: Can be toggled by users ─────────────────────activation
    this.capabilityCatalog.registerConnector({
      id: 'autonomy',
      name: 'Operating Agreements',
      category: 'connectors',
      description: 'Manage delegation scopes and autonomy agreements',
      riskSummary: 'Allows Sera to propose and manage operating agreements that define its level of autonomous authority. This connector is always active as it is part of the governance layer.',
      alwaysActive: true,
      tools: autonomyAgreementCap.getTools(),
    });

    // Opt-in connectors: require explicit user activation



    this.capabilityCatalog.registerConnector({
      id: 'sera-arena',
      name: 'Sera Arena (Mainnet)',
      category: 'finance',
      description: 'Sera native parimutuel prediction markets on Base',
      riskSummary: 'Sera Arena is a prediction market platform on the Base network. Activating this connector allows Sera to search active markets, view orderbooks, and execute trades (bet UP/DOWN) using your wallet funds. Trading on prediction markets involves real financial risk — you may lose your entire position if the outcome does not resolve in your favor.',
      network: 'Base',
      alwaysActive: false,
      tools: seraArenaCap.getTools(),
      executeTool: (name: string, args: any) => seraArenaCap.executeTool(name, args),
    });

    this.capabilityCatalog.registerConnector({
      id: 'threads',
      name: 'Threads',
      category: 'communication',
      description: 'Autonomous posting and replies on Meta Threads',
      riskSummary: 'Activating this connector allows Sera to read and publish posts on your connected Threads account. Sera will request approval before publishing unless autonomous mode is enabled.',
      network: 'Web2',
      alwaysActive: false,
      tools: threadsCap.getTools(),
      executeTool: (name: string, args: any, context?: any) => threadsCap.executeTool(name, args, context),
    });

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

    globalEventBus.on('system.register.intent', (event: StandardEvent) => {
      const intentPayload = event.payload.intent;
      if (this.intentStore && intentPayload) {
        this.intentStore.registerIntent(intentPayload);
        // Force an execution cycle right after registering a user-driven intent
        this.executeCycle(Date.now()).catch(e => this.logger.error('Failed to trigger execution cycle for new intent', e));
      }
    });

    // Both models use the already-authorized Qwen provider. The light model
    // serves routine interaction; the max model is reserved for reasoning,
    // coding, and high-risk proposal review. Neither model grants execution.
    const qwenFlash = new QwenAdapter(process.env.QWEN_LIGHT_MODEL || 'qwen3.5-flash');
    const qwenMax = new QwenAdapter(process.env.QWEN_HIGH_RISK_MODEL || 'qwen3.7-max');
    const registry = new ModelRegistry([qwenFlash, qwenMax]);
    const routingPolicy = new CapabilityRoutingPolicy();
    const modelOrchestrator = new ModelOrchestrator(registry, routingPolicy, globalEventBus);

    this.dialogueEngine = new DialogueEngine(
      globalEventBus,
      this.worldStateService,
      this.capabilityCatalog,
      this.memoryStore,
      this.chatHistoryStore,
      modelOrchestrator,
      options?.sessionId || 'default',
      this.autonomyAgreementStore,
      { persistLocally: persistUserData },
      this.subscriptionService
    );
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
    await this.intentCoordinator.runCycle(temporalContext, this.getWorldState());

    // 2. Cognitive Cycle: Allocation, Goal Selection, Planning (managed by CognitiveCoordinator)
    const { goal, plan } = await this.cognitiveCoordinator.runCycle(temporalContext, this.getWorldState(), targetGoalId);

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
          createdAt: Date.now(),
          workClass: goal.targetState.workClass || (goal as any).workClass
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
        strategy: candidate.strategy,
        workClass: 'COMPLEX'
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
