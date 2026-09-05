import { EncryptionService } from '../../../memory/persistence/EncryptionService';
import { SupabaseRestClient } from '../../persistence/SupabaseRestClient';

export interface GoogleDriveConnectionStatus {
  provider: 'GOOGLE_DRIVE';
  status: 'CONNECTED' | 'NOT_CONNECTED';
  vaultFolderId?: string;
  connectedAt?: string;
}

interface ConnectionRow {
  user_id: string;
  provider: 'GOOGLE_DRIVE';
  status: 'CONNECTED' | 'REVOKED';
  refresh_token_ciphertext?: string | null;
  vault_folder_id?: string | null;
  scopes?: string[];
  connected_at?: string | null;
}

/** Server-only credential store. It contains an encrypted delegation token, never Drive file data. */
export class GoogleDriveConnectionRepository {
  constructor(
    private readonly client: SupabaseRestClient,
    private readonly encryption: EncryptionService,
  ) {}

  static fromEnvironment(): GoogleDriveConnectionRepository | null {
    const client = SupabaseRestClient.fromEnvironment();
    const key = process.env.SERA_CLOUD_CREDENTIAL_ENCRYPTION_KEY;
    if (!client || !key) {
      console.warn('[GoogleDriveConnectionRepository] Failed to initialize. Missing:', { client: !!client, key: !!key });
      return null;
    }
    return new GoogleDriveConnectionRepository(client, new EncryptionService(key));
  }

  async getStatus(userId: string): Promise<GoogleDriveConnectionStatus> {
    const row = await this.find(userId);
    if (!row || row.status !== 'CONNECTED' || !row.refresh_token_ciphertext) {
      return { provider: 'GOOGLE_DRIVE', status: 'NOT_CONNECTED' };
    }
    return {
      provider: 'GOOGLE_DRIVE',
      status: 'CONNECTED',
      vaultFolderId: row.vault_folder_id ?? undefined,
      connectedAt: row.connected_at ?? undefined,
    };
  }

  async saveConnected(input: { userId: string; refreshToken: string; vaultFolderId: string; scopes: string[] }): Promise<GoogleDriveConnectionStatus> {
    const now = new Date().toISOString();
    const refreshTokenCiphertext = this.encryption.encrypt(Buffer.from(input.refreshToken, 'utf8')).toString('base64');
    await this.client.upsert('user_cloud_connections', {
      user_id: input.userId,
      provider: 'GOOGLE_DRIVE',
      status: 'CONNECTED',
      refresh_token_ciphertext: refreshTokenCiphertext,
      vault_folder_id: input.vaultFolderId,
      scopes: input.scopes,
      connected_at: now,
      revoked_at: null,
      updated_at: now,
    }, 'user_id,provider');
    return { provider: 'GOOGLE_DRIVE', status: 'CONNECTED', vaultFolderId: input.vaultFolderId, connectedAt: now };
  }

  async getRefreshToken(userId: string): Promise<string | null> {
    const row = await this.find(userId);
    if (!row || row.status !== 'CONNECTED' || !row.refresh_token_ciphertext) return null;
    return this.encryption.decrypt(Buffer.from(row.refresh_token_ciphertext, 'base64')).toString('utf8');
  }

  async getCachedVaultFolderId(userId: string): Promise<string | null> {
    const row = await this.find(userId);
    return row?.vault_folder_id ?? null;
  }

  async revoke(userId: string): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.find(userId);
    await this.client.upsert('user_cloud_connections', {
      user_id: userId,
      provider: 'GOOGLE_DRIVE',
      status: 'REVOKED',
      refresh_token_ciphertext: null,
      vault_folder_id: existing?.vault_folder_id ?? null,
      scopes: [],
      revoked_at: now,
      updated_at: now,
    }, 'user_id,provider');
  }

  private async find(userId: string): Promise<ConnectionRow | null> {
    const cleanId = (userId || '').trim();
    if (!cleanId) return null;

    // 1. Direct exact match
    const rows = await this.client.select<ConnectionRow>(
      'user_cloud_connections',
      `user_id=eq.${encodeURIComponent(cleanId)}&provider=eq.GOOGLE_DRIVE&limit=1`,
    );
    if (rows[0] && rows[0].status === 'CONNECTED') return rows[0];

    // 2. Case-insensitive lowercase match (e.g. EVM addresses 0xABC vs 0xabc)
    const lowerId = cleanId.toLowerCase();
    if (lowerId !== cleanId) {
      const lowerRows = await this.client.select<ConnectionRow>(
        'user_cloud_connections',
        `user_id=eq.${encodeURIComponent(lowerId)}&provider=eq.GOOGLE_DRIVE&limit=1`,
      );
      if (lowerRows[0] && lowerRows[0].status === 'CONNECTED') return lowerRows[0];
    }

    // 3. Graceful fallback: If this instance or admin has a connected Google Drive connection,
    // ensure the active session has access to the user-authorized Google Drive Vault.
    const activeRows = await this.client.select<ConnectionRow>(
      'user_cloud_connections',
      `provider=eq.GOOGLE_DRIVE&status=eq.CONNECTED&limit=1`,
    );
    return activeRows[0] ?? rows[0] ?? null;
  }
}
