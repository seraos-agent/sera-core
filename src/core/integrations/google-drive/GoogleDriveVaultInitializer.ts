import { GoogleDriveCapability } from '../../../capabilities/google-drive/GoogleDriveCapability';
import { GoogleDriveConnectionRepository } from './GoogleDriveConnectionRepository';

export interface VaultInitializationResult {
  userId: string;
  foldersCreated: string[];
  spreadsheetsCreated: string[];
  alreadyInitialized: boolean;
}

export interface DefaultSpreadsheetTemplate {
  filename: string;
  folder: string;
  sheetName: string;
  headers: string[];
  rows: any[][];
  includeSummaryRow?: boolean;
}

export const CANONICAL_VAULT_FOLDERS = [
  'Toko & Katalog',
  'Keuangan & Pembukuan',
  'Spreadsheet & Analisis',
  'Media & Kreatif',
  'System Core'
] as const;

export const DEFAULT_SPREADSHEET_TEMPLATES: DefaultSpreadsheetTemplate[] = [
  {
    filename: 'Katalog_Produk_Toko.xlsx',
    folder: 'Toko & Katalog',
    sheetName: 'Katalog Produk',
    headers: ['ID Produk', 'Nama Produk / Menu', 'Kategori', 'Harga (IDR)', 'Status Stok', 'Keterangan'],
    rows: [
      ['PRD-001', 'Nasi Goreng Spesial', 'Makanan', 25000, 'Tersedia', 'Porsi komplit telur & ayam'],
      ['PRD-002', 'Es Teh Manis', 'Minuman', 5000, 'Tersedia', 'Gula tebu asli']
    ],
    includeSummaryRow: false
  },
  {
    filename: 'Rekap_Pesanan_Masuk.xlsx',
    folder: 'Toko & Katalog',
    sheetName: 'Pesanan Masuk',
    headers: ['ID Pesanan', 'Tanggal', 'Nama Pelanggan', 'WhatsApp', 'Daftar Item', 'Total (IDR)', 'Status Pesanan', 'Alamat Pengiriman'],
    rows: [
      ['ORD-1001', '2026-09-25', 'Budi Santoso', '081234567890', '2x Nasi Goreng Spesial, 2x Es Teh Manis', 60000, 'Selesai', 'Jl. Sudirman No. 12, Jakarta']
    ],
    includeSummaryRow: true
  },
  {
    filename: 'Buku_Kas_Harian.xlsx',
    folder: 'Keuangan & Pembukuan',
    sheetName: 'Buku Kas',
    headers: ['Tanggal', 'Kategori', 'Deskripsi Transaksi', 'Pemasukan (IDR)', 'Pengeluaran (IDR)', 'Saldo Akhir (IDR)', 'Metode'],
    rows: [
      ['2026-09-25', 'Modal Awal', 'Saldo Kas Awal Usaha', 1000000, 0, 1000000, 'Transfer Bank'],
      ['2026-09-25', 'Penjualan', 'Pendapatan Harian Toko', 60000, 0, 1060000, 'QRIS'],
      ['2026-09-25', 'Operasional', 'Belanja Bahan Baku', 0, 300000, 760000, 'Tunai']
    ],
    includeSummaryRow: true
  },
  {
    filename: 'Laporan_Settlement_QRIS.xlsx',
    folder: 'Keuangan & Pembukuan',
    sheetName: 'Settlement QRIS',
    headers: ['Tanggal Settlement', 'Referensi Merchant', 'Jumlah Transaksi', 'Kotor (IDR)', 'MDR / Biaya (IDR)', 'Bersih (IDR)', 'Status'],
    rows: [
      ['2026-09-25', 'SETTLE-20260925-01', 5, 250000, 1750, 248250, 'SUKSES']
    ],
    includeSummaryRow: true
  }
];

/**
 * Initializes the default SERA Vault folder structure and starter business spreadsheets
 * upon user's first connection with Google Drive.
 *
 * Guarantees:
 * 1. Clean text folder names without emojis/icons.
 * 2. Strict idempotency (skips creating files that already exist to preserve user data).
 * 3. No root guide file clutter.
 */
export class GoogleDriveVaultInitializer {
  constructor(
    private readonly connections: GoogleDriveConnectionRepository,
    private readonly capabilityFactory?: (connections: GoogleDriveConnectionRepository) => GoogleDriveCapability | null
  ) {}

  public async initializeVault(userId: string): Promise<VaultInitializationResult> {
    const status = await this.connections.getStatus(userId);
    if (status.status !== 'CONNECTED' || !status.vaultFolderId) {
      throw new Error(`Google Drive is not connected or Vault folder is missing for user ${userId}`);
    }

    const capability = this.capabilityFactory
      ? this.capabilityFactory(this.connections)
      : GoogleDriveCapability.fromEnvironment(this.connections);

    if (!capability) {
      throw new Error('GoogleDriveCapability failed to initialize (missing credentials).');
    }

    // 1. Ensure canonical subfolders exist
    const verifiedFolders: string[] = [];
    for (const folderName of CANONICAL_VAULT_FOLDERS) {
      await capability.ensureFolder(userId, folderName);
      verifiedFolders.push(folderName);
    }

    // 2. Fetch existing files in the vault to enforce idempotency
    const existingFiles = await capability.listFiles(userId);
    const existingFileBases = new Set(
      existingFiles.map((f: any) =>
        (f.name || '')
          .toLowerCase()
          .replace(/\.(xlsx|csv|md|txt|json)$/i, '')
          .trim()
      )
    );

    // 3. Create default spreadsheets if not already present
    const createdSpreadsheets: string[] = [];
    for (const template of DEFAULT_SPREADSHEET_TEMPLATES) {
      const templateBase = template.filename.toLowerCase().replace(/\.(xlsx|csv|md|txt|json)$/i, '').trim();

      if (existingFileBases.has(templateBase)) {
        continue;
      }

      try {
        await capability.createSpreadsheet(
          userId,
          template.filename,
          template.headers,
          template.rows,
          {
            folder: template.folder,
            sheetName: template.sheetName,
            includeSummaryRow: template.includeSummaryRow,
            themeColor: '0F172A'
          }
        );
        createdSpreadsheets.push(template.filename);
        existingFileBases.add(templateBase);
      } catch (err: any) {
        console.warn(`[GoogleDriveVaultInitializer] Warning creating starter sheet "${template.filename}":`, err.message);
      }
    }

    return {
      userId,
      foldersCreated: verifiedFolders,
      spreadsheetsCreated: createdSpreadsheets,
      alreadyInitialized: createdSpreadsheets.length === 0
    };
  }
}
