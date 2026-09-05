import { EventEmitter } from 'events';
import { WorldStateService } from '../core/world-state/WorldStateService';
import { IWorkingMemory } from '../core/memory/IWorkingMemory';
import { WorkingMemory } from '../memory/WorkingMemory';
import { StandardEvent, EventTypes } from '../core/events/types';
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
import { BraveSearchCapability } from '../capabilities/search/BraveSearchCapability';
import { GoogleDriveCapability } from '../capabilities/google-drive/GoogleDriveCapability';
import { GoogleDriveConnectionRepository } from '../core/integrations/google-drive/GoogleDriveConnectionRepository';
import { SecretManager } from '../core/secrets/SecretManager';
import { EncryptedDatabaseSecretStore } from '../core/secrets/stores/EncryptedDatabaseSecretStore';
import { ProposalManager } from '../core/governance/ProposalManager';
import { Logger } from '../core/logging/Logger';
import { McpClientAdapter } from '../capabilities/mcp/client/McpClientAdapter';
import { AutonomyAgreementStore } from '../core/autonomy/AutonomyAgreementStore';

/**
 * Lean Autonomous Runtime for SERA Cognitive OS.
 * Powered by Qwen 3.8 Flash with ReAct multi-step capabilities.
 */
export class Runtime {
  public worldStateService!: WorldStateService;
  public capabilityCatalog!: CapabilityCatalog;
  public dialogueEngine!: DialogueEngine;
  public proposalManager!: ProposalManager;
  public memoryStore: IWorkingMemory;
  public chatHistoryStore: any;
  public threadsApi!: ThreadsAPI;
  public secretManager!: SecretManager;
  private logger = new Logger('Runtime');
  private static globalThreadsDaemon?: ThreadsDaemon;

  public static getGlobalThreadsDaemon(): ThreadsDaemon | undefined {
    return Runtime.globalThreadsDaemon;
  }

  constructor(
    memoryStore?: IWorkingMemory,
    chatHistoryStore?: any,
    private readonly autonomyAgreementStore?: AutonomyAgreementStore,
    private readonly persistUserData: boolean = true,
    private readonly subscriptionService?: any
  ) {
    this.memoryStore = memoryStore || new WorkingMemory();
    this.chatHistoryStore = chatHistoryStore;
  }

  public stop(): void {
    Runtime.globalThreadsDaemon?.stop();
  }

  public setGlobalEventBus(globalEventBus: any, options?: { disableMcp?: boolean, sessionId?: string, persistUserData?: boolean }): void {
    const persistUserData = options?.persistUserData ?? this.persistUserData;
    this.worldStateService = new WorldStateService(globalEventBus, options?.sessionId || 'default', { persistLocally: persistUserData });
    this.secretManager = new SecretManager(new EncryptedDatabaseSecretStore());

    const activationStore = new ConnectorActivationStore(this.secretManager, options?.sessionId || 'default');
    this.capabilityCatalog = new CapabilityCatalog(activationStore);

    const walletCap = new WalletToolCapability();
    const commCap = new CommunicationToolCapability();
    const autonomyAgreementCap = new AutonomyAgreementCapability();
    const threadsApi = new ThreadsAPI(this.secretManager);
    this.threadsApi = threadsApi;
    const googleDriveRepo = GoogleDriveConnectionRepository.fromEnvironment();
    const googleDriveCap = googleDriveRepo ? (GoogleDriveCapability.fromEnvironment(googleDriveRepo) || undefined) : undefined;
    const threadsCap = new ThreadsCapability(threadsApi, this.secretManager, undefined, googleDriveCap);
    const imageGenCap = new ImageGenerationCapability();
    const braveSearchCap = new BraveSearchCapability();

    if (process.env.THREADS_APP_ID && !Runtime.globalThreadsDaemon) {
      const activeSession = options?.sessionId || 'default';
      Runtime.globalThreadsDaemon = new ThreadsDaemon(
        threadsApi,
        globalEventBus,
        activeSession,
        this.secretManager
      );
      Runtime.globalThreadsDaemon.start(3 * 60 * 1000);
    }

    // ── Register Connectors ───────────────────────────────────────────────
    this.capabilityCatalog.registerConnector({
      id: 'wallet',
      name: 'Base Network',
      category: 'finance',
      description: 'On-chain USDC/ETH transfers & Agent Vault',
      riskSummary: 'Core wallet functionality on Base network.',
      network: 'Base',
      alwaysActive: true,
      tools: walletCap.getTools(),
    });

    this.capabilityCatalog.registerConnector({
      id: 'communication',
      name: 'Agent Comm',
      category: 'connectors',
      description: 'Inter-agent communication via XMT',
      riskSummary: 'Inter-agent communication network.',
      alwaysActive: true,
      tools: commCap.getTools(),
    });

    this.capabilityCatalog.registerConnector({
      id: 'media_generation',
      name: 'Media Studio',
      category: 'connectors',
      description: 'Generate high-quality images from text',
      riskSummary: 'Uses Qwen-Image/Wanx.',
      alwaysActive: true,
      tools: imageGenCap.getTools(),
      executeTool: imageGenCap.executeTool.bind(imageGenCap),
    });

    this.capabilityCatalog.registerConnector({
      id: 'web_search',
      name: 'Web Intelligence',
      category: 'connectors',
      description: 'Live internet web search powered by Brave',
      riskSummary: 'Fetches real-time web search results.',
      alwaysActive: true,
      tools: braveSearchCap.getTools(),
      executeTool: braveSearchCap.executeTool.bind(braveSearchCap),
    });

    this.capabilityCatalog.registerConnector({
      id: 'autonomy',
      name: 'Operating Agreements',
      category: 'connectors',
      description: 'Manage delegation scopes and autonomy agreements',
      riskSummary: 'Defines autonomous authority levels.',
      alwaysActive: true,
      tools: autonomyAgreementCap.getTools(),
    });

    this.capabilityCatalog.registerConnector({
      id: 'hyperliquid',
      name: 'Hyperliquid Spot Trading',
      category: 'finance',
      description: 'On-chain CLOB orderbook trading, live market data & portfolio',
      riskSummary: 'Real-time orderbook pricing, spot orders, and portfolio tracking on Hyperliquid L1.',
      network: 'Hyperliquid L1',
      alwaysActive: false,
      tools: [
        {
          name: 'HL_SPOT_MARKET_DATA',
          description: 'Fetches live spot market data from Hyperliquid orderbook: price, 24h volume, bid/ask, and price change.',
          parameters: { type: 'object', properties: { coin: { type: 'string', description: 'Token symbol (e.g. HYPE, ETH, BTC)' } }, required: ['coin'] }
        },
        {
          name: 'HL_SPOT_ORDER',
          description: 'Places a spot buy or sell order on Hyperliquid (Market or Limit).',
          parameters: {
            type: 'object',
            properties: {
              coin: { type: 'string', description: 'Token symbol' },
              side: { type: 'string', enum: ['buy', 'sell'] },
              amount: { type: 'number', description: 'Amount in USDC' },
              orderType: { type: 'string', enum: ['market', 'limit'] },
              limitPrice: { type: 'number' }
            },
            required: ['coin', 'side', 'amount']
          },
          requiresApproval: true
        },
        {
          name: 'HL_SPOT_CANCEL',
          description: 'Cancels a resting limit order on the spot market.',
          parameters: { type: 'object', properties: { coin: { type: 'string' }, orderId: { type: 'number' } }, required: ['coin', 'orderId'] },
          requiresApproval: true
        },
        {
          name: 'HL_SPOT_PORTFOLIO',
          description: 'Shows user complete portfolio with all token holdings and USD valuations.',
          parameters: { type: 'object', properties: {} }
        },
        {
          name: 'HL_SPOT_OPEN_ORDERS',
          description: 'Lists all active resting limit orders on the spot market.',
          parameters: { type: 'object', properties: {} }
        }
      ],
    });

    this.capabilityCatalog.registerConnector({
      id: 'threads',
      name: 'Threads',
      category: 'communication',
      description: 'Autonomous posting and replies on Meta Threads',
      riskSummary: 'Read and publish posts on Threads.',
      network: 'Web2',
      alwaysActive: false,
      tools: threadsCap.getTools(),
      executeTool: (name: string, args: any, context?: any) => threadsCap.executeTool(name, args, context),
    });

    this.capabilityCatalog.registerConnector({
      id: 'telegram',
      name: 'Telegram Bot',
      category: 'communication',
      description: 'Chat with Sera anytime via Telegram',
      riskSummary: 'Connect personal Telegram account.',
      network: 'Web2',
      alwaysActive: false,
      tools: [],
    });

    if (!options?.disableMcp) {
      const mcpMemoryClient = new McpClientAdapter(
        'memory-server',
        'npx',
        ['-y', '@modelcontextprotocol/server-memory'],
        globalEventBus,
        this.capabilityCatalog
      );
      mcpMemoryClient.connect().catch(console.error);

      const mcpBraveClient = new McpClientAdapter(
        'brave-search-server',
        'npx',
        ['-y', '@modelcontextprotocol/server-brave-search'],
        globalEventBus,
        this.capabilityCatalog
      );
      mcpBraveClient.connect().catch((e) => {
        this.logger.warn(`Failed to connect to Brave MCP: ${e.message}`);
      });
    }

    this.proposalManager = new ProposalManager(globalEventBus);

    // Qwen 3.8 Flash everywhere (Fast, Native Multimodal Vision, 128k context, Sub-second latency)
    const qwenFlash = new QwenAdapter(process.env.QWEN_LIGHT_MODEL || 'qwen3.8-flash');
    const qwenMax = new QwenAdapter(process.env.QWEN_HIGH_RISK_MODEL || 'qwen3.8-flash');
    const qwenVision = new QwenAdapter(process.env.QWEN_VISION_MODEL || 'qwen3.8-flash');
    const registry = new ModelRegistry([qwenFlash, qwenMax, qwenVision]);
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
    console.log('[Runtime] Lean Autonomous ReAct Agent Runtime Initialized (Qwen 3.8 Flash)');
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

  getMemory() {
    return this.memoryStore.getHistory();
  }
}
