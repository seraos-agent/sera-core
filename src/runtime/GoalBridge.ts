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
import { SecretManager } from '../core/secrets/SecretManager';
import { EncryptedDatabaseSecretStore } from '../core/secrets/stores/EncryptedDatabaseSecretStore';
import { ThreadsAPI } from '../capabilities/threads/ThreadsAPI';
import {
  SupabaseTransferAuditRepository,
  TransferAuditEvent,
  TransferAuditRepository,
} from '../core/persistence/SupabaseTransferAuditRepository';

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
  private walletInitialized = false;
  private walletInitializing: Promise<void> | null = null;
  private currentWalletId: { address: string; network: string } | null = null;
  private cachedPersonal: string = '0';
  private cachedVault: string = '0';
  private sessionId: string;

  private readonly spotMarket = new BaseSpotMarketCapability();
  private readonly tokenResolver = new TokenResolverService();
  private readonly threadsApi = new ThreadsAPI(new SecretManager(new EncryptedDatabaseSecretStore()));

  constructor(
    eventBus: EventEmitter,
    sessionId: string = 'dev',
    private readonly personalWalletAddress?: string,
    private readonly autonomyAgreementStore?: AutonomyAgreementStore,
    private readonly transferAudit: TransferAuditRepository | null = SupabaseTransferAuditRepository.fromEnvironment(),
    private readonly triggerEngine?: TriggerEngine
  ) {
    this.eventBus = eventBus;
    this.sessionId = sessionId;
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
    const { actionType, actionPayload, context } = event.payload;
    const requestId = context?.triggerId || `req-${Date.now()}`;

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
        case 'ACTIVATE_AUTONOMY_AGREEMENT':
          this.handleActivateAutonomyAgreement(requestId, actionPayload);
          break;
        case 'THREADS_PUBLISH':
        case 'THREADS_REPLY':
          await this.handleThreadsPublish(requestId, actionPayload);
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
    const text = parameters.text;
    if (!text) throw new Error('Threads publish requires text parameter.');
    const container = await this.threadsApi.createContainer(parameters.sessionId || 'dev', text, parameters.replyToId);
    const published = await this.threadsApi.publishContainer(parameters.sessionId || 'dev', container.id);
    this.emitResult(requestId, true, {
      provider: 'Meta Threads',
      id: published.id,
      summary: `Successfully published to Threads (ID: ${published.id})`
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

    // Programmatic Safeguard: System minimum interval is 1 minute (60 seconds)
    const MINIMUM_SCHEDULE_SECONDS = 60;
    let sanitizedCron = cronExpression;
    if (scheduleType === 'cron') {
      // Normalize any per-second cron (6 fields or <=30s) to 1 minute
      if (!cronExpression || cronExpression.includes('*/30 * *') || cronExpression.includes('*/10 * *') || cronExpression.includes('*/5 * *') || cronExpression.includes('*/1 * * * * *')) {
        sanitizedCron = '*/1 * * * *';
      }
    }

    let computedExecuteAfterUtc = executeAfterUtc;
    if (scheduleType === 'exact' && delaySeconds !== undefined) {
      const safeDelay = Math.max(10, Number(delaySeconds));
      computedExecuteAfterUtc = new Date(Date.now() + safeDelay * 1000).toISOString();
    }

    this.triggerEngine.register({
      id: `trg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'TIME',
      state: 'ACTIVE',
      firePolicy: scheduleType === 'cron' ? 'REPEAT' : 'ONCE',
      condition: {
        type: scheduleType === 'cron' ? 'RECURRING' : 'EXACT',
        humanIntent: humanIntent || 'Unknown schedule',
        timezoneContext: 'UTC (Global)',
        internalCompiled: scheduleType === 'cron' ? sanitizedCron : undefined,
        executeAfterUtc: scheduleType === 'exact' ? computedExecuteAfterUtc : undefined,
      },
      action: {
        type: actionIntent,
        payload: actionParameters || {}
      },
      createdAt: Date.now()
    });

    this.emitResult(requestId, true, { scheduled: true, humanIntent, actionIntent });
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

      // ── Pre-flight Check: AI can only spend from the Vault ────────────────
      const vaultAddress = process.env.SERA_VAULT_ADDRESS;
      if (!vaultAddress) {
        this.emitResult(requestId, false, {}, 'No Vault configured. AI cannot send funds.');
        return;
      }

      let transferAmount = amount;
      let preVault = 0;
      let prePersonal = 0;

      if (typeof this.walletAdapter.getAddressBalance === 'function') {
        try {
          preVault = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, asset);
          prePersonal = await this.walletAdapter.getBalance(walletId, asset);
        } catch (e) {
          console.warn('[GoalBridge] Pre-transfer snapshot failed, using cache:', e);
          preVault = parseFloat(this.cachedVault) || 0;
          prePersonal = parseFloat(this.cachedPersonal) || 0;
        }

        if (typeof amount === 'string' && amount.toLowerCase() === 'all') {
          transferAmount = preVault.toString();
        }

        if (parseFloat(transferAmount) > preVault) {
          this.emitResult(requestId, false, {}, `Insufficient Sera Vault balance. Available: ${preVault} ${asset.toUpperCase()}, Requested: ${transferAmount} ${asset.toUpperCase()}`);
          return;
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      const numericAmount = Number(transferAmount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        this.emitResult(requestId, false, {}, 'Transfer amount must be a positive number.');
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
        type: finalRecipient === vaultAddress ? 'SERA_VAULT' : 'EXTERNAL_ADDRESS',
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
          amount: transferAmount,
          asset,
          fromWallet: 'sera_vault' // AI can only transfer from its vault
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
        // TX is confirmed on-chain (waitForTransactionReceipt already called inside executeTransfer)
        // Math is now 100% accurate — no guessing
        const sent = parseFloat(transferAmount);
        const isToPersonal = finalRecipient.toLowerCase() === walletId.address.toLowerCase();
        const confirmedVault = Math.max(0, preVault - sent);
        const confirmedPersonal = isToPersonal ? prePersonal + sent : prePersonal;
        this.emitWalletState(walletId.address, vaultAddress, confirmedPersonal.toString(), confirmedVault.toString(), walletId.network);
        console.log(`[GoalBridge] ✅ TX confirmed. Balance updated — Vault: ${confirmedVault}, Personal: ${confirmedPersonal}`);
      } else {
        await this.recordTransferOutcome({
          ...auditEvent,
          status: 'FAILED',
          transactionHash: result.executionId,
          failureReason: result.reason ?? 'Wallet provider did not confirm the transfer.',
        });
        // TX failed — restore original balance (syncing=false, no changes)
        console.log(`[GoalBridge] ❌ Transfer failed. Restoring original balance.`);
        this.emitWalletState(walletId.address, vaultAddress, prePersonal.toString(), preVault.toString(), walletId.network);
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

    const vaultAddress = process.env.SERA_VAULT_ADDRESS || '';
    const walletId = this.currentWalletId as any;

    if (params.recipientAddress === 'SERA_VAULT_ADDRESS') {
      params.recipientAddress = vaultAddress;
    }

    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      return { status: 'FAILED', error: 'Transfer amount must be a positive number.' };
    }

    const auditEvent = this.createTransferAuditEvent({
      idempotencyKey: `direct-${this.sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      approvalSource: 'DIRECT_UI',
      sourceWallet: walletId.address,
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
      prePersonal = await this.walletAdapter.getBalance(walletId, params.asset);
      if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
        preVault = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, params.asset);
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
        fromWallet: 'user_main_wallet'
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
}
