import { randomUUID } from 'node:crypto';
import { ThirdwebCustodyProvider } from '../../capabilities/wallet/ThirdwebCustodyProvider';
import { WalletCustodyProvider } from '../../capabilities/wallet/WalletCustodyProvider';
import { SeraUserId, WalletAccount } from './types';
import { WalletAccountRepository } from './TwinWalletRegistry';

/**
 * Binds thirdweb's managed Agent Wallet to SERA's provider-independent user
 * UUID. The user ID—not an email or wallet address—is the deterministic
 * thirdweb identifier, so linked wallets can change without replacing SERA's
 * agent or its agreements.
 */
export class ThirdwebAgentWalletProvisioner {
  constructor(
    private readonly repository: WalletAccountRepository,
    private readonly provider: Pick<WalletCustodyProvider, 'initializeAgentWallet'>,
  ) {}

  static fromEnvironment(repository: WalletAccountRepository): ThirdwebAgentWalletProvisioner | null {
    if (!process.env.THIRDWEB_SECRET_KEY?.trim()) return null;
    return new ThirdwebAgentWalletProvisioner(repository, new ThirdwebCustodyProvider());
  }

  async ensureForUser(userId: SeraUserId): Promise<WalletAccount> {
    const existing = await this.repository.getByUserAndKind(userId, 'AGENT');
    if (existing?.provider === 'THIRDWEB' && existing.status === 'READY' && existing.address) {
      return existing;
    }

    const wallet = await this.provider.initializeAgentWallet(userId);
    const now = Date.now();
    const account: WalletAccount = {
      id: existing?.id ?? randomUUID(),
      userId,
      kind: 'AGENT',
      provider: 'THIRDWEB',
      // This is a stable thirdweb lookup identifier, not a credential.
      providerWalletId: `sera-agent:${userId}`,
      chain: 'base-mainnet',
      address: wallet.address.toLowerCase(),
      status: 'READY',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repository.save(account);
    return account;
  }
}
