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
import { AutonomyAgreementStore } from '../core/autonomy/AutonomyAgreementStore';
import { SeraUserContext } from '../core/identity/types';
import { ExecutionDispatcher } from '../runtime/ExecutionDispatcher';
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
  public executionDispatcher!: ExecutionDispatcher;
  public temporalClockService!: TemporalClockService;
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

    this.executionDispatcher = new ExecutionDispatcher(
      this.eventBus,
      this.sessionId
    );

    this.runtime = new Runtime(
      this.memoryStore,
      this.chatHistoryStore,
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
      },
      // =====================================================================
      // Google Drive & Spreadsheet Vault Tools
      // =====================================================================
      {
        name: 'GDRIVE_CREATE_SPREADSHEET',
        description: 'Creates a professionally formatted Excel spreadsheet (.xlsx) in Google Drive with headers, zebra striping, currency/percent formats, and optional native charts (COLUMN, LINE, PIE). Use this to create or save spreadsheets.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Name of the spreadsheet' },
            headers: { type: 'array', items: { type: 'string' }, description: 'Column headers (e.g. ["Coin", "Price (USDC)", "24h Volume"])' },
            rows: { type: 'array', items: { type: 'array' }, description: 'Data rows (array of arrays containing numbers, strings, or formulas)' },
            options: {
              type: 'object',
              description: 'Optional formatting options (sheetName, themeColor, chart)',
              properties: {
                sheetName: { type: 'string' },
                themeColor: { type: 'string' },
                includeSummaryRow: { type: 'boolean' },
                chart: {
                  type: 'object',
                  description: 'Native Google Sheets chart configuration',
                  properties: {
                    type: { type: 'string', enum: ['COLUMN', 'BAR', 'LINE', 'PIE', 'AREA'] },
                    title: { type: 'string' },
                    categoryColumn: { type: 'number', description: '0-indexed column for categories/labels' },
                    valueColumns: { type: 'array', items: { type: 'number' }, description: '0-indexed column(s) for series values' }
                  },
                  required: ['type']
                }
              }
            }
          },
          required: ['title', 'headers', 'rows']
        }
      },
      {
        name: 'GDRIVE_CREATE_SHEET',
        description: 'Alias for GDRIVE_CREATE_SPREADSHEET. Creates a professionally formatted Excel spreadsheet (.xlsx) in Google Drive.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Name of the spreadsheet' },
            headers: { type: 'array', items: { type: 'string' }, description: 'Column headers' },
            rows: { type: 'array', items: { type: 'array' }, description: 'Data rows' },
            options: { type: 'object' }
          },
          required: ['title', 'headers', 'rows']
        }
      },
      {
        name: 'GDRIVE_WRITE',
        description: 'Writes a document, note, or markdown file to Google Drive SERA Vault.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name of the file (e.g. report.md, summary.txt)' },
            content: { type: 'string', description: 'Text content to write' },
            mimeType: { type: 'string', description: 'Optional mime type (e.g. text/markdown, text/plain)' }
          },
          required: ['filename', 'content']
        }
      },
      {
        name: 'GDRIVE_APPEND',
        description: 'Appends text content to an existing document or note in Google Drive SERA Vault without overwriting.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name of the file to append to' },
            content: { type: 'string', description: 'Text content to append' }
          },
          required: ['filename', 'content']
        }
      },
      {
        name: 'GDRIVE_READ',
        description: 'Reads a file from Google Drive SERA Vault by filename or fileId.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name of the file to read' },
            fileId: { type: 'string', description: 'Direct file ID if known' }
          }
        }
      },
      {
        name: 'GDRIVE_LIST',
        description: 'Lists or searches files inside Google Drive SERA Vault folder.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Filter by exact file name' },
            searchTerm: { type: 'string', description: 'Search query for file names' },
            mimeType: { type: 'string', description: 'Filter by mime type' }
          }
        }
      },
      {
        name: 'GDRIVE_DELETE',
        description: 'Deletes an obsolete file from Google Drive SERA Vault.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name of the file to delete' },
            fileId: { type: 'string', description: 'Direct file ID if known' }
          }
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
    this.cognitiveCompressor.stop();
    this.experienceBuilder.stop();
    this.runtime.stop();
  }
}
