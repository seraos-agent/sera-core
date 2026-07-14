import { EventEmitter } from 'events';
import { Runtime } from '../runtime/Runtime';
import { WorldStateService } from '../core/world-state/WorldStateService';
import { EventTypes } from '../core/events/types';
import { IWorkingMemory } from '../core/memory/IWorkingMemory';
import { WorkingMemory } from '../memory/WorkingMemory';
import { FileMemoryPersistence } from '../memory/persistence/FileMemoryPersistence';
import { GoalBridge } from '../runtime/GoalBridge';
import { ChatHistoryStore } from '../capabilities/dialogue/ChatHistoryStore';
import { ObservationStore } from '../core/perception/ObservationStore';
import { InMemoryTriggerStore } from '../core/triggers/InMemoryTriggerStore';
import { TriggerEngine } from '../core/triggers/TriggerEngine';
import { ExecutionDispatcher } from '../runtime/ExecutionDispatcher';
import { Planner } from '../core/planner/Planner';
import { StrategyStore } from '../core/strategy/StrategyStore';
import { StrategyEngine } from '../core/strategy/StrategyEngine';
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
import { ExperienceBuilder } from '../core/memory/ExperienceBuilder';
import { EpisodicSemanticBridge } from '../core/memory/EpisodicSemanticBridge';
import { CapabilityCatalog } from '../core/capabilities/CapabilityCatalog';
import { SeraTool } from '../core/cognitive/Tool';
import { CommunicationBridge } from '../capabilities/communication/CommunicationBridge';

export class SeraAgentInstance {
  public sessionId: string;
  public eventBus: EventEmitter;
  
  public runtime!: Runtime;
  public chatHistoryStore!: ChatHistoryStore;
  public observationStore!: ObservationStore;
  public memoryStore!: IWorkingMemory;
  public persistence!: FileMemoryPersistence;
  public worldStateService!: WorldStateService;
  public triggerStore!: InMemoryTriggerStore;
  public triggerEngine!: TriggerEngine;
  public goalBridge!: GoalBridge;
  public temporalClockService!: TemporalClockService;
  public governanceCoordinator!: GovernanceCoordinator;
  public capabilityCatalog!: CapabilityCatalog;
  public communicationBridge!: CommunicationBridge;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.eventBus = new EventEmitter();
    this.initialize();
  }

  private initialize() {
    console.log(`[SeraAgentInstance] Initializing Agent OS for sessionId: ${this.sessionId}`);

    this.chatHistoryStore = new ChatHistoryStore(this.sessionId);
    this.observationStore = new ObservationStore(100);
    this.memoryStore = new WorkingMemory(this.eventBus);
    
    // Derived key mock for this scope (32-bytes hex) based on "sign-to-unlock" pattern discussed.
    const mockDerivedWalletKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    this.persistence = new FileMemoryPersistence(this.sessionId, mockDerivedWalletKey);

    this.worldStateService = new WorldStateService(this.eventBus, this.sessionId);
    
    this.triggerStore = new InMemoryTriggerStore(this.sessionId);
    this.triggerEngine = new TriggerEngine(this.triggerStore, this.eventBus);
    (globalThis as any).__triggerEngine = this.triggerEngine;
    
    this.goalBridge = new GoalBridge(this.eventBus, this.sessionId);

    const executionDispatcher = new ExecutionDispatcher(this.eventBus);
    const planner = new Planner();
    const strategyStore = new StrategyStore();
    const strategyEngine = new StrategyEngine(strategyStore);
    const goalEngine = new GoalEngine();
    const attentionEngine = new AttentionEngine(goalEngine, strategyStore);

    const intentStore = new IntentStore();
    const proposalStore = new ProposalStore();
    const intentEngine = new IntentEngine(intentStore, goalEngine);
    const goalSynthesizer = new GoalSynthesizer();
    const proposalGovernance = new ProposalGovernance();

    const executionTraceStore = new ExecutionTraceStore(this.eventBus);
    const coherenceMonitor = new CoherenceMonitor();
    const proposalEvaluator = new ProposalEvaluator(this.memoryStore);
    const calibrationEvaluationEngine = new CalibrationEvaluationEngine(this.memoryStore);
    const governanceOutcomeTracker = new GovernanceOutcomeTracker(this.memoryStore, this.eventBus);
    const governanceReflectionEngine = new GovernanceReflectionEngine(this.memoryStore, this.eventBus);
    const governanceCalibrationEngine = new GovernanceCalibrationEngine(this.memoryStore);
    const metaGovernanceReview = new MetaGovernanceReview(this.eventBus);

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
    const epistemicPolicyEngine = new EpistemicPolicyEngine(this.memoryStore);
    const feedbackPipeline = new FeedbackPipeline(signalArbitrator, epistemicPolicyEngine as any, goalEngine, coherenceMonitor);

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
      this.chatHistoryStore
    );

    this.runtime.worldStateService = this.worldStateService;
    this.runtime.setGlobalEventBus(this.eventBus);

    this.temporalClockService = new TemporalClockService(this.eventBus, 10000);
    const cognitiveCompressor = new CognitiveCompressor(this.eventBus);
    const auditLogger = new AuditLogger(this.eventBus);
    const experienceBuilder = new ExperienceBuilder(this.eventBus);
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
    console.log(`[SeraAgentInstance] Starting engines for ${this.sessionId}`);
    
    // Load snapshot at start
    const snapshot = await this.persistence.load();
    if (snapshot) {
      if ('loadSnapshot' in this.memoryStore) {
        (this.memoryStore as WorkingMemory).loadSnapshot(snapshot);
      }
    }

    // Subscribe to temporal tick for checkpointing
    this.eventBus.on('temporal.tick', async () => {
      if ('getSnapshot' in this.memoryStore) {
         await this.persistence.save((this.memoryStore as WorkingMemory).getSnapshot());
      }
    });

    this.triggerEngine.start();
    this.temporalClockService.start();
    this.governanceCoordinator.start();
  }

  public stop() {
    console.log(`[SeraAgentInstance] Stopping engines for ${this.sessionId}`);
    this.temporalClockService.stop();
    this.triggerEngine.stop();
    this.runtime.stop();
  }
}
