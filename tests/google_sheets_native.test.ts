import { describe, it, expect, vi } from 'vitest';
import { GoogleSheetsService } from '../src/capabilities/google-drive/GoogleSheetsService';
import { GoogleSheetsFormatter } from '../src/capabilities/google-drive/spreadsheet/GoogleSheetsFormatter';
import { GoogleDriveCapability } from '../src/capabilities/google-drive/GoogleDriveCapability';

describe('GoogleSheetsFormatter', () => {
  it('converts hex strings to Google Sheets 0.0-1.0 RGB colors accurately', () => {
    const white = GoogleSheetsFormatter.hexToRgb('#FFFFFF');
    expect(white.red).toBeCloseTo(1.0);
    expect(white.green).toBeCloseTo(1.0);
    expect(white.blue).toBeCloseTo(1.0);

    const emerald = GoogleSheetsFormatter.hexToRgb('065F46');
    expect(emerald.red).toBeCloseTo(6 / 255);
    expect(emerald.green).toBeCloseTo(95 / 255);
    expect(emerald.blue).toBeCloseTo(70 / 255);

    const shortHex = GoogleSheetsFormatter.hexToRgb('#FFF');
    expect(shortHex.red).toBeCloseTo(1.0);
  });

  it('resolves proper number and currency formats for IDR, USD, %, and numbers', () => {
    const idrFmt = GoogleSheetsFormatter.resolveNumberFormat({ type: 'currency', currency: 'IDR' });
    expect(idrFmt).toEqual({ type: 'CURRENCY', pattern: '"Rp"#,##0' });

    const usdFmt = GoogleSheetsFormatter.resolveNumberFormat({ type: 'currency', currency: 'USD' });
    expect(usdFmt).toEqual({ type: 'CURRENCY', pattern: '$#,##0.00' });

    const pctFmt = GoogleSheetsFormatter.resolveNumberFormat({ type: 'percentage' });
    expect(pctFmt).toEqual({ type: 'PERCENT', pattern: '0.0%' });

    const numFmt = GoogleSheetsFormatter.resolveNumberFormat({ type: 'number' });
    expect(numFmt).toEqual({ type: 'NUMBER', pattern: '#,##0.00' });
  });

  it('builds comprehensive Google Sheets API formatting requests', () => {
    const headers = ['SKU', 'Product Name', 'Price (IDR)', 'Growth', 'Status'];
    const rows = [
      ['SKU-1', 'Item Alpha', 150000, 0.15, 'Completed'],
      ['SKU-2', 'Item Beta', 250000, -0.05, 'Pending'],
      ['SKU-3', 'Item Gamma', 80000, 0.02, 'Failed']
    ];

    const requests = GoogleSheetsFormatter.buildFormattingRequests(0, headers, rows);
    expect(requests.length).toBeGreaterThan(5);

    // 1. Frozen Header
    const freezeReq = requests.find((r) => r.updateSheetProperties?.properties?.gridProperties?.frozenRowCount === 1);
    expect(freezeReq).toBeDefined();

    // 2. Header Row Formatting (Emerald bold white)
    const headerFormat = requests.find((r) => r.repeatCell?.range?.startRowIndex === 0 && r.repeatCell?.range?.endRowIndex === 1);
    expect(headerFormat).toBeDefined();
    expect(headerFormat.repeatCell.cell.userEnteredFormat.textFormat.bold).toBe(true);

    // 3. Borders
    const bordersReq = requests.find((r) => r.updateBorders !== undefined);
    expect(bordersReq).toBeDefined();

    // 4. Zebra Striping Rule
    const zebraReq = requests.find((r) =>
      r.addConditionalFormatRule?.rule?.booleanRule?.condition?.values?.[0]?.userEnteredValue === '=ISEVEN(ROW())'
    );
    expect(zebraReq).toBeDefined();

    // 5. Status Badges Rules
    const statusBadgeReqs = requests.filter((r) =>
      r.addConditionalFormatRule?.rule?.booleanRule?.condition?.values?.[0]?.userEnteredValue?.includes('REGEXMATCH')
    );
    expect(statusBadgeReqs.length).toBeGreaterThanOrEqual(3);

    // 6. Auto-resize columns
    const autoResizeReq = requests.find((r) => r.autoResizeDimensions !== undefined);
    expect(autoResizeReq).toBeDefined();
    expect(autoResizeReq.autoResizeDimensions.dimensions.endIndex).toBe(5);
  });
});

describe('GoogleSheetsService', () => {
  it('creates native spreadsheet and writes values with USER_ENTERED', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr === 'https://sheets.googleapis.com/v4/spreadsheets' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        expect(body.properties.title).toBe('Sales Q3 2026');
        return {
          ok: true,
          json: async () => ({
            spreadsheetId: 'sheet_xyz_123',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_xyz_123/edit',
            sheets: [
              { properties: { sheetId: 0, title: 'Overview' } },
              { properties: { sheetId: 101, title: 'Expenses' } }
            ]
          })
        } as Response;
      }

      if (urlStr.includes('/values/') && init?.method === 'PUT') {
        expect(urlStr).toContain('valueInputOption=USER_ENTERED');
        const body = JSON.parse(init.body as string);
        expect(body.values[0]).toEqual(['Rank', 'Name', 'Score']);
        return {
          ok: true,
          json: async () => ({ updatedCells: 9 })
        } as Response;
      }

      return { ok: true, json: async () => ({}) } as Response;
    });

    const service = new GoogleSheetsService(fetchMock as any);
    const created = await service.createSpreadsheet('test_token', 'Sales Q3 2026', {
      sheetTitle: 'Overview',
      additionalSheets: ['Expenses']
    });

    expect(created.spreadsheetId).toBe('sheet_xyz_123');
    expect(created.sheets.length).toBe(2);
    expect(created.sheets[0].title).toBe('Overview');
    expect(created.sheets[1].sheetId).toBe(101);

    const writeRes = await service.writeValues('test_token', 'sheet_xyz_123', "'Overview'!A1", [
      ['Rank', 'Name', 'Score'],
      ['=ROW()-1', 'Alice', 95],
      ['=ROW()-1', 'Bob', 88]
    ]);

    expect(writeRes.updatedCells).toBe(9);
  });

  it('updates single cell directly with updateSingleCell', async () => {
    let capturedRange = '';
    let capturedValues: any[][] = [];

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('/values/')) {
        const body = JSON.parse(init?.body as string);
        capturedRange = body.range;
        capturedValues = body.values;
        return { ok: true, json: async () => ({ updatedCells: 1 }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const service = new GoogleSheetsService(fetchMock as any);
    await service.updateSingleCell('test_token', 'sheet_xyz', 'B5', 250000, 'Laporan');

    expect(capturedRange).toBe("'Laporan'!B5");
    expect(capturedValues).toEqual([[250000]]);
  });
});

describe('GoogleDriveCapability Native Sheets Integration', () => {
  it('creates native spreadsheet via GoogleSheetsService without ExcelJS binary conversion', async () => {
    const mockConnections = {
      getStatus: vi.fn().mockResolvedValue({ status: 'CONNECTED', vaultFolderId: 'vault_folder_id' }),
      getRefreshToken: vi.fn().mockResolvedValue('mock_refresh_token'),
      getCachedVaultFolderId: vi.fn().mockResolvedValue('vault_folder_id')
    } as any;

    const capturedCalls: string[] = [];

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      capturedCalls.push(`${init?.method || 'GET'} ${urlStr}`);

      // Token refresh
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'active_access_token' })
        } as Response;
      }

      // List files
      if (urlStr.includes('googleapis.com/drive/v3/files') && init?.method === undefined) {
        return {
          ok: true,
          json: async () => ({ files: [] })
        } as Response;
      }

      // Sheets create
      if (urlStr === 'https://sheets.googleapis.com/v4/spreadsheets' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            spreadsheetId: 'native_sheet_999',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/native_sheet_999/edit',
            sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }]
          })
        } as Response;
      }

      // Values write
      if (urlStr.includes('/values/') && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({ updatedCells: 6 })
        } as Response;
      }

      // Batch update (styling)
      if (urlStr.includes(':batchUpdate') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ replies: [] })
        } as Response;
      }

      // Permissions / getPublicMediaUrl
      if (urlStr.includes('/permissions')) {
        return {
          ok: true,
          json: async () => ({ id: 'perm_123' })
        } as Response;
      }

      // Folder / file metadata
      if (urlStr.includes('googleapis.com/drive/v3/files/')) {
        return {
          ok: true,
          json: async () => ({
            id: 'native_sheet_999',
            name: 'Laporan Finansial',
            webViewLink: 'https://docs.google.com/spreadsheets/d/native_sheet_999/edit'
          })
        } as Response;
      }

      return { ok: true, json: async () => ({}) } as Response;
    });

    const capability = new GoogleDriveCapability(
      mockConnections,
      'client_id_test',
      'client_secret_test',
      fetchMock as any
    );

    const result = await capability.createSpreadsheet(
      'user_123',
      'Laporan Finansial',
      ['Rank', 'Item', 'Amount (IDR)'],
      [
        ['=ROW()-1', 'Hosting', 2500000],
        ['=ROW()-1', 'Domain', 150000]
      ]
    );

    expect(result.fileId).toBe('native_sheet_999');
    expect(result.webViewLink).toContain('native_sheet_999');
    expect(result.isUpdate).toBe(false);

    // Verify native Sheets API endpoints were invoked
    const hasSheetsCreate = capturedCalls.some((c) => c.startsWith('POST https://sheets.googleapis.com/v4/spreadsheets'));
    expect(hasSheetsCreate).toBe(true);

    const hasValuesWrite = capturedCalls.some((c) => c.includes('/values/') && c.includes('valueInputOption=USER_ENTERED'));
    expect(hasValuesWrite).toBe(true);

    const hasBatchUpdate = capturedCalls.some((c) => c.includes(':batchUpdate'));
    expect(hasBatchUpdate).toBe(true);
  });

  it('supports updateCell directly modifying single cell in vault sheet', async () => {
    const mockConnections = {
      getStatus: vi.fn().mockResolvedValue({ status: 'CONNECTED', vaultFolderId: 'vault_folder_id' }),
      getRefreshToken: vi.fn().mockResolvedValue('mock_refresh_token')
    } as any;

    let updatedUrl = '';
    let updatedPayload: any = null;

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return { ok: true, json: async () => ({ access_token: 'active_token' }) } as Response;
      }

      // listFiles query
      if (urlStr.includes('googleapis.com/drive/v3/files') && (!init || init.method === 'GET' || !init.method)) {
        return {
          ok: true,
          json: async () => ({
            files: [
              {
                id: 'sheet_abc_456',
                name: 'Laporan Penjualan',
                mimeType: 'application/vnd.google-apps.spreadsheet',
                webViewLink: 'https://docs.google.com/spreadsheets/d/sheet_abc_456/edit'
              }
            ]
          })
        } as Response;
      }

      if (urlStr.includes('/values/') && init?.method === 'PUT') {
        updatedUrl = urlStr;
        updatedPayload = JSON.parse(init.body as string);
        return { ok: true, json: async () => ({ updatedCells: 1 }) } as Response;
      }

      return { ok: true, json: async () => ({}) } as Response;
    });

    const capability = new GoogleDriveCapability(
      mockConnections,
      'client_id_test',
      'client_secret_test',
      fetchMock as any
    );

    const res = await capability.updateCell('user_123', 'Laporan Penjualan', 'B5', 500000, 'Ringkasan');

    expect(res.fileId).toBe('sheet_abc_456');
    expect(res.cell).toBe('B5');
    expect(res.value).toBe(500000);
    expect(updatedUrl).toContain('valueInputOption=USER_ENTERED');
    expect(updatedPayload.range).toBe("'Ringkasan'!B5");
    expect(updatedPayload.values).toEqual([[500000]]);
  });
});
