import ExcelJS from 'exceljs';

export interface SpreadsheetOptions {
  sheetName?: string;
  themeColor?: string; // Header background hex without # (default: '0F172A')
  includeSummaryRow?: boolean; // If true, adds a SUM total row for numeric columns
}

export interface SheetDefinition {
  name: string;
  headers: string[];
  rows: any[][];
  options?: SpreadsheetOptions;
}

export class SpreadsheetEngine {
  private static readonly DEFAULT_HEADER_COLOR = '0F172A'; // Slate 900 / Dark Navy
  private static readonly ZEBRA_ROW_COLOR = 'F8FAFC';     // Slate 50
  private static readonly SUMMARY_ROW_COLOR = 'F1F5F9';   // Slate 100
  private static readonly BORDER_COLOR = 'CBD5E1';        // Slate 300

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
        views: [{ showGridLines: true }]
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

    // Determine column types based on headers & data
    const columnTypes = this.inferColumnTypes(headers, rows);

    // 2. Add Data Rows
    rows.forEach((rowValues, rowIndex) => {
      const row = worksheet.addRow([]);
      row.height = 22;
      const isZebra = rowIndex % 2 === 1;

      headers.forEach((_, colIndex) => {
        const rawVal = rowValues[colIndex] !== undefined ? rowValues[colIndex] : '';
        const cell = row.getCell(colIndex + 1);
        const colType = columnTypes[colIndex];

        // Format and assign value
        this.setFormattedCellValue(cell, rawVal, colType);

        // Styling
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
        cell.border = {
          top: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } },
          left: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } },
          bottom: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } },
          right: { style: 'thin', color: { argb: `FF${this.BORDER_COLOR}` } }
        };

        // Alignments
        if (colType === 'currency' || colType === 'number' || colType === 'percentage') {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (colType === 'date' || colType === 'boolean') {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    });

    // 3. Optional Summary / Total Row
    const shouldAddSummary = options?.includeSummaryRow || (
      options?.includeSummaryRow === undefined &&
      rows.length > 1 &&
      columnTypes.some((t) => t === 'currency' || t === 'number')
    );

    if (shouldAddSummary && rows.length > 0) {
      const summaryRow = worksheet.addRow([]);
      summaryRow.height = 24;
      const firstDataRowNum = 2;
      const lastDataRowNum = rows.length + 1;

      headers.forEach((_, colIndex) => {
        const cell = summaryRow.getCell(colIndex + 1);
        const colType = columnTypes[colIndex];
        const colLetter = this.getColumnLetter(colIndex + 1);

        if (colIndex === 0) {
          cell.value = 'Total';
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (colType === 'currency' || colType === 'number') {
          cell.value = { formula: `SUM(${colLetter}${firstDataRowNum}:${colLetter}${lastDataRowNum})` };
          cell.numFmt = colType === 'currency' ? 'Rp #,##0' : '#,##0.00';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (colType === 'percentage') {
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
      // Add comfortable padding, clamp between 12 and 50
      column.width = Math.max(13, Math.min(55, maxLen + 4));
    });
  }

  private static setFormattedCellValue(
    cell: ExcelJS.Cell,
    rawVal: any,
    colType: 'currency' | 'percentage' | 'number' | 'date' | 'boolean' | 'formula' | 'text'
  ): void {
    if (rawVal === null || rawVal === undefined || rawVal === '') {
      cell.value = '';
      return;
    }

    const strVal = String(rawVal).trim();

    // 1. Explicit Formula starting with '='
    if (strVal.startsWith('=')) {
      cell.value = { formula: strVal.substring(1) };
      return;
    }

    // 2. Currency
    if (colType === 'currency') {
      const numeric = typeof rawVal === 'number'
        ? rawVal
        : parseFloat(strVal.replace(/[^0-9.-]+/g, ''));
      if (!isNaN(numeric)) {
        cell.value = numeric;
        if (strVal.includes('$') || strVal.toUpperCase().includes('USD')) {
          cell.numFmt = '$#,##0.00';
        } else {
          cell.numFmt = 'Rp #,##0';
        }
        return;
      }
    }

    // 3. Percentage
    if (colType === 'percentage') {
      const numeric = typeof rawVal === 'number'
        ? rawVal
        : parseFloat(strVal.replace(/%/g, '').trim()) / (strVal.includes('%') ? 100 : 1);
      if (!isNaN(numeric)) {
        cell.value = numeric;
        cell.numFmt = '0.0%';
        return;
      }
    }

    // 4. Number
    if (colType === 'number') {
      const numeric = typeof rawVal === 'number'
        ? rawVal
        : parseFloat(strVal.replace(/,/g, ''));
      if (!isNaN(numeric)) {
        cell.value = numeric;
        cell.numFmt = Number.isInteger(numeric) ? '#,##0' : '#,##0.00';
        return;
      }
    }

    // 5. Date
    if (colType === 'date') {
      const parsedDate = new Date(rawVal);
      if (!isNaN(parsedDate.getTime())) {
        cell.value = parsedDate;
        cell.numFmt = 'YYYY-MM-DD';
        return;
      }
    }

    // 6. Boolean
    if (colType === 'boolean') {
      cell.value = (strVal.toLowerCase() === 'true' || strVal === '1' || strVal.toLowerCase() === 'yes');
      return;
    }

    // Default: Plain Text
    cell.value = strVal;
  }

  private static inferColumnTypes(
    headers: string[],
    rows: any[][]
  ): Array<'currency' | 'percentage' | 'number' | 'date' | 'boolean' | 'formula' | 'text'> {
    return headers.map((header, colIndex) => {
      const lowerHeader = header.toLowerCase();

      // Check header keywords
      if (
        lowerHeader.includes('price') ||
        lowerHeader.includes('harga') ||
        lowerHeader.includes('cost') ||
        lowerHeader.includes('biaya') ||
        lowerHeader.includes('amount') ||
        lowerHeader.includes('nominal') ||
        lowerHeader.includes('revenue') ||
        lowerHeader.includes('pendapatan') ||
        lowerHeader.includes('expense') ||
        lowerHeader.includes('pengeluaran') ||
        lowerHeader.includes('balance') ||
        lowerHeader.includes('saldo') ||
        lowerHeader.includes('total') ||
        lowerHeader.includes('usdc') ||
        lowerHeader.includes('idr') ||
        lowerHeader.includes('rp')
      ) {
        return 'currency';
      }

      if (lowerHeader.includes('percent') || lowerHeader.includes('rate') || lowerHeader.includes('%') || lowerHeader.includes('pnl')) {
        return 'percentage';
      }

      if (lowerHeader.includes('date') || lowerHeader.includes('tanggal') || lowerHeader.includes('time') || lowerHeader.includes('waktu')) {
        return 'date';
      }

      if (lowerHeader.includes('qty') || lowerHeader.includes('quantity') || lowerHeader.includes('jumlah') || lowerHeader.includes('count')) {
        return 'number';
      }

      // Sample data rows to infer
      for (const row of rows) {
        const val = row[colIndex];
        if (val !== undefined && val !== null && val !== '') {
          const str = String(val).trim();
          if (str.startsWith('=')) return 'formula';
          if (str.startsWith('Rp') || str.startsWith('$')) return 'currency';
          if (str.endsWith('%')) return 'percentage';
          if (typeof val === 'number' || (!isNaN(Number(str)) && str !== '')) return 'number';
        }
      }

      return 'text';
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
}
