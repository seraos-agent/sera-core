import { EventEmitter } from 'events';
import { EventTypes } from '../../core/events/types';
import { WalletCustodyProvider } from '../../capabilities/wallet/WalletCustodyProvider';
import {
  TransferAuditEvent,
  TransferAuditRepository,
} from '../../core/persistence/SupabaseTransferAuditRepository';
import { EmitResultFn } from './types';

/**
 * WalletGoalHandler — Manages on-chain agent wallet initialization, balance synchronization,
 * multi-network transfers, gasless deposits, and Supabase transfer audits.
 */
export class WalletGoalHandler {
  public walletInitialized = false;
  public walletInitializing: Promise<void> | null = null;
  public currentWalletId: { address: string; network: string } | null = null;
  private cachedPersonal: string = '0';
  private cachedVault: string = '0';

  constructor(
    private readonly walletAdapter: WalletCustodyProvider,
    private readonly eventBus: EventEmitter,
    private readonly sessionId: string,
    private readonly emitResult: EmitResultFn,
    private readonly personalWalletAddress?: string,
    private readonly transferAudit: TransferAuditRepository | null = null
  ) {}

  public async initWallet(userAddress?: string): Promise<void> {
    try {
      const walletId = await this.walletAdapter.initializeAgentWallet(userAddress);
      this.walletInitialized = true;
      this.currentWalletId = walletId;

      let primaryAddress = '';
      let vaultAddress = '';
      let primaryBalance = '0';
      let primaryEthBalance = '0';
      let vaultBalance = '0';

      // Emit syncing indicator first
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
          console.error('[WalletGoalHandler] Failed to get primary balance in dev mode:', e);
        }

        if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
          try {
            const vb = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc');
            vaultBalance = vb.toString();
          } catch (e) {
            console.error('[WalletGoalHandler] Failed to get vault balance in dev mode:', e);
          }
        }
      } else {
        // --- 1:1 AGENT WALLET MODE ---
        primaryAddress = this.personalWalletAddress || walletId.address;
        vaultAddress = walletId.address;

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
          console.warn('[WalletGoalHandler] Failed to get user personal balance:', e);
          primaryBalance = '0';
          primaryEthBalance = '0';
        }

        if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
          try {
            const vb = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc');
            vaultBalance = vb.toString();
          } catch (e) {
            console.error('[WalletGoalHandler] Failed to get agent vault balance:', e);
          }
        }
      }

      this.cachedPersonal = primaryBalance;
      this.cachedVault = vaultBalance;

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
      console.error('[WalletGoalHandler] Wallet initialization failed:', err.message);
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
          console.warn('[WalletGoalHandler] Failed to get primary balance:', e);
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
          console.warn('[WalletGoalHandler] Failed to get user personal balance:', e);
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
      console.error('[WalletGoalHandler] Error checking balance:', e.message);
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
  public async syncWalletState(): Promise<void> {
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
          console.warn('[WalletGoalHandler] Failed to get primary balance in sync:', e);
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
          console.warn('[WalletGoalHandler] Failed to get user balance in sync:', e);
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
      console.error('[WalletGoalHandler] Error syncing wallet state:', e.message);
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
          console.warn('[WalletGoalHandler] Pre-transfer snapshot failed, using cache:', e);
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

      this.emitSyncing(walletId.address, vaultAddress, walletId.network);
      console.log(`[WalletGoalHandler] ⏳ Syncing... sending ${transferAmount} ${asset} → ${finalRecipient}`);

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
          fromWallet: 'agent_vault'
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
        console.log(`[WalletGoalHandler] ✅ TX confirmed. Live balances synced.`);
      } else {
        await this.recordTransferOutcome({
          ...auditEvent,
          status: 'FAILED',
          transactionHash: result.executionId,
          failureReason: result.reason ?? 'Wallet provider did not confirm the transfer.',
        });
        console.log(`[WalletGoalHandler] ❌ Transfer failed. Restoring original balance.`);
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
      console.log(`[WalletGoalHandler] ❌ Transfer threw error. Restoring original balance.`);
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

  public emitWalletState(address: string, vaultAddress: string, balance: string, vaultBalance: string, network: string, syncing = false): void {
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

  public emitSyncing(address: string, vaultAddress: string, network: string): void {
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

  public async directTransfer(params: { recipientAddress: string; amount: number; asset: string }): Promise<any> {
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
      console.warn('[WalletGoalHandler] Pre-transfer snapshot failed, falling back to cache:', e);
    }

    this.emitSyncing(walletId.address, vaultAddress, walletId.network);
    console.log(`[WalletGoalHandler] ⏳ Syncing (UI)... sending ${params.amount} ${params.asset} → ${params.recipientAddress}`);

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
      const sent = params.amount;
      const isToVault = vaultAddress && params.recipientAddress.toLowerCase() === vaultAddress.toLowerCase();
      const confirmedPersonal = Math.max(0, prePersonal - sent);
      const confirmedVault = isToVault ? preVault + sent : Math.max(0, preVault - sent);
      this.emitWalletState(walletId.address, vaultAddress, confirmedPersonal.toString(), confirmedVault.toString(), walletId.network);
      console.log(`[WalletGoalHandler] ✅ UI TX confirmed. Balance updated — Personal: ${confirmedPersonal}, Vault: ${confirmedVault}`);
    } else {
      await this.recordTransferOutcome({
        ...auditEvent,
        status: 'FAILED',
        transactionHash: result.executionId,
        failureReason: result.reason ?? 'Wallet provider did not confirm the transfer.',
      });
      console.log(`[WalletGoalHandler] ❌ UI Transfer failed. Restoring original balance.`);
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
      console.error(`[WalletGoalHandler] Failed to persist transfer audit outcome: ${error.message}`);
    }
  }

  public async refreshBalance(): Promise<any | null> {
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
          console.warn('[WalletGoalHandler] Failed to get vault balance during refresh, keeping cached:', e);
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
