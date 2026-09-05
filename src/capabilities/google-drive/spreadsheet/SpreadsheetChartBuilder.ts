import { ChartDefinition, ChartType } from './spreadsheet.types';
import { SpreadsheetFormatter } from './SpreadsheetFormatter';

export class SpreadsheetChartBuilder {
  public static getColumnLetter(colNum: number): string {
    let letter = '';
    while (colNum > 0) {
      const rem = (colNum - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      colNum = Math.floor((colNum - 1) / 26);
    }
    return letter;
  }

  public static columnLetterToIndex(letter: string): number {
    let index = 0;
    for (let i = 0; i < letter.length; i++) {
      index = index * 26 + (letter.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  /**
   * Translates a cell address (e.g. "G2" or "E") to 0-indexed { rowIndex, columnIndex }.
   */
  public static parseCellAddress(address: string = 'G2'): { rowIndex: number; columnIndex: number } {
    if (!address || typeof address !== 'string') {
      return { rowIndex: 1, columnIndex: 6 };
    }
    const clean = address.trim().toUpperCase();
    const match = clean.match(/^([A-Z]{1,3})(\d+)$/);
    if (!match) {
      const colOnlyMatch = clean.match(/^([A-Z]{1,3})$/);
      if (colOnlyMatch) {
        return { rowIndex: 0, columnIndex: Math.max(0, this.columnLetterToIndex(colOnlyMatch[1])) };
      }
      return { rowIndex: 1, columnIndex: 6 };
    }
    const colStr = match[1];
    const rowNum = parseInt(match[2], 10);
    return {
      rowIndex: Math.max(0, isNaN(rowNum) ? 0 : rowNum - 1),
      columnIndex: Math.max(0, this.columnLetterToIndex(colStr))
    };
  }

  /**
   * Pre-flight validation for chart configuration against table headers and rows.
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
   * Determines if a spreadsheet should use Stacked Below-Table layout (wide data > 8 cols)
   * or Side-by-Side layout (compact data <= 8 cols).
   */
  public static isTopHeroLayout(
    headers: string[],
    rows: any[][],
    chartDef?: ChartDefinition
  ): boolean {
    if (!chartDef) return false;
    return headers.length > 8;
  }

  /**
   * Automatically infers the most visual chart (PIE, COLUMN, LINE) if data contains categories and numbers.
   */
  public static inferAutomaticChart(
    headers: string[],
    rows: any[][]
  ): ChartDefinition | undefined {
    if (rows.length < 2) return undefined; // Need at least 2 rows to chart

    const inferences = SpreadsheetFormatter.inferColumnInferences(headers, rows);
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
      const inferences = SpreadsheetFormatter.inferColumnInferences(headers, rows);
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

    // Smart Adaptive Layout:
    // When data has <= 8 columns, place chart Side-by-Side to the right of the table (zero overlap)
    // When data has > 8 columns, place chart Below the table (zero overlap)
    const isSideBySide = headers.length <= 8;
    const defaultSideBySideAnchor = `${this.getColumnLetter(headers.length + 2)}1`; // e.g. Column J1 for 8 cols, Column F1 for 4 cols
    const defaultBelowTableAnchor = `A${rows.length + 3}`; // 2 blank rows gap below the table

    let anchor = chartDef.position?.anchorCell;

    // CRITICAL OVERLAP GUARD:
    // In native Google Sheets API, table data is written starting at A1 (Row 0, Col 0).
    // If anchor is not provided, or is explicitly set to 'A1' / 'A2', placing a floating chart at A1
    // causes the chart to float directly ON TOP of the data table, hiding all rows and numbers!
    // We automatically resolve this to Side-by-Side (for <= 8 columns) or Below Table (for > 8 columns).
    if (!anchor || anchor.toUpperCase() === 'A1' || anchor.toUpperCase() === 'A2') {
      anchor = isSideBySide ? defaultSideBySideAnchor : defaultBelowTableAnchor;
    }

    let { rowIndex: anchorRow, columnIndex: anchorCol } = this.parseCellAddress(anchor);
    
    // Explicit anchorRow / anchorCol numeric overrides if provided
    const explicitAnchorRow = chartDef.anchorRow !== undefined ? chartDef.anchorRow : chartDef.position?.anchorRow;
    const explicitAnchorCol = chartDef.anchorCol !== undefined ? chartDef.anchorCol : chartDef.position?.anchorCol;

    if (explicitAnchorRow !== undefined && !isNaN(Number(explicitAnchorRow))) {
      anchorRow = Math.max(0, Number(explicitAnchorRow));
    }
    if (explicitAnchorCol !== undefined && !isNaN(Number(explicitAnchorCol))) {
      anchorCol = Math.max(0, Number(explicitAnchorCol));
    }

    // Sanitize: ensure anchor coordinates are always valid finite integers (prevents Row NaN, Col NaN)
    if (!isFinite(anchorRow) || isNaN(anchorRow)) anchorRow = 0;
    if (!isFinite(anchorCol) || isNaN(anchorCol)) anchorCol = 0;
    anchorRow = Math.max(0, Math.round(anchorRow));
    anchorCol = Math.max(0, Math.round(anchorCol));

    // Secondary Overlap Guard: If coordinates still point to (0, 0), shift away from A1 data
    if (anchorRow === 0 && anchorCol === 0) {
      if (isSideBySide) {
        anchorCol = headers.length + 1;
        anchorRow = 0;
      } else {
        anchorRow = rows.length + 2;
        anchorCol = 0;
      }
    }
    
    // Proportional dimensions: neat side-by-side or wide below-table
    const defaultWidth = isSideBySide ? 580 : 820;
    const defaultHeight = isSideBySide 
      ? Math.max(260, Math.min(340, (rows.length + 2) * 28 + 40))
      : 300;

    const widthPixels = chartDef.position?.widthPixels || defaultWidth;
    const heightPixels = chartDef.position?.heightPixels || defaultHeight;

    // Count pure data rows (strictly excluding any Total / Summary or Guard / Test row from chart ranges)
    let pureDataRowCount = 0;
    for (const r of rows) {
      const firstCell = String(r[0] || '').toLowerCase().trim();
      const isExcludedRow = (
        firstCell === 'total' ||
        firstCell === 'summary' ||
        firstCell === 'jumlah' ||
        firstCell === 'rata-rata' ||
        firstCell === 'average' ||
        firstCell.includes('(guard)') ||
        firstCell.includes('(uji)') ||
        firstCell.includes('(test)') ||
        firstCell.startsWith('guard') ||
        firstCell.startsWith('uji ') ||
        firstCell.startsWith('test ') ||
        firstCell.includes('dummy') ||
        firstCell.includes('mock') ||
        firstCell.includes('zero')
      );
      if (isExcludedRow) {
        break;
      }
      pureDataRowCount++;
    }
    if (pureDataRowCount === 0) pureDataRowCount = numRows;

    // Native Google Sheets API: data is always written starting at A1 (row index 0).
    // The chart overlay position is independent of data location — no row offset needed.
    // (The previous offset of 15 was a remnant from ExcelJS binary layout where Top Hero
    //  charts occupied rows 0-14 and pushed data to row 16. This does not apply to Sheets API.)
    const startRowIdx = 0;

    if (chartDef.type === 'PIE') {
      let pieValCol = valCols[0];
      if (!chartDef.valueColumns || chartDef.valueColumns.length === 0) {
        const inferences = SpreadsheetFormatter.inferColumnInferences(headers, rows);
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

    const isHorizontalBar = chartType === 'BAR';
    const seriesTargetAxis = isHorizontalBar ? 'BOTTOM_AXIS' : 'LEFT_AXIS';

    // BasicChartSpec includes the header row at startRowIdx because headerCount: 1 is set
    const basicStartRow = startRowIdx;
    const basicEndRow = startRowIdx + 1 + pureDataRowCount;

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
                } : (idx === 2 ? {
                  rgbColor: { red: 0.851, green: 0.467, blue: 0.024 } // Amber #D97706
                } : (idx === 3 ? {
                  rgbColor: { red: 0.486, green: 0.227, blue: 0.929 } // Violet #7C3AED
                } : undefined))),
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
}
