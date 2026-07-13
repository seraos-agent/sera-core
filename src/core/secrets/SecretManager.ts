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

  private getAgenticPkKey(userAddress?: string): string {
    return userAddress ? `AGENTIC_WALLET_PRIVATE_KEY_${userAddress.toLowerCase()}` : SecretKeys.AGENTIC_WALLET_PRIVATE_KEY;
  }

  private getAgenticAddressKey(userAddress?: string): string {
    return userAddress ? `AGENTIC_WALLET_ADDRESS_${userAddress.toLowerCase()}` : SecretKeys.AGENTIC_WALLET_ADDRESS;
  }

  async getAgenticWalletPrivateKey(userAddress?: string): Promise<string | null> {
    return this.store.getSecret(this.getAgenticPkKey(userAddress));
  }

  async setAgenticWalletPrivateKey(privateKey: string, userAddress?: string): Promise<void> {
    return this.store.setSecret(this.getAgenticPkKey(userAddress), privateKey);
  }

  async getAgenticWalletAddress(userAddress?: string): Promise<string | null> {
    return this.store.getSecret(this.getAgenticAddressKey(userAddress));
  }

  async setAgenticWalletAddress(address: string, userAddress?: string): Promise<void> {
    return this.store.setSecret(this.getAgenticAddressKey(userAddress), address);
  }

  async deleteAgenticWallet(userAddress?: string): Promise<void> {
    await this.store.deleteSecret(this.getAgenticPkKey(userAddress));
    await this.store.deleteSecret(this.getAgenticAddressKey(userAddress));
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
