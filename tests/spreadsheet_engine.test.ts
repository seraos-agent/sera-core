import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { SpreadsheetEngine } from '../src/capabilities/google-drive/SpreadsheetEngine';
import { GoogleDriveCapability } from '../src/capabilities/google-drive/GoogleDriveCapability';

describe('SpreadsheetEngine', () => {
  it('generates a valid .xlsx buffer with styled headers, frozen pane, and data rows', async () => {
    const headers = ['Item', 'Category', 'Price (IDR)', 'Quantity', 'Status'];
    const rows = [
      ['Server Hosting', 'Infrastructure', 2500000, 1, 'Completed'],
      ['Domain Name', 'Infrastructure', 150000, 2, 'Pending'],
      ['AI Inference', 'API Services', 4500000, 10, 'Failed']
    ];

    const buffer = await SpreadsheetEngine.generateWorkbook('Monthly Expenses', headers, rows);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);

    // Verify generated workbook with ExcelJS reader
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const ws = wb.getWorksheet('Monthly Expenses') || wb.getWorksheet(1);
    expect(ws).toBeDefined();

    // Verify Frozen Header view
    expect(ws!.views[0].state).toBe('frozen');
    expect((ws!.views[0] as any).ySplit).toBe(1);

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

    // Verify Status Badges
    const completedCell = ws!.getRow(2).getCell(5);
    expect(completedCell.value).toBe('Completed');
    expect(completedCell.fill).toBeDefined();

    const pendingCell = ws!.getRow(3).getCell(5);
    expect(pendingCell.value).toBe('Pending');

    const failedCell = ws!.getRow(4).getCell(5);
    expect(failedCell.value).toBe('Failed');

    // Verify Summary / Total row exists
    const totalRow = ws!.getRow(5);
    expect(totalRow.getCell(1).value).toBe('Total');
    expect((totalRow.getCell(3).value as any)?.formula).toBe('SUM(C2:C4)');
  });

  it('supports multi-currency detection including Indian Rupee (INR), EUR, GBP, JPY, SGD, MYR', async () => {
    const headers = ['Consultant', 'Fee (INR)', 'Euro Project', 'UK Rate', 'Tokyo Retainer'];
    const rows = [
      ['Rajesh Sharma', 85000, '€1,200.00', '£450.00', '¥300,000'],
      ['Priya Patel', '₹120,000.00', '€3,400.00', '£900.00', '¥550,000']
    ];

    const buffer = await SpreadsheetEngine.generateWorkbook('Global Payroll', headers, rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.getWorksheet(1)!;

    // INR formatting
    expect(ws.getRow(2).getCell(2).numFmt).toBe('₹#,##0.00');
    expect(ws.getRow(3).getCell(2).numFmt).toBe('₹#,##0.00');

    // EUR formatting
    expect(ws.getRow(2).getCell(3).numFmt).toBe('€#,##0.00');

    // GBP formatting
    expect(ws.getRow(2).getCell(4).numFmt).toBe('£#,##0.00');

    // JPY formatting
    expect(ws.getRow(2).getCell(5).numFmt).toBe('¥#,##0');
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

describe('GoogleDriveCapability Operations', () => {
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

  it('deletes file from Google Drive Vault', async () => {
    let capturedDeleteUrl = '';
    let capturedDeleteMethod = '';

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/token')) {
        return { ok: true, json: async () => ({ access_token: 'mock-access-token' }) };
      }
      if (url.includes('/files?')) {
        return { ok: true, json: async () => ({ files: [{ id: 'delete-target-id', name: 'old_data.csv' }] }) };
      }
      if (url.includes('/files/delete-target-id')) {
        capturedDeleteUrl = url;
        capturedDeleteMethod = init?.method;
        return { ok: true, status: 204, text: async () => '' };
      }
      return { ok: true, text: async () => '' };
    }) as any;

    const cap = new GoogleDriveCapability(mockRepo, 'client-id', 'client-secret', mockFetch);
    const success = await cap.deleteFile('user-1', { filename: 'old_data.csv' });

    expect(success).toBe(true);
    expect(capturedDeleteUrl).toContain('/files/delete-target-id');
    expect(capturedDeleteMethod).toBe('DELETE');
  });

  it('parses cell addresses accurately for chart positioning', () => {
    expect(SpreadsheetEngine.parseCellAddress('A1')).toEqual({ rowIndex: 0, columnIndex: 0 });
    expect(SpreadsheetEngine.parseCellAddress('G2')).toEqual({ rowIndex: 1, columnIndex: 6 });
    expect(SpreadsheetEngine.parseCellAddress('AA10')).toEqual({ rowIndex: 9, columnIndex: 26 });
    expect(SpreadsheetEngine.parseCellAddress('invalid')).toEqual({ rowIndex: 1, columnIndex: 6 });
  });

  it('builds valid Google Sheets AddChartRequest for COLUMN, LINE, and PIE charts', () => {
    const headers = ['Day', 'Orders', 'Revenue (IDR)', 'Ad Spend (IDR)'];
    const rows = [
      ['Mon', 12, 1200000, 300000],
      ['Tue', 18, 1850000, 400000],
      ['Wed', 25, 2600000, 500000]
    ];

    // Column / Bar Chart
    const columnChartReq = SpreadsheetEngine.buildGoogleSheetsChartRequest(0, rows.length, headers, rows, {
      type: 'COLUMN',
      title: 'Shopee Daily Revenue',
      categoryColumn: 0,
      valueColumns: [2]
    });

    expect(columnChartReq.addChart).toBeDefined();
    expect(columnChartReq.addChart.chart.spec.title).toBe('Shopee Daily Revenue');
    expect(columnChartReq.addChart.chart.spec.basicChart.chartType).toBe('COLUMN');
    expect(columnChartReq.addChart.chart.spec.basicChart.domains[0].domain.sourceRange.sources[0].startColumnIndex).toBe(0);
    expect(columnChartReq.addChart.chart.spec.basicChart.series[0].series.sourceRange.sources[0].startColumnIndex).toBe(2);

    // Pie Chart
    const pieChartReq = SpreadsheetEngine.buildGoogleSheetsChartRequest(0, rows.length, headers, rows, {
      type: 'PIE',
      title: 'Order Status Distribution',
      categoryColumn: 0,
      valueColumns: [1]
    });

    expect(pieChartReq.addChart.chart.spec.pieChart).toBeDefined();
    expect(pieChartReq.addChart.chart.spec.pieChart.legendPosition).toBe('RIGHT_LEGEND');

    // Inferred value columns test
    const autoChartReq = SpreadsheetEngine.buildGoogleSheetsChartRequest(0, rows.length, headers, rows, {
      type: 'LINE',
      title: 'Auto Inferred Trend'
    });

    expect(autoChartReq.addChart.chart.spec.basicChart.chartType).toBe('LINE');
    expect(autoChartReq.addChart.chart.spec.basicChart.series.length).toBeGreaterThan(0);
  });

  it('creates Google Drive spreadsheet with native chart batchUpdate invocation', async () => {
    let capturedBatchUrl = '';
    let capturedBatchBody: any = null;

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/token')) {
        return { ok: true, json: async () => ({ access_token: 'mock-access-token' }) };
      }
      if (url.includes('/upload/drive/v3/files')) {
        return { ok: true, json: async () => ({ id: 'new-sheet-123' }) };
      }
      if (url.includes('/files?')) {
        return { ok: true, json: async () => ({ files: [] }) };
      }
      if (url.includes(':batchUpdate')) {
        capturedBatchUrl = url;
        capturedBatchBody = JSON.parse(init?.body || '{}');
        return { ok: true, json: async () => ({ spreadsheetId: 'new-sheet-123' }) };
      }
      return { ok: true, text: async () => '' };
    }) as any;

    const cap = new GoogleDriveCapability(mockRepo, 'client-id', 'client-secret', mockFetch);
    const fileId = await cap.createSpreadsheet(
      'user-1',
      'Shopee Store Performance',
      ['Date', 'Sales', 'Profit'],
      [['2026-08-01', 5000000, 1500000]],
      {
        chart: {
          type: 'COLUMN',
          title: 'Daily Store Sales',
          categoryColumn: 0,
          valueColumns: [1, 2]
        }
      }
    );

    expect(fileId).toBe('new-sheet-123');
    expect(capturedBatchUrl).toContain('https://sheets.googleapis.com/v4/spreadsheets/new-sheet-123:batchUpdate');
    expect(capturedBatchBody.requests).toBeDefined();
    expect(capturedBatchBody.requests[0].addChart.chart.spec.title).toBe('Daily Store Sales');
  });
});
