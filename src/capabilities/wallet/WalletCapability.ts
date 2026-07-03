import { WalletId, TransferRequest, TransferReceipt } from './types';

export interface IWalletCapability {
  /**
   * Retrieves the current balance for a specific asset in the wallet.
   */
  getBalance(walletId: WalletId, asset: string): Promise<number>;
  getAddressBalance?(address: string, asset: string): Promise<number>;

  /**
   * Executes a transfer if the request complies with all spend permissions.
   */
  executeTransfer(walletId: WalletId, request: TransferRequest): Promise<TransferReceipt>;
}
