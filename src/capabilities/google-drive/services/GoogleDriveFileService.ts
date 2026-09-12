import { SpreadsheetEngine } from '../SpreadsheetEngine';
import { GoogleSheetsService } from '../GoogleSheetsService';

export interface FileServiceDependencies {
  fetchImpl: typeof fetch;
  getAccessToken: (userId: string) => Promise<string>;
  sheetsService: GoogleSheetsService;
  getVaultFolderId: (userId: string) => Promise<string>;
  getVaultSubfolderIds: (userId: string, vaultFolderId: string) => Promise<string[]>;
}

/**
 * Handles core file I/O operations for Google Drive, including binary read/write,
 * multipart updates with concurrency write-locks, text/markdown formatting, and public URL generation.
 */
export class GoogleDriveFileService {
  private activeWrites: Map<string, Promise<string>> = new Map();

  constructor(private readonly deps: FileServiceDependencies) {}

  public async listFiles(
    userId: string,
    query?: { name?: string; mimeType?: string; searchTerm?: string; folderId?: string; exact?: boolean }
  ): Promise<any[]> {
    const token = await this.deps.getAccessToken(userId);
    const vaultFolderId = await this.deps.getVaultFolderId(userId);

    let parentCondition = `'${vaultFolderId}' in parents`;
    if (query?.folderId) {
      parentCondition = `'${query.folderId}' in parents`;
    } else {
      const subfolderIds = await this.deps.getVaultSubfolderIds(userId, vaultFolderId);
      const allParentIds = [vaultFolderId, ...subfolderIds];
      parentCondition = allParentIds.map(id => `'${id}' in parents`).join(' or ');
    }

    let q = `(${parentCondition}) and trashed = false`;
    if (query?.name) {
      const rawName = query.name.trim();
      const escapedRaw = rawName.replace(/'/g, "\\'");
      const baseName = rawName.replace(/\.(xlsx|csv|md|txt|json)$/i, '').trim();
      const escapedBase = baseName.replace(/'/g, "\\'");

      if (query.exact) {
        q += ` and (name = '${escapedRaw}' or name = '${escapedBase}.xlsx' or name = '${escapedBase}.csv' or name = '${escapedBase}.md' or name = '${escapedBase}.txt')`;
      } else {
        q += ` and (name = '${escapedRaw}' or name = '${escapedBase}.xlsx' or name = '${escapedBase}.csv' or name = '${escapedBase}.md' or name = '${escapedBase}.txt' or name contains '${escapedBase}')`;
      }
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

    const res = await this.deps.fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`List files failed: ${await res.text()}`);
    const data = (await res.json()) as any;
    let files: any[] = data.files || [];

    // Fallback: If querying by name returned 0 results due to Google Drive query syntax/case-sensitivity, list all files in vault and match in-memory
    if (query?.name && files.length === 0) {
      const fallbackUrl = new URL('https://www.googleapis.com/drive/v3/files');
      fallbackUrl.searchParams.set('q', `(${parentCondition}) and trashed = false`);
      fallbackUrl.searchParams.set('fields', 'files(id, name, mimeType, modifiedTime, webViewLink, webContentLink, parents)');
      const fallbackRes = await this.deps.fetchImpl(fallbackUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (fallbackRes.ok) {
        const fallbackData = (await fallbackRes.json()) as any;
        const allVaultFiles = fallbackData.files || [];
        const targetClean = query.name.toLowerCase().trim();
        const baseClean = targetClean.replace(/\.(xlsx|csv|md|txt|json)$/i, '');

        files = allVaultFiles.filter((f: any) => {
          const fn = (f.name || '').toLowerCase().trim();
          const fBase = fn.replace(/\.(xlsx|csv|md|txt|json)$/i, '');
          if (query?.exact) {
            return fn === targetClean || fBase === baseClean;
          }
          return fn === targetClean || fBase === baseClean || fn.includes(baseClean) || baseClean.includes(fBase);
        });
      }
    }

    return files;
  }

  public async deleteFile(userId: string, target: { filename?: string; fileId?: string }): Promise<boolean> {
    const token = await this.deps.getAccessToken(userId);
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
        const metaRes = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${targetId}?fields=name`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (metaRes.ok) {
          const meta = (await metaRes.json()) as any;
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

    const res = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${targetId}`, {
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

  public async resolveFileId(userId: string, fileIdOrName: string): Promise<string> {
    if (!fileIdOrName || typeof fileIdOrName !== 'string') {
      throw new Error('Invalid file ID or name provided.');
    }
    const clean = fileIdOrName.trim();
    const looksLikeDriveId = /^[a-zA-Z0-9_-]{8,}$/.test(clean);

    if (looksLikeDriveId) {
      try {
        const token = await this.deps.getAccessToken(userId);
        const res = await this.deps.fetchImpl(
          `https://www.googleapis.com/drive/v3/files/${clean}?fields=id`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          return clean;
        }
      } catch {
        // Direct ID lookup failed, fall through to title search
      }
    }

    const files = await this.listFiles(userId, { name: clean });
    if (files.length > 0) {
      return files[0].id;
    }

    throw new Error(`File "${clean}" not found in your SERA Vault.`);
  }

  public async readBuffer(userId: string, fileIdOrName: string): Promise<Buffer> {
    const fileId = await this.resolveFileId(userId, fileIdOrName);
    const token = await this.deps.getAccessToken(userId);

    let mimeType = '';
    try {
      const metaRes = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as any;
        mimeType = meta.mimeType || '';
      }
    } catch {}

    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
    } else if (mimeType === 'application/vnd.google-apps.document') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    } else if (mimeType.startsWith('application/vnd.google-apps.')) {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
    }

    const res = await this.deps.fetchImpl(downloadUrl, {
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

  public async readFile(userId: string, fileIdOrName: string): Promise<string> {
    const fileId = await this.resolveFileId(userId, fileIdOrName);
    const buffer = await this.readBuffer(userId, fileId);

    // Check if file is an Excel spreadsheet (.xlsx starts with PK\x03\x04)
    if (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      try {
        let markdownTable = await SpreadsheetEngine.readWorkbookAsMarkdown(buffer);

        try {
          const token = await this.deps.getAccessToken(userId);
          const metaRes = await this.deps.fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}?fields=sheets.charts`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (metaRes.ok) {
            const metaData = (await metaRes.json()) as any;
            const charts = metaData.sheets?.[0]?.charts || [];
            if (charts.length > 0) {
              const chartSummaries = charts.map((c: any, idx: number) => {
                const spec = c.spec || {};
                const title = spec.title || `Chart #${idx + 1}`;
                const chartType = spec.basicChart?.chartType || (spec.pieChart ? 'PIE' : 'VISUAL_CHART');
                const anchor = c.position?.overlayPosition?.anchorCell;
                const rIdx = typeof anchor?.rowIndex === 'number' ? anchor.rowIndex : 0;
                const cIdx = typeof anchor?.columnIndex === 'number' ? anchor.columnIndex : 0;
                const isHeroTop = rIdx === 0 && cIdx === 0;
                const positionDesc = isHeroTop ? 'Top Hero (A1)' : (anchor ? `Row ${rIdx + 1}, Col ${cIdx + 1}` : 'Side-by-Side');

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
        console.warn(`[GoogleDriveFileService] Failed to parse xlsx with SpreadsheetEngine:`, err.message);
      }
    }

    return buffer.toString('utf-8');
  }

  public async writeBuffer(userId: string, name: string, buffer: Buffer, mimeType: string, targetFolderId?: string): Promise<string> {
    const lockKey = `${userId}:${name.toLowerCase().trim()}`;
    const existingLock = this.activeWrites.get(lockKey);
    if (existingLock) {
      await existingLock.catch(() => {});
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
    const token = await this.deps.getAccessToken(userId);
    const folderId = targetFolderId || (await this.deps.getVaultFolderId(userId));

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

    const res = await this.deps.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(multipartRequestBody.length)
      },
      body: multipartRequestBody
    });

    if (!res.ok) throw new Error(`Write buffer failed: ${await res.text()}`);
    const data = (await res.json()) as any;
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
        const token = await this.deps.getAccessToken(userId);
        await this.deps.sheetsService.appendValues(token, file.id, 'Sheet1', rowsToAppend, 'USER_ENTERED');
        return file.id;
      }

      const existingBuffer = await this.readBuffer(userId, file.id);
      const updatedBuffer = await SpreadsheetEngine.appendRowsToWorkbook(existingBuffer, rowsToAppend);
      return this.writeBuffer(userId, file.name, updatedBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    const currentContent = await this.readFile(userId, file.id);
    const separator = currentContent.endsWith('\n') ? '' : '\n';
    const combinedContent = currentContent + separator + contentToAppend;
    return this.writeFile(userId, name, combinedContent, file.mimeType || 'text/plain');
  }

  public async getPublicMediaUrl(userId: string, fileId: string): Promise<string> {
    const token = await this.deps.getAccessToken(userId);

    const permUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
    const permRes = await this.deps.fetchImpl(permUrl, {
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

    const res = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webContentLink,webViewLink`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`Failed to get link: ${await res.text()}`);
    const data = (await res.json()) as any;
    return data.webViewLink || data.webContentLink || `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
  }
}
