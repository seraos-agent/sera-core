import ExcelJS from 'exceljs';

export type ChartType = 'COLUMN' | 'BAR' | 'LINE' | 'PIE' | 'AREA';

export interface ChartPosition {
  anchorCell?: string;   // e.g. "G2" or cell address
  widthPixels?: number;  // default 600
  heightPixels?: number; // default 380
}

export interface ChartDefinition {
  title?: string;
  type: ChartType;
  categoryColumn?: number; // 0-indexed column for X-axis / labels (default: 0)
  valueColumns?: number[];  // 0-indexed column(s) for Y-axis / series values (default: inferred numeric columns)
  position?: ChartPosition;
}

export interface SpreadsheetOptions {
  sheetName?: string;
  themeColor?: string; // Header background hex without # (default: '0F172A')
  includeSummaryRow?: boolean; // If true, adds a SUM total row for numeric columns
  chart?: ChartDefinition;     // Optional native chart configuration
}

export interface SheetDefinition {
  name: string;
  headers: string[];
  rows: any[][];
  options?: SpreadsheetOptions;
}

export type SupportedCurrency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'SGD' | 'MYR' | 'IDR' | 'GENERIC';

export interface ColumnInference {
  type: 'currency' | 'percentage' | 'number' | 'date' | 'boolean' | 'formula' | 'status' | 'text';
  currency?: SupportedCurrency;
  numFmt?: string;
}

export class SpreadsheetEngine {
  private static readonly DEFAULT_HEADER_COLOR = '0F172A'; // Slate 900 / Dark Navy
  private static readonly ZEBRA_ROW_COLOR = 'F8FAFC';     // Slate 50
  private static readonly SUMMARY_ROW_COLOR = 'F1F5F9';   // Slate 100
  private static readonly BORDER_COLOR = 'CBD5E1';        // Slate 300

  // Status Badge Color Definitions (Universal English Standard)
  private static readonly STATUS_STYLES: Record<string, { bg: string; font: string }> = {
    // Success / Completed / Positive
    completed: { bg: 'DCFCE7', font: '15803D' },
    success: { bg: 'DCFCE7', font: '15803D' },
    done: { bg: 'DCFCE7', font: '15803D' },
    active: { bg: 'DCFCE7', font: '15803D' },
    approved: { bg: 'DCFCE7', font: '15803D' },
    paid: { bg: 'DCFCE7', font: '15803D' },
    profit: { bg: 'DCFCE7', font: '15803D' },
    win: { bg: 'DCFCE7', font: '15803D' },

    // Warning / Pending / In Progress
    pending: { bg: 'FEF3C7', font: 'B45309' },
    'in progress': { bg: 'FEF3C7', font: 'B45309' },
    in_progress: { bg: 'FEF3C7', font: 'B45309' },
    processing: { bg: 'FEF3C7', font: 'B45309' },
    review: { bg: 'FEF3C7', font: 'B45309' },
    waiting: { bg: 'FEF3C7', font: 'B45309' },
    hold: { bg: 'FEF3C7', font: 'B45309' },
    draft: { bg: 'FEF3C7', font: 'B45309' },

    // Danger / Rejected / Failed
    failed: { bg: 'FEE2E2', font: 'B91C1C' },
    rejected: { bg: 'FEE2E2', font: 'B91C1C' },
    canceled: { bg: 'FEE2E2', font: 'B91C1C' },
    cancelled: { bg: 'FEE2E2', font: 'B91C1C' },
    loss: { bg: 'FEE2E2', font: 'B91C1C' },
    error: { bg: 'FEE2E2', font: 'B91C1C' },
    overdue: { bg: 'FEE2E2', font: 'B91C1C' }
  };

  /**
   * Generates a styled .xlsx buffer from headers and row data.
   */
  public static async generateWorkbook(
    title: string,
    headers: string[],
    rows: any[][],
    options?: SpreadsheetOptions
  ): Promise<Buffer> {
    const sheetDef: SheetDefinition = {
      name: options?.sheetName || this.sanitizeSheetName(title),
      headers,
      rows,
      options
    };
    return this.generateMultiSheetWorkbook([sheetDef]);
  }

  /**
   * Generates a multi-sheet .xlsx workbook buffer.
   */
  public static async generateMultiSheetWorkbook(sheets: SheetDefinition[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SERA OS Cognitive Runtime';
    workbook.lastModifiedBy = 'SERA Agent';
    workbook.created = new Date();
    workbook.modified = new Date();

    for (const sheetDef of sheets) {
      const sheetName = this.sanitizeSheetName(sheetDef.name || 'Sheet1');
      const worksheet = workbook.addWorksheet(sheetName, {
        views: [
          {
            state: 'frozen',
            ySplit: 1, // Auto-freeze header row
            showGridLines: true
          }
        ]
      });

      this.populateWorksheet(worksheet, sheetDef);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private static populateWorksheet(worksheet: ExcelJS.Worksheet, def: SheetDefinition): void {
    const { headers, rows, options } = def;
    const headerColor = options?.themeColor || this.DEFAULT_HEADER_COLOR;

    if (!headers || headers.length === 0) return;

    // 1. Add Header Row
    const headerRow = worksheet.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${headerColor}` }
      };
      cell.font = {
        name: 'Segoe UI',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true
      };
      cell.border = {
        top: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } },
        left: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } }
      };
    });

    // Determine column types & currency formats based on headers & data
    const columnInferences = this.inferColumnInferences(headers, rows);

    // 2. Add Data Rows
    rows.forEach((rowValues, rowIndex) => {
      const row = worksheet.addRow([]);
      row.height = 22;
      const isZebra = rowIndex % 2 === 1;

      headers.forEach((_, colIndex) => {
        const rawVal = rowValues[colIndex] !== undefined ? rowValues[colIndex] : '';
        const cell = row.getCell(colIndex + 1);
        const colInf = columnInferences[colIndex];

        // Format and assign value
        const statusStyle = this.setFormattedCellValue(cell, rawVal, colInf);

        // Styling
        if (statusStyle) {
          // Status Pill Badge Styling
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: `FF${statusStyle.bg}` }
          };
          cell.font = {
            name: 'Segoe UI',
            size: 10,
            bold: true,
            color: { argb: `FF${statusStyle.font}` }
          };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isZebra ? `FF${this.ZEBRA_ROW_COLOR}` : 'FFFFFFFF' }
          };
          cell.font = {
            name: 'Segoe UI',
            size: 10.5,
            color: { argb: 'FF1E293B' }
          };

          // Alignments
          if (colInf.type === 'currency' || colInf.type === 'number' || colInf.type === 'percentage') {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else if (colInf.type === 'date' || colInf.type === 'boolean') {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          }
        }

        cell.border = {
          top: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } },
          left: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } },
          bottom: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } },
          right: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } }
        };
      });
    });

    // 3. Optional Summary / Total Row
    const shouldAddSummary = options?.includeSummaryRow || (
      options?.includeSummaryRow === undefined &&
      rows.length > 1 &&
      columnInferences.some((t) => t.type === 'currency' || t.type === 'number')
    );

    if (shouldAddSummary && rows.length > 0) {
      const summaryRow = worksheet.addRow([]);
      summaryRow.height = 24;
      const firstDataRowNum = 2;
      const lastDataRowNum = rows.length + 1;

      headers.forEach((_, colIndex) => {
        const cell = summaryRow.getCell(colIndex + 1);
        const colInf = columnInferences[colIndex];
        const colLetter = this.getColumnLetter(colIndex + 1);

        if (colIndex === 0) {
          cell.value = 'Total';
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (colInf.type === 'currency' || colInf.type === 'number') {
          cell.value = { formula: `SUM(${colLetter}${firstDataRowNum}:${colLetter}${lastDataRowNum})` };
          cell.numFmt = colInf.numFmt || '#,##0.00';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (colInf.type === 'percentage') {
          cell.value = { formula: `AVERAGE(${colLetter}${firstDataRowNum}:${colLetter}${lastDataRowNum})` };
          cell.numFmt = '0.0%';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
          cell.value = '';
        }

        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${this.SUMMARY_ROW_COLOR}` }
        };
        cell.font = {
          name: 'Segoe UI',
          size: 11,
          bold: true,
          color: { argb: 'FF0F172A' }
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
          right: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } }
        };
      });
    }

    // 4. Auto-fit column widths
    worksheet.columns.forEach((column, colIndex) => {
      let maxLen = (headers[colIndex] || '').toString().length;
      rows.forEach((row) => {
        const cellVal = row[colIndex] !== undefined && row[colIndex] !== null ? String(row[colIndex]) : '';
        if (cellVal.length > maxLen) {
          maxLen = cellVal.length;
        }
      });
      // Add comfortable padding, clamp between 13 and 55
      column.width = Math.max(13, Math.min(55, maxLen + 4));
    });
  }

  private static setFormattedCellValue(
    cell: ExcelJS.Cell,
    rawVal: any,
    colInf: ColumnInference
  ): { bg: string; font: string } | null {
    if (rawVal === null || rawVal === undefined || rawVal === '') {
      cell.value = '';
      return null;
    }

    const strVal = String(rawVal).trim();

    // 1. Explicit Formula starting with '='
    if (strVal.startsWith('=')) {
      cell.value = { formula: strVal.substring(1) };
      return null;
    }

    // 2. Status Badge Detection
    if (colInf.type === 'status') {
      const lower = strVal.toLowerCase();
      cell.value = strVal;
      const match = this.STATUS_STYLES[lower];
      if (match) return match;
      return null;
    }

    // 3. Currency with Multi-Currency Formatting
    if (colInf.type === 'currency') {
      const numeric = typeof rawVal === 'number'
        ? rawVal
        : parseFloat(strVal.replace(/[^0-9.-]+/g, ''));
      if (!isNaN(numeric)) {
        cell.value = numeric;
        cell.numFmt = this.resolveCellCurrencyFormat(strVal, colInf);
        return null;
      }
    }

    // 4. Percentage
    if (colInf.type === 'percentage') {
      const numeric = typeof rawVal === 'number'
        ? rawVal
        : parseFloat(strVal.replace(/%/g, '').trim()) / (strVal.includes('%') ? 100 : 1);
      if (!isNaN(numeric)) {
        cell.value = numeric;
        cell.numFmt = '0.0%';
        return null;
      }
    }

    // 5. Number
    if (colInf.type === 'number') {
      const numeric = typeof rawVal === 'number'
        ? rawVal
        : parseFloat(strVal.replace(/,/g, ''));
      if (!isNaN(numeric)) {
        cell.value = numeric;
        cell.numFmt = Number.isInteger(numeric) ? '#,##0' : '#,##0.00';
        return null;
      }
    }

    // 6. Date
    if (colInf.type === 'date') {
      const parsedDate = new Date(rawVal);
      if (!isNaN(parsedDate.getTime())) {
        cell.value = parsedDate;
        cell.numFmt = 'YYYY-MM-DD';
        return null;
      }
    }

    // 7. Boolean
    if (colInf.type === 'boolean') {
      cell.value = (strVal.toLowerCase() === 'true' || strVal === '1' || strVal.toLowerCase() === 'yes');
      return null;
    }

    // Default: Check if standalone value matches a status
    const statusMatch = this.STATUS_STYLES[strVal.toLowerCase()];
    if (statusMatch) {
      cell.value = strVal;
      return statusMatch;
    }

    cell.value = strVal;
    return null;
  }

  private static resolveCellCurrencyFormat(cellStr: string, colInf: ColumnInference): string {
    const s = cellStr.toUpperCase();
    if (s.includes('₹') || s.includes('INR')) return '₹#,##0.00';
    if (s.includes('€') || s.includes('EUR')) return '€#,##0.00';
    if (s.includes('£') || s.includes('GBP')) return '£#,##0.00';
    if (s.includes('¥') || s.includes('JPY')) return '¥#,##0';
    if (s.includes('S$') || s.includes('SGD')) return 'S$#,##0.00';
    if (s.includes('RM') || s.includes('MYR')) return 'RM #,##0.00';
    if (s.includes('RP') || s.includes('IDR')) return 'Rp #,##0';
    if (s.includes('$') || s.includes('USD')) return '$#,##0.00';

    return colInf.numFmt || '$#,##0.00';
  }

  private static inferColumnInferences(headers: string[], rows: any[][]): ColumnInference[] {
    return headers.map((header, colIndex) => {
      const lowerHeader = header.toLowerCase();

      // Check Status
      if (lowerHeader.includes('status') || lowerHeader.includes('state')) {
        return { type: 'status' };
      }

      // Check Specific Currencies from Header
      if (lowerHeader.includes('₹') || lowerHeader.includes('inr') || lowerHeader.includes('rupee')) {
        return { type: 'currency', currency: 'INR', numFmt: '₹#,##0.00' };
      }
      if (lowerHeader.includes('€') || lowerHeader.includes('eur') || lowerHeader.includes('euro')) {
        return { type: 'currency', currency: 'EUR', numFmt: '€#,##0.00' };
      }
      if (lowerHeader.includes('£') || lowerHeader.includes('gbp') || lowerHeader.includes('pound')) {
        return { type: 'currency', currency: 'GBP', numFmt: '£#,##0.00' };
      }
      if (lowerHeader.includes('¥') || lowerHeader.includes('jpy') || lowerHeader.includes('yen')) {
        return { type: 'currency', currency: 'JPY', numFmt: '¥#,##0' };
      }
      if (lowerHeader.includes('s$') || lowerHeader.includes('sgd')) {
        return { type: 'currency', currency: 'SGD', numFmt: 'S$#,##0.00' };
      }
      if (lowerHeader.includes('rm') || lowerHeader.includes('myr') || lowerHeader.includes('ringgit')) {
        return { type: 'currency', currency: 'MYR', numFmt: 'RM #,##0.00' };
      }
      if (lowerHeader.includes('rp') || lowerHeader.includes('idr') || lowerHeader.includes('rupiah')) {
        return { type: 'currency', currency: 'IDR', numFmt: 'Rp #,##0' };
      }
      if (lowerHeader.includes('$') || lowerHeader.includes('usd') || lowerHeader.includes('usdc')) {
        return { type: 'currency', currency: 'USD', numFmt: '$#,##0.00' };
      }

      // 2. First check data rows for any explicit currency symbols (€, £, ¥, ₹, S$, RM, Rp, $)
      for (const row of rows) {
        const val = String(row[colIndex] || '').toUpperCase();
        if (val.includes('₹') || val.includes('INR')) return { type: 'currency', currency: 'INR', numFmt: '₹#,##0.00' };
        if (val.includes('€') || val.includes('EUR')) return { type: 'currency', currency: 'EUR', numFmt: '€#,##0.00' };
        if (val.includes('£') || val.includes('GBP')) return { type: 'currency', currency: 'GBP', numFmt: '£#,##0.00' };
        if (val.includes('¥') || val.includes('JPY')) return { type: 'currency', currency: 'JPY', numFmt: '¥#,##0' };
        if (val.includes('S$') || val.includes('SGD')) return { type: 'currency', currency: 'SGD', numFmt: 'S$#,##0.00' };
        if (val.includes('RM') || val.includes('MYR')) return { type: 'currency', currency: 'MYR', numFmt: 'RM #,##0.00' };
        if (val.includes('RP') || val.includes('IDR')) return { type: 'currency', currency: 'IDR', numFmt: 'Rp #,##0' };
        if (val.includes('$') || val.includes('USD')) return { type: 'currency', currency: 'USD', numFmt: '$#,##0.00' };
      }

      // 3. Generic currency keywords (Price, Amount, Cost, Expense, Revenue, Balance, Total)
      if (
        lowerHeader.includes('price') ||
        lowerHeader.includes('cost') ||
        lowerHeader.includes('amount') ||
        lowerHeader.includes('revenue') ||
        lowerHeader.includes('expense') ||
        lowerHeader.includes('balance') ||
        lowerHeader.includes('nominal') ||
        lowerHeader.includes('total') ||
        lowerHeader.includes('fee') ||
        lowerHeader.includes('retainer')
      ) {
        return { type: 'currency', currency: 'USD', numFmt: '$#,##0.00' };
      }

      if (lowerHeader.includes('percent') || lowerHeader.includes('%') || lowerHeader.includes('pnl') || lowerHeader.includes('percentage')) {
        return { type: 'percentage' };
      }

      if (lowerHeader.includes('rate') && !lowerHeader.includes('currency')) {
        // If header has rate (like win rate, conversion rate)
        return { type: 'percentage' };
      }

      if (lowerHeader.includes('date') || lowerHeader.includes('time')) {
        return { type: 'date' };
      }

      if (lowerHeader.includes('qty') || lowerHeader.includes('quantity') || lowerHeader.includes('count')) {
        return { type: 'number', numFmt: '#,##0' };
      }

      // Sample data rows to infer
      for (const row of rows) {
        const val = row[colIndex];
        if (val !== undefined && val !== null && val !== '') {
          const str = String(val).trim();
          if (str.startsWith('=')) return { type: 'formula' };
          if (str.includes('₹') || str.includes('INR')) return { type: 'currency', currency: 'INR', numFmt: '₹#,##0.00' };
          if (str.includes('€') || str.includes('EUR')) return { type: 'currency', currency: 'EUR', numFmt: '€#,##0.00' };
          if (str.includes('£') || str.includes('GBP')) return { type: 'currency', currency: 'GBP', numFmt: '£#,##0.00' };
          if (str.includes('¥') || str.includes('JPY')) return { type: 'currency', currency: 'JPY', numFmt: '¥#,##0' };
          if (str.includes('S$') || str.includes('SGD')) return { type: 'currency', currency: 'SGD', numFmt: 'S$#,##0.00' };
          if (str.includes('RM') || str.includes('MYR')) return { type: 'currency', currency: 'MYR', numFmt: 'RM #,##0.00' };
          if (str.includes('Rp') || str.includes('IDR')) return { type: 'currency', currency: 'IDR', numFmt: 'Rp #,##0' };
          if (str.includes('$') || str.includes('USD')) return { type: 'currency', currency: 'USD', numFmt: '$#,##0.00' };
          if (str.endsWith('%')) return { type: 'percentage' };
          if (typeof val === 'number' || (!isNaN(Number(str)) && str !== '')) return { type: 'number', numFmt: '#,##0.00' };
        }
      }

      return { type: 'text' };
    });
  }

  private static sanitizeSheetName(name: string): string {
    // Excel sheet names cannot contain: \ / ? * : [ ] and max 31 chars
    return (name || 'Sheet1')
      .replace(/[\\/?*:\[\]]/g, '_')
      .trim()
      .substring(0, 31) || 'Sheet1';
  }

  private static getColumnLetter(colNum: number): string {
    let letter = '';
    while (colNum > 0) {
      const rem = (colNum - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      colNum = Math.floor((colNum - 1) / 26);
    }
    return letter;
  }

  /**
   * Translates a cell address (e.g. "G2") to 0-indexed { rowIndex, columnIndex }.
   */
  public static parseCellAddress(address: string = 'G2'): { rowIndex: number; columnIndex: number } {
    const match = address.toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!match) return { rowIndex: 1, columnIndex: 6 };
    const colStr = match[1];
    const rowNum = parseInt(match[2], 10);
    let colIndex = 0;
    for (let i = 0; i < colStr.length; i++) {
      colIndex = colIndex * 26 + (colStr.charCodeAt(i) - 64);
    }
    return {
      rowIndex: Math.max(0, rowNum - 1),
      columnIndex: Math.max(0, colIndex - 1)
    };
  }

  /**
   * Generates a Google Sheets AddChartRequest payload from a ChartDefinition.
   */
  public static buildGoogleSheetsChartRequest(
    sheetId: number,
    numRows: number,
    headers: string[],
    rows: any[][],
    chartDef: ChartDefinition
  ): any {
    const catCol = chartDef.categoryColumn !== undefined ? chartDef.categoryColumn : 0;
    
    // Determine value columns
    let valCols = chartDef.valueColumns;
    if (!valCols || valCols.length === 0) {
      const inferences = this.inferColumnInferences(headers, rows);
      valCols = [];
      inferences.forEach((inf, idx) => {
        if (idx !== catCol && (inf.type === 'currency' || inf.type === 'number' || inf.type === 'percentage')) {
          valCols!.push(idx);
        }
      });
      if (valCols.length === 0) {
        valCols = [headers.length > 1 ? 1 : 0];
      }
    }

    const { rowIndex: anchorRow, columnIndex: anchorCol } = this.parseCellAddress(chartDef.position?.anchorCell || 'G2');
    const widthPixels = chartDef.position?.widthPixels || 600;
    const heightPixels = chartDef.position?.heightPixels || 380;
    const endRow = Math.max(1, numRows + 1);

    if (chartDef.type === 'PIE') {
      return {
        addChart: {
          chart: {
            spec: {
              title: chartDef.title || 'Distribution Overview',
              pieChart: {
                legendPosition: 'RIGHT_LEGEND',
                domain: {
                  sourceRange: {
                    sources: [{
                      sheetId,
                      startRowIndex: 0,
                      endRowIndex: endRow,
                      startColumnIndex: catCol,
                      endColumnIndex: catCol + 1
                    }]
                  }
                },
                series: {
                  sourceRange: {
                    sources: [{
                      sheetId,
                      startRowIndex: 0,
                      endRowIndex: endRow,
                      startColumnIndex: valCols[0],
                      endColumnIndex: valCols[0] + 1
                    }]
                  }
                },
                threeDimensional: false
              }
            },
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId,
                  rowIndex: anchorRow,
                  columnIndex: anchorCol
                },
                widthPixels,
                heightPixels
              }
            }
          }
        }
      };
    }

    const chartType = chartDef.type === 'COLUMN' ? 'COLUMN' :
      (chartDef.type === 'BAR' ? 'BAR' :
      (chartDef.type === 'LINE' ? 'LINE' : 'AREA'));

    return {
      addChart: {
        chart: {
          spec: {
            title: chartDef.title || 'Analytics Overview',
            basicChart: {
              chartType,
              legendPosition: 'BOTTOM_LEGEND',
              headerCount: 1,
              domains: [{
                domain: {
                  sourceRange: {
                    sources: [{
                      sheetId,
                      startRowIndex: 0,
                      endRowIndex: endRow,
                      startColumnIndex: catCol,
                      endColumnIndex: catCol + 1
                    }]
                  }
                }
              }],
              series: valCols.map(vc => ({
                series: {
                  sourceRange: {
                    sources: [{
                      sheetId,
                      startRowIndex: 0,
                      endRowIndex: endRow,
                      startColumnIndex: vc,
                      endColumnIndex: vc + 1
                    }]
                  }
                },
                targetAxis: 'LEFT_AXIS'
              }))
            }
          },
          position: {
            overlayPosition: {
              anchorCell: {
                sheetId,
                rowIndex: anchorRow,
                columnIndex: anchorCol
              },
              widthPixels,
              heightPixels
            }
          }
        }
      }
    };
  }
}
