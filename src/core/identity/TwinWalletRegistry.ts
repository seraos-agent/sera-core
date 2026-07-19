import { randomUUID } from 'node:crypto';
import {
  SeraUserId,
  TwinWalletState,
  WalletAccount,
  WalletKind,
  WalletProvider,
  WalletStatus,
} from './types';

export interface WalletAccountRepository {
  getByUserAndKind(userId: SeraUserId, kind: WalletKind): Promise<WalletAccount | null>;
  save(wallet: WalletAccount): Promise<void>;
}

export interface EnsureTwinWalletsInput {
  userId: SeraUserId;
  personal: Pick<WalletAccount, 'provider' | 'chain' | 'address' | 'providerWalletId' | 'status'>;
  agent?: Pick<WalletAccount, 'provider' | 'chain' | 'address' | 'providerWalletId' | 'status'>;
}

/**
 * Enforces SERA's product invariant: every account has exactly one personal
 * wallet and one agent wallet record. Provider provisioning is intentionally
 * separate; an AGENT record may remain PROVISIONING while the user uses SERA.
 */
export class TwinWalletRegistry {
  constructor(private readonly repository: WalletAccountRepository) {}

  async ensure(input: EnsureTwinWalletsInput): Promise<TwinWalletState> {
    const personalWallet = await this.ensureWallet(input.userId, 'PERSONAL', input.personal);
    const agentWallet = await this.ensureWallet(input.userId, 'AGENT', input.agent ?? {
      provider: 'THIRDWEB',
      chain: input.personal.chain,
      status: 'PROVISIONING',
    });
    return { userId: input.userId, personalWallet, agentWallet };
  }

  private async ensureWallet(
    userId: SeraUserId,
    kind: WalletKind,
    requested: Pick<WalletAccount, 'provider' | 'chain' | 'address' | 'providerWalletId' | 'status'>,
  ): Promise<WalletAccount> {
    const existing = await this.repository.getByUserAndKind(userId, kind);
    if (existing) return existing;

    const now = Date.now();
    const wallet: WalletAccount = {
      id: randomUUID(),
      userId,
      kind,
      provider: requested.provider,
      providerWalletId: requested.providerWalletId,
      chain: requested.chain,
      address: requested.address?.toLowerCase(),
      status: requested.status,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.save(wallet);
    return wallet;
  }
}

/** Development/test-only repository. Production must use the Postgres schema. */
export class InMemoryWalletAccountRepository implements WalletAccountRepository {
  private readonly wallets = new Map<string, WalletAccount>();

  async getByUserAndKind(userId: SeraUserId, kind: WalletKind): Promise<WalletAccount | null> {
    return [...this.wallets.values()].find(wallet => wallet.userId === userId && wallet.kind === kind) ?? null;
  }

  async save(wallet: WalletAccount): Promise<void> {
    this.wallets.set(wallet.id, { ...wallet });
  }
}
