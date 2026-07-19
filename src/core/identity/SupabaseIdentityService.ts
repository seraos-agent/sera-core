import { randomUUID } from 'node:crypto';
import { SupabaseRestClient } from '../persistence/SupabaseRestClient';
import { TwinWalletRegistry, WalletAccountRepository } from './TwinWalletRegistry';
import { SeraUserContext, WalletAccount, WalletKind } from './types';

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

class SupabaseWalletAccountRepository implements WalletAccountRepository {
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

/**
 * Resolves a verified Supabase Auth token to SERA's canonical user ID and
 * atomically establishes the two wallet records. The service key remains
 * server-only; callers can never supply a SeraUserId directly.
 */
export class SupabaseIdentityService {
  private readonly walletRegistry: TwinWalletRegistry;

  constructor(private readonly client: SupabaseRestClient) {
    this.walletRegistry = new TwinWalletRegistry(new SupabaseWalletAccountRepository(client));
  }

  static fromEnvironment(): SupabaseIdentityService | null {
    const client = SupabaseRestClient.fromEnvironment();
    return client ? new SupabaseIdentityService(client) : null;
  }

  async resolve(accessToken: string, personalWalletAddress?: string): Promise<SeraUserContext> {
    const user = await this.client.getAuthenticatedUser(accessToken);
    const now = new Date().toISOString();
    const provider = user.app_metadata?.provider ?? 'supabase';

    await this.client.upsert('sera_users', { id: user.id, created_at: now, updated_at: now }, 'id');
    await this.client.upsert('auth_identities', {
      id: randomUUID(),
      user_id: user.id,
      kind: provider === 'google' ? 'GOOGLE' : 'EMAIL',
      provider: 'supabase_auth',
      subject: user.id,
      verified_at: now,
    }, 'provider,subject');

    await this.walletRegistry.ensure({
      userId: user.id,
      personal: {
        provider: personalWalletAddress ? 'REOWN' : 'REOWN',
        chain: 'base-mainnet',
        address: personalWalletAddress,
        status: personalWalletAddress ? 'READY' : 'PROVISIONING',
      },
      agent: { provider: 'THIRDWEB', chain: 'base-mainnet', status: 'PROVISIONING' },
    });

    return { userId: user.id, personalWalletAddress: personalWalletAddress?.toLowerCase() };
  }
}
