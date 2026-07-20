import { randomUUID } from 'node:crypto';
import { SupabaseRestClient } from '../persistence/SupabaseRestClient';
import { TwinWalletRegistry } from './TwinWalletRegistry';
import { SeraUserContext, VerifiedIdentity } from './types';
import { SupabaseWalletAccountRepository } from './SupabaseWalletAccountRepository';
import { ThirdwebAgentWalletProvisioner } from './ThirdwebAgentWalletProvisioner';

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
  private readonly walletRepository: SupabaseWalletAccountRepository;
  private readonly thirdwebProvisioner: ThirdwebAgentWalletProvisioner | null;

  constructor(private readonly client: SupabaseRestClient) {
    this.walletRepository = new SupabaseWalletAccountRepository(client);
    this.walletRegistry = new TwinWalletRegistry(this.walletRepository);
    this.thirdwebProvisioner = ThirdwebAgentWalletProvisioner.fromEnvironment(this.walletRepository);
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
    await this.provisionAgentWallet(userId);

    return { userId, personalWalletAddress };
  }

  /**
   * Adds a wallet that has been proven by a fresh signature to an already
   * authenticated SERA account. A wallet can never be silently moved from a
   * different user: the unique provider/subject constraint is checked first.
   */
  async linkVerifiedWallet(userId: string, address: string): Promise<VerifiedIdentity> {
    const subject = address.toLowerCase();
    const existing = await this.findIdentity(subject);
    if (existing) {
      if (existing.userId !== userId) {
        throw new WalletAlreadyLinkedError();
      }
      return existing;
    }

    const now = new Date().toISOString();
    await this.client.upsert('auth_identities', {
      id: randomUUID(),
      user_id: userId,
      kind: 'EXTERNAL_WALLET',
      provider: 'reown_wallet',
      subject,
      verified_at: now,
    }, 'provider,subject');

    const linked = await this.findIdentity(subject);
    if (!linked) throw new Error('Wallet identity could not be linked.');
    if (linked.userId !== userId) throw new WalletAlreadyLinkedError();
    return linked;
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

  private async provisionAgentWallet(userId: string): Promise<void> {
    if (!this.thirdwebProvisioner) return;
    try {
      await this.thirdwebProvisioner.ensureForUser(userId);
    } catch (error) {
      // Authentication never falls back to a local key. The Agent Wallet stays
      // PROVISIONING and can be retried after a transient thirdweb failure.
      console.warn('[ReownIdentity] Agent Wallet provisioning deferred:', error instanceof Error ? error.message : error);
    }
  }
}

export class WalletAlreadyLinkedError extends Error {
  constructor() {
    super('This wallet is already linked to a different SERA account.');
    this.name = 'WalletAlreadyLinkedError';
  }
}
