import { describe, it, expect, vi } from 'vitest';
import {
  GoogleDriveVaultInitializer,
  CANONICAL_VAULT_FOLDERS,
  DEFAULT_SPREADSHEET_TEMPLATES
} from '../src/core/integrations/google-drive/GoogleDriveVaultInitializer';

describe('GoogleDriveVaultInitializer', () => {
  const userId = 'user-vault-test-123';

  function createMockEnvironment(initialFiles: any[] = []) {
    const files: any[] = [...initialFiles];
    const folders: string[] = [];

    const mockConnections = {
      getStatus: vi.fn().mockResolvedValue({
        provider: 'GOOGLE_DRIVE',
        status: 'CONNECTED',
        vaultFolderId: 'vault-root-id'
      }),
      getRefreshToken: vi.fn().mockResolvedValue('mock-refresh-token')
    } as any;

    const mockCapability = {
      ensureFolder: vi.fn().mockImplementation(async (_uid: string, folderName: string) => {
        if (!folders.includes(folderName)) {
          folders.push(folderName);
        }
        return `folder-id-${folderName.replace(/\s+/g, '-').toLowerCase()}`;
      }),
      listFiles: vi.fn().mockImplementation(async () => {
        return files.map(f => ({ ...f }));
      }),
      createSpreadsheet: vi.fn().mockImplementation(async (_uid: string, title: string, headers: string[], rows: any[][], options: any) => {
        const newFile = {
          id: `file-id-${Date.now()}-${title}`,
          name: title,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          headers,
          rows,
          options
        };
        files.push(newFile);
        return {
          fileId: newFile.id,
          webViewLink: `https://drive.google.com/open?id=${newFile.id}`,
          isUpdate: false
        };
      })
    } as any;

    const initializer = new GoogleDriveVaultInitializer(
      mockConnections,
      () => mockCapability
    );

    return { initializer, mockConnections, mockCapability, files, folders };
  }

  it('scaffolds canonical clean text folders without emojis or icons', () => {
    // Assert all folders are clean text without emoji characters
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
    for (const folder of CANONICAL_VAULT_FOLDERS) {
      expect(emojiRegex.test(folder)).toBe(false);
    }

    expect(CANONICAL_VAULT_FOLDERS).toEqual([
      'Toko & Katalog',
      'Keuangan & Pembukuan',
      'Spreadsheet & Analisis',
      'Media & Kreatif',
      'System Core'
    ]);
  });

  it('initializes all 5 folders and 4 starter spreadsheets on first connection', async () => {
    const { initializer, mockCapability, files, folders } = createMockEnvironment([]);

    const result = await initializer.initializeVault(userId);

    // 1. Result summary
    expect(result.userId).toBe(userId);
    expect(result.alreadyInitialized).toBe(false);
    expect(result.foldersCreated).toHaveLength(5);
    expect(result.spreadsheetsCreated).toEqual([
      'Katalog_Produk_Toko.xlsx',
      'Rekap_Pesanan_Masuk.xlsx',
      'Buku_Kas_Harian.xlsx',
      'Laporan_Settlement_QRIS.xlsx'
    ]);

    // 2. Ensure each folder was requested
    expect(mockCapability.ensureFolder).toHaveBeenCalledTimes(5);
    for (const folder of CANONICAL_VAULT_FOLDERS) {
      expect(mockCapability.ensureFolder).toHaveBeenCalledWith(userId, folder);
    }

    // 3. Verify created spreadsheets in target folders
    expect(files).toHaveLength(4);
    const katalog = files.find(f => f.name === 'Katalog_Produk_Toko.xlsx');
    expect(katalog).toBeDefined();
    expect(katalog.options.folder).toBe('Toko & Katalog');
    expect(katalog.headers).toContain('ID Produk');
    expect(katalog.headers).toContain('Nama Produk / Menu');

    const pesanan = files.find(f => f.name === 'Rekap_Pesanan_Masuk.xlsx');
    expect(pesanan).toBeDefined();
    expect(pesanan.options.folder).toBe('Toko & Katalog');
    expect(pesanan.headers).toContain('ID Pesanan');

    const bukuKas = files.find(f => f.name === 'Buku_Kas_Harian.xlsx');
    expect(bukuKas).toBeDefined();
    expect(bukuKas.options.folder).toBe('Keuangan & Pembukuan');
    expect(bukuKas.headers).toContain('Pemasukan (IDR)');
    expect(bukuKas.headers).toContain('Pengeluaran (IDR)');

    const settlement = files.find(f => f.name === 'Laporan_Settlement_QRIS.xlsx');
    expect(settlement).toBeDefined();
    expect(settlement.options.folder).toBe('Keuangan & Pembukuan');
    expect(settlement.headers).toContain('MDR / Biaya (IDR)');

    // 4. Verify NO root guide files created
    const guideFile = files.find(f =>
      f.name.toLowerCase().includes('readme') ||
      f.name.toLowerCase().includes('panduan')
    );
    expect(guideFile).toBeUndefined();
  });

  it('guarantees strict idempotency: skips existing spreadsheets to protect user data', async () => {
    // User already has Katalog_Produk_Toko.xlsx with customized products
    const initialFiles = [
      {
        id: 'existing-katalog-id',
        name: 'Katalog_Produk_Toko.xlsx',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        rows: [['CUSTOM-01', 'Custom User Product', 'Custom', 99999]]
      },
      {
        id: 'existing-buku-kas-id',
        name: 'Buku_Kas_Harian.xlsx',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        rows: [['2026-09-20', 'Sales', 'Real Revenue', 500000]]
      }
    ];

    const { initializer, mockCapability } = createMockEnvironment(initialFiles);

    const result = await initializer.initializeVault(userId);

    // Only the 2 missing sheets should be created
    expect(result.spreadsheetsCreated).toEqual([
      'Rekap_Pesanan_Masuk.xlsx',
      'Laporan_Settlement_QRIS.xlsx'
    ]);
    expect(mockCapability.createSpreadsheet).toHaveBeenCalledTimes(2);

    // Run again when all exist
    const secondPass = await initializer.initializeVault(userId);
    expect(secondPass.alreadyInitialized).toBe(true);
    expect(secondPass.spreadsheetsCreated).toEqual([]);
    expect(mockCapability.createSpreadsheet).toHaveBeenCalledTimes(2); // No new calls
  });

  it('throws an error if Google Drive is not connected for the user', async () => {
    const mockConnections = {
      getStatus: vi.fn().mockResolvedValue({
        provider: 'GOOGLE_DRIVE',
        status: 'NOT_CONNECTED'
      })
    } as any;

    const initializer = new GoogleDriveVaultInitializer(mockConnections);

    await expect(initializer.initializeVault('unconnected-user')).rejects.toThrow(
      'Google Drive is not connected or Vault folder is missing for user unconnected-user'
    );
  });
});
