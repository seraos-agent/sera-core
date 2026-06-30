import { IWalletCapability } from './WalletCapability';
import { TransferReceipt, TransferRequest, WalletId } from './types';
import { SpendPermissionAdapter } from './SpendPermissionAdapter';

export class AgenticWalletAdapter implements IWalletCapability {
  private permissionGuard: SpendPermissionAdapter;

  constructor(permissionGuard: SpendPermissionAdapter) {
    this.permissionGuard = permissionGuard;
  }

  async getBalance(walletId: WalletId, asset: string): Promise<number> {
    // In a real implementation, this would query CDP Agentic Wallet SDK
    // For Walking Skeleton, we just return the spend allowance limit
    return await this.permissionGuard.getRemainingAllowance(walletId, asset);
  }

  async executeTransfer(walletId: WalletId, request: TransferRequest): Promise<TransferReceipt> {
    console.log(`[AgenticWalletAdapter] 🚀 Initiating transfer of ${request.amount} ${request.asset} to ${request.recipientAddress}...`);
    
    // Step 1: The Guard (Single Source of Truth)
    const isAllowed = await this.permissionGuard.validateAndDeduct(walletId, request);
    
    if (!isAllowed) {
      return {
        status: 'REJECTED',
        amountTransferred: 0,
        asset: request.asset,
        reason: 'Spend Permission Denied',
        timestamp: Date.now()
      };
    }

    // Step 2: The Execution (Blind Executor)
    // In a real implementation, we would call the CDP Agentic Wallet SDK here:
    // await wallet.transfer({ amount: request.amount, assetId: request.asset, destination: request.recipientAddress })
    
    // Mocking network delay and successful execution
    await new Promise(resolve => setTimeout(resolve, 500));
    const fakeTxHash = '0x' + Math.random().toString(16).substring(2, 10).padEnd(64, '0');

    console.log(`[AgenticWalletAdapter] ✅ Transfer executed successfully. TX Hash: ${fakeTxHash}`);

    return {
      status: 'SUCCESS',
      transactionHash: fakeTxHash,
      amountTransferred: request.amount,
      asset: request.asset,
      timestamp: Date.now()
    };
  }
}
