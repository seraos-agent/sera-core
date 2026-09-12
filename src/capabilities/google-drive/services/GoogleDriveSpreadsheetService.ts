import { SpreadsheetEngine, SpreadsheetOptions, SheetDefinition, ChartDefinition } from '../SpreadsheetEngine';
import { GoogleSheetsService } from '../GoogleSheetsService';
import { GoogleSheetsFormatter } from '../spreadsheet/GoogleSheetsFormatter';

export interface SpreadsheetServiceDependencies {
  fetchImpl: typeof fetch;
  getAccessToken: (userId: string) => Promise<string>;
  sheetsService: GoogleSheetsService;
  ensureFolderPath: (userId: string, folderPath: string) => Promise<string>;
  listFiles: (userId: string, query?: { name?: string; mimeType?: string; searchTerm?: string; folderId?: string; exact?: boolean }) => Promise<any[]>;
  deleteFile: (userId: string, target: { filename?: string; fileId?: string }) => Promise<boolean>;
  getPublicMediaUrl: (userId: string, fileId: string) => Promise<string>;
}

/**
 * Handles Google Sheets creation, in-place multi-tab updates, financial number formatting,
 * cell modifications, and native Google Sheets chart generation.
 */
export class GoogleDriveSpreadsheetService {
  constructor(private readonly deps: SpreadsheetServiceDependencies) {}

  public async addNativeChart(
    userId: string,
    spreadsheetId: string,
    chartDef: ChartDefinition,
    numRows: number,
    headers: string[],
    rows: any[][],
    options?: SpreadsheetOptions
  ): Promise<void> {
    const token = await this.deps.getAccessToken(userId);

    let sheetId = 0;
    try {
      const metadata = await this.deps.sheetsService.getSpreadsheetMetadata(token, spreadsheetId);
      const allSheets = metadata.sheets || [];
      const targetSheet = options?.targetSheet
        ? allSheets.find((s: any) => s.title?.toLowerCase() === options.targetSheet?.toLowerCase())
        : allSheets[0];

      sheetId = targetSheet?.sheetId ?? 0;
      await this.deps.sheetsService.clearAndDeleteCharts(token, spreadsheetId, sheetId);
    } catch (e: any) {
      console.warn('[GoogleDriveSpreadsheetService] Warning fetching sheetId, defaulting to 0:', e.message);
    }

    const chartRequest = SpreadsheetEngine.buildGoogleSheetsChartRequest(
      sheetId,
      numRows,
      headers,
      rows,
      chartDef
    );

    if (chartRequest) {
      await this.deps.sheetsService.batchUpdate(token, spreadsheetId, [chartRequest]);
    }
  }

  public async createSpreadsheet(
    userId: string,
    title: string,
    headers?: string[],
    rows?: any[][],
    options?: SpreadsheetOptions,
    sheets?: SheetDefinition[]
  ): Promise<{ fileId: string; webViewLink: string; isUpdate: boolean }> {
    const token = await this.deps.getAccessToken(userId);
    const cleanTitle = title.replace(/\.xlsx$/i, '').trim();

    const targetFolderName = options?.folder || 'Spreadsheets';
    const targetFolderId = await this.deps.ensureFolderPath(userId, targetFolderName);

    const normalizedInput = GoogleSheetsFormatter.normalizeSpreadsheetInput(headers, rows);
    let effectiveHeaders = normalizedInput.headers;
    let effectiveRows = normalizedInput.rows;

    let normalizedSheets = sheets;
    if (Array.isArray(sheets) && sheets.length > 0) {
      normalizedSheets = sheets.map(s => {
        const sNorm = GoogleSheetsFormatter.normalizeSpreadsheetInput(s.headers, s.rows);
        return {
          ...s,
          headers: sNorm.headers,
          rows: sNorm.rows
        };
      });
      if (effectiveHeaders.length === 0 && normalizedSheets[0]?.headers) {
        effectiveHeaders = normalizedSheets[0].headers;
      }
      if (effectiveRows.length === 0 && normalizedSheets[0]?.rows) {
        effectiveRows = normalizedSheets[0].rows;
      }
    }

    const hasAnyRows = effectiveRows.length > 0 || (normalizedSheets && normalizedSheets.some(s => s.rows && s.rows.length > 0));
    if (!hasAnyRows && !options?.allowEmpty) {
      throw new Error(`Cannot create spreadsheet "${cleanTitle}" with 0 data rows. All provided rows were empty or invalid. Please provide valid data rows in the "rows" parameter.`);
    }

    const hasExplicitCharts = (options?.charts && options.charts.length > 0) ||
      (normalizedSheets && normalizedSheets.some(s => s.options?.charts && s.options.charts.length > 0));

    let effectiveChart =
      options?.chart ||
      (normalizedSheets && normalizedSheets[0]?.options?.chart) ||
      (!hasExplicitCharts ? SpreadsheetEngine.inferAutomaticChart(effectiveHeaders, effectiveRows) : undefined);

    if (effectiveChart) {
      const validation = SpreadsheetEngine.validateChartDefinition(
        effectiveHeaders,
        effectiveRows,
        effectiveChart
      );
      if (!validation.valid) {
        console.warn(
          `[GoogleDriveSpreadsheetService] Chart validation: ${validation.reason}. Falling back to automatic chart.`
        );
        effectiveChart = SpreadsheetEngine.inferAutomaticChart(
          effectiveHeaders,
          effectiveRows
        );
      }
    }

    if (options?.charts && options.charts.length > 0) {
      for (const ch of options.charts) {
        const val = SpreadsheetEngine.validateChartDefinition(effectiveHeaders, effectiveRows, ch);
        if (!val.valid) {
          console.warn(`[GoogleDriveSpreadsheetService] Chart validation warning: ${val.reason}`);
        }
      }
    }

    const existing = await this.deps.listFiles(userId, { name: cleanTitle, exact: true });
    const targetClean = cleanTitle.toLowerCase();
    const exactMatch = existing.find((f: any) => {
      const fn = (f.name || '').toLowerCase().trim();
      const fBase = fn.replace(/\.(xlsx|csv|md|txt|json)$/i, '').trim();
      return fn === targetClean || fBase === targetClean;
    });
    const isUpdate = !!exactMatch;
    const existingFile = exactMatch;
    const isNativeSheet = existingFile?.mimeType === 'application/vnd.google-apps.spreadsheet';

    let fileId: string;

    // --- CASE A: Append Mode to existing native Google Sheet ---
    if (options?.mode === 'append' && isUpdate && existingFile && isNativeSheet) {
      fileId = existingFile.id;
      const targetSheetName = options?.targetSheet || (normalizedSheets && normalizedSheets[0]?.name) || options?.sheetName || 'Sheet1';
      const normalizedRows = GoogleSheetsFormatter.normalizeRowsForNativeSheetsApi(effectiveHeaders, effectiveRows);
      await this.deps.sheetsService.appendValues(
        token,
        fileId,
        `'${targetSheetName}'!A1`,
        normalizedRows,
        'USER_ENTERED'
      );
      const webViewLink = existingFile.webViewLink || (await this.deps.getPublicMediaUrl(userId, fileId));
      return { fileId, webViewLink, isUpdate: true };
    }

    // --- CASE B: Update in-place on existing native Google Sheet ---
    if (isUpdate && existingFile && isNativeSheet) {
      fileId = existingFile.id;
      await this.deps.sheetsService.ensureLocaleSettings(token, fileId);
      await this.deps.sheetsService.clearAndDeleteCharts(token, fileId);

      if (normalizedSheets && normalizedSheets.length > 0) {
        for (let idx = 0; idx < normalizedSheets.length; idx++) {
          const sheetDef = normalizedSheets[idx];
          const sheetId = await this.deps.sheetsService.ensureSheetExists(token, fileId, sheetDef.name);
          await this.deps.sheetsService.clearValues(token, fileId, `'${sheetDef.name}'!A1:ZZ10000`);

          const curOptions = sheetDef.options || options;
          const normalizedRows = GoogleSheetsFormatter.normalizeRowsForNativeSheetsApi(sheetDef.headers, sheetDef.rows);
          const autoSummaryRow = GoogleSheetsFormatter.generateNativeSummaryRow(sheetDef.headers, normalizedRows, curOptions);
          const allRows = autoSummaryRow ? [sheetDef.headers, ...normalizedRows, autoSummaryRow] : [sheetDef.headers, ...normalizedRows];
          const rowsWithSummary = autoSummaryRow ? [...normalizedRows, autoSummaryRow] : normalizedRows;

          await this.deps.sheetsService.writeValues(token, fileId, `'${sheetDef.name}'!A1`, allRows, 'USER_ENTERED');

          const formatReqs = GoogleSheetsFormatter.buildFormattingRequests(
            sheetId,
            sheetDef.headers,
            rowsWithSummary,
            curOptions
          );

          const tabCharts: ChartDefinition[] = (curOptions?.charts && curOptions.charts.length > 0)
            ? curOptions.charts
            : (curOptions?.chart ? [curOptions.chart] : (idx === 0 && effectiveChart ? [effectiveChart] : []));

          if (tabCharts.length > 0) {
            const chartReqs = SpreadsheetEngine.buildMultiGoogleSheetsChartRequests(
              sheetId,
              rowsWithSummary.length,
              sheetDef.headers,
              rowsWithSummary,
              tabCharts
            );
            if (chartReqs && chartReqs.length > 0) formatReqs.push(...chartReqs);
          }
          await this.deps.sheetsService.batchUpdate(token, fileId, formatReqs);
        }
      } else {
        const sheetName = options?.sheetName || 'Sheet1';
        const sheetId = await this.deps.sheetsService.ensureSheetExists(token, fileId, sheetName);
        await this.deps.sheetsService.clearValues(token, fileId, `'${sheetName}'!A1:ZZ10000`);

        const normalizedRows = GoogleSheetsFormatter.normalizeRowsForNativeSheetsApi(effectiveHeaders, effectiveRows);
        const autoSummaryRow = GoogleSheetsFormatter.generateNativeSummaryRow(effectiveHeaders, normalizedRows, options);
        const allRows = autoSummaryRow ? [effectiveHeaders, ...normalizedRows, autoSummaryRow] : [effectiveHeaders, ...normalizedRows];
        const rowsWithSummary = autoSummaryRow ? [...normalizedRows, autoSummaryRow] : normalizedRows;

        await this.deps.sheetsService.writeValues(token, fileId, `'${sheetName}'!A1`, allRows, 'USER_ENTERED');

        const formatReqs = GoogleSheetsFormatter.buildFormattingRequests(
          sheetId,
          effectiveHeaders,
          rowsWithSummary,
          options
        );

        const targetCharts: ChartDefinition[] = (options?.charts && options.charts.length > 0)
          ? options.charts
          : (effectiveChart ? [effectiveChart] : []);

        if (targetCharts.length > 0) {
          const chartReqs = SpreadsheetEngine.buildMultiGoogleSheetsChartRequests(
            sheetId,
            rowsWithSummary.length,
            effectiveHeaders,
            rowsWithSummary,
            targetCharts
          );
          if (chartReqs && chartReqs.length > 0) formatReqs.push(...chartReqs);
        }
        await this.deps.sheetsService.batchUpdate(token, fileId, formatReqs);
      }

      const webViewLink = existingFile.webViewLink || (await this.deps.getPublicMediaUrl(userId, fileId));
      return { fileId, webViewLink, isUpdate: true };
    }

    // --- CASE C: Brand New Native Google Sheet (or replacing legacy .xlsx) ---
    if (isUpdate && existingFile && !isNativeSheet) {
      try {
        await this.deps.deleteFile(userId, { fileId: existingFile.id });
      } catch (err: any) {
        console.warn(`[GoogleDriveSpreadsheetService] Non-fatal: could not remove legacy .xlsx file:`, err.message);
      }
    }

    if (normalizedSheets && normalizedSheets.length > 0) {
      const firstTab = normalizedSheets[0].name || 'Sheet1';
      const additionalTabs = normalizedSheets.slice(1).map(s => s.name);
      const created = await this.deps.sheetsService.createSpreadsheet(token, cleanTitle, {
        folderId: targetFolderId,
        sheetTitle: firstTab,
        additionalSheets: additionalTabs
      });
      fileId = created.spreadsheetId;

      for (let idx = 0; idx < normalizedSheets.length; idx++) {
        const sheetDef = normalizedSheets[idx];
        const found = created.sheets.find(s => s.title.toLowerCase() === sheetDef.name.toLowerCase());
        const sheetId = found ? found.sheetId : await this.deps.sheetsService.ensureSheetExists(token, fileId, sheetDef.name);

        const curOptions = sheetDef.options || options;
        const normalizedRows = GoogleSheetsFormatter.normalizeRowsForNativeSheetsApi(sheetDef.headers, sheetDef.rows);
        const autoSummaryRow = GoogleSheetsFormatter.generateNativeSummaryRow(sheetDef.headers, normalizedRows, curOptions);
        const allRows = autoSummaryRow ? [sheetDef.headers, ...normalizedRows, autoSummaryRow] : [sheetDef.headers, ...normalizedRows];
        const rowsWithSummary = autoSummaryRow ? [...normalizedRows, autoSummaryRow] : normalizedRows;

        await this.deps.sheetsService.writeValues(token, fileId, `'${sheetDef.name}'!A1`, allRows, 'USER_ENTERED');

        const formatReqs = GoogleSheetsFormatter.buildFormattingRequests(
          sheetId,
          sheetDef.headers,
          rowsWithSummary,
          curOptions
        );

        const tabCharts: ChartDefinition[] = (curOptions?.charts && curOptions.charts.length > 0)
          ? curOptions.charts
          : (curOptions?.chart ? [curOptions.chart] : (idx === 0 && effectiveChart ? [effectiveChart] : []));

        if (tabCharts.length > 0) {
          const chartReqs = SpreadsheetEngine.buildMultiGoogleSheetsChartRequests(
            sheetId,
            rowsWithSummary.length,
            sheetDef.headers,
            rowsWithSummary,
            tabCharts
          );
          if (chartReqs && chartReqs.length > 0) formatReqs.push(...chartReqs);
        }
        await this.deps.sheetsService.batchUpdate(token, fileId, formatReqs);
      }
    } else {
      const sheetName = options?.sheetName || 'Sheet1';
      const created = await this.deps.sheetsService.createSpreadsheet(token, cleanTitle, {
        folderId: targetFolderId,
        sheetTitle: sheetName
      });
      fileId = created.spreadsheetId;
      const sheetId = created.sheets[0]?.sheetId ?? 0;

      const normalizedRows = GoogleSheetsFormatter.normalizeRowsForNativeSheetsApi(effectiveHeaders, effectiveRows);
      const autoSummaryRow = GoogleSheetsFormatter.generateNativeSummaryRow(effectiveHeaders, normalizedRows, options);
      const allRows = autoSummaryRow ? [effectiveHeaders, ...normalizedRows, autoSummaryRow] : [effectiveHeaders, ...normalizedRows];
      const rowsWithSummary = autoSummaryRow ? [...normalizedRows, autoSummaryRow] : normalizedRows;

      await this.deps.sheetsService.writeValues(token, fileId, `'${sheetName}'!A1`, allRows, 'USER_ENTERED');

      const formatReqs = GoogleSheetsFormatter.buildFormattingRequests(
        sheetId,
        effectiveHeaders,
        rowsWithSummary,
        options
      );

      const targetCharts: ChartDefinition[] = (options?.charts && options.charts.length > 0)
        ? options.charts
        : (effectiveChart ? [effectiveChart] : []);

      if (targetCharts.length > 0) {
        const chartReqs = SpreadsheetEngine.buildMultiGoogleSheetsChartRequests(
          sheetId,
          rowsWithSummary.length,
          effectiveHeaders,
          rowsWithSummary,
          targetCharts
        );
        if (chartReqs && chartReqs.length > 0) formatReqs.push(...chartReqs);
      }
      await this.deps.sheetsService.batchUpdate(token, fileId, formatReqs);
    }

    const webViewLink = isUpdate && existing[0]?.webViewLink
      ? existing[0].webViewLink
      : await this.deps.getPublicMediaUrl(userId, fileId);

    return { fileId, webViewLink, isUpdate };
  }

  public async updateCell(
    userId: string,
    fileIdOrName: string,
    cell: string,
    value: any,
    sheetName?: string
  ): Promise<{ fileId: string; cell: string; value: any; webViewLink: string }> {
    const token = await this.deps.getAccessToken(userId);
    let targetId = fileIdOrName;
    let webViewLink = '';

    if (!/^[a-zA-Z0-9_-]{25,}$/.test(fileIdOrName)) {
      const files = await this.deps.listFiles(userId, { name: fileIdOrName });
      if (files.length === 0) {
        throw new Error(`Spreadsheet "${fileIdOrName}" not found in your SERA Vault.`);
      }
      targetId = files[0].id;
      webViewLink = files[0].webViewLink;
    }

    await this.deps.sheetsService.updateSingleCell(token, targetId, cell, value, sheetName);

    if (!webViewLink) {
      webViewLink = await this.deps.getPublicMediaUrl(userId, targetId);
    }

    return { fileId: targetId, cell, value, webViewLink };
  }
}
