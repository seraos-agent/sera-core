import { randomBytes } from 'crypto';

/**
 * In-memory API key store for MCP authentication (V1).
 * Maps Sera API keys to user IDs so that external MCP clients
 * (Claude Desktop, ChatGPT) can authenticate as a specific Sera user.
 *
 * Keys are prefixed with `sk-sera-` for easy identification.
 */
export class McpApiKeyStore {
  /** apiKey → userId */
  private keyToUser: Map<string, string> = new Map();
  /** userId → Set<apiKey> (a user can have multiple keys) */
  private userToKeys: Map<string, Set<string>> = new Map();

  private oauthStore?: any;

  constructor(oauthStore?: any) {
    this.oauthStore = oauthStore;
    // Automatically register the static environment API key if provided.
    // This allows securing the deployed server with a fixed key.
    if (process.env.SERA_API_KEY) {
      const adminUserId = 'admin-system-user';
      this.keyToUser.set(process.env.SERA_API_KEY, adminUserId);
      this.userToKeys.set(adminUserId, new Set([process.env.SERA_API_KEY]));
    }
  }

  public setOAuthStore(oauthStore: any) {
    this.oauthStore = oauthStore;
  }

  /**
   * Generates a new API key for a given userId.
   * Format: sk-sera-<32 hex chars>
   */
  public generateKey(userId: string): string {
    const key = `sk-sera-${randomBytes(16).toString('hex')}`;
    this.keyToUser.set(key, userId);

    let userKeys = this.userToKeys.get(userId);
    if (!userKeys) {
      userKeys = new Set();
      this.userToKeys.set(userId, userKeys);
    }
    userKeys.add(key);

    return key;
  }

  /**
   * Resolves an API key or OAuth Bearer token to its owning userId.
   * Returns null if the key/token is invalid or revoked.
   */
  public resolveUser(tokenOrKey: string): string | null {
    if (!tokenOrKey) return null;
    const clean = tokenOrKey.replace(/^Bearer\s+/i, '').trim();
    
    // 1. Direct API Key map check
    const directUser = this.keyToUser.get(clean);
    if (directUser) return directUser;

    // 2. OAuth token resolution
    if (this.oauthStore && typeof this.oauthStore.resolveSession === 'function') {
      const oauthUser = this.oauthStore.resolveSession(clean);
      if (oauthUser) return oauthUser;
    }

    return null;
  }

  /**
   * Revokes a specific API key. Returns true if the key existed.
   */
  public revokeKey(apiKey: string): boolean {
    const userId = this.keyToUser.get(apiKey);
    if (!userId) return false;

    this.keyToUser.delete(apiKey);
    const userKeys = this.userToKeys.get(userId);
    if (userKeys) {
      userKeys.delete(apiKey);
      if (userKeys.size === 0) this.userToKeys.delete(userId);
    }
    return true;
  }

  /**
   * Lists all active API keys for a user (masked for security).
   */
  public listKeys(userId: string): Array<{ key: string; masked: string }> {
    const userKeys = this.userToKeys.get(userId);
    if (!userKeys) return [];

    return Array.from(userKeys).map(key => ({
      key,
      masked: `${key.slice(0, 10)}...${key.slice(-4)}`,
    }));
  }

  /**
   * Revokes all keys belonging to a user.
   */
  public revokeAllForUser(userId: string): number {
    const userKeys = this.userToKeys.get(userId);
    if (!userKeys) return 0;

    let count = 0;
    for (const key of userKeys) {
      this.keyToUser.delete(key);
      count++;
    }
    this.userToKeys.delete(userId);
    return count;
  }
}
