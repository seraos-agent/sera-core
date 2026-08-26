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
import { SecretManager } from '../core/secrets/SecretManager';
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

  constructor(
    context: SeraUserContext | string,
    public readonly subscriptionService?: any,
    public readonly secretManager?: SecretManager
  ) {
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
    
    // Wire token deduction based on LLM usage
    this.eventBus.on(EventTypes.LLM_MODEL_COMPLETED, (event: any) => {
      if (this.subscriptionService) {
        const inputTokens = event.payload.inputTokens || 0;
        const outputTokens = event.payload.outputTokens || 0;
        const total = inputTokens + outputTokens;
        
        if (total > 0) {
          const success = this.subscriptionService.consumeCredits(this.sessionId, total);
          if (success) {
            this.eventBus.emit(EventTypes.BILLING_CREDITS_UPDATED, {
              id: `evt-bill-${Date.now()}`,
              type: EventTypes.BILLING_CREDITS_UPDATED,
              source: 'SeraAgentInstance',
              timestamp: Date.now(),
              payload: {
                address: this.sessionId,
                remainingTokens: this.subscriptionService.getAgentCredits(this.sessionId)
              }
            });
          }
        }
      }
    });
    
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
    const persistLocally = true;
    this.chatHistoryStore = new ChatHistoryStore(this.sessionId, { persistLocally });
    
    this.triggerStore = new InMemoryTriggerStore(this.sessionId, { persistLocally });
    this.triggerEngine = new TriggerEngine(this.triggerStore, this.eventBus);
    
    this.goalBridge = new GoalBridge(
      this.eventBus,
      this.sessionId,
      this.personalWalletAddress,
      this.autonomyAgreementStore,
      undefined,
      this.triggerEngine,
      this.secretManager
    );

    const executionDispatcher = new ExecutionDispatcher(this.eventBus, this.sessionId);
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
      persistLocally,
      this.subscriptionService
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
    const baseTools: SeraTool[] = [
      {
        name: 'system_ping',
        description: 'Pings the system to check if it is responsive. Use this when the user asks to ping the system.',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Optional message to attach to the ping' }
          }
        }
      },
      {
        name: 'RESOLVE_BASE_TOKEN',
        description: 'Fetches official live token data, contract address, price, liquidity depth, and risk analysis DIRECTLY on-chain from the Base ecosystem (DexScreener/Uniswap/Aerodrome). ALWAYS use this tool for Base token queries, price checks, or token lists instead of web search.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The token symbol, name, or contract address to resolve on Base (e.g. WETH, BRETT, TOSHI, top 10 Base coins)' }
          },
          required: ['query']
        }
      },
      {
        name: 'SPOT_SWAP',
        description: 'Executes a live DEX spot swap on Base network via Uniswap V3 / Aerodrome router. Charges 0.20% Volume Take Rate + Gas Surcharge in USDC.',
        parameters: {
          type: 'object',
          properties: {
            fromToken: { type: 'string', description: 'Source token symbol (default USDC)' },
            toToken: { type: 'string', description: 'Destination token symbol (e.g. WETH, AERO, BRETT)' },
            amount: { type: 'number', description: 'Amount in USDC to swap' }
          },
          required: ['toToken', 'amount']
        },
        requiresApproval: true
      },
      {
        name: 'CHECK_WALLET_BALANCE',
        description: 'Checks real-time wallet balances (USDC, WETH) for user and agent wallet on Base network.',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'TRANSFER_FUNDS',
        description: 'Transfers USDC to a recipient address on Base network. Charges standard take rate + gas surcharge.',
        parameters: {
          type: 'object',
          properties: {
            recipient: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['EXTERNAL_ADDRESS', 'DOMAIN_INTERNAL'] },
                address: { type: 'string', description: 'The 0x address of the recipient' }
              },
              required: ['type']
            },
            amount: { type: ['number', 'string'], description: 'The amount of USDC to transfer, or "all"' },
            asset: { type: 'string', description: 'Asset symbol (default: USDC)' }
          },
          required: ['recipient', 'amount']
        },
        requiresApproval: true,
        irreversible: true
      },
      {
        name: 'SCHEDULE_GOAL',
        description: 'Schedules a future or recurring automated task (e.g. "every 5 minutes", "every hour", "in 20 seconds"). Put the target action (e.g. THREADS_PUBLISH, CHECK_WALLET_BALANCE, DYNAMIC_SCHEDULED_ACTION) in actionIntent.',
        parameters: {
          type: 'object',
          properties: {
            scheduleType: { type: 'string', enum: ['cron', 'exact'], description: 'cron for recurring schedules, exact for a one-time delay' },
            humanIntent: { type: 'string', description: 'Human readable schedule description (e.g. "Every 5 minutes", "In 1 hour")' },
            cronExpression: { type: 'string', description: 'If recurring, 5-field UTC cron (e.g. "*/5 * * * *" for every 5 minutes)' },
            delaySeconds: { type: 'number', description: 'If exact, delay in seconds from now' },
            actionIntent: { type: 'string', description: 'The action tool to execute (e.g. THREADS_PUBLISH, CHECK_WALLET_BALANCE, DYNAMIC_SCHEDULED_ACTION)' },
            actionParameters: { type: 'object', description: 'Parameters for the actionIntent (e.g. { "text": "..." } or { "taskPrompt": "..." })' }
          },
          required: ['scheduleType', 'humanIntent', 'actionIntent', 'actionParameters']
        },
        requiresApproval: true
      },
      {
        name: 'ACTIVATE_AUTONOMY_AGREEMENT',
        description: 'Proposes an operating agreement / delegation scope to allow autonomous actions without requiring per-transaction approvals.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            mode: { type: 'string', enum: ['FULL_ACCESS', 'APPROVAL_REQUIRED', 'RESTRICTED'] },
            scopes: { type: 'array', items: { type: 'string' } }
          },
          required: ['title', 'mode', 'scopes']
        },
        requiresApproval: true
      },
      // =====================================================================
      // Hyperliquid Spot Trading Tools
      // =====================================================================
      {
        name: 'HL_SPOT_MARKET_DATA',
        description: 'Fetches live spot market data from Hyperliquid orderbook: price, 24h volume, bid/ask, and price change. Use this for any token price query.',
        parameters: {
          type: 'object',
          properties: {
            coin: { type: 'string', description: 'Token symbol to look up (e.g. HYPE, ETH, BTC, SOL, PURR)' }
          },
          required: ['coin']
        }
      },
      {
        name: 'HL_SPOT_ORDER',
        description: 'Places a spot buy or sell order. Supports market (instant fill) and limit (at specific price). Funds are managed automatically. Use this when user wants to buy or sell any token.',
        parameters: {
          type: 'object',
          properties: {
            coin: { type: 'string', description: 'Token symbol to trade (e.g. HYPE, ETH, BTC)' },
            side: { type: 'string', enum: ['buy', 'sell'], description: 'Buy or sell' },
            amount: { type: 'number', description: 'Amount in USDC' },
            orderType: { type: 'string', enum: ['market', 'limit'], description: 'Market (instant) or limit (at specific price). Default: market' },
            limitPrice: { type: 'number', description: 'Required for limit orders: the price per token in USDC' }
          },
          required: ['coin', 'side', 'amount']
        },
        requiresApproval: true
      },
      {
        name: 'HL_SPOT_CANCEL',
        description: 'Cancels a resting limit order on the spot market.',
        parameters: {
          type: 'object',
          properties: {
            coin: { type: 'string', description: 'Token symbol of the order (e.g. HYPE, ETH)' },
            orderId: { type: 'number', description: 'The order ID to cancel' }
          },
          required: ['coin', 'orderId']
        },
        requiresApproval: true
      },
      {
        name: 'HL_SPOT_PORTFOLIO',
        description: 'Shows the user complete portfolio: all token holdings with current USD valuations and total portfolio value.',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'HL_SPOT_OPEN_ORDERS',
        description: 'Lists all active limit orders waiting to be filled on the spot market.',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    ];
    this.capabilityCatalog.registerTools(baseTools);

    this.communicationBridge = new CommunicationBridge(this.eventBus);
  }

  public async start() {
    if (this.started || this.stopped) return;
    this.started = true;
    console.log(`[SeraAgentInstance] Starting engines for ${this.sessionId}`);
    
    // Load working memory snapshot and chat history concurrently
    const [snapshot] = await Promise.all([
      this.persistence.load(),
      this.chatHistoryStore.ensureLoaded()
    ]);
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
