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

  // Status Badge Color Definitions (Universal English & Indonesian Synonyms)
  private static readonly STATUS_STYLES: Record<string, { bg: string; font: string }> = {
    // Green (Success / Completed / Positive / Active)
    completed: { bg: 'DCFCE7', font: '15803D' },
    complete: { bg: 'DCFCE7', font: '15803D' },
    success: { bg: 'DCFCE7', font: '15803D' },
    successful: { bg: 'DCFCE7', font: '15803D' },
    paid: { bg: 'DCFCE7', font: '15803D' },
    approved: { bg: 'DCFCE7', font: '15803D' },
    done: { bg: 'DCFCE7', font: '15803D' },
    active: { bg: 'DCFCE7', font: '15803D' },
    profit: { bg: 'DCFCE7', font: '15803D' },
    win: { bg: 'DCFCE7', font: '15803D' },
    lunas: { bg: 'DCFCE7', font: '15803D' },
    selesai: { bg: 'DCFCE7', font: '15803D' },
    berhasil: { bg: 'DCFCE7', font: '15803D' },
    disetujui: { bg: 'DCFCE7', font: '15803D' },

    // Amber / Yellow (Warning / Pending / In Progress / Review / Draft)
    pending: { bg: 'FEF3C7', font: 'B45309' },
    'in progress': { bg: 'FEF3C7', font: 'B45309' },
    in_progress: { bg: 'FEF3C7', font: 'B45309' },
    inprogress: { bg: 'FEF3C7', font: 'B45309' },
    processing: { bg: 'FEF3C7', font: 'B45309' },
    review: { bg: 'FEF3C7', font: 'B45309' },
    'in review': { bg: 'FEF3C7', font: 'B45309' },
    waiting: { bg: 'FEF3C7', font: 'B45309' },
    hold: { bg: 'FEF3C7', font: 'B45309' },
    'on hold': { bg: 'FEF3C7', font: 'B45309' },
    draft: { bg: 'FEF3C7', font: 'B45309' },
    proses: { bg: 'FEF3C7', font: 'B45309' },
    'dalam proses': { bg: 'FEF3C7', font: 'B45309' },
    menunggu: { bg: 'FEF3C7', font: 'B45309' },
    tinjau: { bg: 'FEF3C7', font: 'B45309' },
    antrian: { bg: 'FEF3C7', font: 'B45309' },

    // Red (Danger / Rejected / Failed / Overdue)
    failed: { bg: 'FEE2E2', font: 'B91C1C' },
    fail: { bg: 'FEE2E2', font: 'B91C1C' },
    rejected: { bg: 'FEE2E2', font: 'B91C1C' },
    reject: { bg: 'FEE2E2', font: 'B91C1C' },
    canceled: { bg: 'FEE2E2', font: 'B91C1C' },
    cancelled: { bg: 'FEE2E2', font: 'B91C1C' },
    cancel: { bg: 'FEE2E2', font: 'B91C1C' },
    loss: { bg: 'FEE2E2', font: 'B91C1C' },
    error: { bg: 'FEE2E2', font: 'B91C1C' },
    overdue: { bg: 'FEE2E2', font: 'B91C1C' },
    batal: { bg: 'FEE2E2', font: 'B91C1C' },
    gagal: { bg: 'FEE2E2', font: 'B91C1C' },
    ditolak: { bg: 'FEE2E2', font: 'B91C1C' },
    kadaluarsa: { bg: 'FEE2E2', font: 'B91C1C' },

    // Blue (Info / Open / New)
    open: { bg: 'DBEAFE', font: '1D4ED8' },
    new: { bg: 'DBEAFE', font: '1D4ED8' },
    info: { bg: 'DBEAFE', font: '1D4ED8' },
    baru: { bg: 'DBEAFE', font: '1D4ED8' }
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
   * Pre-flight validation for chart configuration against table headers and rows.
   * Fixes BUG-08 by returning descriptive error messages for out-of-bounds or invalid configurations.
   */
  public static validateChartDefinition(
    headers: string[],
    rows: any[][],
    chartDef?: ChartDefinition
  ): { valid: boolean; reason?: string } {
    if (!chartDef) return { valid: true };
    const validTypes: ChartType[] = ['COLUMN', 'BAR', 'LINE', 'PIE', 'AREA'];
    if (!validTypes.includes(chartDef.type)) {
      return { valid: false, reason: `CHART_INVALID_TYPE: Type "${chartDef.type}" is not supported. Supported types: COLUMN, BAR, LINE, PIE, AREA.` };
    }

    const catCol = chartDef.categoryColumn ?? 0;
    if (catCol < 0 || catCol >= headers.length) {
      return { valid: false, reason: `CHART_RANGE_OUT_OF_BOUNDS: categoryColumn ${catCol} exceeds headers length (${headers.length}).` };
    }

    if (chartDef.valueColumns && chartDef.valueColumns.length > 0) {
      for (const vc of chartDef.valueColumns) {
        if (vc < 0 || vc >= headers.length) {
          return { valid: false, reason: `CHART_RANGE_OUT_OF_BOUNDS: valueColumn ${vc} exceeds headers length (${headers.length}).` };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Determines if a spreadsheet should use Top Hero Banner layout (wide/large data)
   * or Side-by-Side Compact layout (compact data: <= 8 rows and <= 4 columns).
   */
  public static isTopHeroLayout(
    headers: string[],
    rows: any[][],
    chartDef?: ChartDefinition
  ): boolean {
    if (!chartDef) return false;
    if (chartDef.position?.anchorCell) {
      const anchor = chartDef.position.anchorCell.toUpperCase();
      return anchor === 'A1' || anchor === 'A2';
    }
    // If compact data (<= 4 columns and <= 8 rows): Side-by-Side!
    if (headers.length <= 4 && rows.length <= 8) {
      return false;
    }
    // Large / wide dataset (> 8 rows or > 4 columns): Top Hero Banner!
    return true;
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
    const isHero = !!options?.chart && this.isTopHeroLayout(headers, rows, options.chart);

    if (!headers || headers.length === 0) return;

    // Separate pure data rows from any user-supplied or existing Total / Summary row
    const pureDataRows: any[][] = [];
    let existingSummaryRow: any[] | null = null;

    for (const r of rows) {
      const firstCell = String(r[0] || '').toLowerCase().trim();
      if (firstCell === 'total' || firstCell === 'summary' || firstCell === 'jumlah' || firstCell === 'rata-rata' || firstCell === 'average') {
        existingSummaryRow = r;
        break; // Do not treat as a normal data row!
      }
      pureDataRows.push(r);
    }

    // 0. If Top Hero Chart is enabled, reserve rows 1..15 for the visual chart canvas
    if (isHero) {
      for (let i = 1; i <= 15; i++) {
        const emptyRow = worksheet.addRow([]);
        emptyRow.height = 19;
      }
    }

    // 1. Add Header Row (Row 16 if Top Hero, else Row 1)
    const headerRow = worksheet.addRow(headers);
    headerRow.height = 28;

    // Freeze header pane so headers stay visible on scroll
    worksheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: isHero ? 16 : 1 }
    ];

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

    // Determine column types & currency formats based on headers & pure data rows
    const columnInferences = this.inferColumnInferences(headers, pureDataRows);

    // 2. Add Pure Data Rows (Strictly excludes Total row)
    pureDataRows.forEach((rowValues, rowIndex) => {
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

    // 3. Exactly ONE Summary / Total Row (Zero double-counting, strictly single row)
    const shouldAddSummary = existingSummaryRow !== null || options?.includeSummaryRow || (
      options?.includeSummaryRow === undefined &&
      pureDataRows.length > 1 &&
      columnInferences.some((t) => t.type === 'currency' || t.type === 'number')
    );

    if (shouldAddSummary && pureDataRows.length > 0) {
      const summaryRow = worksheet.addRow([]);
      summaryRow.height = 24;
      const firstDataRowNum = isHero ? 17 : 2;
      const lastDataRowNum = isHero ? 16 + pureDataRows.length : 1 + pureDataRows.length;

      headers.forEach((h, colIndex) => {
        const cell = summaryRow.getCell(colIndex + 1);
        const colInf = columnInferences[colIndex];
        const colLetter = this.getColumnLetter(colIndex + 1);
        const lowerH = (h || '').toLowerCase().trim();

        if (colIndex === 0) {
          cell.value = existingSummaryRow?.[0] || 'Total';
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (existingSummaryRow) {
          // If existingSummaryRow was provided, strictly respect the caller's explicit values/blanks!
          const userVal = existingSummaryRow[colIndex];
          if (userVal === undefined || userVal === null || userVal === '' || userVal === '-') {
            // User intentionally left this column blank in summary (e.g. Unit Price, Rate) -> DO NOT aggregate!
            cell.value = '-';
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if (typeof userVal === 'string' && userVal.trim().startsWith('=')) {
            cell.value = { formula: userVal.trim().substring(1) };
            if (colInf.type === 'currency') cell.numFmt = colInf.numFmt || '#,##0';
            else if (colInf.type === 'percentage') cell.numFmt = '0.0%';
            else cell.numFmt = colInf.numFmt || '#,##0';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else {
            // Explicit value was specified -> bind SUM formula over pure data rows with exact numeric sum
            let sum = 0;
            pureDataRows.forEach((r) => {
              const raw = r[colIndex];
              const num = typeof raw === 'number' ? raw : parseFloat(String(raw || '').replace(/[^0-9.-]+/g, ''));
              if (!isNaN(num)) sum += num;
            });
            cell.value = {
              formula: `SUM(${colLetter}${firstDataRowNum}:${colLetter}${lastDataRowNum})`,
              result: Number.isInteger(sum) ? sum : parseFloat(sum.toFixed(2))
            };
            cell.numFmt = colInf.numFmt || (colInf.type === 'percentage' ? '0.0%' : '#,##0');
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }
        } else {
          // Auto-generated summary row (no pre-existing row) -> Fix BUG-05 & BUG-06:
          // Aggregate columns that are conceptually summable (Budget, Spend, Volume, Nominal, Qty, Total, Market Cap, Variance, etc.)
          const isUnitPriceOrRate = lowerH.includes('unit price') || lowerH.includes('unit_price') ||
            lowerH.includes('harga satuan') || lowerH.includes('harga_satuan') ||
            lowerH.includes('kurs') || (lowerH.includes('rate') && !lowerH.includes('revenue') && !lowerH.includes('amount') && !lowerH.includes('total') && !lowerH.includes('price')) ||
            lowerH.includes('fee_per') ||
            (/\b(id|no|rank|kode|ticker)\b/i.test(lowerH)) ||
            colInf.type === 'date' || colInf.type === 'status' || colInf.type === 'boolean';

          const isSummable = !isUnitPriceOrRate && (
            options?.includeSummaryRow === true ||
            lowerH.includes('price') || lowerH.includes('harga') || lowerH.includes('fee') ||
            lowerH.includes('volume') || lowerH.includes('nominal') || lowerH.includes('total') ||
            lowerH.includes('omset') || lowerH.includes('revenue') || lowerH.includes('biaya') ||
            lowerH.includes('expense') || lowerH.includes('amount') || lowerH.includes('saldo') ||
            lowerH.includes('balance') || lowerH.includes('cap') || lowerH.includes('subtotal') ||
            lowerH.includes('laba') || lowerH.includes('profit') || lowerH.includes('loss') ||
            lowerH.includes('qty') || lowerH.includes('quantity') || lowerH.includes('jumlah') ||
            lowerH.includes('count') || lowerH.includes('porsi') || lowerH.includes('share') ||
            lowerH.includes('bobot') || lowerH.includes('alokasi') || lowerH.includes('budget') ||
            lowerH.includes('spend') || lowerH.includes('actual') || lowerH.includes('target') ||
            lowerH.includes('variance') || lowerH.includes('selisih')
          );

          if (isSummable && (colInf.type === 'currency' || colInf.type === 'number' || colInf.type === 'percentage')) {
            let sum = 0;
            pureDataRows.forEach((r) => {
              const raw = r[colIndex];
              if (raw !== null && raw !== undefined && raw !== '') {
                let num: number;
                if (typeof raw === 'number') {
                  num = raw;
                } else if (typeof raw === 'object' && 'formula' in raw) {
                  num = 0;
                } else {
                  const str = String(raw).replace(/%/g, '').replace(/\+/g, '').replace(/\s+/g, '').replace(/,/g, '.').trim();
                  const parsed = parseFloat(str);
                  num = String(raw).includes('%') ? (parsed / 100) : parsed;
                }
                if (!isNaN(num)) sum += num;
              }
            });
            cell.value = {
              formula: `SUM(${colLetter}${firstDataRowNum}:${colLetter}${lastDataRowNum})`,
              result: Number.isInteger(sum) ? sum : parseFloat(sum.toFixed(2))
            };
            cell.numFmt = colInf.numFmt || (colInf.type === 'percentage' ? '0.0%' : '#,##0');
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else {
            // Leave non-summable / text columns clean with a dash
            cell.value = '-';
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
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

    // 4. Auto-fit column widths with generous breathing room & format compensation
    worksheet.columns.forEach((column, colIndex) => {
      const headerStr = (headers[colIndex] || '').toString();
      let maxLen = headerStr.length;
      const colInf = columnInferences[colIndex];

      pureDataRows.forEach((row) => {
        const rawVal = row[colIndex];
        if (rawVal !== undefined && rawVal !== null) {
          let strLen = String(rawVal).length;
          // Account for currency and thousand formatting expanding length in Excel (e.g. 7300000 -> Rp 7.300.000)
          if (colInf?.type === 'currency' && typeof rawVal === 'number') {
            const formattedLen = rawVal.toLocaleString('id-ID').length + 5;
            strLen = Math.max(strLen, formattedLen);
          } else if (colInf?.type === 'number' && typeof rawVal === 'number') {
            const formattedLen = rawVal.toLocaleString('id-ID').length + 2;
            strLen = Math.max(strLen, formattedLen);
          }
          if (strLen > maxLen) {
            maxLen = strLen;
          }
        }
      });
      // Add generous breathing room, minimum width 16 (prevents tight boxes), maximum width 65
      column.width = Math.max(16, Math.min(65, maxLen + 6));
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

    // 0. Formula Object Support (e.g. { formula: '=B2/B7', type: 'percent', decimals: 1 }) -> Fix BUG-02
    if (typeof rawVal === 'object' && rawVal !== null && 'formula' in rawVal) {
      const formulaStr = String(rawVal.formula || '').trim();
      const cleanFormula = formulaStr.startsWith('=') ? formulaStr.substring(1) : formulaStr;
      cell.value = { formula: cleanFormula };
      
      const type = (rawVal.type || colInf.type || '').toLowerCase();
      if (type === 'percent' || type === 'percentage') {
        cell.numFmt = rawVal.decimals ? `0.${'0'.repeat(rawVal.decimals)}%` : '0.0%';
      } else if (type === 'currency') {
        cell.numFmt = rawVal.numFmt || colInf.numFmt || 'Rp #,##0';
      } else if (type === 'number') {
        cell.numFmt = rawVal.decimals ? `#,##0.${'0'.repeat(rawVal.decimals)}` : (colInf.numFmt || '#,##0');
      } else {
        cell.numFmt = colInf.numFmt || '#,##0';
      }
      return null;
    }

    const strVal = String(rawVal).trim();

    // 1. Explicit Formula starting with '=' -> Fix BUG-02
    if (strVal.startsWith('=')) {
      cell.value = { formula: strVal.substring(1) };
      if (colInf.type === 'currency') {
        cell.numFmt = colInf.numFmt || 'Rp #,##0';
      } else if (colInf.type === 'percentage') {
        cell.numFmt = '0.0%';
      } else if (colInf.type === 'number') {
        cell.numFmt = colInf.numFmt || '#,##0';
      }
      return null;
    }

    // 2. Status Badge Detection (Case-insensitive & whitespace normalized) -> Fix BUG-07
    const normalizedStatus = strVal.toLowerCase().replace(/[_\s-]+/g, ' ').trim();
    if (colInf.type === 'status') {
      cell.value = strVal;
      const match = this.STATUS_STYLES[normalizedStatus] || this.STATUS_STYLES[strVal.toLowerCase()];
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

    // 4. Percentage (by column inference OR explicit % string) -> Fix BUG-04
    const isPercentageCell = colInf.type === 'percentage' || strVal.includes('%');
    if (isPercentageCell) {
      let numeric: number;
      if (typeof rawVal === 'number') {
        numeric = rawVal;
      } else {
        const cleanStr = strVal.replace(/%/g, '').replace(/\+/g, '').replace(/\s+/g, '').replace(/,/g, '.');
        const parsed = parseFloat(cleanStr);
        numeric = strVal.includes('%') ? (parsed / 100) : parsed;
      }

      if (!isNaN(numeric)) {
        // Fix BUG-04: If value > 1.0 (or < -1.0) and wasn't parsed from explicit '%' string, it's on 0-100 scale -> divide by 100
        if (!strVal.includes('%') && (numeric > 1.0 || numeric < -1.0)) {
          numeric = numeric / 100;
        }
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

    // Default: Check if standalone value matches a status badge
    const statusMatch = this.STATUS_STYLES[normalizedStatus] || this.STATUS_STYLES[strVal.toLowerCase()];
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

      if (
        lowerHeader.includes('percent') || 
        lowerHeader.includes('%') || 
        lowerHeader.includes('pnl') || 
        lowerHeader.includes('percentage') ||
        lowerHeader.includes('porsi') ||
        lowerHeader.includes('share') ||
        lowerHeader.includes('proporsi') ||
        lowerHeader.includes('alokasi') ||
        lowerHeader.includes('allocation') ||
        lowerHeader.includes('bobot') ||
        lowerHeader.includes('rasio') ||
        lowerHeader.includes('ratio') ||
        lowerHeader.includes('perubahan') ||
        lowerHeader.includes('change') ||
        lowerHeader.includes('growth') ||
        lowerHeader.includes('delta') ||
        lowerHeader.includes('margin') ||
        lowerHeader.includes('yield') ||
        lowerHeader.includes('roi') ||
        lowerHeader.includes('apr') ||
        lowerHeader.includes('apy')
      ) {
        return { type: 'percentage', numFmt: '0.0%' };
      }

      if (lowerHeader.includes('rate') && !lowerHeader.includes('currency')) {
        // If header has rate (like win rate, conversion rate)
        return { type: 'percentage', numFmt: '0.0%' };
      }

      if (lowerHeader.includes('date') || lowerHeader.includes('time')) {
        return { type: 'date' };
      }

      if (lowerHeader.includes('qty') || lowerHeader.includes('quantity') || lowerHeader.includes('count')) {
        return { type: 'number', numFmt: '#,##0' };
      }

      // Check if all numeric values in column are integers
      let hasNumbers = false;
      let allIntegers = true;
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
          if (str.endsWith('%') || str.includes('%')) return { type: 'percentage', numFmt: '0.0%' };
          
          const cleanNumStr = str.replace(/,/g, '');
          const num = typeof val === 'number' ? val : Number(cleanNumStr);
          if (!isNaN(num)) {
            hasNumbers = true;
            if (!Number.isInteger(num)) {
              allIntegers = false;
            }
          }
        }
      }

      if (hasNumbers) {
        return { type: 'number', numFmt: allIntegers ? '#,##0' : '#,##0.00' };
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
   * Automatically infers the most delightful visual chart (PIE, COLUMN, LINE) if data contains categories and numbers.
   */
  public static inferAutomaticChart(
    headers: string[],
    rows: any[][]
  ): ChartDefinition | undefined {
    if (rows.length < 2) return undefined; // Need at least 2 rows to chart

    const inferences = this.inferColumnInferences(headers, rows);
    let catCol = -1;
    const numericCols: number[] = [];
    let isPercentageOrShare = false;
    let isTimeOrDate = false;

    inferences.forEach((inf, idx) => {
      if (inf.type === 'text' && catCol === -1) {
        catCol = idx;
      } else if (inf.type === 'date') {
        catCol = idx;
        isTimeOrDate = true;
      } else if (inf.type === 'currency' || inf.type === 'number' || inf.type === 'percentage') {
        numericCols.push(idx);
        if (inf.type === 'percentage') isPercentageOrShare = true;
      }
    });

    if (catCol === -1) catCol = 0;
    if (numericCols.length === 0) return undefined; // No numeric data to chart

    const titleLower = headers.join(' ').toLowerCase();
    if (titleLower.includes('share') || titleLower.includes('distribusi') || titleLower.includes('persen') || isPercentageOrShare) {
      // Pick the percentage column or the most relevant volume/share column
      const pctCol = inferences.findIndex((inf, idx) => idx !== catCol && inf.type === 'percentage');
      const chosenCol = pctCol !== -1 ? pctCol : numericCols[0];
      return {
        type: 'PIE',
        title: 'Ringkasan & Distribusi Data',
        categoryColumn: catCol,
        valueColumns: [chosenCol]
      };
    }

    if (isTimeOrDate || titleLower.includes('bulan') || titleLower.includes('tahun') || titleLower.includes('tren') || titleLower.includes('trend')) {
      return {
        type: 'LINE',
        title: 'Tren Perkembangan Data',
        categoryColumn: catCol,
        valueColumns: numericCols.slice(0, 2)
      };
    }

    // Default to Column / Bar comparison
    return {
      type: 'COLUMN',
      title: 'Perbandingan & Analisis Visual',
      categoryColumn: catCol,
      valueColumns: numericCols.slice(0, 2)
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

    // Smart Adaptive Layout: Top Hero for large/wide data, Side-by-Side Compact for small data
    const isTopHero = this.isTopHeroLayout(headers, rows, chartDef);
    const defaultAnchor = isTopHero 
      ? 'A1' 
      : `${this.getColumnLetter(headers.length + 2)}1`; // Aligned at Row 1 (e.g. E1)

    const anchor = chartDef.position?.anchorCell || defaultAnchor;
    const { rowIndex: anchorRow, columnIndex: anchorCol } = this.parseCellAddress(anchor);
    
    // Proportional dimensions: slim & neat for compact tables, wide for hero dashboards
    const widthPixels = chartDef.position?.widthPixels || (isTopHero ? 820 : 520);
    const heightPixels = chartDef.position?.heightPixels || (
      isTopHero 
        ? 290 
        : Math.max(220, Math.min(250, (rows.length + 2) * 24 + 40))
    );

    // Count pure data rows (strictly excluding any Total / Summary row from chart ranges)
    let pureDataRowCount = 0;
    for (const r of rows) {
      const firstCell = String(r[0] || '').toLowerCase().trim();
      if (firstCell === 'total' || firstCell === 'summary' || firstCell === 'jumlah' || firstCell === 'rata-rata' || firstCell === 'average') {
        break;
      }
      pureDataRowCount++;
    }
    if (pureDataRowCount === 0) pureDataRowCount = numRows;

    // Determine row bounds for Domain & Series:
    // If Top Hero, header is at index 15 (row 16), data rows are 16..15+pureDataRowCount
    // If Side-by-Side (compact mode), header is at index 0 (row 1), data rows are 1..pureDataRowCount
    const startRowIdx = isTopHero ? 15 : 0;

    if (chartDef.type === 'PIE') {
      let pieValCol = valCols[0];
      // If valueColumns was not explicitly set or has multiple, pick the most appropriate single value column
      if (!chartDef.valueColumns || chartDef.valueColumns.length === 0) {
        const inferences = this.inferColumnInferences(headers, rows);
        const pctIdx = inferences.findIndex((inf, idx) => idx !== catCol && inf.type === 'percentage');
        if (pctIdx !== -1) {
          pieValCol = pctIdx;
        } else {
          const volIdx = headers.findIndex((h, idx) => idx !== catCol && (
            h.toLowerCase().includes('volume') ||
            h.toLowerCase().includes('cap') ||
            h.toLowerCase().includes('total') ||
            h.toLowerCase().includes('nilai') ||
            h.toLowerCase().includes('amount') ||
            h.toLowerCase().includes('jumlah')
          ));
          if (volIdx !== -1 && (inferences[volIdx]?.type === 'number' || inferences[volIdx]?.type === 'currency')) {
            pieValCol = volIdx;
          }
        }
      }

      // CRITICAL: PieChartSpec in Google Sheets API does NOT have a headerCount field.
      // Therefore, PieChartSpec sourceRange MUST start at the first data row (startRowIdx + 1),
      // and end at startRowIdx + 1 + pureDataRowCount (strictly excluding Total row).
      const pieStartRow = startRowIdx + 1;
      const pieEndRow = startRowIdx + 1 + pureDataRowCount;

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
                      startRowIndex: pieStartRow,
                      endRowIndex: pieEndRow,
                      startColumnIndex: catCol,
                      endColumnIndex: catCol + 1
                    }]
                  }
                },
                series: {
                  sourceRange: {
                    sources: [{
                      sheetId,
                      startRowIndex: pieStartRow,
                      endRowIndex: pieEndRow,
                      startColumnIndex: pieValCol,
                      endColumnIndex: pieValCol + 1
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

    // Critical: For horizontal BAR charts, Google Sheets API requires targetAxis: 'BOTTOM_AXIS'
    // For vertical COLUMN / LINE / AREA charts, targetAxis is 'LEFT_AXIS'
    const isHorizontalBar = chartType === 'BAR';
    const seriesTargetAxis = isHorizontalBar ? 'BOTTOM_AXIS' : 'LEFT_AXIS';

    // BasicChartSpec includes the header row at startRowIdx because headerCount: 1 is set
    const basicStartRow = startRowIdx;
    const basicEndRow = startRowIdx + 1 + pureDataRowCount;

    // Show data labels only on compact bar/column charts (<= 6 categories) where labels fit cleanly
    // For large charts (> 6 categories) or LINE/AREA charts, data labels are disabled to prevent collision/clutter;
    // full precision values remain instantly accessible via interactive hover tooltips in Google Sheets.
    const showDataLabels = (chartType === 'COLUMN' || chartType === 'BAR') && pureDataRowCount <= 6;

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
                      startRowIndex: basicStartRow,
                      endRowIndex: basicEndRow,
                      startColumnIndex: catCol,
                      endColumnIndex: catCol + 1
                    }]
                  }
                }
              }],
              series: valCols.map((vc, idx) => ({
                series: {
                  sourceRange: {
                    sources: [{
                      sheetId,
                      startRowIndex: basicStartRow,
                      endRowIndex: basicEndRow,
                      startColumnIndex: vc,
                      endColumnIndex: vc + 1
                    }]
                  }
                },
                targetAxis: seriesTargetAxis,
                colorStyle: idx === 0 ? {
                  rgbColor: { red: 0.106, green: 0.212, blue: 0.365 } // Executive Navy #1B365D
                } : (idx === 1 ? {
                  rgbColor: { red: 0.058, green: 0.317, blue: 0.196 } // Emerald #0F5132
                } : undefined),
                dataLabel: showDataLabels ? {
                  type: 'DATA',
                  placement: 'OUTSIDE_END'
                } : {
                  type: 'NONE'
                }
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

  /**
   * Appends rows to an existing .xlsx workbook buffer safely without corrupting binary structure.
   * If a summary/Total row exists at the bottom, rows are cleanly inserted above it.
   */
  public static async appendRowsToWorkbook(
    existingBuffer: Buffer,
    newRows: any[][]
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(existingBuffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('No worksheet found in Excel workbook.');

    const lastRowNum = worksheet.rowCount;
    const lastRow = worksheet.getRow(lastRowNum);
    const firstCellVal = String(lastRow.getCell(1).value || '').toLowerCase();
    const isSummaryLastRow = firstCellVal.includes('total') || firstCellVal.includes('summary') || firstCellVal.includes('jumlah');

    if (isSummaryLastRow && lastRowNum > 2) {
      const insertAt = lastRowNum;
      for (let i = 0; i < newRows.length; i++) {
        const row = newRows[i];
        const addedRow = worksheet.insertRow(insertAt + i, row);
        addedRow.height = 24;
        addedRow.alignment = { vertical: 'middle' };
        addedRow.font = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' } };
        addedRow.eachCell({ includeEmpty: false }, (cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };
        });
      }
    } else {
      for (const row of newRows) {
        const addedRow = worksheet.addRow(row);
        addedRow.height = 24;
        addedRow.alignment = { vertical: 'middle' };
        addedRow.font = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' } };
        addedRow.eachCell({ includeEmpty: false }, (cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };
        });
      }
    }

    // Auto-expand column widths if newly appended rows have longer content
    worksheet.columns.forEach((column) => {
      let maxLen = 10;
      worksheet.eachRow({ includeEmpty: false }, (r) => {
        const cell = r.getCell(column.number!);
        const cellVal = cell.value !== undefined && cell.value !== null ? String(cell.value) : '';
        if (cellVal.length > maxLen) maxLen = cellVal.length;
      });
      column.width = Math.max(16, Math.min(65, maxLen + 6));
    });

    const uint8 = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8);
  }

  /**
   * Reads an .xlsx workbook buffer and converts its active sheet into clean Markdown table format.
   * Synthesizes calculated values for formulas (e.g. SUM, AVERAGE, cell multiplication) and formats
   * currencies, integers, and percentages cleanly.
   */
  public static async readWorkbookAsMarkdown(buffer: Buffer): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return '(Empty Spreadsheet)';

    // Pre-extract matrix of raw cell objects/values for formula resolution
    const matrix: any[][] = [];
    const cellMatrix: (ExcelJS.Cell | null)[][] = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const rIdx = rowNumber - 1;
      while (matrix.length <= rIdx) {
        matrix.push([]);
        cellMatrix.push([]);
      }
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const cIdx = colNumber - 1;
        while (matrix[rIdx].length <= cIdx) {
          matrix[rIdx].push(null);
          cellMatrix[rIdx].push(null);
        }
        matrix[rIdx][cIdx] = cell.value;
        cellMatrix[rIdx][cIdx] = cell;
      });
    });

    if (matrix.length === 0) return '(Empty Spreadsheet)';

    // Helper to evaluate a cell reference like 'B2' or 'C3'
    const getCellNumeric = (colLetter: string, rowNum: number): number => {
      const cIdx = SpreadsheetEngine.columnLetterToIndex(colLetter);
      const rIdx = rowNum - 1;
      const val = matrix[rIdx]?.[cIdx];
      if (val === null || val === undefined) return 0;
      if (typeof val === 'number') return val;
      if (typeof val === 'object') {
        if ('result' in val && typeof val.result === 'number') return val.result;
      }
      const parsed = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
      return isNaN(parsed) ? 0 : parsed;
    };

    // Find the first row with meaningful content (Header Row index)
    let headerRowIdx = 0;
    for (let r = 0; r < matrix.length; r++) {
      if (matrix[r].some(c => c !== null && c !== undefined && String(c).trim() !== '')) {
        headerRowIdx = r;
        break;
      }
    }

    const formattedRows: string[][] = [];

    for (let rIdx = 0; rIdx < matrix.length; rIdx++) {
      const rowVals: string[] = [];
      const row = matrix[rIdx];
      for (let cIdx = 0; cIdx < row.length; cIdx++) {
        const cell = cellMatrix[rIdx]?.[cIdx];
        let val = matrix[rIdx][cIdx];
        let numFmt = cell?.numFmt || '';

        // 1. Resolve Formula if present
        if (val !== null && typeof val === 'object' && ('formula' in val || 'result' in val)) {
          if (val.result !== undefined && val.result !== null) {
            val = val.result;
          } else if (val.formula) {
            const formulaStr = String(val.formula).trim().toUpperCase();
            
            // Formula: SUM(B2:B6) or SUM(B17:B21)
            const sumMatch = formulaStr.match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/i);
            if (sumMatch) {
              const [, col1, startRow, , endRow] = sumMatch;
              let sum = 0;
              for (let r = parseInt(startRow, 10); r <= parseInt(endRow, 10); r++) {
                sum += getCellNumeric(col1, r);
              }
              val = sum;
            } else {
              // Formula: AVERAGE(B2:B6) or AVERAGE(B17:B21)
              const avgMatch = formulaStr.match(/^AVERAGE\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/i);
              if (avgMatch) {
                const [, col1, startRow, , endRow] = avgMatch;
                let sum = 0;
                let count = 0;
                for (let r = parseInt(startRow, 10); r <= parseInt(endRow, 10); r++) {
                  sum += getCellNumeric(col1, r);
                  count++;
                }
                val = count > 0 ? sum / count : 0;
              } else {
                // Formula: Cell arithmetic like C2*D2 or B2/B7
                const arithMatch = formulaStr.match(/^([A-Z]+)(\d+)\s*([*+\/-])\s*([A-Z]+)(\d+)$/i);
                if (arithMatch) {
                  const [, colA, rowA, op, colB, rowB] = arithMatch;
                  const numA = getCellNumeric(colA, parseInt(rowA, 10));
                  const numB = getCellNumeric(colB, parseInt(rowB, 10));
                  if (op === '*') val = numA * numB;
                  else if (op === '+') val = numA + numB;
                  else if (op === '-') val = numA - numB;
                  else if (op === '/') val = numB !== 0 ? numA / numB : 0;
                }
              }
            }
          }
        }

        // 2. Format Value Cleanly for Agent Consumption
        if (val === null || val === undefined) {
          rowVals.push('');
        } else if (typeof val === 'number') {
          // Check if percentage
          const header = String(matrix[headerRowIdx]?.[cIdx] || '').toLowerCase();
          const isPercent = numFmt.includes('%') || 
            header.includes('porsi') || header.includes('%') || header.includes('percent') || 
            header.includes('share') || header.includes('proporsi') || header.includes('alokasi') ||
            header.includes('rasio') || header.includes('ratio');

          if (isPercent) {
            const pct = (val > 1 ? val : val * 100);
            rowVals.push(`${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`);
          } else if (numFmt.includes('Rp') || header.includes('rp') || header.includes('rupiah') || header.includes('gaji')) {
            rowVals.push(`Rp ${val.toLocaleString('id-ID')}`);
          } else if (numFmt.includes('$') || header.includes('usd') || header.includes('price')) {
            rowVals.push(`$${Number.isInteger(val) ? val.toLocaleString('en-US') : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
          } else if (Number.isInteger(val)) {
            rowVals.push(val.toLocaleString('id-ID'));
          } else {
            rowVals.push(val.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          }
        } else if (typeof val === 'object' && 'text' in val) {
          rowVals.push(String(val.text ?? ''));
        } else if (typeof val === 'object' && 'richText' in val) {
          const txt = val.richText?.map((t: any) => t.text).join('') || '';
          rowVals.push(txt);
        } else {
          rowVals.push(String(val));
        }
      }
      formattedRows.push(rowVals);
    }

    // Filter out completely blank rows (e.g. rows 1..15 in Top Hero layout)
    const meaningfulRows = formattedRows.filter(row => row.some(cell => cell !== '' && cell !== undefined && cell !== null));
    if (meaningfulRows.length === 0) return '(Empty Spreadsheet)';

    const headers = meaningfulRows[0];
    const dataRows = meaningfulRows.slice(1);
    const headerLine = `| ${headers.map(h => h || '-').join(' | ')} |`;
    const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
    const bodyLines = dataRows.map(r => `| ${headers.map((_, i) => r[i] !== undefined ? r[i] : '').join(' | ')} |`);

    return [
      `### Spreadsheet: ${worksheet.name || 'Sheet1'}`,
      headerLine,
      separatorLine,
      ...bodyLines
    ].join('\n');
  }

  private static columnLetterToIndex(letter: string): number {
    let index = 0;
    for (let i = 0; i < letter.length; i++) {
      index = index * 26 + (letter.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  /**
   * Formats a large number into clean international compact notation (K, M, B, T) or IDR (rb, jt, M, T).
   */
  public static formatCompactNumber(val: number, currency: string = 'USD'): string {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    const isIdr = currency.toUpperCase() === 'IDR';

    if (abs >= 1_000_000_000_000) {
      const num = (abs / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '');
      return isIdr ? `${sign}Rp ${num} T` : `${sign}$${num}T`;
    }
    if (abs >= 1_000_000_000) {
      const num = (abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '');
      return isIdr ? `${sign}Rp ${num} M` : `${sign}$${num}B`;
    }
    if (abs >= 1_000_000) {
      const num = (abs / 1_000_000).toFixed(1).replace(/\.0$/, '');
      return isIdr ? `${sign}Rp ${num} jt` : `${sign}$${num}M`;
    }
    if (abs >= 1_000) {
      const num = (abs / 1_000).toFixed(1).replace(/\.0$/, '');
      return isIdr ? `${sign}Rp ${num} rb` : `${sign}$${num}K`;
    }
    return isIdr ? `${sign}Rp ${abs.toLocaleString('id-ID')}` : `${sign}$${abs.toLocaleString('en-US')}`;
  }
}
