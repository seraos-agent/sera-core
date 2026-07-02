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

    console.log('[GoalBridge] Initialized. Listening for SPAWN_GOAL events.');
  }

  private async initWallet(): Promise<void> {
    try {
      const walletId = await this.walletAdapter.initialize();
      this.walletInitialized = true;
      const balance = await this.walletAdapter.getBalance(walletId, 'usdc');
      
      this.eventBus.emit(EventTypes.WALLET_STATE, {
        id: `evt-wallet-${Date.now()}`,
        type: EventTypes.WALLET_STATE,
        payload: { address: walletId.address, balance: balance.toString(), network: walletId.network, asset: 'USDC' },
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

    this.emitResult(requestId, true, {
      asset: 'USDC',
      balance: balance.toString(),
      network: 'Base Mainnet',
      address: walletId.address,
    });

    this.eventBus.emit(EventTypes.WALLET_STATE, {
      id: `evt-wallet-${Date.now()}`,
      type: EventTypes.WALLET_STATE,
      payload: { address: walletId.address, balance: balance.toString(), network: walletId.network, asset: 'USDC' },
      timestamp: Date.now()
    });
  }
}
