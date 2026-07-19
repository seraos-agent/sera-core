import { randomUUID } from 'node:crypto';
import { SupabaseRestClient } from '../persistence/SupabaseRestClient';
import { TwinWalletRegistry, WalletAccountRepository } from './TwinWalletRegistry';
import { SeraUserContext, VerifiedIdentity, WalletAccount, WalletKind } from './types';

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
    const rows = await this.client.select<WalletRow>('wallet_accounts', `user_id=eq.${encodeURIComponent(userId)}&kind=eq.${kind}&limit=1`);
    return rows[0] ? {
      id: rows[0].id,
      userId: rows[0].user_id,
      kind: rows[0].kind,
      provider: rows[0].provider,
      providerWalletId: rows[0].provider_wallet_id,
      chain: rows[0].chain,
      address: rows[0].address,
      status: rows[0].status,
      createdAt: Date.parse(rows[0].created_at),
      updatedAt: Date.parse(rows[0].updated_at),
    } : null;
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
}

interface IdentityRow {
  id: string;
  user_id: string;
  kind: VerifiedIdentity['kind'];
  subject: string;
  provider: string;
  verified_at: string;
}

/**
 * Maps a wallet whose SIWE-style challenge has already been verified by SERA
 * to a durable SERA user. Reown remains the UX/provider; Supabase is only the
 * durable system of record and never receives a wallet private key.
 */
export class ReownWalletIdentityService {
  private readonly walletRegistry: TwinWalletRegistry;

  constructor(private readonly client: SupabaseRestClient) {
    this.walletRegistry = new TwinWalletRegistry(new SupabaseWalletAccountRepository(client));
  }

  static fromEnvironment(): ReownWalletIdentityService | null {
    const client = SupabaseRestClient.fromEnvironment();
    return client ? new ReownWalletIdentityService(client) : null;
  }

  async resolveVerifiedWallet(address: string): Promise<SeraUserContext> {
    const personalWalletAddress = address.toLowerCase();
    const existing = await this.findIdentity(personalWalletAddress);
    const userId = existing?.userId ?? await this.createIdentity(personalWalletAddress);

    await this.walletRegistry.ensure({
      userId,
      personal: {
        provider: 'REOWN',
        chain: 'base-mainnet',
        address: personalWalletAddress,
        status: 'READY',
      },
      agent: { provider: 'THIRDWEB', chain: 'base-mainnet', status: 'PROVISIONING' },
    });

    return { userId, personalWalletAddress };
  }

  private async findIdentity(subject: string): Promise<VerifiedIdentity | null> {
    const rows = await this.client.select<IdentityRow>(
      'auth_identities',
      `provider=eq.reown_wallet&subject=eq.${encodeURIComponent(subject)}&revoked_at=is.null&limit=1`,
    );
    const row = rows[0];
    return row ? {
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      subject: row.subject,
      provider: row.provider,
      verifiedAt: Date.parse(row.verified_at),
    } : null;
  }

  private async createIdentity(subject: string): Promise<string> {
    const now = new Date().toISOString();
    const provisionalUserId = randomUUID();
    await this.client.upsert('sera_users', { id: provisionalUserId, created_at: now, updated_at: now }, 'id');
    await this.client.upsert('auth_identities', {
      id: randomUUID(),
      user_id: provisionalUserId,
      kind: 'EXTERNAL_WALLET',
      provider: 'reown_wallet',
      subject,
      verified_at: now,
    }, 'provider,subject');

    // If concurrent sign-ins reached the unique identity constraint, the
    // subsequent read returns the canonical user instead of trusting the
    // provisional UUID.
    const resolved = await this.findIdentity(subject);
    if (!resolved) throw new Error('Reown identity could not be persisted.');
    return resolved.userId;
  }
}
