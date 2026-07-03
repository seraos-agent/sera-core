import 'dotenv/config';
import { EventEmitter } from 'events';
import { formatEther } from 'viem';
import { base } from 'viem/chains';
import { Event, EventTypes, SpawnGoalPayload, GoalResultPayload } from '../core/events/types';
import { EncryptedDatabaseSecretStore } from '../core/secrets/stores/EncryptedDatabaseSecretStore';
import { SecretManager } from '../core/secrets/SecretManager';
import { ViemWalletAdapter } from '../capabilities/wallet/ViemWalletAdapter';
import { SpendPermissionAdapter } from '../capabilities/wallet/SpendPermissionAdapter';

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

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.eventBus.on(EventTypes.SPAWN_GOAL, this.handleSpawnGoal.bind(this));

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
      this.eventBus.emit(EventTypes.WALLET_STATE, {
        id: `evt-wallet-${Date.now()}`,
        type: EventTypes.WALLET_STATE,
        payload: {
          address: walletId.address,
          vaultAddress,
          balance: balance.toString(),
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
    const event: Event = {
      id: `evt-result-${Date.now()}`,
      type: EventTypes.GOAL_RESULT,
      payload: resultPayload,
      timestamp: Date.now(),
    };
    this.eventBus.emit(EventTypes.GOAL_RESULT, event);
  }

  private async handleSpawnGoal(event: Event): Promise<void> {
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

        default:
          this.emitResult(requestId, false, {}, `Unknown intent: ${intent}`);
      }
    } catch (error: any) {
      console.error(`[GoalBridge] Error handling intent ${intent}:`, error.message);
      this.emitResult(requestId, false, {}, error.message);
    }
  }

  private async handleCheckBalance(requestId: string): Promise<void> {
    if (!this.walletInitialized) {
      this.emitResult(requestId, false, {}, 'Wallet not initialized. Check server logs for details.');
      return;
    }

    // walletAdapter.getBalance needs a WalletId — fetch from SecretManager via adapter
    const walletId = await this.walletAdapter.initialize(); // idempotent: returns existing walletId
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

    this.emitResult(requestId, true, {
      asset: 'USDC',
      personalBalance: balance.toString(),
      vaultBalance,
      totalBalance: (balance + parseFloat(vaultBalance)).toString(),
      network: 'Base Mainnet',
      personalAddress: walletId.address,
      vaultAddress,
    });

    this.eventBus.emit(EventTypes.WALLET_STATE, {
      id: `evt-wallet-${Date.now()}`,
      type: EventTypes.WALLET_STATE,
      payload: {
        address: walletId.address,
        vaultAddress,
        balance: balance.toString(),
        network: walletId.network,
        asset: 'USDC'
      },
      timestamp: Date.now()
    });
  }

  private async handleTransferFunds(requestId: string, parameters: Record<string, any>): Promise<void> {
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

      // ── Pre-flight Check: AI can only spend from the Vault ────────────────
      const vaultAddress = process.env.SERA_VAULT_ADDRESS;
      if (!vaultAddress) {
        this.emitResult(requestId, false, {}, 'No Vault configured. AI cannot send funds.');
        return;
      }

      if (typeof this.walletAdapter.getAddressBalance === 'function') {
        const vaultBalance = await this.walletAdapter.getAddressBalance(vaultAddress as `0x${string}`, asset);
        if (parseFloat(amount) > vaultBalance) {
          this.emitResult(requestId, false, {}, `Insufficient Sera Vault balance. Available: ${vaultBalance} ${asset.toUpperCase()}, Requested: ${amount} ${asset.toUpperCase()}`);
          return;
        }
      }
      // ────────────────────────────────────────────────────────────────────────
      
      const receipt = await this.walletAdapter.executeTransfer(walletId, {
        idempotencyKey: `tx-${Date.now()}`,
        recipientAddress: recipient,
        amount: parseFloat(amount),
        asset: asset,
        initiator: 'AI',
      });
      
      this.emitResult(requestId, receipt.status === 'SUCCESS', receipt);
    } catch (err: any) {
      this.emitResult(requestId, false, {}, err.message);
    }
  }

  /** Direct transfer — called by the UI via socket (bypasses DialogueEngine) */
  async directTransfer(params: { recipientAddress: string; amount: number; asset: string }): Promise<any> {
    if (this.walletInitializing) await this.walletInitializing;
    if (!this.walletInitialized || !this.currentWalletId) {
      return { status: 'FAILED', error: 'Wallet not initialized' };
    }

    const receipt = await this.walletAdapter.executeTransfer(this.currentWalletId as any, {
      idempotencyKey: `ui-tx-${Date.now()}`,
      recipientAddress: params.recipientAddress,
      amount: params.amount,
      asset: params.asset,
      initiator: 'UI',
    });

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
      this.eventBus.emit(EventTypes.WALLET_STATE, {
        id: `evt-wallet-${Date.now()}`,
        type: EventTypes.WALLET_STATE,
        payload,
        timestamp: Date.now(),
      });
      return payload;
    } catch {
      return null;
    }
  }
}
