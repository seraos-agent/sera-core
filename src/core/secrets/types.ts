/**
 * ISecretStore — The pluggable backend for Sera's Secret Management Service.
 *
 * Implementations:
 *   Phase 1: EncryptedDatabaseSecretStore (AES-256-GCM, local file)
 *   Phase 2: CloudKmsSecretStore (AWS KMS, GCP KMS, Azure Key Vault)
 *   Phase 3: VaultSecretStore (HashiCorp Vault)
 *   Phase 4: HsmSecretStore / MpcSecretStore / CdpSecretStore
 *
 * The Wallet Service (and all callers) only depend on this interface.
 * The storage backend is completely replaceable without changing any caller.
 */
export interface ISecretStore {
  /**
   * Retrieve a secret by its key. Returns null if not found.
   */
  getSecret(key: string): Promise<string | null>;

  /**
   * Persist a secret under the given key.
   * Implementations must ensure atomic writes and encryption at rest.
   */
  setSecret(key: string, value: string): Promise<void>;

  /**
   * Permanently delete a secret.
   */
  deleteSecret(key: string): Promise<void>;
}

// ── Well-known Secret Keys ─────────────────────────────────────────────────
export const SecretKeys = {
  AGENTIC_WALLET_PRIVATE_KEY: 'agentic_wallet.private_key',
  AGENTIC_WALLET_ADDRESS: 'agentic_wallet.address',
} as const;
