import 'dotenv/config';
import { EventEmitter } from 'events';
import { base } from 'viem/chains';
import { StandardEvent, EventTypes, GoalResultPayload } from '../core/events/types';
import {
  UnavailableWalletCustodyProvider,
  WalletCustodyProvider,
  WalletCustodyUnavailableError,
} from '../capabilities/wallet/WalletCustodyProvider';
import { createWalletCustodyProvider } from '../capabilities/wallet/WalletCustodyProviderFactory';
import { TriggerEngine } from '../core/triggers/TriggerEngine';
import { AutonomyAgreementStore } from '../core/autonomy/AutonomyAgreementStore';
import { HyperliquidClient } from '../capabilities/hyperliquid/HyperliquidClient';
import { HyperliquidTokenRegistry } from '../capabilities/hyperliquid/HyperliquidTokenRegistry';
import { AutoBridgeService } from '../capabilities/hyperliquid/AutoBridgeService';
import { HyperliquidSpotCapability } from '../capabilities/hyperliquid/HyperliquidSpotCapability';
import { GasAbstractionService } from '../capabilities/wallet/GasAbstractionService';
import { SecretManager } from '../core/secrets/SecretManager';
import { EncryptedDatabaseSecretStore } from '../core/secrets/stores/EncryptedDatabaseSecretStore';
import { ThreadsAPI } from '../capabilities/threads/ThreadsAPI';
import { ThreadsPostHistoryStore } from '../capabilities/threads/ThreadsPostHistoryStore';
import {
  SupabaseTransferAuditRepository,
  TransferAuditRepository,
} from '../core/persistence/SupabaseTransferAuditRepository';
import { GoogleDriveCapability } from '../capabilities/google-drive/GoogleDriveCapability';
import { GoogleDriveConnectionRepository } from '../core/integrations/google-drive/GoogleDriveConnectionRepository';
import { WebSearchCapability } from '../capabilities/search/WebSearchCapability';
import { GDriveGoalHandler } from './handlers/GDriveGoalHandler';
import { ThreadsGoalHandler } from './handlers/ThreadsGoalHandler';
import { CryptoGoalHandler } from './handlers/CryptoGoalHandler';
import { TriggerGoalHandler } from './handlers/TriggerGoalHandler';
import { WalletGoalHandler } from './handlers/WalletGoalHandler';
import { VertexSearchGoalHandler } from './handlers/VertexSearchGoalHandler';
import { VertexSearchService } from '../capabilities/vertex-search/VertexSearchService';
import { VaultIndexSyncService } from '../capabilities/vertex-search/VaultIndexSyncService';

/**
 * GoalBridge — Connects the Sera EventBus to real Capabilities.
 *
 * Architecture role: Runtime Bridge (src/runtime/)
 * - Listens for SPAWN_GOAL / DOMAIN_ACTION_DISPATCHED events
 * - Routes each intent to specialized domain handlers (GDrive, Threads, Crypto, Triggers, Wallet)
 * - Emits GOAL_RESULT events back onto the EventBus
 *
 * Wallet custody is injected behind a provider boundary. The local-key
 * implementation remains development-only; production fails closed until a
 * managed provider is configured and testnet-verified.
 */
export class GoalBridge {
  private eventBus: EventEmitter;
  private walletAdapter: WalletCustodyProvider;
  private readonly walletHandler: WalletGoalHandler;

  public get walletInitialized(): boolean {
    return this.walletHandler.walletInitialized;
  }
  public set walletInitialized(val: boolean) {
    this.walletHandler.walletInitialized = val;
  }

  public get walletInitializing(): Promise<void> | null {
    return this.walletHandler.walletInitializing;
  }
  public set walletInitializing(val: Promise<void> | null) {
    this.walletHandler.walletInitializing = val;
  }

  public get currentWalletId(): { address: string; network: string } | null {
    return this.walletHandler.currentWalletId;
  }
  public set currentWalletId(val: { address: string; network: string } | null) {
    this.walletHandler.currentWalletId = val;
  }

  private sessionId: string;

  // Domain handlers for modular, scalable architecture
  private readonly gdriveHandler: GDriveGoalHandler;
  private readonly threadsHandler: ThreadsGoalHandler;
  private readonly cryptoHandler: CryptoGoalHandler;
  private readonly triggerHandler: TriggerGoalHandler;
  private readonly vertexSearchHandler: VertexSearchGoalHandler;

  // Google Drive capability (lazy-initialized)
  private _googleDriveCapability: GoogleDriveCapability | null = null;
  public get googleDriveCapability(): GoogleDriveCapability {
    if (!this._googleDriveCapability) {
      const connections = GoogleDriveConnectionRepository.fromEnvironment();
      if (!connections) throw new Error('GoogleDriveConnectionRepository missing environment variables.');
      this._googleDriveCapability = GoogleDriveCapability.fromEnvironment(connections)!;
      if (!this._googleDriveCapability) throw new Error('GoogleDriveCapability failed to initialize.');
    }
    return this._googleDriveCapability;
  }

  // Vertex Search service (lazy-initialized)
  private _vertexSearchService: VertexSearchService | null = null;
  public get vertexSearchService(): VertexSearchService {
    if (!this._vertexSearchService) {
      this._vertexSearchService = new VertexSearchService();
    }
    return this._vertexSearchService;
  }

  // Vault Index Sync service (lazy-initialized)
  private _vaultIndexSyncService: VaultIndexSyncService | null = null;
  public get vaultIndexSyncService(): VaultIndexSyncService {
    if (!this._vaultIndexSyncService) {
      this._vaultIndexSyncService = new VaultIndexSyncService({
        vertexSearchService: this.vertexSearchService,
        googleDriveCapability: this.googleDriveCapability
      });
    }
    return this._vaultIndexSyncService;
  }

  // Hyperliquid spot trading capability (lazy-initialized)
  private _hlSpot: HyperliquidSpotCapability | null = null;
  public get hlSpot(): HyperliquidSpotCapability {
    if (!this._hlSpot) {
      const hlClient = new HyperliquidClient();
      const hlTokenRegistry = new HyperliquidTokenRegistry(hlClient);
      const autoBridge = new AutoBridgeService(hlClient);
      const gasService = new GasAbstractionService();
      this._hlSpot = new HyperliquidSpotCapability(hlClient, hlTokenRegistry, autoBridge, gasService);
      console.log('[GoalBridge] Hyperliquid spot capability initialized.');
    }
    return this._hlSpot;
  }
  private readonly threadsApi: ThreadsAPI;
  private readonly threadsPostHistoryStore: ThreadsPostHistoryStore;

  constructor(
    eventBus: EventEmitter,
    sessionId: string = 'dev',
    private readonly personalWalletAddress?: string,
    private readonly autonomyAgreementStore?: AutonomyAgreementStore,
    private readonly transferAudit: TransferAuditRepository | null = SupabaseTransferAuditRepository.fromEnvironment(),
    private readonly triggerEngine?: TriggerEngine,
    secretManager?: SecretManager,
    threadsPostHistoryStore?: ThreadsPostHistoryStore
  ) {
    this.eventBus = eventBus;
    this.sessionId = sessionId;
    this.threadsApi = new ThreadsAPI(secretManager || new SecretManager(new EncryptedDatabaseSecretStore()));
    this.threadsPostHistoryStore = threadsPostHistoryStore || new ThreadsPostHistoryStore();

    // Instantiate domain handlers
    this.gdriveHandler = new GDriveGoalHandler(
      () => this.googleDriveCapability,
      this.sessionId,
      this.emitResult.bind(this)
    );
    this.threadsHandler = new ThreadsGoalHandler(
      this.threadsApi,
      this.threadsPostHistoryStore,
      this.sessionId,
      this.emitResult.bind(this),
      () => this.googleDriveCapability
    );
    this.cryptoHandler = new CryptoGoalHandler(
      () => this.hlSpot,
      this.sessionId,
      this.emitResult.bind(this),
      this.personalWalletAddress,
      () => this.currentWalletId?.address
    );
    this.triggerHandler = new TriggerGoalHandler(
      this.triggerEngine,
      this.autonomyAgreementStore,
      this.eventBus,
      this.sessionId,
      this.emitResult.bind(this),
      this.requestContextMap
    );
    this.vertexSearchHandler = new VertexSearchGoalHandler(
      () => this.vertexSearchService,
      () => this.vaultIndexSyncService,
      this.sessionId,
      this.emitResult.bind(this)
    );

    try {
      this.walletAdapter = createWalletCustodyProvider();
    } catch (error) {
      if (!(error instanceof WalletCustodyUnavailableError)) throw error;
      this.walletAdapter = new UnavailableWalletCustodyProvider(error.message);
      console.warn(`[GoalBridge] Wallet capability unavailable: ${error.message}`);
    }

    this.walletHandler = new WalletGoalHandler(
      this.walletAdapter,
      this.eventBus,
      this.sessionId,
      this.emitResult.bind(this),
      typeof this.personalWalletAddress === 'string' ? this.personalWalletAddress : undefined,
      this.transferAudit
    );

    if (this.walletAdapter instanceof UnavailableWalletCustodyProvider) {
      this.walletHandler.walletInitializing = Promise.resolve();
      process.nextTick(() => {
        this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
          id: `evt-ws-fallback-${Date.now()}`,
          type: EventTypes.DOMAIN_WALLET_STATE,
          source: 'GoalBridge',
          payload: {
            address: (typeof this.personalWalletAddress === 'string' ? this.personalWalletAddress : '') || '',
            vaultAddress: '',
            balance: '0',
            vaultBalance: '0',
            vaultBalances: { base: '0', polygon: '0', ethereum: '0' },
            network: 'auto',
            asset: 'USDC',
            syncing: false
          },
          timestamp: Date.now()
        });
      });
    } else {
      this.walletHandler.walletInitializing = this.walletHandler.initWallet(sessionId !== 'dev' ? sessionId : undefined);
    }

    this.eventBus.on(EventTypes.DOMAIN_ACTION_DISPATCHED, this.handleDispatchedAction.bind(this));
    console.log(`[GoalBridge] Initialized for session ${sessionId}. Listening for SPAWN_GOAL events.`);
  }

  private recentlyHandledRequests: Map<string, number> = new Map();
  private requestContextMap: Map<string, { _responseContext?: any; _userMessage?: any }> = new Map();

  private emitResult(requestId: string, success: boolean, data: Record<string, any>, errorMessage?: string): void {
    let effectiveData = data || {};
    const meta = this.requestContextMap.get(requestId);
    if (meta) {
      effectiveData = { ...meta, ...effectiveData };
      this.requestContextMap.delete(requestId);
    }
    const resultPayload: GoalResultPayload = { requestId, success, data: effectiveData, errorMessage };
    const event: StandardEvent = {
      id: `evt-result-${Date.now()}`,
      type: EventTypes.DOMAIN_GOAL_RESULT,
      source: 'GoalBridge',
      correlationId: requestId,
      payload: resultPayload,
      timestamp: Date.now(),
    };
    this.eventBus.emit(EventTypes.DOMAIN_GOAL_RESULT, event);
  }

  private async handleDispatchedAction(event: StandardEvent): Promise<void> {
    const payload = event?.payload || event || {};
    const actionType = payload.actionType || payload.intent;
    const actionPayload = payload.actionPayload || payload.parameters || payload || {};
    const context = payload.context || {};
    const requestId = context?.triggerId || payload.requestId || event.correlationId || `req-${Date.now()}`;

    if (actionPayload._responseContext || actionPayload._userMessage) {
      this.requestContextMap.set(requestId, {
        _responseContext: actionPayload._responseContext,
        _userMessage: actionPayload._userMessage
      });
    }

    // Deduplicate duplicate dispatches with identical requestId within 10 seconds
    const now = Date.now();
    if (this.recentlyHandledRequests.has(requestId)) {
      const lastHandled = this.recentlyHandledRequests.get(requestId)!;
      if (now - lastHandled < 10000) {
        console.log(`[GoalBridge] Skipping duplicate dispatch for requestId: ${requestId} (${actionType})`);
        return;
      }
    }
    this.recentlyHandledRequests.set(requestId, now);
    if (this.recentlyHandledRequests.size > 200) {
      for (const [k, ts] of this.recentlyHandledRequests.entries()) {
        if (now - ts > 30000) this.recentlyHandledRequests.delete(k);
      }
    }
    if (this.requestContextMap.size > 200) {
      this.requestContextMap.clear();
    }

    console.log(`\n[GoalBridge] Handling action: ${actionType} (requestId: ${requestId})`);

    try {
      switch (actionType) {
        case 'CHECK_WALLET_BALANCE':
          await this.handleCheckBalance(requestId);
          break;

        case 'TRANSFER_FUNDS':
          await this.handleTransferFunds(requestId, actionPayload);
          break;

        case 'CHECK_NETWORK':
          this.emitResult(requestId, true, {
            network: 'Base Mainnet',
            chainId: base.id,
            rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
            status: this.walletInitialized ? 'connected' : 'wallet_error',
          });
          break;

        case 'SCHEDULE_GOAL':
          await this.triggerHandler.handleScheduleGoal(requestId, actionPayload);
          break;

        case 'SPOT_SWAP':
          await this.cryptoHandler.handleSpotSwap(requestId, actionPayload);
          break;
        case 'RESOLVE_TOKEN':
          await this.cryptoHandler.handleResolveToken(requestId, actionPayload);
          break;

        // Hyperliquid Spot Trading
        case 'HL_SPOT_MARKET_DATA':
          await this.cryptoHandler.handleHLSpotMarketData(requestId, actionPayload);
          break;
        case 'HL_SPOT_ORDER':
          await this.cryptoHandler.handleHLSpotOrder(requestId, actionPayload);
          break;
        case 'HL_SPOT_CANCEL':
          await this.cryptoHandler.handleHLSpotCancel(requestId, actionPayload);
          break;
        case 'HL_SPOT_PORTFOLIO':
          await this.cryptoHandler.handleHLSpotPortfolio(requestId);
          break;
        case 'HL_SPOT_OPEN_ORDERS':
          await this.cryptoHandler.handleHLSpotOpenOrders(requestId);
          break;
        case 'ACTIVATE_AUTONOMY_AGREEMENT':
          this.triggerHandler.handleActivateAutonomyAgreement(requestId, actionPayload);
          break;
        case 'THREADS_PUBLISH':
        case 'THREADS_REPLY':
          await this.threadsHandler.handlePublish(requestId, actionPayload);
          break;
        case 'THREADS_DELETE':
          await this.threadsHandler.handleDelete(requestId, actionPayload);
          break;
        case 'THREADS_GET_POSTS':
          await this.threadsHandler.handleGetPosts(requestId, actionPayload);
          break;
        case 'THREADS_GET_INSIGHTS':
          await this.threadsHandler.handleGetInsights(requestId, actionPayload);
          break;

        case 'GDRIVE_WRITE':
        case 'gdrive:write_file':
          await this.gdriveHandler.handleWrite(requestId, actionPayload);
          break;
        case 'GDRIVE_APPEND':
        case 'gdrive:append_file':
          await this.gdriveHandler.handleAppend(requestId, actionPayload);
          break;
        case 'GDRIVE_READ':
        case 'gdrive:read_file':
          await this.gdriveHandler.handleRead(requestId, actionPayload);
          break;
        case 'GDRIVE_CREATE_SPREADSHEET':
        case 'GDRIVE_CREATE_SHEET':
        case 'gdrive:create_sheet':
        case 'SPREADSHEET':
        case 'CREATE_SPREADSHEET':
        case 'sera_gdrive_create_sheet':
        case 'SHEET_CREATE':
          await this.gdriveHandler.handleCreateSheet(requestId, actionPayload);
          break;
        case 'GDRIVE_UPDATE_CELL':
        case 'UPDATE_CELL':
        case 'gdrive:update_cell':
          await this.gdriveHandler.handleUpdateCell(requestId, actionPayload);
          break;
        case 'GDRIVE_LIST':
        case 'gdrive:list_files':
          await this.gdriveHandler.handleList(requestId, actionPayload);
          break;
        case 'GDRIVE_DELETE':
        case 'GDRIVE_DELETE_FILE':
        case 'DELETE_FILE':
        case 'gdrive:delete_file':
          await this.gdriveHandler.handleDelete(requestId, actionPayload);
          break;
        case 'GDRIVE_SAVE_MEDIA':
        case 'gdrive:save_media':
        case 'SAVE_MEDIA':
          await this.gdriveHandler.handleSaveMedia(requestId, actionPayload);
          break;
        case 'GDRIVE_CREATE_FOLDER':
        case 'CREATE_FOLDER':
        case 'gdrive:create_folder':
          await this.gdriveHandler.handleCreateFolder(requestId, actionPayload);
          break;
        case 'GDRIVE_RENAME':
        case 'RENAME':
        case 'RENAME_FILE':
        case 'RENAME_FOLDER':
        case 'gdrive:rename':
          await this.gdriveHandler.handleRename(requestId, actionPayload);
          break;
        case 'GDRIVE_MOVE':
        case 'MOVE':
        case 'MOVE_FILE':
        case 'gdrive:move':
          await this.gdriveHandler.handleMove(requestId, actionPayload);
          break;
        case 'GDRIVE_DELETE_FOLDER':
        case 'DELETE_FOLDER':
        case 'gdrive:delete_folder':
          await this.gdriveHandler.handleDeleteFolder(requestId, actionPayload);
          break;
        case 'GDRIVE_TIDY_VAULT':
        case 'TIDY_VAULT':
        case 'gdrive:tidy_vault':
        case 'RAPIKAN_DRIVE':
          await this.gdriveHandler.handleTidyVault(requestId, actionPayload);
          break;

        case 'VAULT_DEEP_SEARCH':
        case 'VAULT_SEARCH':
        case 'DEEP_SEARCH':
        case 'sera_vault_deep_search':
          await this.vertexSearchHandler.handleVaultSearch(requestId, actionPayload);
          break;

        case 'VAULT_SYNC_INDEX':
        case 'SYNC_VAULT_INDEX':
          await this.vertexSearchHandler.handleSyncIndex(requestId, actionPayload);
          break;

        case 'KNOWLEDGE_SEARCH':
        case 'DOMAIN_KNOWLEDGE_SEARCH':
          await this.vertexSearchHandler.handleKnowledgeSearch(requestId, actionPayload);
          break;

        case 'CONVERSATION':
        case 'NONE':
        case 'NO_ACTION':
        case 'DIRECT_ANSWER':
          this.emitResult(requestId, true, { summary: 'Conversational turn completed successfully.' });
          break;

        case 'SEND_MESSAGE':
        case 'SEND_NOTIFICATION':
        case 'NOTIFY_USER':
        case 'REMIND_USER':
        case 'READ_CHANNEL_CONTEXT':
          // Communication actions are handled asynchronously by CommunicationBridge; do not reject
          return;

        case 'WEB_SEARCH':
        case 'web_search':
        case 'search':
        case 'brave_web_search':
          await this.handleWebSearch(requestId, actionPayload);
          break;

        default:
          this.emitResult(requestId, false, {}, `Unknown action: ${actionType}`);
      }
    } catch (error: any) {
      console.error(`[GoalBridge] Error handling action ${actionType}:`, error.message);
      this.emitResult(requestId, false, {}, error.message);
    }
  }

  private async handleWebSearch(requestId: string, parameters: Record<string, any>): Promise<void> {
    const searchCap = new WebSearchCapability();
    const query = String(parameters?.query || parameters?.q || parameters?.searchQuery || parameters?.searchTerm || '').trim();
    const result = await searchCap.executeTool('WEB_SEARCH', { ...parameters, query });
    this.emitResult(requestId, true, result);
  }

  public async handleScheduleGoal(requestId: string, parameters: Record<string, any>): Promise<void> {
    return this.triggerHandler.handleScheduleGoal(requestId, parameters);
  }

  public async handleCheckBalance(requestId: string): Promise<void> {
    return this.walletHandler.handleCheckBalance(requestId);
  }

  public async handleTransferFunds(requestId: string, parameters: Record<string, any>): Promise<void> {
    return this.walletHandler.handleTransferFunds(requestId, parameters);
  }

  public async syncWalletState(): Promise<void> {
    return this.walletHandler.syncWalletState();
  }

  public async directTransfer(params: { recipientAddress: string; amount: number; asset: string }): Promise<any> {
    return this.walletHandler.directTransfer(params);
  }

  public async executeGaslessDeposit(payload: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
    signature?: string;
    v?: number;
    r?: string;
    s?: string;
  }): Promise<{ status: 'SUCCESS' | 'FAILED'; transactionHash?: string; error?: string }> {
    return this.walletHandler.executeGaslessDeposit(payload);
  }

  public async ensureAddressGas(targetAddress: `0x${string}`): Promise<boolean> {
    return this.walletHandler.ensureAddressGas(targetAddress);
  }

  public async refreshBalance(): Promise<any | null> {
    return this.walletHandler.refreshBalance();
  }
}

