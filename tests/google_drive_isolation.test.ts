import { describe, it, expect, vi } from 'vitest';
import { GoogleDriveConnectionRepository } from '../src/core/integrations/google-drive/GoogleDriveConnectionRepository';
import { GoogleDriveCapability } from '../src/capabilities/google-drive/GoogleDriveCapability';
import { EncryptionService } from '../src/memory/persistence/EncryptionService';

describe('Google Drive Multi-Tenant Isolation', () => {
  const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const encryption = new EncryptionService(encryptionKey);

  const encTokenA = encryption.encrypt(Buffer.from('refresh-token-user-a', 'utf8')).toString('base64');
  const encTokenC = encryption.encrypt(Buffer.from('refresh-token-user-c', 'utf8')).toString('base64');

  // Simulated Supabase user_cloud_connections rows
  const databaseRows: any[] = [
    {
      user_id: 'user-a-1111-2222',
      provider: 'GOOGLE_DRIVE',
      status: 'CONNECTED',
      refresh_token_ciphertext: encTokenA,
      vault_folder_id: 'vault-folder-user-a',
      connected_at: '2026-09-01T00:00:00.000Z'
    },
    {
      user_id: '0x1234567890abcdef1234567890abcdef12345678',
      provider: 'GOOGLE_DRIVE',
      status: 'CONNECTED',
      refresh_token_ciphertext: encTokenC,
      vault_folder_id: 'vault-folder-user-c',
      connected_at: '2026-09-01T00:00:00.000Z'
    }
  ];

  const mockSupabaseClient = {
    select: vi.fn().mockImplementation(async (table: string, query: string) => {
      if (table !== 'user_cloud_connections') return [];
      
      const parsedParams = new URLSearchParams(query);
      const userIdFilter = parsedParams.get('user_id');
      const providerFilter = parsedParams.get('provider');

      let matches = databaseRows.filter(r => {
        if (providerFilter && !providerFilter.includes(r.provider)) return false;
        if (userIdFilter) {
          const expected = userIdFilter.replace('eq.', '');
          if (r.user_id !== expected) return false;
        }
        return true;
      });

      return matches;
    }),
    upsert: vi.fn().mockResolvedValue({})
  } as any;

  const repo = new GoogleDriveConnectionRepository(mockSupabaseClient, encryption);

  it('correctly resolves connected status for User A who authorized Google Drive', async () => {
    const statusA = await repo.getStatus('user-a-1111-2222');
    expect(statusA.status).toBe('CONNECTED');
    expect(statusA.vaultFolderId).toBe('vault-folder-user-a');

    const tokenA = await repo.getRefreshToken('user-a-1111-2222');
    expect(tokenA).toBe('refresh-token-user-a');
  });

  it('STRICT ISOLATION: User B who has NOT connected Google Drive must NOT inherit User A credentials', async () => {
    // User B is an unconnected user or guest session
    const statusB = await repo.getStatus('user-b-unconnected-3333');
    expect(statusB.status).toBe('NOT_CONNECTED');
    expect(statusB.vaultFolderId).toBeUndefined();

    const tokenB = await repo.getRefreshToken('user-b-unconnected-3333');
    expect(tokenB).toBeNull();

    const vaultB = await repo.getCachedVaultFolderId('user-b-unconnected-3333');
    expect(vaultB).toBeNull();
  });

  it('STRICT ISOLATION: GoogleDriveCapability rejects spreadsheet actions for unconnected User B without touching User A vault', async () => {
    const mockFetch = vi.fn();
    const capability = new GoogleDriveCapability(repo, 'mock-client-id', 'mock-client-secret', mockFetch);

    // User B attempts to get access token
    await expect(capability.getAccessToken('user-b-unconnected-3333')).rejects.toThrow(
      'Google Drive is not connected for user user-b-unconnected-3333'
    );

    // User B attempts to create spreadsheet
    await expect(
      capability.createSpreadsheet('user-b-unconnected-3333', 'Secret Financials', ['Col A'], [['Row 1']])
    ).rejects.toThrow('Google Drive is not connected for user user-b-unconnected-3333');

    // Google API fetch must NEVER be invoked with User A's token or vault
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('supports case-insensitive EVM address lookup while maintaining strict user boundary', async () => {
    // Connect address stored in lowercase: 0x1234567890abcdef1234567890abcdef12345678
    // Queried with mixed-case: 0x1234567890ABCDEF1234567890ABCDEF12345678
    const statusC = await repo.getStatus('0x1234567890ABCDEF1234567890ABCDEF12345678');
    expect(statusC.status).toBe('CONNECTED');
    expect(statusC.vaultFolderId).toBe('vault-folder-user-c');

    const tokenC = await repo.getRefreshToken('0x1234567890ABCDEF1234567890ABCDEF12345678');
    expect(tokenC).toBe('refresh-token-user-c');

    // Different EVM address gets NOT_CONNECTED
    const statusD = await repo.getStatus('0x9999999999999999999999999999999999999999');
    expect(statusD.status).toBe('NOT_CONNECTED');
  });
});
