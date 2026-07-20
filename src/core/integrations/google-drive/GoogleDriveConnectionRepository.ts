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
    return client && key ? new GoogleDriveConnectionRepository(client, new EncryptionService(key)) : null;
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

  async revoke(userId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.upsert('user_cloud_connections', {
      user_id: userId,
      provider: 'GOOGLE_DRIVE',
      status: 'REVOKED',
      refresh_token_ciphertext: null,
      vault_folder_id: null,
      scopes: [],
      revoked_at: now,
      updated_at: now,
    }, 'user_id,provider');
  }

  private async find(userId: string): Promise<ConnectionRow | null> {
    const rows = await this.client.select<ConnectionRow>(
      'user_cloud_connections',
      `user_id=eq.${encodeURIComponent(userId)}&provider=eq.GOOGLE_DRIVE&limit=1`,
    );
    return rows[0] ?? null;
  }
}
