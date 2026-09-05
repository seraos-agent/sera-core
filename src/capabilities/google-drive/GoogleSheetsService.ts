/**
 * GoogleSheetsService — Dedicated Transport Layer for Google Sheets API v4
 *
 * Direct REST client for Google Sheets API v4 endpoints:
 * - Direct spreadsheet creation (native Google Sheets)
 * - Value reading, writing, appending (with USER_ENTERED formula parsing)
 * - Granular cell formatting (batchUpdate)
 * - Embedded charts management
 * - In-place tab and data manipulation
 */

export interface GoogleSheetTabInfo {
  sheetId: number;
  title: string;
  rowCount?: number;
  columnCount?: number;
  charts?: any[];
}

export interface GoogleSpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl?: string;
  sheets: GoogleSheetTabInfo[];
}

export class GoogleSheetsService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /**
   * Resilient HTTP fetch wrapper with automatic exponential backoff and retry.
   * Handles transient Google API errors (503 Service Unavailable, 502, 500, 429 Rate Limit)
   * and network disconnects / timeouts.
   */
  private async fetchWithRetry(
    url: string | URL | Request,
    init?: RequestInit,
    maxRetries: number = 3
  ): Promise<Response> {
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use a 30s timeout signal if no signal is already attached
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const mergedInit: RequestInit = {
          ...init,
          signal: init?.signal || controller.signal
        };

        const res = await this.fetchImpl(url, mergedInit);
        clearTimeout(timeoutId);

        // Immediate success or non-retryable client error (400, 401, 403, 404)
        if (res.ok || (res.status < 500 && res.status !== 429)) {
          return res;
        }

        // Transient Google API errors (503, 502, 500, 429)
        if (attempt < maxRetries) {
          const errSnippet = await res.text().catch(() => '');
          console.warn(
            `[GoogleSheetsService] Transient Google API error (${res.status}) on attempt ${attempt}/${maxRetries}. Retrying... Details: ${errSnippet.slice(0, 150)}`
          );
        } else {
          return res;
        }
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          console.warn(
            `[GoogleSheetsService] Network or timeout error on attempt ${attempt}/${maxRetries}: ${err.message}. Retrying...`
          );
        } else {
          throw err;
        }
      }

      // Exponential backoff: 1000ms -> 2000ms -> 4000ms (+ random jitter)
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 400, 6000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    if (lastError) throw lastError;
    throw new Error('GoogleSheetsService fetchWithRetry exhausted retries without response');
  }

  /**
   * Creates a new native Google Sheet directly via Google Sheets API v4.
   * If folderId is supplied, moves the newly created sheet to the target Google Drive folder.
   */
  public async createSpreadsheet(
    token: string,
    title: string,
    options?: {
      folderId?: string;
      sheetTitle?: string;
      additionalSheets?: string[];
    }
  ): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheets: GoogleSheetTabInfo[];
  }> {
    const sheetDefs: any[] = [
      {
        properties: {
          title: options?.sheetTitle || 'Sheet1',
          index: 0
        }
      }
    ];

    if (options?.additionalSheets && options.additionalSheets.length > 0) {
      options.additionalSheets.forEach((name, idx) => {
        sheetDefs.push({
          properties: {
            title: name,
            index: idx + 1
          }
        });
      });
    }

    const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    const createRes = await this.fetchWithRetry(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title,
          locale: 'en_US',
          autoRecalc: 'ON_CHANGE'
        },
        sheets: sheetDefs
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Google Sheets API createSpreadsheet failed: ${errText}`);
    }

    const data = (await createRes.json()) as any;
    const spreadsheetId: string = data.spreadsheetId;
    const spreadsheetUrl: string =
      data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    const sheets: GoogleSheetTabInfo[] = (data.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title || 'Sheet1',
      rowCount: s.properties?.gridProperties?.rowCount,
      columnCount: s.properties?.gridProperties?.columnCount
    }));

    // If a target folder in SERA Vault is provided, move file out of root into target folder
    if (options?.folderId) {
      try {
        const moveUrl = `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${encodeURIComponent(
          options.folderId
        )}&removeParents=root&fields=id,parents`;
        await this.fetchWithRetry(moveUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } catch (err: any) {
        console.warn(`[GoogleSheetsService] Warning moving file to folder:`, err.message);
      }
    }

    return {
      spreadsheetId,
      spreadsheetUrl,
      sheets
    };
  }

  /**
   * Fetches metadata including all sheets, their properties, and embedded charts.
   */
  public async getSpreadsheetMetadata(
    token: string,
    spreadsheetId: string
  ): Promise<GoogleSpreadsheetMetadata> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,spreadsheetUrl,sheets(properties(sheetId,title,index,gridProperties),charts.chartId)`;
    const res = await this.fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Sheets API getSpreadsheetMetadata failed: ${errText}`);
    }

    const data = (await res.json()) as any;
    return {
      spreadsheetId,
      title: data.properties?.title || '',
      spreadsheetUrl: data.spreadsheetUrl,
      sheets: (data.sheets || []).map((s: any) => ({
        sheetId: s.properties?.sheetId ?? 0,
        title: s.properties?.title || 'Sheet1',
        rowCount: s.properties?.gridProperties?.rowCount,
        columnCount: s.properties?.gridProperties?.columnCount,
        charts: s.charts || []
      }))
    };
  }

  /**
   * Writes values to a given range using USER_ENTERED (evaluates formulas like =ROW()-1 or =SUM).
   */
  public async writeValues(
    token: string,
    spreadsheetId: string,
    range: string,
    values: any[][],
    valueInputOption: 'USER_ENTERED' | 'RAW' = 'USER_ENTERED'
  ): Promise<any> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}?valueInputOption=${valueInputOption}`;
    const res = await this.fetchWithRetry(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Sheets API writeValues failed for range "${range}": ${errText}`);
    }

    return await res.json();
  }

  /**
   * Appends values to the end of a given range / table.
   */
  public async appendValues(
    token: string,
    spreadsheetId: string,
    range: string,
    values: any[][],
    valueInputOption: 'USER_ENTERED' | 'RAW' = 'USER_ENTERED'
  ): Promise<any> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}:append?valueInputOption=${valueInputOption}&insertDataOption=INSERT_ROWS`;
    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Sheets API appendValues failed for range "${range}": ${errText}`);
    }

    return await res.json();
  }

  /**
   * Clears all values within a given range or entire sheet tab.
   */
  public async clearValues(
    token: string,
    spreadsheetId: string,
    range: string
  ): Promise<any> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}:clear`;
    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Sheets API clearValues failed for range "${range}": ${errText}`);
    }

    return await res.json();
  }

  /**
   * Executes a batch of formatting / layout / chart requests.
   */
  public async batchUpdate(
    token: string,
    spreadsheetId: string,
    requests: any[]
  ): Promise<any> {
    if (!requests || requests.length === 0) return { replies: [] };

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Sheets API batchUpdate failed: ${errText}`);
    }

    return await res.json();
  }

  /**
   * Updates a single cell or small range with a new value or formula.
   */
  public async updateSingleCell(
    token: string,
    spreadsheetId: string,
    cell: string,
    value: any,
    sheetTitle?: string
  ): Promise<any> {
    const range = sheetTitle ? `'${sheetTitle}'!${cell}` : cell;
    return await this.writeValues(token, spreadsheetId, range, [[value]], 'USER_ENTERED');
  }

  /**
   * Ensures consistent locale and recalculation settings on an existing spreadsheet.
   * Critical for formula evaluation and number formatting consistency.
   * Prevents locale-dependent parsing issues (e.g. '.' vs ',' decimal separator).
   */
  public async ensureLocaleSettings(
    token: string,
    spreadsheetId: string,
    locale: string = 'en_US'
  ): Promise<void> {
    await this.batchUpdate(token, spreadsheetId, [{
      updateSpreadsheetProperties: {
        properties: {
          locale,
          autoRecalc: 'ON_CHANGE'
        },
        fields: 'locale,autoRecalc'
      }
    }]);
  }

  /**
   * Removes all embedded charts on a specific tab (or across all tabs if sheetId is undefined).
   */
  public async clearAndDeleteCharts(
    token: string,
    spreadsheetId: string,
    sheetId?: number
  ): Promise<void> {
    try {
      const metadata = await this.getSpreadsheetMetadata(token, spreadsheetId);
      const deleteChartRequests: any[] = [];

      for (const sheet of metadata.sheets) {
        if (sheetId !== undefined && sheet.sheetId !== sheetId) {
          continue;
        }

        if (sheet.charts && sheet.charts.length > 0) {
          for (const c of sheet.charts) {
            if (c.chartId !== undefined) {
              deleteChartRequests.push({
                deleteEmbeddedObject: {
                  objectId: c.chartId
                }
              });
            }
          }
        }
      }

      if (deleteChartRequests.length > 0) {
        await this.batchUpdate(token, spreadsheetId, deleteChartRequests);
      }
    } catch (err: any) {
      console.warn(`[GoogleSheetsService] Warning in clearAndDeleteCharts:`, err.message);
    }
  }

  /**
   * Ensures that a worksheet tab with sheetTitle exists in the workbook.
   * If it does not exist, creates it and returns the new sheetId.
   */
  public async ensureSheetExists(
    token: string,
    spreadsheetId: string,
    sheetTitle: string
  ): Promise<number> {
    const metadata = await this.getSpreadsheetMetadata(token, spreadsheetId);
    const existing = metadata.sheets.find(
      (s) => s.title.toLowerCase() === sheetTitle.toLowerCase()
    );

    if (existing) {
      return existing.sheetId;
    }

    const res = await this.batchUpdate(token, spreadsheetId, [
      {
        addSheet: {
          properties: {
            title: sheetTitle
          }
        }
      }
    ]);

    const addSheetReply = res.replies?.[0]?.addSheet;
    const newSheetId = addSheetReply?.properties?.sheetId ?? 0;
    return newSheetId;
  }
}
