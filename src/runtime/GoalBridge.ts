import 'dotenv/config';
import { EventEmitter } from 'events';
import { formatEther } from 'viem';
import { base } from 'viem/chains';
import { StandardEvent, EventTypes, SpawnGoalPayload, GoalResultPayload } from '../core/events/types';
import {
  UnavailableWalletCustodyProvider,
  WalletCustodyProvider,
  WalletCustodyUnavailableError,
} from '../capabilities/wallet/WalletCustodyProvider';
import { createWalletCustodyProvider } from '../capabilities/wallet/WalletCustodyProviderFactory';
import { TriggerEngine } from '../core/triggers/TriggerEngine';

import { AutonomyAgreementStore } from '../core/autonomy/AutonomyAgreementStore';
import { BaseSpotMarketCapability } from '../capabilities/spot/BaseSpotMarketCapability';
import { TokenResolverService } from '../capabilities/spot/TokenResolverService';
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
  TransferAuditEvent,
  TransferAuditRepository,
} from '../core/persistence/SupabaseTransferAuditRepository';
import { GoogleDriveCapability } from '../capabilities/google-drive/GoogleDriveCapability';
import { GoogleDriveConnectionRepository } from '../core/integrations/google-drive/GoogleDriveConnectionRepository';

/**
 * GoalBridge — Connects the Sera EventBus to real Capabilities.
 *
 * Architecture role: Runtime Bridge (src/runtime/)
 * - Listens for SPAWN_GOAL events from DialogueEngine
 * - Routes each intent to the appropriate Capability
 * - Emits GOAL_RESULT events back onto the EventBus
 *
 * Wallet custody is injected behind a provider boundary. The local-key
 * implementation remains development-only; production fails closed until a
 * managed provider is configured and testnet-verified.
 */
export class GoalBridge {
  private eventBus: EventEmitter;
  private walletAdapter: WalletCustodyProvider;
  public walletInitialized = false;
  public walletInitializing: Promise<void> | null = null;
  public currentWalletId: { address: string; network: string } | null = null;
  private cachedPersonal: string = '0';
  private cachedVault: string = '0';
  private sessionId: string;

  private readonly spotMarket = new BaseSpotMarketCapability();
  private readonly tokenResolver = new TokenResolverService();

  // Google Drive capability (lazy-initialized)
  private _googleDriveCapability: GoogleDriveCapability | null = null;
  private get googleDriveCapability(): GoogleDriveCapability {
    if (!this._googleDriveCapability) {
      const connections = GoogleDriveConnectionRepository.fromEnvironment();
      if (!connections) throw new Error('GoogleDriveConnectionRepository missing environment variables.');
      this._googleDriveCapability = GoogleDriveCapability.fromEnvironment(connections)!;
      if (!this._googleDriveCapability) throw new Error('GoogleDriveCapability failed to initialize.');
    }
    return this._googleDriveCapability;
  }

  // Hyperliquid spot trading capability (lazy-initialized)
  private _hlSpot: HyperliquidSpotCapability | null = null;
  private get hlSpot(): HyperliquidSpotCapability {
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
    this.eventBus.on(EventTypes.DOMAIN_ACTION_DISPATCHED, this.handleDispatchedAction.bind(this));

    try {
      this.walletAdapter = createWalletCustodyProvider();

      // Pre-warm: initialize wallet on boot (generates one if it doesn't exist)
      this.walletInitializing = this.initWallet(sessionId !== 'dev' ? sessionId : undefined);
    } catch (error) {
      if (!(error instanceof WalletCustodyUnavailableError)) throw error;

      // A missing managed custody adapter must never create or use a server
      // private key. It also must not prevent unrelated Core capabilities
      // (dialogue, memory, Google Drive) from serving users.
      this.walletAdapter = new UnavailableWalletCustodyProvider(error.message);
      this.walletInitializing = Promise.resolve();
      console.warn(`[GoalBridge] Wallet capability unavailable: ${error.message}`);

      process.nextTick(() => {
        this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
          id: `evt-ws-fallback-${Date.now()}`,
          type: EventTypes.DOMAIN_WALLET_STATE,
          source: 'GoalBridge',
          payload: {
            address: this.personalWalletAddress || '',
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
    }

    console.log(`[GoalBridge] Initialized for session ${sessionId}. Listening for SPAWN_GOAL events.`);
  }



  private async initWallet(userAddress?: string): Promise<void> {
    try {
      const walletId = await this.walletAdapter.initializeAgentWallet(userAddress);
      this.walletInitialized = true;
      this.currentWalletId = walletId;

      let primaryAddress = '';
      let vaultAddress = '';
      let primaryBalance = '0';
      let primaryEthBalance = '0';
      let vaultBalance = '0';

      // EMIT SYNCING FIRST
      if (!userAddress) {
        primaryAddress = walletId.address;
        vaultAddress = process.env.SERA_VAULT_ADDRESS || '';
      } else {
        primaryAddress = this.personalWalletAddress || walletId.address;
        vaultAddress = walletId.address;
      }
      this.emitSyncing(primaryAddress, vaultAddress, walletId.network);

      if (!userAddress) {
        // --- DEV BYPASS MODE (Legacy Behavior) ---
        primaryAddress = walletId.address;
        vaultAddress = process.env.SERA_VAULT_ADDRESS || '';

        try {
          const [pb, eb] = await Promise.allSettled([
            this.walletAdapter.getBalance(walletId, 'usdc'),
            this.walletAdapter.getAddressBalance(walletId.address as `0x${string}`, 'eth', 'base-mainnet'),
          ]);
          primaryBalance = pb.status === 'fulfilled' ? pb.value.toString() : '0';
          primaryEthBalance = eb.status === 'fulfilled' ? eb.value.toString() : '0';
        } catch (e) {
          console.error('Failed to get primary balance in dev mode:', e);
        }

        if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
          try {
            const vb = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc');
            vaultBalance = vb.toString();
          } catch (e) {
            console.error('Failed to get vault balance in dev mode:', e);
          }
        }
      } else {
        // --- 1:1 AGENT WALLET MODE ---
        primaryAddress = this.personalWalletAddress || walletId.address;
        vaultAddress = walletId.address; // The generated agent wallet for this user

        // Fetch actual user balance instead of mocking
        try {
          if (primaryAddress) {
            const [pb, eb] = await Promise.allSettled([
              this.walletAdapter.getAddressBalance(primaryAddress as `0x${string}`, 'usdc', 'base-mainnet'),
              this.walletAdapter.getAddressBalance(primaryAddress as `0x${string}`, 'eth', 'base-mainnet'),
            ]);
            primaryBalance = pb.status === 'fulfilled' ? pb.value.toString() : '0';
            primaryEthBalance = eb.status === 'fulfilled' ? eb.value.toString() : '0';
          } else {
            primaryBalance = '0';
            primaryEthBalance = '0';
          }
        } catch (e) {
          console.warn('[GoalBridge] Failed to get user personal balance:', e);
          primaryBalance = '0';
          primaryEthBalance = '0';
        }

        if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
          try {
            const vb = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc');
            vaultBalance = vb.toString();
          } catch (e) {
            console.error('Failed to get agent vault balance:', e);
          }
        }
      }

      this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
        id: `evt-ws-${Date.now()}`,
        type: EventTypes.DOMAIN_WALLET_STATE,
        source: 'GoalBridge',
        payload: {
          address: primaryAddress,
          vaultAddress,
          balance: primaryBalance,
          ethBalance: primaryEthBalance,
          vaultBalance,
          vaultBalances: { base: vaultBalance, polygon: '0', ethereum: '0' },
          network: walletId.network,
          asset: 'USDC',
          syncing: false
        },
        timestamp: Date.now()
      });
    } catch (err: any) {
      console.error('[GoalBridge] Wallet initialization failed:', err.message);
      this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
        id: `evt-ws-err-${Date.now()}`,
        type: EventTypes.DOMAIN_WALLET_STATE,
        source: 'GoalBridge',
        payload: {
          address: this.personalWalletAddress || '',
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
    }
  }

  private recentlyHandledRequests: Map<string, number> = new Map();

  private emitResult(requestId: string, success: boolean, data: Record<string, any>, errorMessage?: string): void {
    const resultPayload: GoalResultPayload = { requestId, success, data, errorMessage };
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
    const actionPayload = payload.actionPayload || payload.parameters || {};
    const context = payload.context || {};
    const requestId = context?.triggerId || payload.requestId || event.correlationId || `req-${Date.now()}`;

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
          await this.handleScheduleGoal(requestId, actionPayload);
          break;

        case 'SPOT_SWAP':
          await this.handleSpotSwap(requestId, actionPayload);
          break;
        case 'RESOLVE_TOKEN':
          await this.handleResolveToken(requestId, actionPayload);
          break;

        // Hyperliquid Spot Trading
        case 'HL_SPOT_MARKET_DATA':
          await this.handleHLSpotMarketData(requestId, actionPayload);
          break;
        case 'HL_SPOT_ORDER':
          await this.handleHLSpotOrder(requestId, actionPayload);
          break;
        case 'HL_SPOT_CANCEL':
          await this.handleHLSpotCancel(requestId, actionPayload);
          break;
        case 'HL_SPOT_PORTFOLIO':
          await this.handleHLSpotPortfolio(requestId);
          break;
        case 'HL_SPOT_OPEN_ORDERS':
          await this.handleHLSpotOpenOrders(requestId);
          break;
        case 'ACTIVATE_AUTONOMY_AGREEMENT':
          this.handleActivateAutonomyAgreement(requestId, actionPayload);
          break;
        case 'THREADS_PUBLISH':
        case 'THREADS_REPLY':
          await this.handleThreadsPublish(requestId, actionPayload);
          break;

        case 'GDRIVE_WRITE':
        case 'gdrive:write_file':
          await this.handleGDriveWrite(requestId, actionPayload);
          break;
        case 'GDRIVE_APPEND':
        case 'gdrive:append_file':
          await this.handleGDriveAppend(requestId, actionPayload);
          break;
        case 'GDRIVE_READ':
        case 'gdrive:read_file':
          await this.handleGDriveRead(requestId, actionPayload);
          break;
        case 'GDRIVE_CREATE_SPREADSHEET':
        case 'GDRIVE_CREATE_SHEET':
        case 'gdrive:create_sheet':
          await this.handleGDriveCreateSheet(requestId, actionPayload);
          break;
        case 'GDRIVE_LIST':
        case 'gdrive:list_files':
          await this.handleGDriveList(requestId, actionPayload);
          break;
        case 'GDRIVE_DELETE':
        case 'GDRIVE_DELETE_FILE':
        case 'DELETE_FILE':
        case 'gdrive:delete_file':
          await this.handleGDriveDelete(requestId, actionPayload);
          break;

        default:
          this.emitResult(requestId, false, {}, `Unknown action: ${actionType}`);
      }
    } catch (error: any) {
      console.error(`[GoalBridge] Error handling action ${actionType}:`, error.message);
      this.emitResult(requestId, false, {}, error.message);
    }
  }

  private async handleThreadsPublish(requestId: string, parameters: Record<string, any>): Promise<void> {
    const { text, replyToId, imageUrl, driveFileName } = parameters;
    if (!text) throw new Error('Threads publish requires text parameter.');
    
    let finalImageUrl = imageUrl;
    if (driveFileName) {
      const files = await this.googleDriveCapability.listFiles(this.sessionId, { name: driveFileName });
      if (files.length === 0) throw new Error(`Drive image ${driveFileName} not found.`);
      finalImageUrl = await this.googleDriveCapability.getPublicMediaUrl(this.sessionId, files[0].id);
    }
    
    const publishedId = await this.threadsApi.publishPost(this.sessionId, text, replyToId, finalImageUrl);
    this.threadsPostHistoryStore.recordPost(this.sessionId, text, publishedId);
    this.emitResult(requestId, true, {
      provider: 'Meta Threads',
      id: publishedId,
      summary: `Successfully published to Threads (ID: ${publishedId})`
    });
  }



  private async handleSpotSwap(requestId: string, parameters: Record<string, any>): Promise<void> {
    const fromToken = parameters.fromToken || 'USDC';
    const toToken = parameters.toToken || 'WETH';
    const amountIn = Number(parameters.amount || 10);
    const recipient = parameters.recipient || this.currentWalletId?.address || '0x0000000000000000000000000000000000000000';

    const result = await this.spotMarket.executeSpotSwap({
      fromTokenSymbol: fromToken,
      toTokenSymbol: toToken,
      amountInUsdc: amountIn,
      recipientAddress: recipient
    });

    this.emitResult(requestId, result.success, result, result.errorMessage);
  }

  private async handleResolveToken(requestId: string, parameters: Record<string, any>): Promise<void> {
    const query = String(parameters.query || parameters.coin || 'WETH');
    const metadata = await this.tokenResolver.resolveToken(query);
    this.emitResult(requestId, true, metadata);
  }

  // ===========================================================================
  // Hyperliquid Spot Trading Handlers
  // ===========================================================================

  private async handleHLSpotMarketData(requestId: string, parameters: Record<string, any>): Promise<void> {
    const rawCoin = String(parameters.coin || parameters.query || parameters.symbol || '').trim();
    const isTopQuery = !rawCoin || ['all', 'top', 'coins', 'crypto', 'tokens', 'market', 'rankings', 'overview'].includes(rawCoin.toLowerCase()) || parameters.limit !== undefined;

    if (isTopQuery) {
      const limit = Number(parameters.limit || 10);
      const topData = await this.hlSpot.getTopMarketData(limit);
      this.emitResult(requestId, true, {
        provider: 'Hyperliquid Spot',
        mode: 'TOP_MARKET_OVERVIEW',
        count: topData.length,
        tokens: topData.map(d => ({
          symbol: d.coin,
          name: d.token.fullName,
          priceUsdc: d.midPrice,
          bestBid: d.bestBid,
          bestAsk: d.bestAsk,
          volume24h: d.volume24h,
          priceChange24hPercent: d.priceChange24hPercent
        }))
      });
      return;
    }

    const data = await this.hlSpot.getMarketData(rawCoin);
    this.emitResult(requestId, true, {
      provider: 'Hyperliquid Spot',
      mode: 'SPOT',
      symbol: data.coin,
      name: data.token.fullName,
      midPrice: data.midPrice,
      bestBid: data.bestBid,
      bestAsk: data.bestAsk,
      volume24h: data.volume24h,
      priceChange24hPercent: data.priceChange24hPercent
    });
  }

  private async handleHLSpotOrder(requestId: string, parameters: Record<string, any>): Promise<void> {
    const coin = String(parameters.coin || '').trim();
    const side = (parameters.side || 'buy') as 'buy' | 'sell';
    const amount = Number(parameters.amount || 0);
    const orderType = (parameters.orderType || 'market') as 'market' | 'limit';
    const limitPrice = parameters.limitPrice ? Number(parameters.limitPrice) : undefined;
    const userAddress = this.personalWalletAddress || this.sessionId;

    if (!coin) throw new Error('Please specify which token to trade (e.g. HYPE, ETH, BTC).');
    if (amount <= 0) throw new Error('Please specify a valid amount in USDC.');

    const result = await this.hlSpot.executeOrder({
      coin,
      side,
      amountUsdc: amount,
      orderType,
      limitPrice,
      userAddress
    });
    this.emitResult(requestId, result.success, result, result.errorMessage);
  }

  private async handleHLSpotCancel(requestId: string, parameters: Record<string, any>): Promise<void> {
    const coin = String(parameters.coin || '').trim();
    const orderId = Number(parameters.orderId || 0);

    if (!coin) throw new Error('Please specify the token symbol of the order to cancel.');
    if (!orderId) throw new Error('Please specify the order ID to cancel.');

    const result = await this.hlSpot.cancelOrder(coin, orderId);
    this.emitResult(requestId, result.success, result, result.errorMessage);
  }

  private async handleHLSpotPortfolio(requestId: string): Promise<void> {
    const userAddress = this.personalWalletAddress || this.sessionId;
    const portfolio = await this.hlSpot.getPortfolio(userAddress);
    this.emitResult(requestId, true, {
      provider: 'Hyperliquid Spot',
      mode: 'PORTFOLIO',
      items: portfolio.items,
      totalValueUsdc: portfolio.totalValueUsdc,
      userAddress
    });
  }

  private async handleHLSpotOpenOrders(requestId: string): Promise<void> {
    const orders = await this.hlSpot.getOpenOrders();
    this.emitResult(requestId, true, {
      provider: 'Hyperliquid Spot',
      mode: 'OPEN_ORDERS',
      orders: orders.map(o => ({
        coin: o.coin,
        side: o.side === 'B' ? 'buy' : 'sell',
        price: o.limitPx,
        size: o.sz,
        orderId: o.oid,
        timestamp: o.timestamp
      }))
    });
  }

  private handleActivateAutonomyAgreement(requestId: string, parameters: Record<string, any>): void {
    if (!this.autonomyAgreementStore) throw new Error('Autonomy Agreement store is not initialized.');
    const mode = parameters.mode === 'FULL_ACCESS' ? 'FULL_ACCESS' : 'ASSISTANT';
    const permissions = Array.isArray(parameters.permissions)
      ? parameters.permissions.filter((permission): permission is string => typeof permission === 'string' && permission.length > 0)
      : [];
    const agreement = this.autonomyAgreementStore.activate({
      principalId: this.sessionId,
      title: String(parameters.title || '').trim(),
      intent: String(parameters.intent || '').trim(),
      mode,
      permissions,
      nextActionSummary: typeof parameters.nextActionSummary === 'string' ? parameters.nextActionSummary : undefined
    });
    this.eventBus.emit(EventTypes.AUTONOMY_AGREEMENT_ACTIVATED, {
      id: `evt-agreement-${Date.now()}`,
      type: EventTypes.AUTONOMY_AGREEMENT_ACTIVATED,
      source: 'GoalBridge',
      timestamp: Date.now(),
      payload: { agreement }
    } as StandardEvent);
    this.emitResult(requestId, true, {
      agreement,
      message: 'Operating Agreement is active.',
      _userMessage: typeof parameters._userMessage === 'string' ? parameters._userMessage : undefined
    });
  }

  private async handleScheduleGoal(requestId: string, parameters: Record<string, any>): Promise<void> {
    if (!this.triggerEngine) {
      this.emitResult(requestId, false, {}, 'TriggerEngine is not initialized');
      return;
    }

    let { scheduleType, humanIntent, cronExpression, executeAfterUtc, delaySeconds, actionIntent, actionParameters } = parameters;

    // Option B Relative Interval Extraction & Cron Normalization
    let computedIntervalMs: number | undefined = undefined;
    let sanitizedCron = cronExpression ? cronExpression.trim() : undefined;

    if (scheduleType === 'cron' || parameters.intervalHours || parameters.intervalMinutes || parameters.intervalMs) {
      if (parameters.intervalMs && Number(parameters.intervalMs) > 0) {
        computedIntervalMs = Number(parameters.intervalMs);
      } else if (parameters.intervalHours && Number(parameters.intervalHours) > 0) {
        computedIntervalMs = Number(parameters.intervalHours) * 3600 * 1000;
      } else if (parameters.intervalMinutes && Number(parameters.intervalMinutes) > 0) {
        computedIntervalMs = Number(parameters.intervalMinutes) * 60 * 1000;
      } else if (sanitizedCron) {
        const parts = sanitizedCron.split(/\s+/);
        if (parts.length === 6) {
          sanitizedCron = '*/1 * * * *';
        } else if (parts.length < 5) {
          sanitizedCron = '*/5 * * * *';
        } else if (parts.length === 5) {
          if (parts[0] === '*/60') {
            parts[0] = '0';
            sanitizedCron = parts.join(' ');
          }
          if (parts[0] === '*' && parts[1].includes('/')) {
            parts[0] = '0';
            sanitizedCron = parts.join(' ');
          }
        }

        // Check for relative interval patterns (Option B)
        const mMin = sanitizedCron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
        const mHourStep = sanitizedCron.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
        const mHourEvery = sanitizedCron.match(/^0\s+\*\s+\*\s+\*\s+\*$/);

        if (mMin) {
          computedIntervalMs = Math.max(60000, parseInt(mMin[1]) * 60 * 1000);
        } else if (mHourStep) {
          computedIntervalMs = Math.max(3600000, parseInt(mHourStep[1]) * 3600 * 1000);
        } else if (mHourEvery) {
          computedIntervalMs = 3600000; // 1 hour
        }
      } else {
        computedIntervalMs = 300000; // Default: 5 minutes
      }
    }

    let computedExecuteAfterUtc = executeAfterUtc;
    if (scheduleType === 'exact' && delaySeconds !== undefined) {
      const safeDelay = Math.max(10, Number(delaySeconds));
      computedExecuteAfterUtc = new Date(Date.now() + safeDelay * 1000).toISOString();
    } else if (scheduleType === 'exact' && !executeAfterUtc) {
      // Fallback: If LLM forgets to pass delaySeconds for exact schedule, default to 60 seconds
      computedExecuteAfterUtc = new Date(Date.now() + 60000).toISOString();
    }

    const triggerId = `trg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newTrigger = {
      id: triggerId,
      type: 'TIME' as const,
      state: 'ACTIVE' as const,
      firePolicy: scheduleType === 'cron' ? ('REPEAT' as const) : ('ONCE' as const),
      condition: {
        type: scheduleType === 'cron' ? ('RECURRING' as const) : ('EXACT' as const),
        humanIntent: humanIntent || 'Recurring schedule',
        timezoneContext: 'UTC (Global)',
        internalCompiled: sanitizedCron,
        intervalMs: computedIntervalMs,
        executeAfterUtc: scheduleType === 'exact' ? computedExecuteAfterUtc : undefined,
      },
      action: {
        type: actionIntent,
        payload: actionParameters || {}
      },
      createdAt: Date.now()
    };

    this.triggerEngine.register(newTrigger);

    // Emit event so the server socket and Active Intent Stream update in real-time
    this.eventBus.emit('system.trigger.registered', {
      id: `evt-trg-reg-${Date.now()}`,
      type: 'system.trigger.registered',
      source: 'GoalBridge',
      timestamp: Date.now(),
      payload: newTrigger
    });

    this.emitResult(requestId, true, { scheduled: true, humanIntent, actionIntent, triggerId });
  }

  public async handleCheckBalance(requestId: string): Promise<void> {
    if (!this.walletInitialized) {
      this.emitResult(requestId, false, {}, 'Wallet not initialized. Check server logs for details.');
      this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
        id: `evt-wallet-err-${Date.now()}`,
        type: EventTypes.DOMAIN_WALLET_STATE,
        source: 'GoalBridge',
        payload: {
          address: this.personalWalletAddress || '',
          vaultAddress: process.env.SERA_VAULT_ADDRESS || '',
          balance: '0',
          vaultBalance: '0',
          vaultBalances: { base: '0', polygon: '0', ethereum: '0' },
          network: 'auto',
          asset: 'USDC',
          syncing: false
        },
        timestamp: Date.now()
      });
      return;
    }

    try {
      const userAddress = this.personalWalletAddress;
      const walletId = await this.walletAdapter.initializeAgentWallet(this.sessionId !== 'dev' ? this.sessionId : undefined);

      let primaryAddress = '';
      let vaultAddress = '';
      let primaryBalance = '0';
      let vaultBalance = this.cachedVault || '0';

      // Multi-network vault balances
      let vaultBalances = { base: '0', polygon: '0', ethereum: '0' };

      let primaryEthBalance = '0';
      if (!userAddress) {
        primaryAddress = walletId.address;
        vaultAddress = process.env.SERA_VAULT_ADDRESS || '';
        try {
          const [pb, eb] = await Promise.allSettled([
            this.walletAdapter.getBalance(walletId, 'usdc'),
            this.walletAdapter.getAddressBalance(walletId.address as `0x${string}`, 'eth', 'base-mainnet'),
          ]);
          primaryBalance = pb.status === 'fulfilled' ? pb.value.toString() : '0';
          primaryEthBalance = eb.status === 'fulfilled' ? eb.value.toString() : '0';
        } catch (e) {
          console.warn('[GoalBridge] Failed to get primary balance:', e);
        }
      } else {
        primaryAddress = userAddress;
        vaultAddress = walletId.address;
        try {
          const [pb, eb] = await Promise.allSettled([
            this.walletAdapter.getAddressBalance(primaryAddress as `0x${string}`, 'usdc', 'base-mainnet'),
            this.walletAdapter.getAddressBalance(primaryAddress as `0x${string}`, 'eth', 'base-mainnet'),
          ]);
          primaryBalance = pb.status === 'fulfilled' ? pb.value.toString() : '0';
          primaryEthBalance = eb.status === 'fulfilled' ? eb.value.toString() : '0';
        } catch (e) {
          console.warn('[GoalBridge] Failed to get user personal balance:', e);
          primaryBalance = '0';
          primaryEthBalance = '0';
        }
      }

      // Fetch vault balances across all networks concurrently
      if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
        const [baseResult, polygonResult, ethResult] = await Promise.allSettled([
          this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc', 'base-mainnet'),
          this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc', 'polygon'),
          this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc', 'ethereum'),
        ]);

        vaultBalances.base = baseResult.status === 'fulfilled' ? baseResult.value.toString() : '0';
        vaultBalances.polygon = polygonResult.status === 'fulfilled' ? polygonResult.value.toString() : '0';
        vaultBalances.ethereum = ethResult.status === 'fulfilled' ? ethResult.value.toString() : '0';

        // Primary vault balance stays as the Base balance for backward compatibility
        vaultBalance = vaultBalances.base;
      }

      this.cachedPersonal = primaryBalance;
      this.cachedVault = vaultBalance;

      const isBackgroundSync = !requestId || requestId.startsWith('login-') || requestId.startsWith('refresh-') || requestId.startsWith('fetch-') || requestId.startsWith('sync-');
      if (!isBackgroundSync) {
        this.emitResult(requestId, true, {
          asset: 'USDC',
          personalBalance: primaryBalance,
          personalEthBalance: primaryEthBalance,
          vaultBalance,
          vaultBalances,
          totalBalance: (parseFloat(primaryBalance) + parseFloat(vaultBalances.base) + parseFloat(vaultBalances.polygon) + parseFloat(vaultBalances.ethereum)).toString(),
          network: walletId.network || 'Base Mainnet',
          personalAddress: primaryAddress,
          vaultAddress,
        });
      }

      this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
        id: `evt-wallet-${Date.now()}`,
        type: EventTypes.DOMAIN_WALLET_STATE,
        source: 'GoalBridge',
        payload: {
          address: primaryAddress,
          vaultAddress,
          balance: primaryBalance,
          ethBalance: primaryEthBalance,
          vaultBalance,
          vaultBalances,
          network: walletId.network || 'Base Mainnet',
          asset: 'USDC',
          syncing: false
        },
        timestamp: Date.now()
      });
    } catch (e: any) {
      console.error('[GoalBridge] Error checking balance:', e.message);
      if (this.currentWalletId) {
        this.emitWalletState(this.currentWalletId.address, process.env.SERA_VAULT_ADDRESS || '', this.cachedPersonal, this.cachedVault, 'Base Mainnet');
      } else {
        this.emitResult(requestId, false, {}, e.message);
        this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
          id: `evt-wallet-err-${Date.now()}`,
          type: EventTypes.DOMAIN_WALLET_STATE,
          source: 'GoalBridge',
          payload: {
            address: this.personalWalletAddress || '',
            vaultAddress: process.env.SERA_VAULT_ADDRESS || '',
            balance: '0',
            vaultBalance: '0',
            vaultBalances: { base: '0', polygon: '0', ethereum: '0' },
            network: 'auto',
            asset: 'USDC',
            syncing: false
          },
          timestamp: Date.now()
        });
      }
    }
  }

  /** Fetch live on-chain balances and emit DOMAIN_WALLET_STATE silently without triggering chat narration */
  async syncWalletState(): Promise<void> {
    if (this.walletInitializing) await this.walletInitializing;
    if (!this.walletInitialized || !this.currentWalletId) return;

    try {
      const userAddress = this.personalWalletAddress;
      const walletId = this.currentWalletId as any;

      let primaryAddress = '';
      let vaultAddress = '';
      let primaryBalance = '0';
      let primaryEthBalance = '0';
      let vaultBalance = this.cachedVault || '0';
      let vaultBalances = { base: '0', polygon: '0', ethereum: '0' };

      if (!userAddress) {
        primaryAddress = walletId.address;
        vaultAddress = process.env.SERA_VAULT_ADDRESS || '';
        try {
          const [pb, eb] = await Promise.allSettled([
            this.walletAdapter.getBalance(walletId, 'usdc'),
            this.walletAdapter.getAddressBalance(walletId.address as `0x${string}`, 'eth', 'base-mainnet'),
          ]);
          primaryBalance = pb.status === 'fulfilled' ? pb.value.toString() : '0';
          primaryEthBalance = eb.status === 'fulfilled' ? eb.value.toString() : '0';
        } catch (e) {
          console.warn('[GoalBridge] Failed to get primary balance in sync:', e);
        }
      } else {
        primaryAddress = userAddress;
        vaultAddress = walletId.address;
        try {
          const [pb, eb] = await Promise.allSettled([
            this.walletAdapter.getAddressBalance(primaryAddress as `0x${string}`, 'usdc', 'base-mainnet'),
            this.walletAdapter.getAddressBalance(primaryAddress as `0x${string}`, 'eth', 'base-mainnet'),
          ]);
          primaryBalance = pb.status === 'fulfilled' ? pb.value.toString() : '0';
          primaryEthBalance = eb.status === 'fulfilled' ? eb.value.toString() : '0';
        } catch (e) {
          console.warn('[GoalBridge] Failed to get user balance in sync:', e);
          primaryBalance = '0';
          primaryEthBalance = '0';
        }
      }

      if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
        const [baseResult, polygonResult, ethResult] = await Promise.allSettled([
          this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc', 'base-mainnet'),
          this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc', 'polygon'),
          this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc', 'ethereum'),
        ]);

        vaultBalances.base = baseResult.status === 'fulfilled' ? baseResult.value.toString() : '0';
        vaultBalances.polygon = polygonResult.status === 'fulfilled' ? polygonResult.value.toString() : '0';
        vaultBalances.ethereum = ethResult.status === 'fulfilled' ? ethResult.value.toString() : '0';
        vaultBalance = vaultBalances.base;
      }

      this.cachedPersonal = primaryBalance;
      this.cachedVault = vaultBalance;

      this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
        id: `evt-wallet-${Date.now()}`,
        type: EventTypes.DOMAIN_WALLET_STATE,
        source: 'GoalBridge',
        payload: {
          address: primaryAddress,
          vaultAddress,
          balance: primaryBalance,
          ethBalance: primaryEthBalance,
          vaultBalance,
          vaultBalances,
          network: walletId.network || 'Base Mainnet',
          asset: 'USDC',
          syncing: false
        },
        timestamp: Date.now()
      });
    } catch (e: any) {
      console.error('[GoalBridge] Error syncing wallet state:', e.message);
    }
  }

  public async handleTransferFunds(requestId: string, parameters: Record<string, any>): Promise<void> {
    if (!this.walletInitialized) {
      this.emitResult(requestId, false, {}, 'Wallet not initialized.');
      return;
    }

    let auditEvent: Omit<TransferAuditEvent, 'status' | 'transactionHash' | 'failureReason' | 'broadcastAt' | 'confirmedAt'> | null = null;

    try {
      const walletId = await this.walletAdapter.initializeAgentWallet();
      const { recipient, amount, asset } = parameters;

      if (!recipient || !amount || !asset) {
        this.emitResult(requestId, false, {}, 'Missing recipient, amount, or asset for transfer.');
        return;
      }

      let finalRecipient = '';
      if (typeof recipient === 'string') {
        // Fallback for backwards compatibility with old triggers
        finalRecipient = recipient;
      } else if (recipient && typeof recipient === 'object') {
        if (recipient.type === 'USER_MAIN_WALLET') {
          finalRecipient = this.personalWalletAddress || walletId.address;
        } else if (recipient.type === 'SERA_VAULT') {
          finalRecipient = process.env.SERA_VAULT_ADDRESS || '';
        } else if (recipient.type === 'EXTERNAL_ADDRESS') {
          if (!recipient.address || !recipient.address.startsWith('0x')) {
            this.emitResult(requestId, false, {}, `Invalid recipient address format: ${recipient.address}`);
            return;
          }
          finalRecipient = recipient.address;
        } else {
          this.emitResult(requestId, false, {}, `Invalid recipient type: ${recipient.type}`);
          return;
        }
      }

      // ── Pre-flight Check: AI can only spend from the Agent Vault ─────────
      const vaultAddress = walletId.address || process.env.SERA_VAULT_ADDRESS || '';
      if (!vaultAddress) {
        this.emitResult(requestId, false, {}, 'No Agent Wallet initialized. Cannot send funds.');
        return;
      }

      let transferAmount = typeof amount === 'number' ? amount.toString() : amount;
      let preVault = 0;
      let prePersonal = 0;

      if (typeof this.walletAdapter.getAddressBalance === 'function') {
        try {
          preVault = await this.walletAdapter.getAddressBalance(walletId.address as `0x${string}`, asset, 'base-mainnet');
          if (this.personalWalletAddress) {
            prePersonal = await this.walletAdapter.getAddressBalance(this.personalWalletAddress as `0x${string}`, asset, 'base-mainnet');
          }
        } catch (e) {
          console.warn('[GoalBridge] Pre-transfer snapshot failed, using cache:', e);
          preVault = parseFloat(this.cachedVault) || 0;
          prePersonal = parseFloat(this.cachedPersonal) || 0;
        }

        if (typeof amount === 'string' && amount.toLowerCase() === 'all') {
          transferAmount = preVault.toString();
        }

        if (parseFloat(transferAmount) > preVault) {
          this.emitResult(requestId, false, {}, `Insufficient Agent balance. Available: ${preVault} ${asset.toUpperCase()}, Requested: ${transferAmount} ${asset.toUpperCase()}`);
          return;
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      const numericAmount = Number(transferAmount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        this.emitResult(requestId, false, {}, `Transfer amount must be a positive number. (Available: ${preVault} ${asset.toUpperCase()})`);
        return;
      }

      auditEvent = this.createTransferAuditEvent({
        idempotencyKey: requestId,
        approvalSource: 'GOVERNED_ACTION',
        sourceWallet: (parameters.fromWallet === 'agent_vault' || parameters.fromWallet === 'sera_vault') ? vaultAddress : walletId.address,
        destinationWallet: finalRecipient,
        chain: this.auditChain(walletId.network),
        asset,
        amount: numericAmount.toString(),
      });
      await this.recordTransferApproval(auditEvent);

      // STEP 1: Show syncing indicator — current balance stays visible, spinner appears
      this.emitSyncing(walletId.address, vaultAddress, walletId.network);
      console.log(`[GoalBridge] ⏳ Syncing... sending ${transferAmount} ${asset} → ${finalRecipient}`);

      // ── Dispatch via ExecutionContext ────────────────────────────────────
      const normalizedRecipient = {
        type: finalRecipient.toLowerCase() === vaultAddress.toLowerCase() ? 'SERA_VAULT' : 'EXTERNAL_ADDRESS',
        address: finalRecipient
      };

      const context = {
        network: 'auto',
        asset: {
          id: asset,
          classification: 'token'
        },
        intent: {
          recipient: normalizedRecipient,
          amount: numericAmount,
          asset,
          fromWallet: 'agent_vault' // 1:1 Agent wallet
        },
        onBroadcast: (transactionHash: string) => this.recordTransferOutcome({
          ...auditEvent!,
          status: 'BROADCAST',
          transactionHash,
          broadcastAt: new Date(),
        }),
      };

      const result = await this.walletAdapter.execute(walletId, context as any);

      if (result.status === 'SUCCESS') {
        await this.recordTransferOutcome({
          ...auditEvent,
          status: 'CONFIRMED',
          transactionHash: result.executionId,
          confirmedAt: new Date(result.timestamp),
        });
        this.emitResult(requestId, true, {
          transactionHash: result.executionId,
          amount: result.amountExecuted,
          asset: result.asset,
        });
        await this.syncWalletState();
        console.log(`[GoalBridge] ✅ TX confirmed. Live balances synced.`);
      } else {
        await this.recordTransferOutcome({
          ...auditEvent,
          status: 'FAILED',
          transactionHash: result.executionId,
          failureReason: result.reason ?? 'Wallet provider did not confirm the transfer.',
        });
        console.log(`[GoalBridge] ❌ Transfer failed. Restoring original balance.`);
        await this.syncWalletState();
        this.emitResult(requestId, false, {
          executionId: result.executionId,
          amount: result.amountExecuted,
          asset: result.asset,
          reason: result.reason
        });
      }
    } catch (err: any) {
      if (auditEvent) {
        await this.recordTransferOutcome({
          ...auditEvent,
          status: 'FAILED',
          failureReason: err.message,
        });
      }
      console.log(`[GoalBridge] ❌ Transfer threw error. Restoring original balance.`);
      if (this.currentWalletId) {
        this.emitWalletState(
          this.currentWalletId.address,
          process.env.SERA_VAULT_ADDRESS || '',
          this.cachedPersonal,
          this.cachedVault,
          this.currentWalletId.network
        );
      }
      this.emitResult(requestId, false, {}, err.message);
    }
  }

  private emitWalletState(address: string, vaultAddress: string, balance: string, vaultBalance: string, network: string, syncing = false): void {
    if (!syncing) {
      this.cachedPersonal = balance;
      this.cachedVault = vaultBalance;
    }

    this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
      id: `evt-wallet-${Date.now()}`,
      type: EventTypes.DOMAIN_WALLET_STATE,
      source: 'GoalBridge',
      payload: { address, vaultAddress, balance, vaultBalance, network, asset: 'USDC', syncing },
      timestamp: Date.now()
    });
  }

  /** Emit a "balance is being updated" signal — does NOT change the displayed numbers */
  private emitSyncing(address: string, vaultAddress: string, network: string): void {
    // Emit current cached values but flag syncing=true so UI shows indicator
    this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
      id: `evt-wallet-${Date.now()}`,
      type: EventTypes.DOMAIN_WALLET_STATE,
      source: 'GoalBridge',
      payload: {
        address,
        vaultAddress,
        balance: this.cachedPersonal,
        vaultBalance: this.cachedVault,
        network,
        asset: 'USDC',
        syncing: true,
      },
      timestamp: Date.now()
    });
  }

  private async pollUntilConfirmed(walletId: any, vaultAddress: string, expectedVault: number, expectedPersonal: number, asset: string, maxRetries: number): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(r => setTimeout(r, 6000));
      try {
        const actualVault = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, asset);
        const actualPersonal = await this.walletAdapter.getBalance(walletId, asset);
        console.log(`[GoalBridge] 🔍 Poll ${i + 1}/${maxRetries} — Vault: ${actualVault} (exp ${expectedVault}), Personal: ${actualPersonal} (exp ${expectedPersonal})`);
        this.emitWalletState(walletId.address, vaultAddress, actualPersonal.toString(), actualVault.toString(), walletId.network, false);
        if (Math.abs(actualVault - expectedVault) < 0.001 && Math.abs(actualPersonal - expectedPersonal) < 0.001) {
          console.log(`[GoalBridge] ✅ On-chain confirmed after ${i + 1} poll(s).`);
          return;
        }
      } catch (e) {
        console.warn(`[GoalBridge] Poll ${i + 1} failed:`, e);
      }
    }
    console.log(`[GoalBridge] ⚠️ Max polls reached.`);
  }

  /** Direct transfer — called by the UI via socket (bypasses DialogueEngine) */
  async directTransfer(params: { recipientAddress: string; amount: number; asset: string }): Promise<any> {
    if (this.walletInitializing) await this.walletInitializing;
    if (!this.walletInitialized || !this.currentWalletId) {
      return { status: 'FAILED', error: 'Wallet not initialized' };
    }

    const walletId = this.currentWalletId as any;
    const vaultAddress = walletId.address || process.env.SERA_VAULT_ADDRESS || '';
    const walletIdAddress = walletId.address;

    if (params.recipientAddress === 'SERA_VAULT_ADDRESS') {
      params.recipientAddress = vaultAddress;
    }

    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      return { status: 'FAILED', error: 'Transfer amount must be a positive number.' };
    }

    const auditEvent = this.createTransferAuditEvent({
      idempotencyKey: `direct-${this.sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      approvalSource: 'DIRECT_UI',
      sourceWallet: walletIdAddress,
      destinationWallet: params.recipientAddress,
      chain: this.auditChain(walletId.network),
      asset: params.asset,
      amount: params.amount.toString(),
    });

    try {
      await this.recordTransferApproval(auditEvent);
    } catch (error: any) {
      return { status: 'FAILED', error: `Transfer audit could not be initialized: ${error.message}` };
    }

    // Snapshot balances BEFORE transfer
    let prePersonal = parseFloat(this.cachedPersonal) || 0;
    let preVault = parseFloat(this.cachedVault) || 0;
    try {
      preVault = await this.walletAdapter.getBalance(walletId, params.asset);
      if (this.personalWalletAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
        prePersonal = await this.walletAdapter.getAddressBalance(this.personalWalletAddress as `0x${string}`, params.asset);
      }
    } catch (e) {
      console.warn('[GoalBridge] Pre-transfer snapshot failed, falling back to cache:', e);
    }

    // STEP 1: Show syncing — keep current numbers, add spinner
    this.emitSyncing(walletId.address, vaultAddress, walletId.network);
    console.log(`[GoalBridge] ⏳ Syncing (UI)... sending ${params.amount} ${params.asset} → ${params.recipientAddress}`);

    const context = {
      network: 'auto',
      asset: {
        id: params.asset,
        classification: 'token'
      },
      intent: {
        recipient: {
          type: params.recipientAddress === vaultAddress ? 'SERA_VAULT' : 'EXTERNAL_ADDRESS',
          address: params.recipientAddress
        },
        amount: params.amount,
        asset: params.asset,
        fromWallet: 'agent_vault'
      }
    };

    let result;
    try {
      result = await this.walletAdapter.execute(walletId, {
        ...context,
        onBroadcast: (transactionHash: string) => this.recordTransferOutcome({
          ...auditEvent,
          status: 'BROADCAST',
          transactionHash,
          broadcastAt: new Date(),
        }),
      } as any);
    } catch (error: any) {
      await this.recordTransferOutcome({ ...auditEvent, status: 'FAILED', failureReason: error.message });
      this.emitWalletState(walletId.address, vaultAddress, prePersonal.toString(), preVault.toString(), walletId.network);
      return { status: 'FAILED', error: error.message };
    }

    if (result.status === 'SUCCESS') {
      await this.recordTransferOutcome({
        ...auditEvent,
        status: 'CONFIRMED',
        transactionHash: result.executionId,
        confirmedAt: new Date(result.timestamp),
      });
      // TX confirmed on-chain — compute real final balance
      const sent = params.amount;
      const isToVault = vaultAddress && params.recipientAddress.toLowerCase() === vaultAddress.toLowerCase();
      const confirmedPersonal = Math.max(0, prePersonal - sent);
      const confirmedVault = isToVault ? preVault + sent : Math.max(0, preVault - sent);
      this.emitWalletState(walletId.address, vaultAddress, confirmedPersonal.toString(), confirmedVault.toString(), walletId.network);
      console.log(`[GoalBridge] ✅ UI TX confirmed. Balance updated — Personal: ${confirmedPersonal}, Vault: ${confirmedVault}`);
    } else {
      await this.recordTransferOutcome({
        ...auditEvent,
        status: 'FAILED',
        transactionHash: result.executionId,
        failureReason: result.reason ?? 'Wallet provider did not confirm the transfer.',
      });
      // TX failed — restore original, no damage
      console.log(`[GoalBridge] ❌ UI Transfer failed. Restoring original balance.`);
      this.emitWalletState(walletId.address, vaultAddress, prePersonal.toString(), preVault.toString(), walletId.network);
    }

    return result;
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
    if (!this.walletAdapter.executeGaslessDeposit) {
      return { status: 'FAILED', error: 'Gasless deposit is not supported by current wallet custody provider.' };
    }

    const result = await this.walletAdapter.executeGaslessDeposit(payload);
    return result;
  }

  public async ensureAddressGas(targetAddress: `0x${string}`): Promise<boolean> {
    if (this.walletAdapter && typeof (this.walletAdapter as any).ensureAddressGas === 'function') {
      return (this.walletAdapter as any).ensureAddressGas(targetAddress);
    }
    return false;
  }

  private createTransferAuditEvent(event: Omit<TransferAuditEvent, 'userId' | 'status' | 'transactionHash' | 'failureReason' | 'broadcastAt' | 'confirmedAt'>): Omit<TransferAuditEvent, 'status' | 'transactionHash' | 'failureReason' | 'broadcastAt' | 'confirmedAt'> {
    return { ...event, userId: this.sessionId };
  }

  private auditChain(network: string): string {
    return network.toLowerCase().includes('base') || network === 'auto' ? 'base-mainnet' : network.toLowerCase();
  }

  private async recordTransferApproval(event: Omit<TransferAuditEvent, 'status' | 'transactionHash' | 'failureReason' | 'broadcastAt' | 'confirmedAt'>): Promise<void> {
    if (!this.transferAudit) {
      if (process.env.NODE_ENV === 'production' && this.sessionId !== 'dev') {
        throw new Error('Transfer audit persistence is not configured.');
      }
      return;
    }
    await this.transferAudit.record({ ...event, status: 'APPROVED' });
  }

  private async recordTransferOutcome(event: TransferAuditEvent): Promise<void> {
    if (!this.transferAudit) return;
    try {
      await this.transferAudit.record(event);
    } catch (error: any) {
      // Never tell a user that an already-broadcast transaction failed merely
      // because the audit database had a transient error.
      console.error(`[GoalBridge] Failed to persist transfer audit outcome: ${error.message}`);
    }
  }

  /** Refresh on-chain balance and return the latest wallet state payload */
  async refreshBalance(): Promise<any | null> {
    if (!this.walletInitialized || !this.currentWalletId) return null;
    try {
      const balance = await this.walletAdapter.getBalance(this.currentWalletId as any, 'usdc');
      const vaultAddress = process.env.SERA_VAULT_ADDRESS || '';
      let vaultBalance = this.cachedVault || '0';
      if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
        try {
          const vb = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc');
          vaultBalance = vb.toString();
        } catch (e) {
          console.warn('[GoalBridge] Failed to get vault balance during refresh, keeping cached:', e);
        }
      }

      this.emitWalletState(this.currentWalletId.address, vaultAddress, balance.toString(), vaultBalance, this.currentWalletId.network);

      return {
        address: this.currentWalletId.address,
        vaultAddress,
        vaultBalance,
        balance: balance.toString(),
        network: this.currentWalletId.network,
        asset: 'USDC',
        syncing: false
      };
    } catch {
      return null;
    }
  }

  private async handleGDriveWrite(requestId: string, payload: any): Promise<void> {
    try {
      const { filename, content, mimeType } = payload;
      const fileId = await this.googleDriveCapability.writeFile(this.sessionId, filename, content, mimeType);
      this.emitResult(requestId, true, { fileId, filename });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  private async handleGDriveAppend(requestId: string, payload: any): Promise<void> {
    try {
      const { filename, content } = payload;
      if (!filename || content === undefined) throw new Error('GDrive append requires filename and content.');
      const fileId = await this.googleDriveCapability.appendToFile(this.sessionId, filename, content);
      this.emitResult(requestId, true, { fileId, filename });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  private async handleGDriveRead(requestId: string, payload: any): Promise<void> {
    try {
      const filename = payload?.filename || payload?.fileName || payload?.name || payload?.title;
      let targetId = payload?.fileId || payload?.id;
      if (!targetId && filename) {
        const files = await this.googleDriveCapability.listFiles(this.sessionId, { name: filename });
        if (files.length === 0) throw new Error(`File "${filename}" not found in your SERA Vault.`);
        targetId = files[0].id;
      }
      if (!targetId) throw new Error('Must provide either filename or fileId to read a file.');
      
      const content = await this.googleDriveCapability.readFile(this.sessionId, targetId);
      this.emitResult(requestId, true, { content, fileId: targetId });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  private async handleGDriveCreateSheet(requestId: string, payload: any): Promise<void> {
    try {
      const { title, headers, rows, options } = payload;
      const fileId = await this.googleDriveCapability.createSpreadsheet(this.sessionId, title, headers, rows, options);
      this.emitResult(requestId, true, { fileId, title });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  private async handleGDriveList(requestId: string, payload: any): Promise<void> {
    try {
      const { name, searchTerm, mimeType } = payload || {};
      const files = await this.googleDriveCapability.listFiles(this.sessionId, { name, searchTerm, mimeType });
      this.emitResult(requestId, true, { files, count: files.length });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }

  private async handleGDriveDelete(requestId: string, payload: any): Promise<void> {
    try {
      const filename = payload?.filename || payload?.fileName || payload?.name || payload?.title;
      const fileId = payload?.fileId || payload?.id;
      await this.googleDriveCapability.deleteFile(this.sessionId, { filename, fileId });
      this.emitResult(requestId, true, { deleted: true, filename: filename || fileId });
    } catch (e: any) {
      this.emitResult(requestId, false, {}, e.message);
    }
  }
}
