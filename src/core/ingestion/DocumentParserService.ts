import ExcelJS from 'exceljs';

export interface ParsedDocumentResult {
  filename: string;
  mimeType: string;
  detectedType: 'SHOPEE_ORDER' | 'TOKOPEDIA_ORDER' | 'BANK_STATEMENT' | 'CRYPTO_TRADES' | 'TABULAR_DATA' | 'PLAIN_TEXT' | 'JSON_DATA';
  sheetCount: number;
  totalRows: number;
  headers: string[];
  sampleRows: any[][];
  allRows?: any[][];
  summaryMetrics?: Record<string, any>;
  formattedMarkdownTable: string;
}

export class DocumentParserService {
  /**
   * Main entrypoint: Parses raw file buffer or string into structured document analytics.
   */
  public static async parseDocument(
    bufferOrText: Buffer | string,
    filename: string = 'document.csv',
    mimeType: string = 'text/csv'
  ): Promise<ParsedDocumentResult> {
    const ext = filename.toLowerCase().split('.').pop() || '';
    const isExcel = ext === 'xlsx' || ext === 'xls' || mimeType.includes('spreadsheet') || mimeType.includes('excel');
    const isJson = ext === 'json' || mimeType.includes('json');
    const isCsv = ext === 'csv' || mimeType.includes('csv');

    if (isExcel) {
      const buffer = Buffer.isBuffer(bufferOrText) ? bufferOrText : Buffer.from(bufferOrText, 'base64');
      return this.parseExcelBuffer(buffer, filename, mimeType);
    }

    const textContent = typeof bufferOrText === 'string' ? bufferOrText : bufferOrText.toString('utf-8');

    if (isJson) {
      return this.parseJsonText(textContent, filename, mimeType);
    }

    if (isCsv || this.looksLikeDelimited(textContent)) {
      return this.parseCsvText(textContent, filename, mimeType);
    }

    return this.parsePlainText(textContent, filename, mimeType);
  }

  /**
   * Parses Excel (.xlsx/.xls) workbook buffer.
   */
  private static async parseExcelBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<ParsedDocumentResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return {
        filename,
        mimeType,
        detectedType: 'TABULAR_DATA',
        sheetCount: 0,
        totalRows: 0,
        headers: [],
        sampleRows: [],
        formattedMarkdownTable: '_Empty Excel file._'
      };
    }

    const rawRows: any[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const rowValues = (row.values as any[]).slice(1); // ExcelJS uses 1-based indexing for values
      rawRows.push(rowValues.map(v => (v !== null && v !== undefined ? (typeof v === 'object' && v.result !== undefined ? v.result : (typeof v === 'object' && v.text !== undefined ? v.text : v)) : '')));
    });

    if (rawRows.length === 0) {
      return {
        filename,
        mimeType,
        detectedType: 'TABULAR_DATA',
        sheetCount: workbook.worksheets.length,
        totalRows: 0,
        headers: [],
        sampleRows: [],
        formattedMarkdownTable: '_Empty Excel Sheet._'
      };
    }

    const headers = rawRows[0].map(h => String(h || '').trim());
    const dataRows = rawRows.slice(1);

    return this.buildResultFromTable(filename, mimeType, workbook.worksheets.length, headers, dataRows);
  }

  /**
   * Parses CSV string with intelligent delimiter autodetection (comma, semicolon, tab).
   */
  private static parseCsvText(
    csvText: string,
    filename: string,
    mimeType: string
  ): ParsedDocumentResult {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      return {
        filename,
        mimeType,
        detectedType: 'TABULAR_DATA',
        sheetCount: 1,
        totalRows: 0,
        headers: [],
        sampleRows: [],
        formattedMarkdownTable: '_Empty CSV file._'
      };
    }

    // Delimiter heuristic: check frequency in first line
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;

    let delimiter = ',';
    if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
    else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

    const parsedRows = lines.map(line => this.parseCsvLine(line, delimiter));
    const headers = parsedRows[0].map(h => String(h || '').trim());
    const dataRows = parsedRows.slice(1);

    return this.buildResultFromTable(filename, mimeType, 1, headers, dataRows);
  }

  /**
   * Splits a single CSV line honoring quotes.
   */
  private static parseCsvLine(line: string, delimiter: string): string[] {
    const values: string[] = [];
    let curVal = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        values.push(curVal.trim().replace(/^["']|["']$/g, ''));
        curVal = '';
      } else {
        curVal += char;
      }
    }
    values.push(curVal.trim().replace(/^["']|["']$/g, ''));
    return values;
  }

  /**
   * Parses JSON string (either array of objects or key-value structures).
   */
  private static parseJsonText(
    jsonText: string,
    filename: string,
    mimeType: string
  ): ParsedDocumentResult {
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
        const headers = Array.from(new Set(parsed.flatMap(obj => Object.keys(obj))));
        const rows = parsed.map(obj => headers.map(h => obj[h] !== undefined ? obj[h] : ''));
        return this.buildResultFromTable(filename, mimeType, 1, headers, rows);
      }
      return {
        filename,
        mimeType,
        detectedType: 'JSON_DATA',
        sheetCount: 1,
        totalRows: typeof parsed === 'object' ? Object.keys(parsed).length : 1,
        headers: ['Key', 'Value'],
        sampleRows: typeof parsed === 'object' ? Object.entries(parsed).slice(0, 10) : [['Data', JSON.stringify(parsed)]],
        formattedMarkdownTable: `\`\`\`json\n${JSON.stringify(parsed, null, 2).substring(0, 1500)}\n\`\`\``
      };
    } catch {
      return this.parsePlainText(jsonText, filename, mimeType);
    }
  }

  /**
   * Parses unstructured plain text / markdown.
   */
  private static parsePlainText(
    text: string,
    filename: string,
    mimeType: string
  ): ParsedDocumentResult {
    const lines = text.split(/\r?\n/);
    const snippet = lines.slice(0, 40).join('\n');
    return {
      filename,
      mimeType,
      detectedType: 'PLAIN_TEXT',
      sheetCount: 1,
      totalRows: lines.length,
      headers: ['Content'],
      sampleRows: lines.slice(0, 10).map(l => [l]),
      formattedMarkdownTable: `[Text Document Preview: ${filename}]\n${snippet.substring(0, 2000)}`
    };
  }

  /**
   * Analyzes headers and rows to detect template type (Shopee, Tokopedia, Bank, Trading, Generic)
   * and calculates key metrics.
   */
  private static buildResultFromTable(
    filename: string,
    mimeType: string,
    sheetCount: number,
    headers: string[],
    dataRows: any[][]
  ): ParsedDocumentResult {
    const lowerHeaders = headers.map(h => h.toLowerCase());
    let detectedType: ParsedDocumentResult['detectedType'] = 'TABULAR_DATA';
    const summaryMetrics: Record<string, any> = {
      totalRows: dataRows.length
    };

    // 1. Check Shopee Order / Settlement Export
    const isShopee = lowerHeaders.some(h => h.includes('no. pesanan') || h.includes('nomor pesanan') || h.includes('order id') || h.includes('order sn')) &&
      lowerHeaders.some(h => h.includes('total penghasilan') || h.includes('biaya') || h.includes('penjualan') || h.includes('sku') || h.includes('shopee'));

    if (isShopee) {
      detectedType = 'SHOPEE_ORDER';
      summaryMetrics.marketplace = 'Shopee';
      this.calculateMarketplaceMetrics(headers, dataRows, summaryMetrics);
    }

    // 2. Check Tokopedia / TikTok Shop Export
    const isTokopedia = lowerHeaders.some(h => h.includes('nomor invoice') || h.includes('no invoice') || h.includes('tokopedia') || h.includes('tiktok'));
    if (!isShopee && isTokopedia) {
      detectedType = 'TOKOPEDIA_ORDER';
      summaryMetrics.marketplace = 'Tokopedia/TikTok Shop';
      this.calculateMarketplaceMetrics(headers, dataRows, summaryMetrics);
    }

    // 3. Check Bank Statement / Mutation
    const isBank = (lowerHeaders.includes('debit') && lowerHeaders.includes('kredit')) ||
      (lowerHeaders.includes('debet') && lowerHeaders.includes('kredit')) ||
      (lowerHeaders.some(h => h.includes('saldo') || h.includes('balance')) && lowerHeaders.some(h => h.includes('keterangan') || h.includes('uraian') || h.includes('deskripsi')));

    if (!isShopee && !isTokopedia && isBank) {
      detectedType = 'BANK_STATEMENT';
      this.calculateBankMetrics(headers, dataRows, summaryMetrics);
    }

    // 4. Check Crypto Trading History
    const isCrypto = lowerHeaders.some(h => h.includes('symbol') || h.includes('coin') || h.includes('token') || h.includes('pair')) &&
      lowerHeaders.some(h => h.includes('side') || h.includes('buy/sell') || h.includes('pnl') || h.includes('fee'));

    if (!isShopee && !isTokopedia && !isBank && isCrypto) {
      detectedType = 'CRYPTO_TRADES';
      this.calculateCryptoMetrics(headers, dataRows, summaryMetrics);
    }

    // Build concise Markdown table for display/dialogue (max 10 sample rows)
    const sampleRows = dataRows.slice(0, 10);
    const mdTable = this.renderMarkdownTable(headers, sampleRows, dataRows.length);

    return {
      filename,
      mimeType,
      detectedType,
      sheetCount,
      totalRows: dataRows.length,
      headers,
      sampleRows,
      allRows: dataRows,
      summaryMetrics,
      formattedMarkdownTable: mdTable
    };
  }

  private static calculateMarketplaceMetrics(headers: string[], rows: any[][], metrics: Record<string, any>): void {
    let totalGross = 0;
    let totalNet = 0;
    let totalFees = 0;
    let completedCount = 0;
    let cancelledCount = 0;

    const grossIdx = headers.findIndex(h => /total (pembayaran|penghasilan|pesanan|harga|penjualan)/i.test(h));
    const feeIdx = headers.findIndex(h => /biaya (layanan|administrasi|transaksi|admin)/i.test(h));
    const statusIdx = headers.findIndex(h => /status/i.test(h));

    for (const row of rows) {
      if (grossIdx >= 0 && row[grossIdx]) {
        const val = this.cleanNumeric(row[grossIdx]);
        totalGross += val;
      }
      if (feeIdx >= 0 && row[feeIdx]) {
        const val = this.cleanNumeric(row[feeIdx]);
        totalFees += val;
      }
      if (statusIdx >= 0 && row[statusIdx]) {
        const s = String(row[statusIdx]).toLowerCase();
        if (s.includes('selesai') || s.includes('completed') || s.includes('delivered') || s.includes('terkirim')) completedCount++;
        if (s.includes('batal') || s.includes('cancel') || s.includes('gagal')) cancelledCount++;
      }
    }

    totalNet = totalGross > 0 && totalFees > 0 ? (totalGross - totalFees) : totalGross;

    metrics.totalOrders = rows.length;
    metrics.completedOrders = completedCount || rows.length;
    metrics.cancelledOrders = cancelledCount;
    if (totalGross > 0) metrics.grossRevenue = `Rp ${totalGross.toLocaleString('id-ID')}`;
    if (totalFees > 0) metrics.platformFees = `Rp ${totalFees.toLocaleString('id-ID')}`;
    if (totalNet > 0) metrics.netPayout = `Rp ${totalNet.toLocaleString('id-ID')}`;
  }

  private static calculateBankMetrics(headers: string[], rows: any[][], metrics: Record<string, any>): void {
    let totalDebit = 0;
    let totalKredit = 0;

    const debitIdx = headers.findIndex(h => /^deb(it|et)/i.test(h) || h.toLowerCase().includes('keluar'));
    const kreditIdx = headers.findIndex(h => /^kredit/i.test(h) || h.toLowerCase().includes('masuk'));

    for (const row of rows) {
      if (debitIdx >= 0 && row[debitIdx]) totalDebit += this.cleanNumeric(row[debitIdx]);
      if (kreditIdx >= 0 && row[kreditIdx]) totalKredit += this.cleanNumeric(row[kreditIdx]);
    }

    metrics.totalTransactions = rows.length;
    if (totalKredit > 0) metrics.totalInflow = `Rp ${totalKredit.toLocaleString('id-ID')}`;
    if (totalDebit > 0) metrics.totalOutflow = `Rp ${totalDebit.toLocaleString('id-ID')}`;
    metrics.netCashFlow = `Rp ${(totalKredit - totalDebit).toLocaleString('id-ID')}`;
  }

  private static calculateCryptoMetrics(headers: string[], rows: any[][], metrics: Record<string, any>): void {
    let totalPnl = 0;
    let totalFee = 0;

    const pnlIdx = headers.findIndex(h => /pnl|profit|realized/i.test(h));
    const feeIdx = headers.findIndex(h => /fee|commission/i.test(h));

    for (const row of rows) {
      if (pnlIdx >= 0 && row[pnlIdx]) totalPnl += this.cleanNumeric(row[pnlIdx]);
      if (feeIdx >= 0 && row[feeIdx]) totalFee += this.cleanNumeric(row[feeIdx]);
    }

    metrics.totalTrades = rows.length;
    metrics.totalPnl = `$${totalPnl.toFixed(2)}`;
    if (totalFee > 0) metrics.totalFees = `$${totalFee.toFixed(2)}`;
  }

  private static cleanNumeric(val: any): number {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const str = String(val)
      .replace(/[Rp$€£¥\s]/g, '')
      .replace(/\./g, '') // Indonesian thousand dots: 100.000 -> 100000
      .replace(/,/g, '.'); // Indonesian decimal comma: 10,50 -> 10.50
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }

  private static renderMarkdownTable(headers: string[], sampleRows: any[][], totalRows: number): string {
    if (headers.length === 0) return '_No tabular headers detected._';

    const headerLine = `| ${headers.join(' | ')} |`;
    const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
    const rowLines = sampleRows.map(row => `| ${headers.map((_, i) => String(row[i] !== undefined && row[i] !== null ? row[i] : '')).join(' | ')} |`);

    let result = `${headerLine}\n${separatorLine}\n${rowLines.join('\n')}`;
    if (totalRows > sampleRows.length) {
      result += `\n\n_... showing 10 of ${totalRows} total rows._`;
    }
    return result;
  }

  private static looksLikeDelimited(text: string): boolean {
    const firstFewLines = text.split(/\r?\n/).slice(0, 3).filter(l => l.trim().length > 0);
    if (firstFewLines.length < 1) return false;
    const first = firstFewLines[0];
    return first.includes(',') || first.includes(';') || first.includes('\t');
  }
}
