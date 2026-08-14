import { SupabaseRestClient } from './SupabaseRestClient';

export type TransferAuditStatus = 'APPROVED' | 'BROADCAST' | 'CONFIRMED' | 'FAILED';
export type TransferApprovalSource = 'GOVERNED_ACTION' | 'DIRECT_UI';

export interface TransferAuditEvent {
  userId: string;
  idempotencyKey: string;
  approvalSource: TransferApprovalSource;
  sourceWallet: string;
  destinationWallet: string;
  chain: string;
  asset: string;
  amount: string;
  status: TransferAuditStatus;
  transactionHash?: string;
  failureReason?: string;
  broadcastAt?: Date;
  confirmedAt?: Date;
}

export interface TransferAuditRepository {
  record(event: TransferAuditEvent): Promise<void>;
}

/**
 * Server-only persistence for the transfer lifecycle. The unique request key
 * makes retries idempotent while preserving one auditable transfer record.
 */
export class SupabaseTransferAuditRepository implements TransferAuditRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  static fromEnvironment(): SupabaseTransferAuditRepository | null {
    const client = SupabaseRestClient.fromEnvironment();
    return client ? new SupabaseTransferAuditRepository(client) : null;
  }

  async record(event: TransferAuditEvent): Promise<void> {
    await this.client.upsert('wallet_transfer_events', {
      user_id: event.userId,
      idempotency_key: event.idempotencyKey,
      approval_source: event.approvalSource,
      source_wallet: event.sourceWallet.toLowerCase(),
      destination_wallet: event.destinationWallet.toLowerCase(),
      chain: event.chain,
      asset: event.asset.toUpperCase(),
      amount: event.amount,
      status: event.status,
      transaction_hash: event.transactionHash ?? undefined,
      failure_reason: event.failureReason ?? undefined,
      broadcast_at: event.broadcastAt?.toISOString(),
      confirmed_at: event.confirmedAt?.toISOString(),
      updated_at: new Date().toISOString(),
    }, 'idempotency_key');
  }
}
