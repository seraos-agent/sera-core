import { randomUUID } from 'node:crypto';
import { SupabaseRestClient } from '../persistence/SupabaseRestClient';
import { TwinWalletRegistry } from './TwinWalletRegistry';
import { SeraUserContext } from './types';
import { SupabaseWalletAccountRepository } from './SupabaseWalletAccountRepository';
import { ThirdwebAgentWalletProvisioner } from './ThirdwebAgentWalletProvisioner';

/**
 * Resolves a verified Supabase Auth token to SERA's canonical user ID and
 * atomically establishes the two wallet records. The service key remains
 * server-only; callers can never supply a SeraUserId directly.
 */
export class SupabaseIdentityService {
  private readonly walletRegistry: TwinWalletRegistry;
  private readonly walletRepository: SupabaseWalletAccountRepository;
  private readonly thirdwebProvisioner: ThirdwebAgentWalletProvisioner | null;

  constructor(private readonly client: SupabaseRestClient) {
    this.walletRepository = new SupabaseWalletAccountRepository(client);
    this.walletRegistry = new TwinWalletRegistry(this.walletRepository);
    this.thirdwebProvisioner = ThirdwebAgentWalletProvisioner.fromEnvironment(this.walletRepository);
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
    await this.provisionAgentWallet(user.id);

    return { userId: user.id, personalWalletAddress: personalWalletAddress?.toLowerCase() };
  }

  private async provisionAgentWallet(userId: string): Promise<void> {
    if (!this.thirdwebProvisioner) return;
    try {
      await this.thirdwebProvisioner.ensureForUser(userId);
    } catch (error) {
      // Identity login remains available. Wallet actions still fail closed
      // until a retry has provisioned the managed Agent Wallet.
      console.warn('[SupabaseIdentity] Agent Wallet provisioning deferred:', error instanceof Error ? error.message : error);
    }
  }
}
