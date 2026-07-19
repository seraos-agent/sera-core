import { SupabaseRestClient } from '../persistence/SupabaseRestClient';
import { WalletAccount, WalletKind } from './types';
import { WalletAccountRepository } from './TwinWalletRegistry';

interface WalletRow {
  id: string;
  user_id: string;
  kind: WalletKind;
  provider: WalletAccount['provider'];
  provider_wallet_id?: string;
  chain: string;
  address?: string;
  status: WalletAccount['status'];
  created_at: string;
  updated_at: string;
}

/** Server-only persistence adapter shared by every Supabase-backed identity flow. */
export class SupabaseWalletAccountRepository implements WalletAccountRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  async getByUserAndKind(userId: string, kind: WalletKind): Promise<WalletAccount | null> {
    const rows = await this.client.select<WalletRow>(
      'wallet_accounts',
      `user_id=eq.${encodeURIComponent(userId)}&kind=eq.${kind}&limit=1`,
    );
    return rows[0] ? this.toDomain(rows[0]) : null;
  }

  async save(wallet: WalletAccount): Promise<void> {
    await this.client.upsert('wallet_accounts', {
      id: wallet.id,
      user_id: wallet.userId,
      kind: wallet.kind,
      provider: wallet.provider,
      provider_wallet_id: wallet.providerWalletId ?? null,
      chain: wallet.chain,
      address: wallet.address ?? null,
      status: wallet.status,
      created_at: new Date(wallet.createdAt).toISOString(),
      updated_at: new Date(wallet.updatedAt).toISOString(),
    }, 'id');
  }

  private toDomain(row: WalletRow): WalletAccount {
    return {
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      provider: row.provider,
      providerWalletId: row.provider_wallet_id,
      chain: row.chain,
      address: row.address,
      status: row.status,
      createdAt: Date.parse(row.created_at),
      updatedAt: Date.parse(row.updated_at),
    };
  }
}
