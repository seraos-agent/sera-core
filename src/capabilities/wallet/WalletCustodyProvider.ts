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
