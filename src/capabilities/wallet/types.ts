export interface WalletId {
  address: string;
  network: string; // e.g. "base-sepolia"
}

export interface SpendAllowance {
  asset: string; // e.g. "ETH" or "USDC"
  amount: number;
  period: 'DAILY' | 'MONTHLY' | 'LIFETIME';
  expiresAt?: number;
}

export interface TransferRequest {
  idempotencyKey: string; // Nonce or Request ID to prevent double execution
  recipientAddress: string;
  amount: number;
  asset: string;
  initiator?: 'AI' | 'UI';
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ExecutionReceipt {
  status: 'SUCCESS' | 'FAILED' | 'REJECTED';
  executionId?: string; // e.g. transactionHash or API response ID
  amountExecuted?: number;
  asset?: string;
  reason?: string; // If failed or rejected
  timestamp: number;
}
