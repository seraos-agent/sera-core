import { GoogleDriveConnectionRepository } from '../../core/integrations/google-drive/GoogleDriveConnectionRepository';
import { SpreadsheetEngine, SpreadsheetOptions, SheetDefinition, ChartDefinition } from './SpreadsheetEngine';
import { GoogleSheetsService } from './GoogleSheetsService';
import { GoogleSheetsFormatter } from './spreadsheet/GoogleSheetsFormatter';
import { uploadMediaToSupabase, cleanupCdnMedia } from '../../server/routes/mediaRoutes';

export class GoogleDriveCapability {
  private readonly sheetsService: GoogleSheetsService;

  constructor(
    private readonly connections: GoogleDriveConnectionRepository,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.sheetsService = new GoogleSheetsService(this.fetchImpl);
  }

  static fromEnvironment(connections: GoogleDriveConnectionRepository): GoogleDriveCapability | null {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return new GoogleDriveCapability(connections, clientId, clientSecret);
  }

  /** Gets a fresh access token using the stored refresh token */
  public async getAccessToken(userId: string): Promise<string> {
    const refreshToken = await this.connections.getRefreshToken(userId);
    if (!refreshToken) {
      throw new Error(`Google Drive is not connected for user ${userId}`);
    }

    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to refresh Google Drive token: ${err}`);
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }

  /** Helper to get the Vault folder ID. Creates it if missing (should be created during OAuth, but just in case). */
  private async getVaultFolderId(userId: string): Promise<string> {
    const status = await this.connections.getStatus(userId);
    if (status.status !== 'CONNECTED' || !status.vaultFolderId) {
      throw new Error(`Google Drive is not connected or Vault folder missing for user ${userId}`);
    }
    return status.vaultFolderId;
  }

  private activeWrites: Map<string, Promise<string>> = new Map();
  private folderIdCache: Map<string, Map<string, string>> = new Map();

  /**
   * Retrieves all immediate subfolder IDs inside the Vault folder.
   */
  public async getVaultSubfolderIds(userId: string, vaultFolderId: string): Promise<string[]> {
    const token = await this.getAccessToken(userId);
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${vaultFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    url.searchParams.set('fields', 'files(id, name)');

    try {
      const res = await this.fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return [];
      const data = await res.json() as any;
      return (data.files || []).map((f: any) => f.id);
    } catch {
      return [];
    }
  }

  /**
   * Ensures a single folder exists under a parent folder.
   */
  public async ensureFolder(userId: string, folderName: string, parentFolderId?: string): Promise<string> {
    const token = await this.getAccessToken(userId);
    const parentId = parentFolderId || await this.getVaultFolderId(userId);

    const cacheKey = `${userId}:${parentId}`;
    let userCache = this.folderIdCache.get(cacheKey);
    if (!userCache) {
      userCache = new Map();
      this.folderIdCache.set(cacheKey, userCache);
    }
    if (userCache.has(folderName)) {
      return userCache.get(folderName)!;
    }

    const cleanName = folderName.trim().replace(/'/g, "\\'");
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and (name = '${cleanName}' or name contains '${cleanName}')`);
    url.searchParams.set('fields', 'files(id, name)');

    const res = await this.fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      const data = await res.json() as any;
      if (data.files && data.files.length > 0) {
        const id = data.files[0].id;
        userCache.set(folderName, id);
        return id;
      }
    }

    const createRes = await this.fetchImpl('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });

    if (!createRes.ok) {
      throw new Error(`Failed to create folder "${folderName}": ${await createRes.text()}`);
    }

    const created = await createRes.json() as any;
    userCache.set(folderName, created.id);
    return created.id;
  }

  /**
   * Ensures a nested folder path (e.g. "Spreadsheets/Sales & Marketplace") exists inside SERA Vault.
   */
  public async ensureFolderPath(userId: string, folderPath: string): Promise<string> {
    if (!folderPath || folderPath.trim() === '' || folderPath === '/') {
      return this.getVaultFolderId(userId);
    }
    const segments = folderPath.split('/').map(s => s.trim()).filter(Boolean);
    let currentParentId = await this.getVaultFolderId(userId);

    for (const segment of segments) {
      currentParentId = await this.ensureFolder(userId, segment, currentParentId);
    }

    return currentParentId;
  }

  public async listFiles(userId: string, query?: { name?: string; mimeType?: string; searchTerm?: string; folderId?: string }): Promise<any[]> {
    const token = await this.getAccessToken(userId);
    const vaultFolderId = await this.getVaultFolderId(userId);

    let parentCondition = `'${vaultFolderId}' in parents`;
    if (query?.folderId) {
      parentCondition = `'${query.folderId}' in parents`;
    } else {
      const subfolderIds = await this.getVaultSubfolderIds(userId, vaultFolderId);
      const allParentIds = [vaultFolderId, ...subfolderIds];
      parentCondition = allParentIds.map(id => `'${id}' in parents`).join(' or ');
    }

    let q = `(${parentCondition}) and trashed = false`;
    if (query?.name) {
      const rawName = query.name.trim();
      const escapedRaw = rawName.replace(/'/g, "\\'");
      const baseName = rawName.replace(/\.(xlsx|csv|md|txt|json)$/i, '').trim();
      const escapedBase = baseName.replace(/'/g, "\\'");

      // Fuzzy Extension Matching: Match exact, base + popular extensions, or contains
      q += ` and (name = '${escapedRaw}' or name = '${escapedBase}.xlsx' or name = '${escapedBase}.csv' or name = '${escapedBase}.md' or name = '${escapedBase}.txt' or name contains '${escapedBase}')`;
    }
    if (query?.searchTerm) {
      const cleanSearch = query.searchTerm.replace(/'/g, "\\'").trim();
      q += ` and name contains '${cleanSearch}'`;
    }
    if (query?.mimeType) {
      q += ` and mimeType = '${query.mimeType}'`;
    }

    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', q);
    url.searchParams.set('fields', 'files(id, name, mimeType, modifiedTime, webViewLink, webContentLink, parents)');
    url.searchParams.set('spaces', 'drive');

    const res = await this.fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`List files failed: ${await res.text()}`);
    const data = await res.json() as any;
    let files: any[] = data.files || [];

    // Fallback: If querying by name returned 0 results due to Google Drive query syntax/case-sensitivity, list all files in vault and match in-memory
    if (query?.name && files.length === 0) {
      const fallbackUrl = new URL('https://www.googleapis.com/drive/v3/files');
      fallbackUrl.searchParams.set('q', `(${parentCondition}) and trashed = false`);
      fallbackUrl.searchParams.set('fields', 'files(id, name, mimeType, modifiedTime, webViewLink, webContentLink, parents)');
      const fallbackRes = await this.fetchImpl(fallbackUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json() as any;
        const allVaultFiles = fallbackData.files || [];
        const targetClean = query.name.toLowerCase().trim();
        const baseClean = targetClean.replace(/\.(xlsx|csv|md|txt|json)$/i, '');

        files = allVaultFiles.filter((f: any) => {
          const fn = (f.name || '').toLowerCase().trim();
          const fBase = fn.replace(/\.(xlsx|csv|md|txt|json)$/i, '');
          return fn === targetClean || fBase === baseClean || fn.includes(baseClean) || baseClean.includes(fBase);
        });
      }
    }

    return files;
  }

  public async deleteFile(userId: string, target: { filename?: string; fileId?: string }): Promise<boolean> {
    const token = await this.getAccessToken(userId);
    let targetId = target.fileId;
    let targetName = target.filename || '';

    if (!targetId && target.filename) {
      const files = await this.listFiles(userId, { name: target.filename });
      if (files.length === 0) {
        throw new Error(`File "${target.filename}" not found in your SERA Vault.`);
      }
      targetId = files[0].id;
      targetName = files[0].name || target.filename;
    } else if (targetId && !targetName) {
      try {
        const metaRes = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${targetId}?fields=name`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (metaRes.ok) {
          const meta = await metaRes.json() as any;
          targetName = meta.name || '';
        }
      } catch {
        // Continue if metadata fetch fails
      }
    }

    if (!targetId) {
      throw new Error('Must provide filename or fileId to delete file.');
    }

    // Protect cognitive core artifacts from accidental deletion
    const protectedFiles = ['sera_profile', 'sera_memory', 'sera_memory_snapshot', 'sera_journal'];
    const normalizedName = targetName.toLowerCase().replace(/\.(json|md|txt)$/i, '').trim();
    if (protectedFiles.includes(normalizedName)) {
      throw new Error(`File "${targetName}" is a protected SERA cognitive artifact and cannot be deleted via standard file operations. Use official memory reset workflows if needed.`);
    }

    // Permanently or soft delete file from Google Drive
    const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${targetId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok && res.status !== 204) {
      throw new Error(`Delete file failed: ${await res.text()}`);
    }

    return true;
  }

  public async readBuffer(userId: string, fileId: string): Promise<Buffer> {
    const token = await this.getAccessToken(userId);

    // 1. Fetch file metadata to detect Google Docs / Google Sheets native format
    let mimeType = '';
    try {
      const metaRes = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (metaRes.ok) {
        const meta = await metaRes.json() as any;
        mimeType = meta.mimeType || '';
      }
    } catch {
      // Ignore metadata fetch errors and fallback to alt=media
    }

    // 2. Select download endpoint: Native Google Docs Editor files must use export endpoint
    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
    } else if (mimeType === 'application/vnd.google-apps.document') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    } else if (mimeType.startsWith('application/vnd.google-apps.')) {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
    }

    const res = await this.fetchImpl(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`Read file buffer failed: ${await res.text()}`);
    if (typeof res.arrayBuffer === 'function') {
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    const text = await res.text();
    return Buffer.from(text, 'utf-8');
  }

  public async readFile(userId: string, fileId: string): Promise<string> {
    const buffer = await this.readBuffer(userId, fileId);

    // Check if file is an Excel spreadsheet (.xlsx format starts with ZIP magic bytes PK\x03\x04)
    if (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      try {
        let markdownTable = await SpreadsheetEngine.readWorkbookAsMarkdown(buffer);

        // Check if there are native charts attached to this Google Sheet
        try {
          const token = await this.getAccessToken(userId);
          const metaRes = await this.fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}?fields=sheets.charts`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (metaRes.ok) {
            const metaData = await metaRes.json() as any;
            const charts = metaData.sheets?.[0]?.charts || [];
            if (charts.length > 0) {
              const chartSummaries = charts.map((c: any, idx: number) => {
                const spec = c.spec || {};
                const title = spec.title || `Chart #${idx + 1}`;
                const chartType = spec.basicChart?.chartType || (spec.pieChart ? 'PIE' : 'VISUAL_CHART');
                const anchor = c.position?.overlayPosition?.anchorCell;
                const isHeroTop = anchor?.rowIndex === 0 && anchor?.columnIndex === 0;
                const positionDesc = isHeroTop ? 'Top Hero (A1)' : (anchor ? `Row ${anchor.rowIndex + 1}, Col ${anchor.columnIndex + 1}` : 'Side-by-Side');

                // Inspect real series binding status
                let seriesInfo = '⚠️ No Data Series';
                if (spec.basicChart) {
                  const seriesCount = spec.basicChart.series?.length || 0;
                  const firstSeries = spec.basicChart.series?.[0]?.series?.sourceRange?.sources?.[0];
                  const axis = spec.basicChart.series?.[0]?.targetAxis;
                  if (seriesCount > 0 && firstSeries) {
                    const headerCount = spec.basicChart.headerCount ?? 1;
                    const rowSpan = Math.max(0, (firstSeries.endRowIndex || 0) - (firstSeries.startRowIndex || 0) - headerCount);
                    seriesInfo = `✅ Active (${seriesCount} series, ${rowSpan} data points, Axis: ${axis || 'DEFAULT'}, Range: R${firstSeries.startRowIndex + 1}:C${firstSeries.startColumnIndex + 1}-R${firstSeries.endRowIndex}:C${firstSeries.endColumnIndex})`;
                  } else {
                    seriesInfo = `❌ Empty Series Binding (${seriesCount} series defined)`;
                  }
                } else if (spec.pieChart) {
                  const domainSource = spec.pieChart.domain?.sourceRange?.sources?.[0];
                  const seriesSource = spec.pieChart.series?.sourceRange?.sources?.[0];
                  if (domainSource && seriesSource) {
                    const rowSpan = Math.max(0, (seriesSource.endRowIndex || 0) - (seriesSource.startRowIndex || 0));
                    seriesInfo = `✅ Active (Pie Domain Col ${domainSource.startColumnIndex + 1}, Series Col ${seriesSource.startColumnIndex + 1}, ${rowSpan} slices)`;
                  } else {
                    seriesInfo = `❌ Incomplete Pie Binding`;
                  }
                }

                return `- **Chart ${idx + 1}**: [${chartType}] "${title}" (Position: ${positionDesc}) | Status: ${seriesInfo}`;
              }).join('\n');

              markdownTable = `📊 **Native Visual Charts Attached (${charts.length})**:\n${chartSummaries}\n\n${markdownTable}`;
            }
          }
        } catch {
          // Ignore chart metadata fetch errors for non-Google Docs files
        }

        return markdownTable;
      } catch (err: any) {
        console.warn(`[GoogleDriveCapability] Failed to parse xlsx with SpreadsheetEngine, falling back to text:`, err.message);
      }
    }

    return buffer.toString('utf-8');
  }

  public async writeBuffer(userId: string, name: string, buffer: Buffer, mimeType: string, targetFolderId?: string): Promise<string> {
    const lockKey = `${userId}:${name.toLowerCase().trim()}`;
    const existingLock = this.activeWrites.get(lockKey);
    if (existingLock) {
      // If a write is currently in-flight for this exact file, wait for it to complete first to avoid double creations
      await existingLock.catch(() => { });
    }

    const writePromise = this._executeWriteBuffer(userId, name, buffer, mimeType, targetFolderId);
    this.activeWrites.set(lockKey, writePromise);
    try {
      return await writePromise;
    } finally {
      this.activeWrites.delete(lockKey);
    }
  }

  private async _executeWriteBuffer(userId: string, name: string, buffer: Buffer, mimeType: string, targetFolderId?: string): Promise<string> {
    const token = await this.getAccessToken(userId);
    const folderId = targetFolderId || await this.getVaultFolderId(userId);

    // Check if file exists with fuzzy name match
    const existing = await this.listFiles(userId, { name });

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';
    let targetFileName = name;

    if (existing.length > 0) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${existing[0].id}?uploadType=multipart`;
      method = 'PATCH';
      targetFileName = existing[0].name || name;
    }

    const isConvertingToNativeSheet = mimeType === 'application/vnd.google-apps.spreadsheet';
    const metadata = {
      name: targetFileName,
      mimeType: isConvertingToNativeSheet ? 'application/vnd.google-apps.spreadsheet' : mimeType,
      ...(existing.length === 0 ? { parents: [folderId] } : {})
    };

    const mediaContentType = isConvertingToNativeSheet
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : mimeType;

    const boundary = '-------314159265358979323846';
    const delimiter = Buffer.from(`\r\n--${boundary}\r\n`, 'utf-8');
    const closeDelimiter = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');

    const metadataHeader = Buffer.from(
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`,
      'utf-8'
    );
    const mediaHeader = Buffer.from(`Content-Type: ${mediaContentType}\r\n\r\n`, 'utf-8');

    const multipartRequestBody = Buffer.concat([
      delimiter,
      metadataHeader,
      delimiter,
      mediaHeader,
      buffer,
      closeDelimiter
    ]);

    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipartRequestBody.length)
      },
      body: multipartRequestBody
    });

    if (!res.ok) throw new Error(`Write buffer failed: ${await res.text()}`);
    const data = await res.json() as any;
    return data.id;
  }

  public async writeFile(userId: string, name: string, content: string, mimeType: string = 'text/plain', targetFolderId?: string): Promise<string> {
    return this.writeBuffer(userId, name, Buffer.from(content, 'utf-8'), mimeType, targetFolderId);
  }

  public async appendToFile(userId: string, name: string, contentToAppend: string): Promise<string> {
    const existing = await this.listFiles(userId, { name });
    if (existing.length === 0) {
      return this.writeFile(userId, name, contentToAppend, 'text/plain');
    }

    const file = existing[0];
    const isSpreadsheet = file.name.toLowerCase().endsWith('.xlsx') ||
      file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimeType === 'application/vnd.google-apps.spreadsheet';

    if (isSpreadsheet) {
      // Parse input rows: handle JSON array string or CSV lines
      let rowsToAppend: any[][] = [];
      const trimmed = contentToAppend.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            rowsToAppend = Array.isArray(parsed[0]) ? parsed : [parsed];
          }
        } catch {
          rowsToAppend = [];
        }
      }

      if (rowsToAppend.length === 0) {
        // Fallback: parse CSV lines (e.g. "7,Gilang Ramadhan,IT,6500000,800000,7300000")
        const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
        rowsToAppend = lines.map(line => {
          return line.split(',').map(item => {
            const clean = item.trim();
            const num = Number(clean);
            return !isNaN(num) && clean !== '' ? num : clean;
          });
        });
      }

      if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
        const token = await this.getAccessToken(userId);
        await this.sheetsService.appendValues(token, file.id, 'Sheet1', rowsToAppend, 'USER_ENTERED');
        return file.id;
      }

      const existingBuffer = await this.readBuffer(userId, file.id);
      const updatedBuffer = await SpreadsheetEngine.appendRowsToWorkbook(existingBuffer, rowsToAppend);
      return this.writeBuffer(userId, file.name, updatedBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    // Plain text / markdown document
    const currentContent = await this.readFile(userId, file.id);
    const separator = currentContent.endsWith('\n') ? '' : '\n';
    const combinedContent = currentContent + separator + contentToAppend;
    return this.writeFile(userId, name, combinedContent, file.mimeType || 'text/plain');
  }

  public async addNativeChart(
    userId: string,
    spreadsheetId: string,
    chartDef: ChartDefinition,
    numRows: number,
    headers: string[],
    rows: any[][],
    options?: SpreadsheetOptions
  ): Promise<void> {
    const token = await this.getAccessToken(userId);

    // 1. Fetch real sheetId of the primary or target worksheet tab
    let sheetId = 0;
    try {
      const metadata = await this.sheetsService.getSpreadsheetMetadata(token, spreadsheetId);
      const allSheets = metadata.sheets || [];
      const targetSheet = options?.targetSheet
        ? allSheets.find((s: any) => s.title?.toLowerCase() === options.targetSheet?.toLowerCase())
        : allSheets[0];

      sheetId = targetSheet?.sheetId ?? 0;

      // Clean up any existing embedded charts on that tab to prevent duplicate overlapping charts
      await this.sheetsService.clearAndDeleteCharts(token, spreadsheetId, sheetId);
    } catch (e: any) {
      console.warn('[GoogleDriveCapability] Warning fetching sheetId, defaulting to 0:', e.message);
    }

    const chartRequest = SpreadsheetEngine.buildGoogleSheetsChartRequest(
      sheetId,
      numRows,
      headers,
      rows,
      chartDef
    );

    if (chartRequest) {
      await this.sheetsService.batchUpdate(token, spreadsheetId, [chartRequest]);
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
    const token = await this.getAccessToken(userId);
    const cleanTitle = title.replace(/\.xlsx$/i, '').trim();

    // 1. Resolve target folder in Vault (defaults to 'Spreadsheets')
    const targetFolderName = options?.folder || 'Spreadsheets';
    const targetFolderId = await this.ensureFolderPath(userId, targetFolderName);

    // 2. Pre-flight Chart Validation
    const effectiveHeaders = headers || (sheets && sheets[0]?.headers) || [];
    const effectiveRows = rows || (sheets && sheets[0]?.rows) || [];
    let effectiveChart =
      options?.chart ||
      (sheets && sheets[0]?.options?.chart) ||
      SpreadsheetEngine.inferAutomaticChart(effectiveHeaders, effectiveRows);

    if (effectiveChart) {
      const validation = SpreadsheetEngine.validateChartDefinition(
        effectiveHeaders,
        effectiveRows,
        effectiveChart
      );
      if (!validation.valid) {
        console.warn(
          `[GoogleDriveCapability] Chart validation: ${validation.reason}. Falling back to automatic chart.`
        );
        effectiveChart = SpreadsheetEngine.inferAutomaticChart(
          effectiveHeaders,
          effectiveRows
        );
      }
    }

    // 3. Search for existing spreadsheet in Vault to support true in-place update
    const existing = await this.listFiles(userId, { name: cleanTitle });
    const isUpdate = existing.length > 0;
    const existingFile = isUpdate ? existing[0] : undefined;
    const isNativeSheet = existingFile?.mimeType === 'application/vnd.google-apps.spreadsheet';

    let fileId: string;

    // --- CASE A: Append Mode to existing native Google Sheet ---
    if (options?.mode === 'append' && isUpdate && existingFile && isNativeSheet) {
      fileId = existingFile.id;
      const targetSheetName = options?.targetSheet || (sheets && sheets[0]?.name) || options?.sheetName || 'Sheet1';
      const normalizedRows = GoogleSheetsFormatter.normalizeRowsForNativeSheetsApi(effectiveHeaders, effectiveRows);
      await this.sheetsService.appendValues(
        token,
        fileId,
        `'${targetSheetName}'!A1`,
        normalizedRows,
        'USER_ENTERED'
      );
      const webViewLink = existingFile.webViewLink || (await this.getPublicMediaUrl(userId, fileId));
      return { fileId, webViewLink, isUpdate: true };
    }

    // --- CASE B: Update in-place on existing native Google Sheet ---
    if (isUpdate && existingFile && isNativeSheet) {
      fileId = existingFile.id;
      // Enforce consistent locale for formula evaluation and number formatting
      await this.sheetsService.ensureLocaleSettings(token, fileId);
      // 1. Clean up old charts to avoid overlapping duplicates
      await this.sheetsService.clearAndDeleteCharts(token, fileId);

      if (sheets && sheets.length > 0) {
        // Multi-tab in-place update
        for (const sheetDef of sheets) {
          const sheetId = await this.sheetsService.ensureSheetExists(token, fileId, sheetDef.name);
          // Clear previous data
          await this.sheetsService.clearValues(token, fileId, `'${sheetDef.name}'!A1:ZZ10000`);
          // Write headers + normalized data
          const normalizedRows = GoogleSheetsFormatter.normalizeRowsForNativeSheetsApi(sheetDef.headers, sheetDef.rows);
          const allRows = [sheetDef.headers, ...normalizedRows];
          await this.sheetsService.writeValues(token, fileId, `'${sheetDef.name}'!A1`, allRows, 'USER_ENTERED');
          // Format
          const formatReqs = GoogleSheetsFormatter.buildFormattingRequests(
            sheetId,
            sheetDef.headers,
            sheetDef.rows,
            sheetDef.options || options
          );
          const tabChart = sheetDef.options?.chart;
          if (tabChart) {
            const chartReq = SpreadsheetEngine.buildGoogleSheetsChartRequest(
              sheetId,
              sheetDef.rows.length,
              sheetDef.headers,
              sheetDef.rows,
              tabChart
            );
            if (chartReq) formatReqs.push(chartReq);
          }
          await this.sheetsService.batchUpdate(token, fileId, formatReqs);
        }
      } else {
        // Single sheet in-place update
        const sheetName = options?.sheetName || 'Sheet1';
        const sheetId = await this.sheetsService.ensureSheetExists(token, fileId, sheetName);
        await this.sheetsService.clearValues(token, fileId, `'${sheetName}'!A1:ZZ10000`);
        const normalizedRows = GoogleSheetsFormatter.normalizeRowsForNativeSheetsApi(effectiveHeaders, effectiveRows);
        const allRows = [effectiveHeaders, ...normalizedRows];
        await this.sheetsService.writeValues(token, fileId, `'${sheetName}'!A1`, allRows, 'USER_ENTERED');
        const formatReqs = GoogleSheetsFormatter.buildFormattingRequests(
          sheetId,
          effectiveHeaders,
          effectiveRows,
          options
        );
        if (effectiveChart) {
          const chartReq = SpreadsheetEngine.buildGoogleSheetsChartRequest(
            sheetId,
            effectiveRows.length,
            effectiveHeaders,
            effectiveRows,
            effectiveChart
          );
          if (chartReq) formatReqs.push(chartReq);
        }
        await this.sheetsService.batchUpdate(token, fileId, formatReqs);
      }

      const webViewLink = existingFile.webViewLink || (await this.getPublicMediaUrl(userId, fileId));
      return { fileId, webViewLink, isUpdate: true };
    }

    // --- CASE C: Brand New Native Google Sheet (or replacing legacy .xlsx) ---
    if (isUpdate && existingFile && !isNativeSheet) {
      try {
        await this.deleteFile(userId, { fileId: existingFile.id });
      } catch (err: any) {
        console.warn(`[GoogleDriveCapability] Non-fatal: could not remove legacy .xlsx file:`, err.message);
      }
    }

    if (sheets && sheets.length > 0) {
      // Multi-sheet workbook creation
      const firstTab = sheets[0].name || 'Sheet1';
      const additionalTabs = sheets.slice(1).map(s => s.name);
      const created = await this.sheetsService.createSpreadsheet(token, cleanTitle, {
        folderId: targetFolderId,
        sheetTitle: firstTab,
        additionalSheets: additionalTabs
      });
      fileId = created.spreadsheetId;

      for (const sheetDef of sheets) {
        const found = created.sheets.find(s => s.title.toLowerCase() === sheetDef.name.toLowerCase());
        const sheetId = found ? found.sheetId : await this.sheetsService.ensureSheetExists(token, fileId, sheetDef.name);
        const normalizedRows = GoogleSheetsFormatter.normalizeRowsForNativeSheetsApi(sheetDef.headers, sheetDef.rows);
        const allRows = [sheetDef.headers, ...normalizedRows];
        await this.sheetsService.writeValues(token, fileId, `'${sheetDef.name}'!A1`, allRows, 'USER_ENTERED');
        const formatReqs = GoogleSheetsFormatter.buildFormattingRequests(
          sheetId,
          sheetDef.headers,
          sheetDef.rows,
          sheetDef.options || options
        );
        const tabChart = sheetDef.options?.chart;
        if (tabChart) {
          const chartReq = SpreadsheetEngine.buildGoogleSheetsChartRequest(
            sheetId,
            sheetDef.rows.length,
            sheetDef.headers,
            sheetDef.rows,
            tabChart
          );
          if (chartReq) formatReqs.push(chartReq);
        }
        await this.sheetsService.batchUpdate(token, fileId, formatReqs);
      }
    } else {
      // Single-sheet workbook creation
      const sheetName = options?.sheetName || 'Sheet1';
      const created = await this.sheetsService.createSpreadsheet(token, cleanTitle, {
        folderId: targetFolderId,
        sheetTitle: sheetName
      });
      fileId = created.spreadsheetId;
      const sheetId = created.sheets[0]?.sheetId ?? 0;

      const normalizedRows = GoogleSheetsFormatter.normalizeRowsForNativeSheetsApi(effectiveHeaders, effectiveRows);
      const allRows = [effectiveHeaders, ...normalizedRows];
      await this.sheetsService.writeValues(token, fileId, `'${sheetName}'!A1`, allRows, 'USER_ENTERED');
      const formatReqs = GoogleSheetsFormatter.buildFormattingRequests(
        sheetId,
        effectiveHeaders,
        effectiveRows,
        options
      );
      if (effectiveChart) {
        const chartReq = SpreadsheetEngine.buildGoogleSheetsChartRequest(
          sheetId,
          effectiveRows.length,
          effectiveHeaders,
          effectiveRows,
          effectiveChart
        );
        if (chartReq) formatReqs.push(chartReq);
      }
      await this.sheetsService.batchUpdate(token, fileId, formatReqs);
    }

    const webViewLink = isUpdate && existing[0]?.webViewLink
      ? existing[0].webViewLink
      : await this.getPublicMediaUrl(userId, fileId);

    return { fileId, webViewLink, isUpdate };
  }

  public async updateCell(
    userId: string,
    fileIdOrName: string,
    cell: string,
    value: any,
    sheetName?: string
  ): Promise<{ fileId: string; cell: string; value: any; webViewLink: string }> {
    const token = await this.getAccessToken(userId);
    let targetId = fileIdOrName;
    let webViewLink = '';

    // If fileIdOrName is not an ID (e.g. filename), find the file in Vault
    if (!/^[a-zA-Z0-9_-]{25,}$/.test(fileIdOrName)) {
      const files = await this.listFiles(userId, { name: fileIdOrName });
      if (files.length === 0) {
        throw new Error(`Spreadsheet "${fileIdOrName}" not found in your SERA Vault.`);
      }
      targetId = files[0].id;
      webViewLink = files[0].webViewLink;
    }

    await this.sheetsService.updateSingleCell(token, targetId, cell, value, sheetName);

    if (!webViewLink) {
      webViewLink = await this.getPublicMediaUrl(userId, targetId);
    }

    return { fileId: targetId, cell, value, webViewLink };
  }

  public async getPublicMediaUrl(userId: string, fileId: string): Promise<string> {
    const token = await this.getAccessToken(userId);

    // Set permission to anyone with link
    const permUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
    const permRes = await this.fetchImpl(permUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });

    if (!permRes.ok) throw new Error(`Failed to set permissions: ${await permRes.text()}`);

    // Return the webViewLink or webContentLink
    const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webContentLink,webViewLink`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`Failed to get link: ${await res.text()}`);
    const data = await res.json() as any;
    return data.webViewLink || data.webContentLink || `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
  }

  /**
   * Saves an attached image or video (from chat attachment, dataUrl, or buffer)
   * into the user's Google Drive SERA Vault (defaults to "🎨 Media & Creative").
   */
  public async saveMedia(
    userId: string,
    filename: string,
    mediaData: string | Buffer,
    mimeType?: string,
    folderName: string = '🎨 Media & Creative'
  ): Promise<{ fileId: string; filename: string; webViewLink: string; folder: string; isVideo: boolean }> {
    let buffer: Buffer;
    let detectedMime = mimeType || '';

    if (Buffer.isBuffer(mediaData)) {
      buffer = mediaData;
    } else if (typeof mediaData === 'string') {
      if (mediaData.startsWith('data:')) {
        const matches = mediaData.match(/^data:([A-Za-z-+\/0-9.]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          if (!detectedMime) detectedMime = matches[1].toLowerCase();
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          buffer = Buffer.from(mediaData.replace(/^data:[^,]+,/, ''), 'base64');
        }
      } else if (mediaData.startsWith('http://') || mediaData.startsWith('https://')) {
        const res = await this.fetchImpl(mediaData);
        if (!res.ok) throw new Error(`Failed to download media from URL: ${res.statusText}`);
        if (!detectedMime) detectedMime = res.headers.get('content-type') || '';
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      } else {
        buffer = Buffer.from(mediaData, 'base64');
      }
    } else {
      throw new Error('Invalid media data provided for saving to Google Drive.');
    }

    // Auto-detect MIME type from filename if not specified
    const lowerName = filename.toLowerCase();
    if (!detectedMime) {
      if (lowerName.endsWith('.mp4')) detectedMime = 'video/mp4';
      else if (lowerName.endsWith('.mov')) detectedMime = 'video/quicktime';
      else if (lowerName.endsWith('.webm')) detectedMime = 'video/webm';
      else if (lowerName.endsWith('.png')) detectedMime = 'image/png';
      else if (lowerName.endsWith('.webp')) detectedMime = 'image/webp';
      else detectedMime = 'image/jpeg';
    }

    const isVideo = detectedMime.startsWith('video/');

    // Ensure target folder exists inside SERA Vault
    const targetFolderId = await this.ensureFolderPath(userId, folderName);

    // Write file into Google Drive with in-place overwrite support
    const fileId = await this.writeBuffer(userId, filename, buffer, detectedMime, targetFolderId);

    const token = await this.getAccessToken(userId);
    let webViewLink = `https://drive.google.com/file/d/${fileId}/view`;
    try {
      const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink,name`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const meta = await res.json() as any;
        if (meta.webViewLink) webViewLink = meta.webViewLink;
      }
    } catch {
      // Continue with default view link
    }

    return {
      fileId,
      filename,
      webViewLink,
      folder: folderName,
      isVideo
    };
  }

  // 24-hour Smart Cache for bridged media to enable zero-latency reposting and reduce egress
  private static bridgeCache = new Map<string, {
    publicUrl: string;
    mimeType: string;
    isVideo: boolean;
    fileKey: string;
    filename: string;
    cachedAt: number;
  }>();
  private static readonly BRIDGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Ephemeral Media Bridge: Reads a media file from Google Drive and uploads it
   * to the public Supabase CDN bridge so Meta Threads crawler can stream it directly.
   * Employs a 24-hour Smart Cache (TTL) for zero-latency multi-posting and bandwidth conservation.
   */
  public async bridgeDriveMediaToCdn(
    userId: string,
    filenameOrId: string
  ): Promise<{ publicUrl: string; mimeType: string; isVideo: boolean; fileKey: string; filename: string }> {
    let targetId = filenameOrId;
    let targetName = filenameOrId;

    // Search file in Drive
    const files = await this.listFiles(userId, { name: filenameOrId });
    if (files.length > 0) {
      targetId = files[0].id;
      targetName = files[0].name || filenameOrId;
    } else {
      // Check if it's already an exact file ID
      try {
        const token = await this.getAccessToken(userId);
        const metaRes = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${filenameOrId}?fields=id,name,mimeType`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (metaRes.ok) {
          const meta = await metaRes.json() as any;
          targetId = meta.id;
          targetName = meta.name || filenameOrId;
        } else {
          throw new Error(`Media file "${filenameOrId}" was not found in your SERA Vault.`);
        }
      } catch {
        throw new Error(`Media file "${filenameOrId}" was not found in your SERA Vault.`);
      }
    }

    // Check 24-hour Smart Cache
    const cacheKey = `${userId}:${targetId}`;
    const cached = GoogleDriveCapability.bridgeCache.get(cacheKey);
    if (cached) {
      if (Date.now() - cached.cachedAt < GoogleDriveCapability.BRIDGE_TTL_MS) {
        console.log(`[GoogleDriveCapability] CDN bridge cache HIT for "${targetName}" (ID: ${targetId}). Reusing cached CDN URL.`);
        return {
          publicUrl: cached.publicUrl,
          mimeType: cached.mimeType,
          isVideo: cached.isVideo,
          fileKey: cached.fileKey,
          filename: cached.filename
        };
      } else {
        // Expired, clean up old file from Supabase and remove from cache
        cleanupCdnMedia(cached.fileKey).catch(() => { });
        GoogleDriveCapability.bridgeCache.delete(cacheKey);
      }
    }

    // Read the raw binary buffer directly from Google Drive API VIP stream
    const buffer = await this.readBuffer(userId, targetId);

    // Detect MIME type
    let mimeType = 'image/jpeg';
    const lower = targetName.toLowerCase();
    if (lower.endsWith('.mp4')) mimeType = 'video/mp4';
    else if (lower.endsWith('.mov')) mimeType = 'video/quicktime';
    else if (lower.endsWith('.webm')) mimeType = 'video/webm';
    else if (lower.endsWith('.png')) mimeType = 'image/png';
    else if (lower.endsWith('.webp')) mimeType = 'image/webp';

    const uploadRes = await uploadMediaToSupabase(buffer, mimeType, targetName, userId, 'bridge');

    const result = {
      publicUrl: uploadRes.url,
      mimeType: uploadRes.mimeType,
      isVideo: uploadRes.isVideo,
      fileKey: uploadRes.fileKey,
      filename: targetName
    };

    // Store in 24-hour TTL cache
    GoogleDriveCapability.bridgeCache.set(cacheKey, {
      ...result,
      cachedAt: Date.now()
    });

    // Sweep any expired entries
    GoogleDriveCapability.sweepExpiredBridgeCache();

    return result;
  }

  /**
   * Sweeps and removes bridge files from Supabase storage that have exceeded the 24-hour TTL.
   */
  public static sweepExpiredBridgeCache(): void {
    const now = Date.now();
    for (const [key, entry] of GoogleDriveCapability.bridgeCache.entries()) {
      if (now - entry.cachedAt >= GoogleDriveCapability.BRIDGE_TTL_MS) {
        cleanupCdnMedia(entry.fileKey).catch(() => { });
        GoogleDriveCapability.bridgeCache.delete(key);
      }
    }
  }

  /**
   * Cleans up a bridge media file from Supabase Storage.
   * By default, files are retained under the 24-hour TTL Smart Cache for zero-latency reposting.
   * If force is true, immediately purges the file from both cache and CDN storage.
   */
  public async cleanupCdnBridge(fileKey: string, force: boolean = false): Promise<boolean> {
    if (!force) {
      // Retained under 24-hour TTL policy
      return true;
    }
    for (const [key, entry] of GoogleDriveCapability.bridgeCache.entries()) {
      if (entry.fileKey === fileKey) {
        GoogleDriveCapability.bridgeCache.delete(key);
        break;
      }
    }
    return cleanupCdnMedia(fileKey);
  }

  /**
   * Creates a folder inside SERA Vault (or nested inside another folder).
   */
  public async createFolder(
    userId: string,
    folderName: string,
    parentFolderNameOrId?: string
  ): Promise<{ folderId: string; folderName: string; webViewLink: string }> {
    let parentId = await this.getVaultFolderId(userId);
    if (parentFolderNameOrId && parentFolderNameOrId.trim() !== '' && parentFolderNameOrId.toLowerCase() !== 'root') {
      parentId = await this.ensureFolderPath(userId, parentFolderNameOrId);
    }
    const folderId = await this.ensureFolder(userId, folderName, parentId);
    const token = await this.getAccessToken(userId);
    let webViewLink = `https://drive.google.com/drive/folders/${folderId}`;
    try {
      const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=webViewLink`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.webViewLink) webViewLink = data.webViewLink;
      }
    } catch { }
    return { folderId, folderName, webViewLink };
  }

  /**
   * Renames a file or folder inside SERA Vault.
   */
  public async renameItem(
    userId: string,
    targetNameOrId: string,
    newName: string
  ): Promise<{ id: string; oldName: string; newName: string; isFolder: boolean }> {
    const token = await this.getAccessToken(userId);
    let item: { id: string; name: string; mimeType: string } | null = null;

    // Check by exact file ID first
    try {
      const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${targetNameOrId}?fields=id,name,mimeType,trashed`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (!data.trashed) item = data;
      }
    } catch { }

    if (!item) {
      // Search files in SERA Vault
      const files = await this.listFiles(userId, { name: targetNameOrId });
      if (files.length > 0) {
        item = files[0];
      } else {
        // Also check if it matches a subfolder
        const cleanName = targetNameOrId.replace(/'/g, "\\'");
        const url = new URL('https://www.googleapis.com/drive/v3/files');
        url.searchParams.set('q', `mimeType = 'application/vnd.google-apps.folder' and trashed = false and (name = '${cleanName}' or name contains '${cleanName}')`);
        url.searchParams.set('fields', 'files(id, name, mimeType)');
        const fRes = await this.fetchImpl(url.toString(), {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (fRes.ok) {
          const fData = await fRes.json() as any;
          if (fData.files && fData.files.length > 0) item = fData.files[0];
        }
      }
    }

    if (!item) {
      throw new Error(`File or folder "${targetNameOrId}" was not found in your SERA Vault.`);
    }

    const originalName = item.name;

    const patchRes = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${item.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: newName })
    });

    if (!patchRes.ok) {
      throw new Error(`Failed to rename "${originalName}": ${await patchRes.text()}`);
    }

    const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
    if (isFolder) {
      this.folderIdCache.clear();
    }

    return {
      id: item.id,
      oldName: originalName,
      newName,
      isFolder
    };
  }

  /**
   * Moves a file or folder into a destination folder in SERA Vault using Google Drive addParents / removeParents.
   */
  public async moveItem(
    userId: string,
    itemNameOrId: string,
    destinationFolderNameOrId: string
  ): Promise<{ id: string; name: string; destinationFolder: string; webViewLink?: string }> {
    const token = await this.getAccessToken(userId);
    let item: { id: string; name: string; parents?: string[]; mimeType: string } | null = null;

    // Try finding by direct ID
    try {
      const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${itemNameOrId}?fields=id,name,parents,mimeType,trashed`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (!data.trashed) item = data;
      }
    } catch { }

    if (!item) {
      const files = await this.listFiles(userId, { name: itemNameOrId });
      if (files.length > 0) {
        item = files[0];
        if (!item?.parents) {
          const pRes = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${item!.id}?fields=id,name,parents,mimeType`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (pRes.ok) item = await pRes.json() as any;
        }
      }
    }

    if (!item) {
      throw new Error(`Item "${itemNameOrId}" was not found in your SERA Vault.`);
    }

    // Resolve destination folder ID
    let targetFolderId: string;
    let targetFolderName = destinationFolderNameOrId;
    const destLower = destinationFolderNameOrId.trim().toLowerCase();
    if (destLower === 'root' || destLower === 'sera vault' || destLower === '/') {
      targetFolderId = await this.getVaultFolderId(userId);
      targetFolderName = 'SERA Vault';
    } else {
      targetFolderId = await this.ensureFolderPath(userId, destinationFolderNameOrId);
    }

    const prevParents = (item.parents || []).join(',');
    let moveUrl = `https://www.googleapis.com/drive/v3/files/${item.id}?addParents=${targetFolderId}&fields=id,name,parents,webViewLink`;
    if (prevParents) {
      moveUrl += `&removeParents=${prevParents}`;
    }

    const moveRes = await this.fetchImpl(moveUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!moveRes.ok) {
      throw new Error(`Failed to move "${item.name}": ${await moveRes.text()}`);
    }

    const movedData = await moveRes.json() as any;
    return {
      id: item.id,
      name: item.name,
      destinationFolder: targetFolderName,
      webViewLink: movedData.webViewLink
    };
  }

  /**
   * Safely deletes or trashes a folder inside SERA Vault.
   */
  public async deleteFolder(
    userId: string,
    folderNameOrId: string,
    permanent: boolean = false
  ): Promise<{ id: string; name: string; trashed: boolean; permanent: boolean }> {
    const token = await this.getAccessToken(userId);
    let folder: { id: string; name: string; mimeType: string } | null = null;

    try {
      const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${folderNameOrId}?fields=id,name,mimeType,trashed`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (!data.trashed && data.mimeType === 'application/vnd.google-apps.folder') folder = data;
      }
    } catch { }

    if (!folder) {
      const cleanName = folderNameOrId.replace(/'/g, "\\'");
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.set('q', `mimeType = 'application/vnd.google-apps.folder' and trashed = false and (name = '${cleanName}' or name contains '${cleanName}')`);
      url.searchParams.set('fields', 'files(id, name, mimeType)');
      const fRes = await this.fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (fRes.ok) {
        const fData = await fRes.json() as any;
        if (fData.files && fData.files.length > 0) folder = fData.files[0];
      }
    }

    if (!folder) {
      throw new Error(`Folder "${folderNameOrId}" was not found in your SERA Vault.`);
    }

    const vaultId = await this.getVaultFolderId(userId);
    if (folder.id === vaultId) {
      throw new Error('Cannot delete the root SERA Vault folder.');
    }

    if (permanent) {
      const delRes = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${folder.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!delRes.ok && delRes.status !== 204) {
        throw new Error(`Failed to delete folder "${folder.name}": ${await delRes.text()}`);
      }
    } else {
      const trashRes = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${folder.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trashed: true })
      });
      if (!trashRes.ok) {
        throw new Error(`Failed to move folder "${folder.name}" to trash: ${await trashRes.text()}`);
      }
    }

    this.folderIdCache.clear();

    return {
      id: folder.id,
      name: folder.name,
      trashed: !permanent,
      permanent
    };
  }

  /**
   * Scans uncategorized files sitting at the root of SERA Vault and moves them
   * into their designated canonical folders (Media, Spreadsheets, Reports).
   */
  public async tidyVault(userId: string): Promise<{ movedCount: number; items: Array<{ name: string; destinationFolder: string }> }> {
    const token = await this.getAccessToken(userId);
    const vaultId = await this.getVaultFolderId(userId);

    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${vaultId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`);
    url.searchParams.set('fields', 'files(id, name, mimeType, parents)');
    url.searchParams.set('pageSize', '100');

    const res = await this.fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error(`Failed to scan root vault files: ${await res.text()}`);
    }

    const data = await res.json() as { files?: Array<{ id: string; name: string; mimeType: string; parents?: string[] }> };
    const files = data.files || [];
    const movedItems: Array<{ name: string; destinationFolder: string }> = [];

    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      let targetFolder = 'Reports & Research';

      // Detect media
      if (
        file.mimeType.startsWith('image/') ||
        file.mimeType.startsWith('video/') ||
        lowerName.endsWith('.jpg') ||
        lowerName.endsWith('.jpeg') ||
        lowerName.endsWith('.png') ||
        lowerName.endsWith('.webp') ||
        lowerName.endsWith('.gif') ||
        lowerName.endsWith('.mp4') ||
        lowerName.endsWith('.mov') ||
        lowerName.endsWith('.webm')
      ) {
        targetFolder = 'Media & Creative';
      }
      // Detect spreadsheets
      else if (
        file.mimeType === 'application/vnd.google-apps.spreadsheet' ||
        file.mimeType.includes('spreadsheet') ||
        lowerName.endsWith('.xlsx') ||
        lowerName.endsWith('.xls') ||
        lowerName.endsWith('.csv')
      ) {
        targetFolder = 'Spreadsheets & Analysis';
      }
      // Detect system memory or logs
      else if (lowerName.includes('system') || lowerName.includes('memory') || lowerName.includes('log')) {
        targetFolder = 'System Core';
      }

      try {
        await this.moveItem(userId, file.id, targetFolder);
        movedItems.push({ name: file.name, destinationFolder: targetFolder });
      } catch (err: any) {
        console.warn(`[GoogleDriveCapability] Warning moving "${file.name}" during tidy:`, err.message);
      }
    }

    return {
      movedCount: movedItems.length,
      items: movedItems
    };
  }
}

