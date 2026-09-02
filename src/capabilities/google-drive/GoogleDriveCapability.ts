import { GoogleDriveConnectionRepository } from '../../core/integrations/google-drive/GoogleDriveConnectionRepository';
import { SpreadsheetEngine, SpreadsheetOptions } from './SpreadsheetEngine';

export class GoogleDriveCapability {
  constructor(
    private readonly connections: GoogleDriveConnectionRepository,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

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

  public async listFiles(userId: string, query?: { name?: string; mimeType?: string; searchTerm?: string }): Promise<any[]> {
    const token = await this.getAccessToken(userId);
    const folderId = await this.getVaultFolderId(userId);

    let q = `'${folderId}' in parents and trashed = false`;
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
    url.searchParams.set('fields', 'files(id, name, mimeType, modifiedTime, webViewLink, webContentLink)');
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
      fallbackUrl.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
      fallbackUrl.searchParams.set('fields', 'files(id, name, mimeType, modifiedTime, webViewLink, webContentLink)');
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
    const protectedFiles = ['sera_profile', 'sera_memory', 'sera_journal'];
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

  public async writeBuffer(userId: string, name: string, buffer: Buffer, mimeType: string): Promise<string> {
    const lockKey = `${userId}:${name.toLowerCase().trim()}`;
    const existingLock = this.activeWrites.get(lockKey);
    if (existingLock) {
      // If a write is currently in-flight for this exact file, wait for it to complete first to avoid double creations
      await existingLock.catch(() => {});
    }

    const writePromise = this._executeWriteBuffer(userId, name, buffer, mimeType);
    this.activeWrites.set(lockKey, writePromise);
    try {
      return await writePromise;
    } finally {
      this.activeWrites.delete(lockKey);
    }
  }

  private async _executeWriteBuffer(userId: string, name: string, buffer: Buffer, mimeType: string): Promise<string> {
    const token = await this.getAccessToken(userId);
    const folderId = await this.getVaultFolderId(userId);

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

  public async writeFile(userId: string, name: string, content: string, mimeType: string = 'text/plain'): Promise<string> {
    return this.writeBuffer(userId, name, Buffer.from(content, 'utf-8'), mimeType);
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
    chartDef: any,
    numRows: number,
    headers: string[],
    rows: any[][]
  ): Promise<void> {
    const token = await this.getAccessToken(userId);
    
    // 1. Fetch real sheetId of the primary worksheet tab
    let sheetId = 0;
    try {
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
      const metaRes = await this.fetchImpl(metaUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (metaRes.ok) {
        const metaData = await metaRes.json() as any;
        sheetId = metaData.sheets?.[0]?.properties?.sheetId ?? 0;
      }
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

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [chartRequest]
      })
    });
    if (!res.ok) {
      console.warn(`[GoogleDriveCapability] Failed to add native chart to ${spreadsheetId}:`, await res.text());
    }
  }

  public async createSpreadsheet(
    userId: string,
    title: string,
    headers: string[],
    rows: any[][],
    options?: SpreadsheetOptions
  ): Promise<string> {
    // 1. Pre-flight Chart Validation (Fix BUG-08)
    let effectiveChart = options?.chart || SpreadsheetEngine.inferAutomaticChart(headers, rows);
    if (effectiveChart) {
      const validation = SpreadsheetEngine.validateChartDefinition(headers, rows, effectiveChart);
      if (!validation.valid) {
        console.warn(`[GoogleDriveCapability] Chart validation: ${validation.reason}. Falling back to automatic chart.`);
        effectiveChart = SpreadsheetEngine.inferAutomaticChart(headers, rows);
      }
    }

    const hasChart = !!effectiveChart;
    const targetMime = hasChart 
      ? 'application/vnd.google-apps.spreadsheet' 
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const fileName = title.toLowerCase().endsWith('.xlsx') ? title : `${title}.xlsx`;

    // 2. Clean In-Place Overwrite (Fix BUG-01, BUG-03, BUG-09):
    // If a spreadsheet with this title already exists in the Vault, delete previous version first
    // to prevent binary multipart patching conflicts and duplicate overlapping charts.
    try {
      const existing = await this.listFiles(userId, { name: fileName });
      if (existing.length > 0) {
        for (const f of existing) {
          try {
            await this.deleteFile(userId, { fileId: f.id });
          } catch (e: any) {
            console.warn(`[GoogleDriveCapability] Warning removing old version ${f.id}:`, e.message);
          }
        }
      }
    } catch (e: any) {
      console.warn(`[GoogleDriveCapability] Existing file check warning:`, e.message);
    }

    const xlsxBuffer = await SpreadsheetEngine.generateWorkbook(title, headers, rows, {
      ...options,
      chart: effectiveChart
    });
    
    const fileId = await this.writeBuffer(
      userId,
      fileName,
      xlsxBuffer,
      targetMime
    );

    if (hasChart && effectiveChart) {
      try {
        await this.addNativeChart(userId, fileId, effectiveChart, rows.length, headers, rows);
      } catch (err: any) {
        console.warn('[GoogleDriveCapability] Chart creation warning:', err.message);
      }
    }

    return fileId;
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

    // Return the webContentLink
    const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webContentLink`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`Failed to get webContentLink: ${await res.text()}`);
    const data = await res.json() as any;
    return data.webContentLink;
  }
}
