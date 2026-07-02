import { ISecretStore, SecretKeys } from './types';

/**
 * SecretManager — High-level typed interface over a raw ISecretStore.
 *
 * Callers (WalletService, OAuth connectors, etc.) use this class
 * rather than interacting with the raw store directly. This ensures:
 *   - Consistent key naming (via SecretKeys constants)
 *   - Typed getter/setter methods
 *   - A single place to add audit logging, rate limiting, etc. in future
 *
 * The underlying ISecretStore is injected at construction time, making
 * it trivially swappable (EncryptedDB → Cloud KMS → Vault → HSM).
 */
export class SecretManager {
  private store: ISecretStore;

  constructor(store: ISecretStore) {
    this.store = store;
  }

  // ── Wallet Secrets ─────────────────────────────────────────────────────

  async getAgenticWalletPrivateKey(): Promise<string | null> {
    return this.store.getSecret(SecretKeys.AGENTIC_WALLET_PRIVATE_KEY);
  }

  async setAgenticWalletPrivateKey(privateKey: string): Promise<void> {
    return this.store.setSecret(SecretKeys.AGENTIC_WALLET_PRIVATE_KEY, privateKey);
  }

  async getAgenticWalletAddress(): Promise<string | null> {
    return this.store.getSecret(SecretKeys.AGENTIC_WALLET_ADDRESS);
  }

  async setAgenticWalletAddress(address: string): Promise<void> {
    return this.store.setSecret(SecretKeys.AGENTIC_WALLET_ADDRESS, address);
  }

  async deleteAgenticWallet(): Promise<void> {
    await this.store.deleteSecret(SecretKeys.AGENTIC_WALLET_PRIVATE_KEY);
    await this.store.deleteSecret(SecretKeys.AGENTIC_WALLET_ADDRESS);
  }

  // ── Generic Pass-through (for future connectors: OAuth, API keys, etc.) ─

  async getSecret(key: string): Promise<string | null> {
    return this.store.getSecret(key);
  }

  async setSecret(key: string, value: string): Promise<void> {
    return this.store.setSecret(key, value);
  }

  async deleteSecret(key: string): Promise<void> {
    return this.store.deleteSecret(key);
  }
}
