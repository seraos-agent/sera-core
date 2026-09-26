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
    const safe = userAddress ? userAddress.toLowerCase().replace(/[^a-z0-9_]/g, '_') : '';
    return safe ? `AGENTIC_WALLET_PRIVATE_KEY_${safe}` : SecretKeys.AGENTIC_WALLET_PRIVATE_KEY;
  }

  private getAgenticAddressKey(userAddress?: string): string {
    const safe = userAddress ? userAddress.toLowerCase().replace(/[^a-z0-9_]/g, '_') : '';
    return safe ? `AGENTIC_WALLET_ADDRESS_${safe}` : SecretKeys.AGENTIC_WALLET_ADDRESS;
  }

  async getAgenticWalletPrivateKey(userAddress?: string): Promise<string | null> {
    const key = this.getAgenticPkKey(userAddress);
    const existing = await this.store.getSecret(key);
    if (existing) return existing;

    // Backward-compatibility fallback: check legacy raw key format (e.g. AGENTIC_WALLET_PRIVATE_KEY_email:user@domain.com)
    if (userAddress) {
      const legacyKey = `AGENTIC_WALLET_PRIVATE_KEY_${userAddress.toLowerCase()}`;
      if (legacyKey !== key) {
        const legacyVal = await this.store.getSecret(legacyKey);
        if (legacyVal) {
          // Auto-migrate to the sanitized key for future fast, URL-safe lookups
          await this.store.setSecret(key, legacyVal);
          return legacyVal;
        }
      }
    }
    return null;
  }

  async setAgenticWalletPrivateKey(privateKey: string, userAddress?: string): Promise<void> {
    return this.store.setSecret(this.getAgenticPkKey(userAddress), privateKey);
  }

  async getAgenticWalletAddress(userAddress?: string): Promise<string | null> {
    const key = this.getAgenticAddressKey(userAddress);
    const existing = await this.store.getSecret(key);
    if (existing) return existing;

    // Backward-compatibility fallback: check legacy raw key format
    if (userAddress) {
      const legacyKey = `AGENTIC_WALLET_ADDRESS_${userAddress.toLowerCase()}`;
      if (legacyKey !== key) {
        const legacyVal = await this.store.getSecret(legacyKey);
        if (legacyVal) {
          await this.store.setSecret(key, legacyVal);
          return legacyVal;
        }
      }
    }
    return null;
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
