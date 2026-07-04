import 'dotenv/config';
import { EventEmitter } from 'events';
import { formatEther } from 'viem';
import { base } from 'viem/chains';
import { StandardEvent, EventTypes, SpawnGoalPayload, GoalResultPayload } from '../core/events/types';
import { EncryptedDatabaseSecretStore } from '../core/secrets/stores/EncryptedDatabaseSecretStore';
import { SecretManager } from '../core/secrets/SecretManager';
import { ViemWalletAdapter } from '../capabilities/wallet/ViemWalletAdapter';
import { SpendPermissionAdapter } from '../capabilities/wallet/SpendPermissionAdapter';
import { TriggerEngine } from '../core/triggers/TriggerEngine';

/**
 * GoalBridge — Connects the SERA EventBus to real Capabilities.
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
  private walletAdapter: ViemWalletAdapter;
  private walletInitialized = false;
  private walletInitializing: Promise<void> | null = null;
  private currentWalletId: { address: string; network: string } | null = null;
  private cachedPersonal: string = '0';
  private cachedVault: string = '0';

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.eventBus.on(EventTypes.DOMAIN_GOAL_SPAWNED, this.handleSpawnGoal.bind(this));

    // Build the wallet stack
    const secretStore = new EncryptedDatabaseSecretStore();
    const secretManager = new SecretManager(secretStore);
    const spendPermissionAdapter = new SpendPermissionAdapter();
    this.walletAdapter = new ViemWalletAdapter(secretManager, spendPermissionAdapter);

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

  private async handleSpawnGoal(event: StandardEvent): Promise<void> {
    const { requestId, intent, parameters } = event.payload as SpawnGoalPayload;
    console.log(`[GoalBridge] Handling intent: ${intent} (requestId: ${requestId})`);

    // Ensure wallet is ready before executing any wallet-related goal
    if (this.walletInitializing) {
      await this.walletInitializing;
    }

    try {
      switch (intent) {
        case 'CHECK_WALLET_BALANCE':
          await this.handleCheckBalance(requestId);
          break;

        case 'CHECK_NETWORK':
          this.emitResult(requestId, true, {
            network: 'Base Mainnet',
            chainId: base.id,
            rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
            status: this.walletInitialized ? 'connected' : 'wallet_error',
          });
          break;

        case 'TRANSFER_FUNDS':
          await this.handleTransferFunds(requestId, parameters);
          break;

        case 'SCHEDULE_GOAL':
          await this.handleScheduleGoal(requestId, parameters);
          break;

        default:
          this.emitResult(requestId, false, {}, `Unknown intent: ${intent}`);
      }
    } catch (error: any) {
      console.error(`[GoalBridge] Error handling intent ${intent}:`, error.message);
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
      let vaultBalance = '0';
      if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
        try {
          const vb = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, 'usdc');
          vaultBalance = vb.toString();
        } catch (e) {
          console.error('Failed to get vault balance:', e);
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

      let finalRecipient = recipient;
      if (typeof recipient === 'string') {
        const lowerRecip = recipient.toLowerCase();
        if (lowerRecip.includes('dompet utama') || lowerRecip.includes('wallet utama') || lowerRecip.includes('dompet_utama') || lowerRecip.includes('wallet_utama') || lowerRecip.includes('main wallet') || lowerRecip.includes('my wallet')) {
          finalRecipient = walletId.address;
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
        preVault = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, asset);
        prePersonal = await this.walletAdapter.getBalance(walletId, asset);

        if (typeof amount === 'string' && amount.toLowerCase() === 'all') {
          transferAmount = preVault.toString();
        }

        if (parseFloat(transferAmount) > preVault) {
          this.emitResult(requestId, false, {}, `Insufficient Sera Vault balance. Available: ${preVault} ${asset.toUpperCase()}, Requested: ${transferAmount} ${asset.toUpperCase()}`);
          return;
        }
      }
      // ────────────────────────────────────────────────────────────────────────
      
      const receipt = await this.walletAdapter.executeTransfer(walletId, {
        idempotencyKey: `tx-${Date.now()}`,
        recipientAddress: finalRecipient,
        amount: parseFloat(transferAmount),
        asset,
        initiator: 'AI',
      });
      
      this.emitResult(requestId, receipt.status === 'SUCCESS', receipt);

      if (receipt.status === 'SUCCESS') {
        const sent = parseFloat(transferAmount);
        const isToPersonal = finalRecipient.toLowerCase() === walletId.address.toLowerCase();

        // STEP 1: Optimistic — math-derived, instant, no RPC guessing
        const optVault = Math.max(0, preVault - sent);
        const optPersonal = isToPersonal ? prePersonal + sent : prePersonal;
        this.emitWalletState(walletId.address, vaultAddress, optPersonal.toString(), optVault.toString(), walletId.network);
        console.log(`[GoalBridge] ⚡ Optimistic balance — Vault: ${optVault}, Personal: ${optPersonal}`);

        // STEP 2: Poll RPC until on-chain state is confirmed, then emit final truth
        this.pollUntilConfirmed(walletId, vaultAddress, optVault, optPersonal, asset, 4);
      }
    } catch (err: any) {
      this.emitResult(requestId, false, {}, err.message);
    }
  }

  private emitWalletState(address: string, vaultAddress: string, balance: string, vaultBalance: string, network: string): void {
    this.cachedPersonal = balance;
    this.cachedVault = vaultBalance;

    this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
      id: `evt-wallet-${Date.now()}`,
      type: EventTypes.DOMAIN_WALLET_STATE,
      source: 'GoalBridge',
      payload: { address, vaultAddress, balance, vaultBalance, network, asset: 'USDC' },
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
        this.emitWalletState(walletId.address, vaultAddress, actualPersonal.toString(), actualVault.toString(), walletId.network);
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

    // Snapshot balances BEFORE transfer
    let prePersonal = 0;
    let preVault = 0;
    try {
      prePersonal = await this.walletAdapter.getBalance(walletId, params.asset);
      if (vaultAddress && typeof this.walletAdapter.getAddressBalance === 'function') {
        preVault = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, params.asset);
      }
    } catch (e) {
      console.warn('[GoalBridge] Pre-transfer snapshot failed:', e);
    }

    const receipt = await this.walletAdapter.executeTransfer(walletId, {
      idempotencyKey: `ui-tx-${Date.now()}`,
      recipientAddress: params.recipientAddress,
      amount: params.amount,
      asset: params.asset,
      initiator: 'UI',
    });

    if (receipt.status === 'SUCCESS') {
      const sent = params.amount;
      const isToVault = vaultAddress && params.recipientAddress.toLowerCase() === vaultAddress.toLowerCase();

      // OPTIMISTIC: compute derived balance from snapshot
      const optPersonal = Math.max(0, prePersonal - sent);
      const optVault = isToVault ? preVault + sent : Math.max(0, preVault - sent);
      this.emitWalletState(walletId.address, vaultAddress, optPersonal.toString(), optVault.toString(), walletId.network);
      console.log(`[GoalBridge] ⚡ Optimistic (UI) — Personal: ${optPersonal}, Vault: ${optVault}`);

      // POLL: confirm on-chain
      this.pollUntilConfirmed(walletId, vaultAddress, optVault, optPersonal, params.asset, 4);
    }

    return receipt;
  }

  /** Refresh on-chain balance and return the latest wallet state payload */
  async refreshBalance(): Promise<any | null> {
    if (!this.walletInitialized || !this.currentWalletId) return null;
    try {
      const balance = await this.walletAdapter.getBalance(this.currentWalletId as any, 'usdc');
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
      
      const payload = {
        address: this.currentWalletId.address,
        vaultAddress,
        vaultBalance,
        balance: balance.toString(),
        network: this.currentWalletId.network,
        asset: 'USDC',
      };
      this.eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
        id: `evt-wallet-${Date.now()}`,
        type: EventTypes.DOMAIN_WALLET_STATE,
        source: 'GoalBridge',
        payload,
        timestamp: Date.now(),
      });
      return payload;
    } catch {
      return null;
    }
  }
}
