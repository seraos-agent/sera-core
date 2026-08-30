import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { SpreadsheetEngine } from '../src/capabilities/google-drive/SpreadsheetEngine';
import { GoogleDriveCapability } from '../src/capabilities/google-drive/GoogleDriveCapability';

describe('SpreadsheetEngine', () => {
  it('generates a valid .xlsx buffer with styled headers and data rows', async () => {
    const headers = ['Item', 'Category', 'Price (IDR)', 'Quantity'];
    const rows = [
      ['Server Hosting', 'Infrastructure', 2500000, 1],
      ['Domain Name', 'Infrastructure', 150000, 2],
      ['AI Inference', 'API Services', 4500000, 10]
    ];

    const buffer = await SpreadsheetEngine.generateWorkbook('Monthly Expenses', headers, rows);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);

    // Verify generated workbook with ExcelJS reader
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const ws = wb.getWorksheet('Monthly Expenses') || wb.getWorksheet(1);
    expect(ws).toBeDefined();

    // Verify Header row
    const headerRow = ws!.getRow(1);
    expect(headerRow.getCell(1).value).toBe('Item');
    expect(headerRow.getCell(3).value).toBe('Price (IDR)');
    expect(headerRow.getCell(1).font?.bold).toBe(true);

    // Verify Data row
    const row2 = ws!.getRow(2);
    expect(row2.getCell(1).value).toBe('Server Hosting');
    expect(row2.getCell(3).value).toBe(2500000);
    expect(row2.getCell(3).numFmt).toBe('Rp #,##0');

    // Verify Summary / Total row exists
    const totalRow = ws!.getRow(5);
    expect(totalRow.getCell(1).value).toBe('Total');
    expect((totalRow.getCell(3).value as any)?.formula).toBe('SUM(C2:C4)');
  });

  it('handles custom theme colors and disables summary row when requested', async () => {
    const headers = ['Task', 'Assignee', 'Status'];
    const rows = [
      ['Build MCP endpoint', 'Agent Alpha', 'Completed'],
      ['Deploy to Cloud Run', 'Agent Beta', 'In Progress']
    ];

    const buffer = await SpreadsheetEngine.generateWorkbook('Task Tracker', headers, rows, {
      themeColor: '4338CA', // Indigo
      includeSummaryRow: false
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.getWorksheet(1)!;

    // Header has custom color
    const cell = ws.getRow(1).getCell(1);
    expect(cell.fill).toBeDefined();

    // No summary row (only header + 2 data rows = 3 rows)
    expect(ws.rowCount).toBe(3);
  });

  it('supports formulas, percentages, dates, and currency detection', async () => {
    const headers = ['Asset', 'Entry Price', 'Current Price', 'PnL Rate', 'Calculated Value'];
    const rows = [
      ['ETH', '$1,800.00', '$2,100.00', '16.6%', '=B2*2'],
      ['USDC', '$1.00', '$1.00', '0.0%', '=B3*100']
    ];

    const buffer = await SpreadsheetEngine.generateWorkbook('Portfolio', headers, rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.getWorksheet(1)!;

    // Currency format
    expect(ws.getRow(2).getCell(2).numFmt).toBe('$#,##0.00');

    // Percentage format
    expect(ws.getRow(2).getCell(4).numFmt).toBe('0.0%');

    // Formula cell
    expect((ws.getRow(2).getCell(5).value as any)?.formula).toBe('B2*2');
  });

  it('generates multi-sheet workbooks', async () => {
    const sheets = [
      {
        name: 'Summary',
        headers: ['Metric', 'Value'],
        rows: [['Total Users', 1250], ['Revenue', 50000000]]
      },
      {
        name: 'Details',
        headers: ['User ID', 'Plan', 'Active Since'],
        rows: [['usr_1', 'Enterprise', '2026-01-15'], ['usr_2', 'Pro', '2026-02-01']]
      }
    ];

    const buffer = await SpreadsheetEngine.generateMultiSheetWorkbook(sheets);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    expect(wb.worksheets.length).toBe(2);
    expect(wb.getWorksheet('Summary')).toBeDefined();
    expect(wb.getWorksheet('Details')).toBeDefined();
  });
});

describe('GoogleDriveCapability Spreadsheet & Append', () => {
  const mockRepo = {
    getRefreshToken: vi.fn().mockResolvedValue('mock-refresh-token'),
    getStatus: vi.fn().mockResolvedValue({ status: 'CONNECTED', vaultFolderId: 'mock-vault-folder-123' })
  } as any;

  it('creates .xlsx spreadsheet file with writeBuffer and proper mimeType', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody: any = null;

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/token')) {
        return { ok: true, json: async () => ({ access_token: 'mock-access-token' }) };
      }
      if (url.includes('/files?uploadType=multipart')) {
        capturedUrl = url;
        capturedMethod = init?.method;
        capturedBody = init?.body;
        return { ok: true, json: async () => ({ id: 'mock-new-file-id' }) };
      }
      if (url.includes('/files?')) {
        return { ok: true, json: async () => ({ files: [] }) };
      }
      return { ok: true, text: async () => '' };
    }) as any;

    const cap = new GoogleDriveCapability(mockRepo, 'client-id', 'client-secret', mockFetch);
    const fileId = await cap.createSpreadsheet('user-1', 'Financial Report', ['Month', 'Cost'], [['Jan', 1000]]);

    expect(fileId).toBe('mock-new-file-id');
    expect(capturedUrl).toContain('uploadType=multipart');
    expect(capturedMethod).toBe('POST');
    expect(capturedBody).toBeInstanceOf(Buffer);
  });

  it('appends content to existing file in Google Drive Vault', async () => {
    let capturedUploadBody: any = null;

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/token')) {
        return { ok: true, json: async () => ({ access_token: 'mock-access-token' }) };
      }
      if (url.includes('alt=media')) {
        return { ok: true, text: async () => 'Initial line 1\nInitial line 2' };
      }
      if (url.includes('/upload/drive/v3/files/file-exist-id')) {
        capturedUploadBody = init?.body;
        return { ok: true, json: async () => ({ id: 'file-exist-id' }) };
      }
      if (url.includes('/files?')) {
        return { ok: true, json: async () => ({ files: [{ id: 'file-exist-id', name: 'journal.md', mimeType: 'text/markdown' }] }) };
      }
      return { ok: true, text: async () => '' };
    }) as any;

    const cap = new GoogleDriveCapability(mockRepo, 'client-id', 'client-secret', mockFetch);
    const fileId = await cap.appendToFile('user-1', 'journal.md', 'New appended note entry');

    expect(fileId).toBe('file-exist-id');
    expect(capturedUploadBody.toString()).toContain('Initial line 1\nInitial line 2\nNew appended note entry');
  });
});
