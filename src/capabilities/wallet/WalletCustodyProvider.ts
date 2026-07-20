import { ExecutionContext } from '../../core/execution/ExecutionContext';
import { SeraUserId } from '../../core/identity/types';
import { ExecutionReceipt, WalletId } from './types';

/**
 * Boundary between SERA's governance/execution layers and key custody.
 * No implementation may expose a private key through this contract.
 */
export interface WalletCustodyProvider {
  readonly providerId: string;
  initializeAgentWallet(userId?: SeraUserId): Promise<WalletId>;
  getBalance(walletId: WalletId, asset: string): Promise<number>;
  getAddressBalance(address: string, asset: string): Promise<number>;
  execute(walletId: WalletId, context: ExecutionContext<any>): Promise<ExecutionReceipt>;
}

export class WalletCustodyUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletCustodyUnavailableError';
  }
}

/**
 * Production-safe placeholder used when a managed wallet provider has not
 * been configured yet. It lets non-wallet SERA capabilities boot while every
 * wallet operation remains explicitly unavailable.
 */
export class UnavailableWalletCustodyProvider implements WalletCustodyProvider {
  readonly providerId = 'unavailable';

  constructor(private readonly reason: string) {}

  private unavailable(): never {
    throw new WalletCustodyUnavailableError(this.reason);
  }

  async initializeAgentWallet(_userId?: SeraUserId): Promise<WalletId> {
    return this.unavailable();
  }

  async getBalance(_walletId: WalletId, _asset: string): Promise<number> {
    return this.unavailable();
  }

  async getAddressBalance(_address: string, _asset: string): Promise<number> {
    return this.unavailable();
  }

  async execute(_walletId: WalletId, _context: ExecutionContext<any>): Promise<ExecutionReceipt> {
    return this.unavailable();
  }
}
