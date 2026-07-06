import { WalletId, ExecutionReceipt } from './types';
import { ExecutionContext } from '../../core/execution/ExecutionContext';

export interface IExecutionCapability {
  /**
   * Retrieves the current balance for a specific asset in the execution environment.
   */
  getBalance(walletId: WalletId, asset: string): Promise<number>;
  getAddressBalance?(address: string, asset: string): Promise<number>;

  /**
   * Universal execution interface.
   * Delegates the intent based on the ExecutionContext to the appropriate reality adapter.
   */
  execute(walletId: WalletId, context: ExecutionContext<any>): Promise<ExecutionReceipt>;
}
