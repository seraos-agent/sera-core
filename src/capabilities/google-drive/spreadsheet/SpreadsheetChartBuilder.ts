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
}
