import { EventEmitter } from 'events';
import { Runtime } from '../runtime/Runtime';
import { WorldStateService } from '../core/world-state/WorldStateService';
import { EventTypes } from '../core/events/types';
import { IWorkingMemory } from '../core/memory/IWorkingMemory';
import { WorkingMemory } from '../memory/WorkingMemory';
import { IMemoryPersistence } from '../core/memory/IMemoryPersistence';
import { MemoryVaultDescriptor } from '../core/memory/MemoryVault';
import { createMemoryPersistence } from '../memory/persistence/MemoryPersistenceFactory';
import { GoalBridge } from '../runtime/GoalBridge';
import { ChatHistoryStore } from '../capabilities/dialogue/ChatHistoryStore';
import { ObservationStore } from '../core/perception/ObservationStore';
import { InMemoryTriggerStore } from '../core/triggers/InMemoryTriggerStore';
import { TriggerEngine } from '../core/triggers/TriggerEngine';
import { ExecutionDispatcher } from '../runtime/ExecutionDispatcher';
import { Planner } from '../core/planner/Planner';
import { StrategyStore } from '../core/strategy/StrategyStore';
import { StrategyEngine } from '../core/strategy/StrategyEngine';
import { QwenAdapter } from '../capabilities/llm/QwenAdapter';
import { ModelRegistry } from '../core/llm/ModelRegistry';
import { GoalEngine } from '../core/goals/GoalEngine';
import { AttentionEngine } from '../core/attention/AttentionEngine';
import { IntentStore } from '../core/intents/IntentStore';
import { ProposalStore } from '../core/intents/ProposalStore';
import { IntentEngine } from '../core/intents/IntentEngine';
import { GoalSynthesizer } from '../core/intents/GoalSynthesizer';
import { ProposalGovernance } from '../core/intents/ProposalGovernance';
import { ExecutionTraceStore } from '../core/execution/ExecutionTraceStore';
import { CoherenceMonitor } from '../core/cognition/CoherenceMonitor';
import { ProposalEvaluator } from '../core/intents/ProposalEvaluator';
import { CalibrationEvaluationEngine } from '../core/cognition/CalibrationEvaluationEngine';
import { GovernanceOutcomeTracker } from '../core/governance/GovernanceOutcomeTracker';
import { GovernanceReflectionEngine } from '../core/governance/GovernanceReflectionEngine';
import { GovernanceCalibrationEngine } from '../core/governance/GovernanceCalibrationEngine';
import { MetaGovernanceReview } from '../core/governance/MetaGovernanceReview';
import { GovernanceCoordinator } from '../core/governance/GovernanceCoordinator';
import { ConstitutionEngine } from '../constitution/ConstitutionEngine';
import { IrreversibleActionRule } from '../constitution/rules/IrreversibleActionRule';
import { DestructiveActionRule } from '../constitution/rules/DestructiveActionRule';
import { UnsafeActionRule } from '../constitution/rules/UnsafeActionRule';
import { SignalArbitrator } from '../core/feedback/SignalArbitrator';
import { EpistemicPolicyEngine } from '../core/memory/EpistemicPolicyEngine';
import { FeedbackPipeline } from '../core/feedback/FeedbackPipeline';
import { TemporalClockService } from '../core/temporal/TemporalClockService';
import { CognitiveCompressor } from '../core/perception/CognitiveCompressor';
import { AuditLogger } from '../core/telemetry/AuditLogger';
import { MetricsAggregator } from '../core/telemetry/MetricsAggregator';
import { InMemoryMetricsStore } from '../core/telemetry/MetricsStore';
import { ExperienceBuilder } from '../core/memory/ExperienceBuilder';
import { EpisodicSemanticBridge } from '../core/memory/EpisodicSemanticBridge';
import { MemoryIngress } from '../core/memory/MemoryIngress';
import { CapabilityCatalog } from '../core/capabilities/CapabilityCatalog';
import { SeraTool } from '../core/cognitive/Tool';
import { CommunicationBridge } from '../capabilities/communication/CommunicationBridge';
import { SwarmCoordinator } from '../core/swarm/SwarmCoordinator';
import { AutonomyAgreementStore } from '../core/autonomy/AutonomyAgreementStore';
import { SeraUserContext } from '../core/identity/types';
import { serverConfig } from './config';

export class SeraAgentInstance {
  public sessionId: string;
  public readonly personalWalletAddress?: string;
  public eventBus: EventEmitter;
  
  public runtime!: Runtime;
  public chatHistoryStore!: ChatHistoryStore;
  public observationStore!: ObservationStore;
  public memoryStore!: IWorkingMemory;
  public persistence!: IMemoryPersistence;
  public memoryVault!: MemoryVaultDescriptor;
  public worldStateService!: WorldStateService;
  public triggerStore!: InMemoryTriggerStore;
  public triggerEngine!: TriggerEngine;
  public goalBridge!: GoalBridge;
  public temporalClockService!: TemporalClockService;
  public governanceCoordinator!: GovernanceCoordinator;
  public metaGovernanceReview!: MetaGovernanceReview;
  public capabilityCatalog!: CapabilityCatalog;
  public communicationBridge!: CommunicationBridge;
  public metricsStore!: InMemoryMetricsStore;
  public readonly autonomyAgreementStore = new AutonomyAgreementStore();
  private memoryIngress!: MemoryIngress;
  private metricsAggregator!: MetricsAggregator;
  private cognitiveCompressor!: CognitiveCompressor;
  private experienceBuilder!: ExperienceBuilder;
  private started = false;
  private stopped = false;
  private memoryDirty = false;
  private checkpointInFlight = false;
  private checkpointQueued = false;
  private readonly persistMemorySnapshot = async () => {
    if (!this.memoryDirty || !('getSnapshot' in this.memoryStore)) return;
    if (this.checkpointInFlight) { this.checkpointQueued = true; return; }
    this.checkpointInFlight = true;
    this.checkpointQueued = false;
    const snapshot = (this.memoryStore as WorkingMemory).getSnapshot();
    this.memoryDirty = false;
    try { await this.persistence.save(snapshot); }
    catch { this.memoryDirty = true; }
    finally {
      this.checkpointInFlight = false;
      if (this.memoryDirty || this.checkpointQueued) void this.persistMemorySnapshot();
    }
  };
  private readonly markMemoryDirty = () => { this.memoryDirty = true; };

  constructor(context: SeraUserContext | string) {
    const user = typeof context === 'string' ? { userId: context } : context;
    this.sessionId = user.userId;
    this.personalWalletAddress = user.personalWalletAddress;
    this.eventBus = new EventEmitter();
    this.initialize();
  }

  private initialize() {
    console.log(`[SeraAgentInstance] Initializing Agent OS for sessionId: ${this.sessionId}`);

    this.observationStore = new ObservationStore(100);
    this.memoryStore = new WorkingMemory(this.eventBus);
    this.memoryIngress = new MemoryIngress(this.eventBus, this.memoryStore);
    this.metricsStore = new InMemoryMetricsStore();
    this.metricsAggregator = new MetricsAggregator(this.eventBus, this.metricsStore);
    
    // The fixed key remains available only to support isolated local-development
    // fixtures. Production defaults to runtime-only memory and never uses it.
    const developmentFixtureKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const memorySelection = createMemoryPersistence({
      sessionId: this.sessionId,
      environment: serverConfig.environment,
      mode: serverConfig.memoryPersistenceMode,
      developmentEncryptionKey: developmentFixtureKey,
    });
    this.persistence = memorySelection.persistence;
    this.memoryVault = memorySelection.vault;
    const persistLocally = this.memoryVault.mode === 'LOCAL_DEVELOPMENT';

    this.chatHistoryStore = new ChatHistoryStore(this.sessionId, { persistLocally });
    
    this.triggerStore = new InMemoryTriggerStore(this.sessionId, { persistLocally });
    this.triggerEngine = new TriggerEngine(this.triggerStore, this.eventBus);
    (globalThis as any).__triggerEngine = this.triggerEngine;
    
    this.goalBridge = new GoalBridge(this.eventBus, this.sessionId, this.personalWalletAddress, this.autonomyAgreementStore);

    const executionDispatcher = new ExecutionDispatcher(this.eventBus);
    const plannerLLM = new QwenAdapter(process.env.QWEN_LIGHT_MODEL || 'qwen3.5-flash');
    const planner = new Planner(plannerLLM, this.eventBus);
    const strategyStore = new StrategyStore();
    const strategyEngine = new StrategyEngine(strategyStore);
    const goalEngine = new GoalEngine();
    const attentionEngine = new AttentionEngine(goalEngine, strategyStore);

    const intentStore = new IntentStore();
    const proposalStore = new ProposalStore();
    const intentEngine = new IntentEngine(intentStore, goalEngine);
    const goalSynthesizer = new GoalSynthesizer();
    const proposalGovernance = new ProposalGovernance();
    const swarmWorker = ({ task, role, blackboard }: { task: { id: string; title: string }; role: string; blackboard: readonly unknown[] }) => ({
      taskId: task.id,
      role,
      note: `Completed proposal-only review step: ${task.title}`,
      priorReviewCount: blackboard.length
    });
    const swarmCoordinator = new SwarmCoordinator({
      RESEARCHER: swarmWorker,
      PLANNER: swarmWorker,
      CRITIC: swarmWorker,
      SYNTHESIZER: swarmWorker
    }, proposalGovernance, this.eventBus);

    const executionTraceStore = new ExecutionTraceStore(this.eventBus);
    const coherenceMonitor = new CoherenceMonitor();
    const proposalEvaluator = new ProposalEvaluator(this.memoryStore);
    const calibrationEvaluationEngine = new CalibrationEvaluationEngine(this.memoryStore);
    const governanceOutcomeTracker = new GovernanceOutcomeTracker(this.memoryStore, this.eventBus);
    const governanceReflectionEngine = new GovernanceReflectionEngine(this.memoryStore, this.eventBus);
    const governanceCalibrationEngine = new GovernanceCalibrationEngine(this.memoryStore);
    const metaGovernanceReview = new MetaGovernanceReview(this.eventBus);
    this.metaGovernanceReview = metaGovernanceReview;

    this.governanceCoordinator = new GovernanceCoordinator(
      this.eventBus,
      governanceOutcomeTracker,
      governanceReflectionEngine,
      calibrationEvaluationEngine,
      governanceCalibrationEngine,
      metaGovernanceReview
    );

    const constitutionEngine = new ConstitutionEngine();
    constitutionEngine.register(new IrreversibleActionRule());
    constitutionEngine.register(new DestructiveActionRule());
    constitutionEngine.register(new UnsafeActionRule());

    const signalArbitrator = new SignalArbitrator();
    const epistemicPolicyEngine = new EpistemicPolicyEngine(this.memoryStore, this.eventBus);
    const feedbackPipeline = new FeedbackPipeline(
      signalArbitrator,
      epistemicPolicyEngine,
      this.memoryStore,
      goalEngine,
      coherenceMonitor,
      this.eventBus
    );

    this.runtime = new Runtime(
      constitutionEngine,
      feedbackPipeline,
      coherenceMonitor,
      calibrationEvaluationEngine,
      executionTraceStore,
      planner,
      strategyStore,
      strategyEngine,
      attentionEngine,
      goalEngine,
      intentEngine,
      intentStore,
      proposalStore,
      goalSynthesizer,
      proposalGovernance,
      proposalEvaluator,
      governanceOutcomeTracker,
      governanceReflectionEngine,
      governanceCalibrationEngine,
      undefined,
      undefined,
      this.eventBus,
      executionDispatcher,
      this.memoryStore,
      this.chatHistoryStore,
      swarmCoordinator,
      this.autonomyAgreementStore,
      persistLocally
    );

    this.runtime.setGlobalEventBus(this.eventBus, {
      sessionId: this.sessionId,
      persistUserData: persistLocally,
      // MCP child processes are optional integration infrastructure. Keeping
      // them disabled on Cloud Run unless explicitly enabled avoids cold-start
      // work and background child processes unrelated to the Core API.
      disableMcp: process.env.NODE_ENV === 'test'
        || (serverConfig.isProduction && process.env.SERA_ENABLE_MCP !== 'true'),
    });
    this.worldStateService = this.runtime.worldStateService;

    this.temporalClockService = new TemporalClockService(this.eventBus, 10000);
    this.cognitiveCompressor = new CognitiveCompressor(this.eventBus);
    const auditLogger = new AuditLogger(this.eventBus, { persistLocally });
    this.experienceBuilder = new ExperienceBuilder(this.eventBus, this.sessionId, { persistLocally });
    const episodicSemanticBridge = new EpisodicSemanticBridge(this.eventBus, this.memoryStore);

    this.capabilityCatalog = new CapabilityCatalog();
    const dummyPingTool: SeraTool = {
      name: 'system_ping',
      description: 'Pings the system to check if it is responsive. Use this when the user asks to ping the system.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Optional message to attach to the ping' }
        }
      }
    };
    this.capabilityCatalog.registerTools([dummyPingTool]);

    this.communicationBridge = new CommunicationBridge(this.eventBus);
  }

  public async start() {
    if (this.started || this.stopped) return;
    this.started = true;
    console.log(`[SeraAgentInstance] Starting engines for ${this.sessionId}`);
    
    // Load snapshot at start
    const snapshot = await this.persistence.load();
    if (snapshot) {
      if ('loadSnapshot' in this.memoryStore) {
        (this.memoryStore as WorkingMemory).loadSnapshot(snapshot);
      }
    }

    // stop() may have run while disk persistence was loading. Never start
    // timers or listeners after an instance has been evicted.
    if (this.stopped) return;

    // Subscribe to temporal tick for checkpointing
    this.eventBus.on('temporal.tick', this.persistMemorySnapshot);
    this.eventBus.on(EventTypes.MEMORY_ITEM_MUTATED, this.markMemoryDirty);

    // Automatic Real-time Agent Credits deduction based on LLM tokens used
    this.eventBus.on(EventTypes.LLM_MODEL_COMPLETED, (event: any) => {
      const input = event.payload?.inputTokens || 0;
      const output = event.payload?.outputTokens || 0;
      const totalTokens = input + output;
      if (totalTokens > 0) {
        console.log(`[SeraAgentInstance][Billing] Agent LLM Token Usage (${this.sessionId}): ${totalTokens} tokens (Input: ${input}, Output: ${output})`);
      }
    });

    this.triggerEngine.start();
    this.temporalClockService.start();
    this.governanceCoordinator.start();
  }

  public stop() {
    if (this.stopped) return;
    this.stopped = true;
    console.log(`[SeraAgentInstance] Stopping engines for ${this.sessionId}`);
    this.eventBus.off('temporal.tick', this.persistMemorySnapshot);
    this.eventBus.off(EventTypes.MEMORY_ITEM_MUTATED, this.markMemoryDirty);
    void this.persistMemorySnapshot();
    this.temporalClockService.stop();
    this.triggerEngine.stop();
    this.governanceCoordinator.stop();
    this.cognitiveCompressor.stop();
    this.experienceBuilder.stop();
    this.runtime.stop();
  }
}
