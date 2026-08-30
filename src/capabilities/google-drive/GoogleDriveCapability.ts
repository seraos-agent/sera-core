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

  public async listFiles(userId: string, query?: { name?: string; mimeType?: string; searchTerm?: string }): Promise<any[]> {
    const token = await this.getAccessToken(userId);
    const folderId = await this.getVaultFolderId(userId);

    let q = `'${folderId}' in parents and trashed = false`;
    if (query?.name) {
      q += ` and name = '${query.name.replace(/'/g, "\\'")}'`;
    }
    if (query?.searchTerm) {
      q += ` and name contains '${query.searchTerm.replace(/'/g, "\\'")}'`;
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
    return data.files || [];
  }

  public async deleteFile(userId: string, target: { filename?: string; fileId?: string }): Promise<boolean> {
    const token = await this.getAccessToken(userId);
    let targetId = target.fileId;

    if (!targetId && target.filename) {
      const files = await this.listFiles(userId, { name: target.filename });
      if (files.length === 0) {
        throw new Error(`File "${target.filename}" not found in your SERA Vault.`);
      }
      targetId = files[0].id;
    }

    if (!targetId) {
      throw new Error('Must provide filename or fileId to delete file.');
    }

    const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${targetId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok && res.status !== 204) {
      throw new Error(`Delete file failed: ${await res.text()}`);
    }

    return true;
  }

  public async readFile(userId: string, fileId: string): Promise<string> {
    const token = await this.getAccessToken(userId);
    const res = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`Read file failed: ${await res.text()}`);
    return res.text();
  }

  public async writeBuffer(userId: string, name: string, buffer: Buffer, mimeType: string): Promise<string> {
    const token = await this.getAccessToken(userId);
    const folderId = await this.getVaultFolderId(userId);

    // Check if file exists
    const existing = await this.listFiles(userId, { name });
    
    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';

    if (existing.length > 0) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${existing[0].id}?uploadType=multipart`;
      method = 'PATCH';
    }

    const metadata = {
      name,
      mimeType,
      ...(existing.length === 0 ? { parents: [folderId] } : {})
    };

    const boundary = '-------314159265358979323846';
    const delimiter = Buffer.from(`\r\n--${boundary}\r\n`, 'utf-8');
    const closeDelimiter = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');

    const metadataHeader = Buffer.from(
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`,
      'utf-8'
    );
    const mediaHeader = Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`, 'utf-8');

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

    const currentContent = await this.readFile(userId, existing[0].id);
    const separator = currentContent.endsWith('\n') ? '' : '\n';
    const combinedContent = currentContent + separator + contentToAppend;
    return this.writeFile(userId, name, combinedContent, existing[0].mimeType || 'text/plain');
  }

  public async addNativeChart(userId: string, spreadsheetId: string, chartRequest: any): Promise<void> {
    const token = await this.getAccessToken(userId);
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
    const hasChart = !!options?.chart;
    const targetMime = hasChart 
      ? 'application/vnd.google-apps.spreadsheet' 
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const fileName = title.toLowerCase().endsWith('.xlsx') ? title : `${title}.xlsx`;
    const xlsxBuffer = await SpreadsheetEngine.generateWorkbook(title, headers, rows, options);
    
    const fileId = await this.writeBuffer(
      userId,
      fileName,
      xlsxBuffer,
      targetMime
    );

    if (hasChart && options?.chart) {
      try {
        const chartRequest = SpreadsheetEngine.buildGoogleSheetsChartRequest(
          0,
          rows.length,
          headers,
          rows,
          options.chart
        );
        await this.addNativeChart(userId, fileId, chartRequest);
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
