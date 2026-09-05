import { describe, it, expect, vi } from 'vitest';
import { GoogleDriveCapability } from '../src/capabilities/google-drive/GoogleDriveCapability';
import { GoogleSheetsService } from '../src/capabilities/google-drive/GoogleSheetsService';
import { GoogleSheetsFormatter } from '../src/capabilities/google-drive/spreadsheet/GoogleSheetsFormatter';
import { SpreadsheetEngine } from '../src/capabilities/google-drive/SpreadsheetEngine';
import { SheetDefinition } from '../src/capabilities/google-drive/spreadsheet/spreadsheet.types';

describe('Comprehensive Google Sheets Professional Capability Suite', () => {
  const mockRepo = {
    getStatus: vi.fn().mockResolvedValue({ status: 'CONNECTED', vaultFolderId: 'vault_folder_root_123' }),
    getRefreshToken: vi.fn().mockResolvedValue('mock_refresh_token')
  } as any;

  // In-memory simulated Google Cloud environment
  let simulatedDriveFiles: any[] = [];
  let simulatedSheetsData: Map<string, { title: string; sheets: any[]; values: Map<string, any[][]>; charts: any[] }> = new Map();
  let executedBatchRequests: any[] = [];
  let executedValueWrites: Array<{ range: string; valueInputOption: string; values: any[][] }> = [];

  const setupSimulatedGoogleApis = () => {
    simulatedDriveFiles = [];
    simulatedSheetsData = new Map();
    executedBatchRequests = [];
    executedValueWrites = [];

    return vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      const method = (init?.method || 'GET').toUpperCase();

      // 1. Google OAuth Token Refresh
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'active_simulation_token', expires_in: 3600 })
        };
      }

      // 2. Google Drive Folder Lookup & Creation
      if (urlStr.includes('googleapis.com/drive/v3/files') && urlStr.includes('mimeType = \'application/vnd.google-apps.folder\'')) {
        return {
          ok: true,
          json: async () => ({
            files: [{ id: 'folder_spreadsheets_id', name: 'Spreadsheets', mimeType: 'application/vnd.google-apps.folder' }]
          })
        };
      }

      // 3. Google Drive File Query (List Files in Vault)
      if (urlStr.includes('googleapis.com/drive/v3/files') && method === 'GET' && !urlStr.includes('/permissions') && !urlStr.includes('fields=webContentLink')) {
        return {
          ok: true,
          json: async () => ({
            files: simulatedDriveFiles.filter((f) => !f.trashed)
          })
        };
      }

      // 4. Google Sheets API v4 - Create Spreadsheet
      if (urlStr === 'https://sheets.googleapis.com/v4/spreadsheets' && method === 'POST') {
        const body = JSON.parse(init?.body as string);
        const spreadsheetId = `sheet_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const sheetObjects = (body.sheets || [{ properties: { title: 'Sheet1' } }]).map((s: any, idx: number) => ({
          properties: {
            sheetId: idx * 10,
            title: s.properties?.title || `Sheet${idx + 1}`,
            index: idx,
            gridProperties: { rowCount: 1000, columnCount: 26 }
          },
          charts: []
        }));

        simulatedSheetsData.set(spreadsheetId, {
          title: body.properties?.title || 'Untitled',
          sheets: sheetObjects,
          values: new Map(),
          charts: []
        });

        const newDriveFile = {
          id: spreadsheetId,
          name: body.properties?.title,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          parents: ['folder_spreadsheets_id'],
          trashed: false
        };
        simulatedDriveFiles.push(newDriveFile);

        return {
          ok: true,
          json: async () => ({
            spreadsheetId,
            spreadsheetUrl: newDriveFile.webViewLink,
            sheets: sheetObjects
          })
        };
      }

      // 5. Google Sheets API v4 - Metadata
      if (urlStr.includes('sheets.googleapis.com/v4/spreadsheets/') && method === 'GET') {
        const match = urlStr.match(/spreadsheets\/([a-zA-Z0-9_-]+)/);
        const id = match ? match[1] : '';
        const data = simulatedSheetsData.get(id);
        if (!data) {
          return { ok: false, status: 404, text: async () => 'Spreadsheet not found in simulation' };
        }
        return {
          ok: true,
          json: async () => ({
            properties: { title: data.title },
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}/edit`,
            sheets: data.sheets
          })
        };
      }

      // 6. Google Sheets API v4 - Values Write / Update
      if (urlStr.includes('/values/') && method === 'PUT') {
        const match = urlStr.match(/spreadsheets\/([a-zA-Z0-9_-]+)\/values\/([^?]+)/);
        const spreadsheetId = match ? match[1] : '';
        const range = match ? decodeURIComponent(match[2]) : '';
        const valueInputOption = new URL(urlStr).searchParams.get('valueInputOption') || 'RAW';
        const body = JSON.parse(init?.body as string);

        executedValueWrites.push({ range, valueInputOption, values: body.values });

        const data = simulatedSheetsData.get(spreadsheetId);
        if (data) {
          data.values.set(range, body.values);
        }

        return {
          ok: true,
          json: async () => ({ updatedCells: (body.values || []).length * (body.values[0] || []).length })
        };
      }

      // 7. Google Sheets API v4 - Values Append
      if (urlStr.includes('/values/') && urlStr.includes(':append') && method === 'POST') {
        const match = urlStr.match(/spreadsheets\/([a-zA-Z0-9_-]+)\/values\/([^?:]+)/);
        const spreadsheetId = match ? match[1] : '';
        const range = match ? decodeURIComponent(match[2]) : '';
        const valueInputOption = new URL(urlStr).searchParams.get('valueInputOption') || 'RAW';
        const body = JSON.parse(init?.body as string);

        executedValueWrites.push({ range, valueInputOption, values: body.values });

        return {
          ok: true,
          json: async () => ({
            updates: {
              updatedCells: (body.values || []).length * (body.values[0] || []).length,
              updatedRows: (body.values || []).length
            }
          })
        };
      }

      // 8. Google Sheets API v4 - Values Clear
      if (urlStr.includes('/values/') && urlStr.includes(':clear') && method === 'POST') {
        return { ok: true, json: async () => ({ clearedRange: 'A1:ZZ10000' }) };
      }

      // 9. Google Sheets API v4 - Batch Update (Styling, Charts, Rules)
      if (urlStr.includes(':batchUpdate') && method === 'POST') {
        const body = JSON.parse(init?.body as string);
        const requests = body.requests || [];
        executedBatchRequests.push(...requests);

        const match = urlStr.match(/spreadsheets\/([a-zA-Z0-9_-]+):batchUpdate/);
        const spreadsheetId = match ? match[1] : '';
        const data = simulatedSheetsData.get(spreadsheetId);

        const replies = requests.map((req: any) => {
          if (req.addSheet) {
            const newSheet = {
              properties: {
                sheetId: Math.floor(Math.random() * 10000),
                title: req.addSheet.properties?.title || 'NewSheet'
              },
              charts: []
            };
            if (data) data.sheets.push(newSheet);
            return { addSheet: newSheet };
          }
          if (req.addChart) {
            const chartObj = { chartId: 777, spec: req.addChart.chart?.spec };
            if (data && data.sheets[0]) {
              data.sheets[0].charts = [chartObj];
            }
            return { addChart: chartObj };
          }
          if (req.deleteEmbeddedObject) {
            if (data) {
              data.sheets.forEach((s) => (s.charts = []));
            }
            return {};
          }
          return {};
        });

        return {
          ok: true,
          json: async () => ({ replies })
        };
      }

      // 10. Google Drive API - Permissions & Metadata
      if (urlStr.includes('/permissions')) {
        return { ok: true, json: async () => ({ id: 'anyone_reader_perm' }) };
      }
      if (urlStr.includes('fields=webContentLink,webViewLink') || urlStr.includes('fields=webContentLink')) {
        return {
          ok: true,
          json: async () => ({
            webViewLink: 'https://docs.google.com/spreadsheets/d/mock_link/edit',
            webContentLink: 'https://docs.google.com/spreadsheets/d/mock_link/export'
          })
        };
      }
      if (urlStr.includes('drive/v3/files/') && method === 'PATCH') {
        return { ok: true, json: async () => ({ id: 'moved_file_id' }) };
      }

      return { ok: true, json: async () => ({}) };
    });
  };

  it('1. Generates Executive-Ready Single Sheet with Formulas, Currency, Badges, and Frozen Pane', async () => {
    const mockFetch = setupSimulatedGoogleApis();
    const capability = new GoogleDriveCapability(mockRepo, 'cid', 'csec', mockFetch);

    const headers = ['No', 'Project / Client', 'Fee (IDR)', 'Target Margin', 'Status'];
    const rows = [
      ['=ROW()-1', 'Fintech Core Migration', 150000000, 0.45, 'Completed'],
      ['=ROW()-1', 'Mobile App Redesign', 75000000, 0.35, 'In Progress'],
      ['=ROW()-1', 'Security Penetration Audit', 45000000, 0.5, 'Pending'],
      ['=ROW()-1', 'Legacy Maintenance Contract', 20000000, -0.1, 'Failed']
    ];

    const result = await capability.createSpreadsheet('user-exec', 'Executive Financial Overview 2026', headers, rows, {
      folder: 'Spreadsheets',
      sheetName: 'Financial Overview',
      themeColor: '065F46' // Executive Emerald
    });

    expect(result.fileId).toBeDefined();
    expect(result.webViewLink).toContain('https://docs.google.com/spreadsheets/d/');
    expect(result.isUpdate).toBe(false);

    // Verify Value Input Option is USER_ENTERED (Crucial for =ROW()-1 formula evaluation!)
    const writeOp = executedValueWrites.find((w) => w.range.includes('Financial Overview'));
    expect(writeOp).toBeDefined();
    expect(writeOp?.valueInputOption).toBe('USER_ENTERED');
    expect(writeOp?.values[1][0]).toBe('=ROW()-1');
    expect(writeOp?.values[1][2]).toBe(150000000);

    // Verify Executive Emerald Header (#065F46) & White Bold Text
    const headerReq = executedBatchRequests.find((r) => r.repeatCell?.range?.startRowIndex === 0 && r.repeatCell?.range?.endRowIndex === 1);
    expect(headerReq).toBeDefined();
    expect(headerReq.repeatCell.cell.userEnteredFormat.backgroundColor.red).toBeCloseTo(6 / 255);
    expect(headerReq.repeatCell.cell.userEnteredFormat.backgroundColor.green).toBeCloseTo(95 / 255);
    expect(headerReq.repeatCell.cell.userEnteredFormat.backgroundColor.blue).toBeCloseTo(70 / 255);
    expect(headerReq.repeatCell.cell.userEnteredFormat.textFormat.bold).toBe(true);

    // Verify Frozen Header Row
    const freezeReq = executedBatchRequests.find((r) => r.updateSheetProperties?.properties?.gridProperties?.frozenRowCount === 1);
    expect(freezeReq).toBeDefined();

    // Verify Dynamic Zebra Striping (=ISEVEN(ROW()))
    const zebraReq = executedBatchRequests.find((r) =>
      r.addConditionalFormatRule?.rule?.booleanRule?.condition?.values?.[0]?.userEnteredValue === '=ISEVEN(ROW())'
    );
    expect(zebraReq).toBeDefined();

    // Verify IDR Currency Formatting on Column 2
    const idrColReq = executedBatchRequests.find(
      (r) => r.repeatCell?.range?.startColumnIndex === 2 && r.repeatCell?.cell?.userEnteredFormat?.numberFormat?.pattern === '"Rp"#,##0'
    );
    expect(idrColReq).toBeDefined();

    // Verify Percentage Formatting on Column 3
    const pctColReq = executedBatchRequests.find(
      (r) => r.repeatCell?.range?.startColumnIndex === 3 && r.repeatCell?.cell?.userEnteredFormat?.numberFormat?.pattern === '0.0%'
    );
    expect(pctColReq).toBeDefined();

    // Verify Status Badge Rules (Success/Completed, In Progress, Failed)
    const statusRules = executedBatchRequests.filter((r) =>
      r.addConditionalFormatRule?.rule?.booleanRule?.condition?.values?.[0]?.userEnteredValue?.includes('REGEXMATCH')
    );
    expect(statusRules.length).toBe(4); // Green, Amber, Red, Blue
  });

  it('2. Granular Cell Update via updateCell (GDRIVE_UPDATE_CELL) without Rebuilding', async () => {
    const mockFetch = setupSimulatedGoogleApis();
    const capability = new GoogleDriveCapability(mockRepo, 'cid', 'csec', mockFetch);

    // Create initial sheet
    const initResult = await capability.createSpreadsheet(
      'user-exec',
      'Inventory Vault',
      ['SKU', 'Item', 'Qty', 'Unit Cost (IDR)'],
      [['SKU-100', 'M3 MacBook Pro 16"', 5, 42000000]]
    );

    executedValueWrites = [];

    // Perform targeted cell modification
    const updateResult = await capability.updateCell(
      'user-exec',
      'Inventory Vault',
      'C2',
      12, // Update Qty to 12
      'Sheet1'
    );

    expect(updateResult.cell).toBe('C2');
    expect(updateResult.value).toBe(12);
    expect(updateResult.fileId).toBe(initResult.fileId);

    // Verify update was sent directly with USER_ENTERED
    expect(executedValueWrites.length).toBe(1);
    expect(executedValueWrites[0].range).toBe("'Sheet1'!C2");
    expect(executedValueWrites[0].valueInputOption).toBe('USER_ENTERED');
    expect(executedValueWrites[0].values).toEqual([[12]]);
  });

  it('3. Multi-Tab Workbook with Sheet-Specific Schemas & Tab Isolation', async () => {
    const mockFetch = setupSimulatedGoogleApis();
    const capability = new GoogleDriveCapability(mockRepo, 'cid', 'csec', mockFetch);

    const sheets: SheetDefinition[] = [
      {
        name: 'Sales',
        headers: ['Date', 'Item', 'Revenue (IDR)'],
        rows: [
          ['2026-09-01', 'Enterprise SaaS License', 250000000],
          ['2026-09-02', 'API Add-on Pack', 15000000]
        ]
      },
      {
        name: 'Expenses',
        headers: ['Date', 'Category', 'Amount (IDR)'],
        rows: [
          ['2026-09-01', 'Cloud Infrastructure (GCP)', 45000000],
          ['2026-09-02', 'LLM Token Credits', 22000000]
        ]
      },
      {
        name: 'Summary',
        headers: ['Metric', 'Value (IDR)'],
        rows: [
          ['Total Revenue', 265000000],
          ['Total Expenses', 67000000],
          ['Net Profit', 198000000]
        ]
      }
    ];

    const result = await capability.createSpreadsheet('user-exec', 'Q3 Master Financial Report', undefined, undefined, undefined, sheets);

    expect(result.fileId).toBeDefined();
    expect(result.isUpdate).toBe(false);

    // Verify values were written to all 3 tabs separately
    const salesWrite = executedValueWrites.find((w) => w.range.includes("'Sales'"));
    const expensesWrite = executedValueWrites.find((w) => w.range.includes("'Expenses'"));
    const summaryWrite = executedValueWrites.find((w) => w.range.includes("'Summary'"));

    expect(salesWrite).toBeDefined();
    expect(expensesWrite).toBeDefined();
    expect(summaryWrite).toBeDefined();
    expect(salesWrite?.values[1][1]).toBe('Enterprise SaaS License');
    expect(expensesWrite?.values[1][1]).toBe('Cloud Infrastructure (GCP)');
  });

  it('4. Append Mode Appends Cleanly Without Overwriting Prior Data', async () => {
    const mockFetch = setupSimulatedGoogleApis();
    const capability = new GoogleDriveCapability(mockRepo, 'cid', 'csec', mockFetch);

    // Step 1: Create initial sheet
    const initialSheet = await capability.createSpreadsheet(
      'user-exec',
      'Transaction Log',
      ['Timestamp', 'Description', 'Amount (IDR)'],
      [['2026-09-01 10:00', 'Top-up Deposit', 50000000]]
    );

    executedValueWrites = [];

    // Step 2: Append 2 new transactions
    const appendResult = await capability.createSpreadsheet(
      'user-exec',
      'Transaction Log',
      undefined,
      [
        ['2026-09-02 14:30', 'Vendor Payment', -15000000],
        ['2026-09-03 09:15', 'Client Retainer', 30000000]
      ],
      { mode: 'append' }
    );

    expect(appendResult.isUpdate).toBe(true);
    expect(appendResult.fileId).toBe(initialSheet.fileId);

    // Verify append was executed via spreadsheets.values.append
    expect(executedValueWrites.length).toBe(1);
    expect(executedValueWrites[0].valueInputOption).toBe('USER_ENTERED');
    expect(executedValueWrites[0].values.length).toBe(2);
    expect(executedValueWrites[0].values[0][1]).toBe('Vendor Payment');
    expect(executedValueWrites[0].values[1][1]).toBe('Client Retainer');
  });

  it('5. In-Place Update with Embedded Chart Cleans Duplicate Charts', async () => {
    const mockFetch = setupSimulatedGoogleApis();
    const capability = new GoogleDriveCapability(mockRepo, 'cid', 'csec', mockFetch);

    // Initial creation with COLUMN chart
    await capability.createSpreadsheet(
      'user-exec',
      'Monthly Revenue Analytics',
      ['Month', 'Revenue (IDR)', 'Expenses (IDR)'],
      [
        ['Jul', 120000000, 45000000],
        ['Aug', 150000000, 50000000]
      ],
      {
        chart: {
          type: 'COLUMN',
          title: 'Monthly Comparison',
          categoryColumn: 0,
          valueColumns: [1, 2]
        }
      }
    );

    // Clear tracking
    executedBatchRequests = [];

    // Update in-place with new data and refreshed chart
    const updateResult = await capability.createSpreadsheet(
      'user-exec',
      'Monthly Revenue Analytics',
      ['Month', 'Revenue (IDR)', 'Expenses (IDR)'],
      [
        ['Jul', 120000000, 45000000],
        ['Aug', 150000000, 50000000],
        ['Sep', 190000000, 55000000] // Added September
      ],
      {
        chart: {
          type: 'COLUMN',
          title: 'Monthly Comparison (Updated Q3)',
          categoryColumn: 0,
          valueColumns: [1, 2]
        }
      }
    );

    expect(updateResult.isUpdate).toBe(true);

    // Verify deleteEmbeddedObject was issued to purge old charts before rendering new chart
    const deleteChartReq = executedBatchRequests.find((r) => r.deleteEmbeddedObject !== undefined);
    expect(deleteChartReq).toBeDefined();

    // Verify new updated chart request was appended cleanly
    const addChartReq = executedBatchRequests.find((r) => r.addChart?.chart?.spec?.title === 'Monthly Comparison (Updated Q3)');
    expect(addChartReq).toBeDefined();
    expect(addChartReq.addChart.chart.spec.basicChart.chartType).toBe('COLUMN');
  });
});
