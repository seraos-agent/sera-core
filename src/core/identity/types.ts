/**
 * The stable, provider-independent identifier for a SERA user.
 *
 * Wallet addresses are public identities, not primary keys: a user can add,
 * remove, or recover a wallet without losing their agent, agreements, or
 * memory.
 */
export type SeraUserId = string;

export interface SeraUserContext {
  userId: SeraUserId;
  /** Verified public personal-wallet address, when WalletConnect was used. */
  personalWalletAddress?: string;
}

export type IdentityKind = 'EMAIL' | 'GOOGLE' | 'EXTERNAL_WALLET';
export type WalletKind = 'PERSONAL' | 'AGENT';
export type WalletProvider = 'EXTERNAL' | 'REOWN' | 'THIRDWEB' | 'BASE_ACCOUNT' | 'LOCAL_DEVELOPMENT';
export type WalletStatus = 'PROVISIONING' | 'READY' | 'FAILED_RETRYABLE' | 'REVOKED';

export interface VerifiedIdentity {
  id: string;
  userId: SeraUserId;
  kind: IdentityKind;
  /** Provider subject, email hash, or normalised public wallet address. */
  subject: string;
  provider: string;
  verifiedAt: number;
}

export interface WalletAccount {
  id: string;
  userId: SeraUserId;
  kind: WalletKind;
  provider: WalletProvider;
  providerWalletId?: string;
  chain: string;
  address?: string;
  status: WalletStatus;
  createdAt: number;
  updatedAt: number;
}

export interface TwinWalletState {
  userId: SeraUserId;
  personalWallet: WalletAccount;
  agentWallet: WalletAccount;
}
