import 'dotenv/config';
import { EventEmitter } from 'events';
import { formatEther } from 'viem';
import { base } from 'viem/chains';
import { StandardEvent, EventTypes, SpawnGoalPayload, GoalResultPayload } from '../core/events/types';
import { EncryptedDatabaseSecretStore } from '../core/secrets/stores/EncryptedDatabaseSecretStore';
import { SecretManager } from '../core/secrets/SecretManager';
import { UniversalAgenticWallet } from '../capabilities/wallet/UniversalAgenticWallet';
import { SpendPermissionAdapter } from '../capabilities/wallet/SpendPermissionAdapter';
import { TriggerEngine } from '../core/triggers/TriggerEngine';

/**
 * GoalBridge — Connects the Sera EventBus to real Capabilities.
 *
 * Architecture role: Runtime Bridge (src/runtime/)
 * - Listens for SPAWN_GOAL events from DialogueEngine
 * - Routes each intent to the appropriate Capability
 * - Emits GOAL_RESULT events back onto the EventBus
 *
 * Wallet stack wired here (all layers injected top-down):
 *   EncryptedDatabaseSecretStore  →  SecretManager  →  ViemWalletAdapter
 */
export class GoalBridge {
  private eventBus: EventEmitter;
  private walletAdapter: UniversalAgenticWallet;
  private walletInitialized = false;
  private walletInitializing: Promise<void> | null = null;
  private currentWalletId: { address: string; network: string } | null = null;
  private cachedPersonal: string = '0';
  private cachedVault: string = '0';

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.eventBus.on(EventTypes.DOMAIN_ACTION_DISPATCHED, this.handleDispatchedAction.bind(this));

    // Build the wallet stack
    const secretStore = new EncryptedDatabaseSecretStore();
    const secretManager = new SecretManager(secretStore);
    const spendPermissionAdapter = new SpendPermissionAdapter();
    this.walletAdapter = new UniversalAgenticWallet(secretManager, spendPermissionAdapter);

    // Pre-warm: initialize wallet on boot (generates one if it doesn't exist)
    this.walletInitializing = this.initWallet();

    // Expose this instance globally for direct server access
    (globalThis as any).__goalBridge = this;

    console.log('[GoalBridge] Initialized. Listening for SPAWN_GOAL events.');
  }

  private async initWallet(): Promise<void> {
    try {
      const walletId = await this.walletAdapter.initialize();
      this.walletInitialized = true;
      this.currentWalletId = walletId;
      const balance = await this.walletAdapter.getBalance(walletId, 'usdc');
      
      const vaultAddress = process.env.SERA_VAULT_ADDRESS || '';
      let vaultBalance = '0';
      if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
        try {
          const vb = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc');
          vaultBalance = vb.toString();
        } catch (e) {
          console.error('Failed to get vault balance:', e);
        }
      }

      this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
        id: `evt-ws-${Date.now()}`,
        type: EventTypes.DOMAIN_WALLET_STATE,
        source: 'GoalBridge',
        payload: {
          address: walletId.address,
          vaultAddress,
          balance: balance.toString(),
          vaultBalance,
          network: walletId.network,
          asset: 'USDC'
        },
        timestamp: Date.now()
      });
    } catch (err: any) {
      console.error('[GoalBridge] Wallet initialization failed:', err.message);
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

        default:
          this.emitResult(requestId, false, {}, `Unknown action: ${actionType}`);
      }
    } catch (error: any) {
      console.error(`[GoalBridge] Error handling action ${actionType}:`, error.message);
      this.emitResult(requestId, false, {}, error.message);
    }
  }

  private async handleScheduleGoal(requestId: string, parameters: Record<string, any>): Promise<void> {
    const triggerEngineInstance = (globalThis as any).__triggerEngine as TriggerEngine | undefined;
    if (!triggerEngineInstance) {
      this.emitResult(requestId, false, {}, 'TriggerEngine is not initialized');
      return;
    }

    const { scheduleType, humanIntent, cronExpression, executeAfterUtc, delaySeconds, actionIntent, actionParameters } = parameters;
    
    let computedExecuteAfterUtc = executeAfterUtc;
    if (scheduleType === 'exact' && delaySeconds !== undefined) {
      computedExecuteAfterUtc = new Date(Date.now() + Number(delaySeconds) * 1000).toISOString();
    }

    triggerEngineInstance.register({
      id: `trg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'TIME',
      state: 'ACTIVE',
      firePolicy: scheduleType === 'cron' ? 'REPEAT' : 'ONCE',
      condition: {
        type: scheduleType === 'cron' ? 'RECURRING' : 'EXACT',
        humanIntent: humanIntent || 'Unknown schedule',
        timezoneContext: 'UTC+7 (WIB)',
        internalCompiled: scheduleType === 'cron' ? cronExpression : undefined,
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
      return;
    }

    try {
      const walletId = await this.walletAdapter.initialize();
      const balance = await this.walletAdapter.getBalance(walletId, 'usdc'); // Fixed to check USDC

      const vaultAddress = process.env.SERA_VAULT_ADDRESS || '';
      let vaultBalance = this.cachedVault || '0';
      if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
        try {
          const vb = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc');
          vaultBalance = vb.toString();
        } catch (e) {
          console.warn('[GoalBridge] Failed to get vault balance, keeping cached:', e);
        }
      }

      this.cachedPersonal = balance.toString();
      this.cachedVault = vaultBalance.toString();

    this.emitResult(requestId, true, {
      asset: 'USDC',
      personalBalance: balance.toString(),
      vaultBalance,
      totalBalance: (balance + parseFloat(vaultBalance)).toString(),
      network: 'Base Mainnet',
      personalAddress: walletId.address,
      vaultAddress,
    });

    this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
      id: `evt-wallet-${Date.now()}`,
      type: EventTypes.DOMAIN_WALLET_STATE,
      source: 'GoalBridge',
      payload: {
        address: walletId.address,
        vaultAddress,
        balance: balance.toString(),
        vaultBalance,
        network: walletId.network,
        asset: 'USDC'
      },
      timestamp: Date.now()
    });
    } catch (e: any) {
      console.error('[GoalBridge] Error checking balance:', e.message);
      
      // Fallback to cache if RPC rate limits are hit
      if (this.currentWalletId) {
        console.log('[GoalBridge] Falling back to cached balance due to RPC error');
        this.emitResult(requestId, true, {
          asset: 'USDC',
          personalBalance: this.cachedPersonal,
          vaultBalance: this.cachedVault,
          totalBalance: (parseFloat(this.cachedPersonal) + parseFloat(this.cachedVault)).toString(),
          network: 'Base Mainnet',
          personalAddress: this.currentWalletId.address,
          vaultAddress: process.env.SERA_VAULT_ADDRESS || '',
        });
      } else {
        this.emitResult(requestId, false, {}, e.message);
      }
    }
  }

  public async handleTransferFunds(requestId: string, parameters: Record<string, any>): Promise<void> {
    if (!this.walletInitialized) {
      this.emitResult(requestId, false, {}, 'Wallet not initialized.');
      return;
    }
    
    try {
      const walletId = await this.walletAdapter.initialize();
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
          finalRecipient = walletId.address;
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
          fromWallet: parameters.fromWallet || 'sera_vault'
        }
      };

      const result = await this.walletAdapter.execute(walletId, context as any);

      if (result.status === 'SUCCESS') {
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
        console.log(`[GoalBridge] 🔍 Poll ${i+1}/${maxRetries} — Vault: ${actualVault} (exp ${expectedVault}), Personal: ${actualPersonal} (exp ${expectedPersonal})`);
        this.emitWalletState(walletId.address, vaultAddress, actualPersonal.toString(), actualVault.toString(), walletId.network, false);
        if (Math.abs(actualVault - expectedVault) < 0.001 && Math.abs(actualPersonal - expectedPersonal) < 0.001) {
          console.log(`[GoalBridge] ✅ On-chain confirmed after ${i+1} poll(s).`);
          return;
        }
      } catch (e) {
        console.warn(`[GoalBridge] Poll ${i+1} failed:`, e);
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

    const result = await this.walletAdapter.execute(walletId, context as any);

    if (result.status === 'SUCCESS') {
      // TX confirmed on-chain — compute real final balance
      const sent = params.amount;
      const isToVault = vaultAddress && params.recipientAddress.toLowerCase() === vaultAddress.toLowerCase();
      const confirmedPersonal = Math.max(0, prePersonal - sent);
      const confirmedVault = isToVault ? preVault + sent : Math.max(0, preVault - sent);
      this.emitWalletState(walletId.address, vaultAddress, confirmedPersonal.toString(), confirmedVault.toString(), walletId.network);
      console.log(`[GoalBridge] ✅ UI TX confirmed. Balance updated — Personal: ${confirmedPersonal}, Vault: ${confirmedVault}`);
    } else {
      // TX failed — restore original, no damage
      console.log(`[GoalBridge] ❌ UI Transfer failed. Restoring original balance.`);
      this.emitWalletState(walletId.address, vaultAddress, prePersonal.toString(), preVault.toString(), walletId.network);
    }

    return result;
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
