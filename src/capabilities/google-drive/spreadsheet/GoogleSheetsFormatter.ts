/**
 * GoogleSheetsFormatter — Translates SERA column inference & styling into Google Sheets API v4 batchUpdate requests.
 *
 * Emits native Google Sheets requests:
 * - Header row styling (Executive Emerald / Slate theme, bold white text, row height)
 * - Freeze header row (frozenRowCount: 1)
 * - Dynamic Zebra Striping (ISEVEN(ROW()) conditional format)
 * - Intelligent Number & Currency formatting (IDR, USD, EUR, %, #,##0)
 * - Status Badge Conditional Formatting (Green, Amber, Red, Blue)
 * - Subtle grid borders and auto column width resizing
 * - Executive Summary / Totals row formatting
 */

import { ColumnInference, SpreadsheetOptions } from './spreadsheet.types';
import { SpreadsheetFormatter } from './SpreadsheetFormatter';
import { SpreadsheetChartBuilder } from './SpreadsheetChartBuilder';
import { SpreadsheetFormulaEngine } from './SpreadsheetFormulaEngine';

export interface RgbColor {
  red: number;
  green: number;
  blue: number;
  alpha?: number;
}

export class GoogleSheetsFormatter {
  public static readonly DEFAULT_HEADER_COLOR = '065F46'; // Executive Emerald-800
  public static readonly ZEBRA_ROW_COLOR = 'F8FAFC';       // Slate-50
  public static readonly SUMMARY_ROW_COLOR = 'F1F5F9';     // Slate-100
  public static readonly BORDER_COLOR = 'E2E8F0';          // Slate-200

  /**
   * Converts 6-digit hex string (with or without #) to Google Sheets API 0.0-1.0 RGB object.
   */
  public static hexToRgb(hex: string): RgbColor {
    const clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
      const r = parseInt(clean[0] + clean[0], 16) / 255;
      const g = parseInt(clean[1] + clean[1], 16) / 255;
      const b = parseInt(clean[2] + clean[2], 16) / 255;
      return { red: r, green: g, blue: b };
    }
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return {
      red: isNaN(r) ? 0 : r,
      green: isNaN(g) ? 0 : g,
      blue: isNaN(b) ? 0 : b
    };
  }

  /**
   * Resolves appropriate Google Sheets numberFormat pattern for a given column inference.
   */
  public static resolveNumberFormat(colInf: ColumnInference): { type: string; pattern?: string } | null {
    if (colInf.type === 'currency') {
      const curr = (colInf.currency || '').toUpperCase();
      if (curr === 'IDR' || curr === 'RP') {
        return { type: 'CURRENCY', pattern: '"Rp"#,##0;("Rp"#,##0);"-"' };
      }
      if (curr === 'USD' || curr === 'USDC' || curr === 'USDT') {
        return { type: 'CURRENCY', pattern: '$#,##0.00;($#,##0.00);"-"' };
      }
      if (curr === 'EUR') {
        return { type: 'CURRENCY', pattern: '€#,##0.00;(€#,##0.00);"-"' };
      }
      if (curr === 'GBP') {
        return { type: 'CURRENCY', pattern: '£#,##0.00;(£#,##0.00);"-"' };
      }
      if (curr === 'JPY') {
        return { type: 'CURRENCY', pattern: '¥#,##0;(¥#,##0);"-"' };
      }
      if (curr === 'SGD' || curr === 'S$') {
        return { type: 'CURRENCY', pattern: 'S$#,##0.00;(S$#,##0.00);"-"' };
      }
      if (curr === 'MYR' || curr === 'RM') {
        return { type: 'CURRENCY', pattern: '"RM"#,##0.00;("RM"#,##0.00);"-"' };
      }
      if (curr === 'SAR') {
        return { type: 'CURRENCY', pattern: '"SAR"#,##0.00;("SAR"#,##0.00);"-"' };
      }
      if (colInf.numFmt) {
        const p = colInf.numFmt.includes(';') ? colInf.numFmt : `${colInf.numFmt};(${colInf.numFmt});"-"`;
        return { type: 'NUMBER', pattern: p };
      }
      return { type: 'CURRENCY', pattern: '$#,##0.00;($#,##0.00);"-"' };
    }

    if (colInf.type === 'percentage') {
      const baseFmt = colInf.numFmt || '0.0%';
      const p = baseFmt.includes(';') ? baseFmt : `${baseFmt};-${baseFmt};"-"`;
      return { type: 'PERCENT', pattern: p };
    }

    if (colInf.type === 'number') {
      const baseFmt = colInf.numFmt || '#,##0.00';
      if (baseFmt === '#,##0') {
        return { type: 'NUMBER', pattern: '#,##0' };
      }
      const p = baseFmt.includes(';') ? baseFmt : `${baseFmt};(${baseFmt});"-"`;
      return { type: 'NUMBER', pattern: p };
    }

    if (colInf.type === 'formula') {
      const baseFmt = colInf.numFmt || '#,##0.00';
      const p = baseFmt.includes(';') ? baseFmt : `${baseFmt};(${baseFmt});"-"`;
      return { type: 'NUMBER', pattern: p };
    }

    if (colInf.type === 'date') {
      return { type: 'DATE', pattern: 'yyyy-mm-dd' };
    }

    return null;
  }

  /**
   * Pre-processes data rows before writing to Google Sheets API v4.
   *
   * Converts formatted currency strings, percentage strings, and number strings
   * to raw JavaScript numbers. Google Sheets numberFormat (applied via batchUpdate)
   * handles the visual display formatting.
   *
   * This prevents locale-dependent parsing issues where USER_ENTERED mode might
   * misinterpret "79.605,68" vs "79,605.68" depending on spreadsheet locale.
   *
   * - Formulas (strings starting with '=') are preserved as-is for Sheets evaluation.
   * - Formula objects ({ formula: '...' }) are converted to '=formula' strings.
   * - Currency/Number strings are parsed to raw numbers via parseFlexibleNumeric.
   * - Percentage strings are parsed to 0.0-1.0 decimal scale.
   */
  public static normalizeRowsForNativeSheetsApi(
    headers: string[],
    rows: any[][]
  ): any[][] {
    if (!rows || rows.length === 0) return rows;

    const inferences = SpreadsheetFormatter.inferColumnInferences(headers, rows);

    return rows.map(row => {
      return row.map((val, colIdx) => {
        if (val === null || val === undefined || val === '') return val;

        const colInf = inferences[colIdx];
        if (!colInf) return val;

        // Already a number — pass through directly (no locale ambiguity)
        if (typeof val === 'number') {
          // For percentage columns: ensure value is in 0.0-1.0 decimal scale
          if (colInf.type === 'percentage' && (val > 1 || val < -1)) {
            return val / 100;
          }
          return val;
        }

        const strVal = String(val).trim();

        // Preserve formulas (starts with '=') — let Sheets evaluate them
        if (strVal.startsWith('=')) return strVal;

        // Handle formula objects: convert to '=formula' string for USER_ENTERED mode
        if (typeof val === 'object' && val !== null && 'formula' in val) {
          const formula = String(val.formula || '').trim();
          return formula.startsWith('=') ? formula : `=${formula}`;
        }

        // Currency column: strip symbols, parse to raw number
        if (colInf.type === 'currency') {
          const numeric = SpreadsheetFormatter.parseFlexibleNumeric(val, true);
          if (numeric !== null && !isNaN(numeric)) return numeric;
        }

        // Percentage column: parse to decimal (0.0-1.0 range for Google Sheets PERCENT format)
        if (colInf.type === 'percentage') {
          const cleanStr = strVal.replace(/%/g, '').replace(/\+/g, '').replace(/\s+/g, '').replace(/,/g, '.');
          const parsed = parseFloat(cleanStr);
          if (!isNaN(parsed)) {
            // If originally had '%' sign, it's on 0-100 scale → divide by 100
            if (strVal.includes('%')) return parsed / 100;
            // If > 1 or < -1 without '%', assume 0-100 scale
            if (parsed > 1 || parsed < -1) return parsed / 100;
            return parsed;
          }
        }

        // Number column: parse to raw number
        if (colInf.type === 'number') {
          const numeric = SpreadsheetFormatter.parseFlexibleNumeric(val, false);
          if (numeric !== null && !isNaN(numeric)) return numeric;
        }

        // Text, status, date, boolean, formula: pass through as-is
        return val;
      });
    });
  }

  /**
   * Builds the complete set of batchUpdate requests to apply professional styling to a sheet tab.
   */
  public static buildFormattingRequests(
    sheetId: number,
    headers: string[],
    rows: any[][],
    options?: SpreadsheetOptions
  ): any[] {
    const requests: any[] = [];
    const numColumns = headers.length;
    const numRows = rows.length;
    const totalRowCount = Math.max(numRows + 1, 2); // At least header + 1 row
    const gridRowCount = Math.max(totalRowCount + 15, 60);
    const gridColCount = Math.max(numColumns + 15, 26);

    const lastRow = rows[rows.length - 1];
    const hasSummaryRow = rows.length > 0 && lastRow && (
      String(lastRow[0] || '').toLowerCase().trim() === 'total' ||
      String(lastRow[0] || '').toLowerCase().trim() === 'summary' ||
      String(lastRow[0] || '').toLowerCase().trim() === 'jumlah'
    );
    const pureDataRowCount = hasSummaryRow ? rows.length - 1 : rows.length;

    const headerHex = options?.themeColor || this.DEFAULT_HEADER_COLOR;
    const headerRgb = this.hexToRgb(headerHex);
    const whiteRgb = this.hexToRgb('FFFFFF');
    const borderRgb = this.hexToRgb(this.BORDER_COLOR);

    // 1. Freeze Header Row
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1
          }
        },
        fields: 'gridProperties.frozenRowCount'
      }
    });

    // 2. Format Header Row (Background, White Bold Text, Centered, Middle)
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: numColumns
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: headerRgb,
            textFormat: {
              foregroundColor: whiteRgb,
              bold: true,
              fontSize: 10
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
      }
    });

    // 3. Set Header Row Height to 32px for breathing room
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: 0,
          endIndex: 1
        },
        properties: {
          pixelSize: 32
        },
        fields: 'pixelSize'
      }
    });

    // 4. Subtle Borders across the entire table
    requests.push({
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: totalRowCount,
          startColumnIndex: 0,
          endColumnIndex: numColumns
        },
        top: { style: 'SOLID', color: borderRgb },
        bottom: { style: 'SOLID', color: borderRgb },
        left: { style: 'SOLID', color: borderRgb },
        right: { style: 'SOLID', color: borderRgb },
        innerHorizontal: { style: 'SOLID', color: borderRgb },
        innerVertical: { style: 'SOLID', color: borderRgb }
      }
    });

    // 4a. Set grid dimensions to match table plus comfortable breathing room (15 buffer rows)
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            rowCount: gridRowCount,
            columnCount: gridColCount
          }
        },
        fields: 'gridProperties(rowCount,columnCount)'
      }
    });

    // 4b. Reset leftover cell formats across entire grid to pure white
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: gridRowCount,
          startColumnIndex: 0,
          endColumnIndex: gridColCount
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 1 },
            textFormat: { bold: false },
            horizontalAlignment: 'LEFT',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat.bold,horizontalAlignment,verticalAlignment,numberFormat)'
      }
    });

    // 5. Apply Column-specific Number and Currency Formats
    const inferences = SpreadsheetFormatter.inferColumnInferences(headers, rows);

    inferences.forEach((colInf, colIndex) => {
      const numFormat = this.resolveNumberFormat(colInf);
      if (numFormat && numRows > 0) {
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: totalRowCount,
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1
            },
            cell: {
              userEnteredFormat: {
                numberFormat: numFormat,
                horizontalAlignment: 'RIGHT',
                verticalAlignment: 'MIDDLE',
                textFormat: { bold: false }
              }
            },
            fields: 'userEnteredFormat(numberFormat,horizontalAlignment,verticalAlignment,textFormat.bold)'
          }
        });
      } else if (colInf.type === 'status' && numRows > 0) {
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: totalRowCount,
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                textFormat: { bold: false }
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat.bold)'
          }
        });
      } else if (numRows > 0) {
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: totalRowCount,
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'MIDDLE',
                textFormat: { bold: false }
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat.bold)'
          }
        });
      }
    });

    // 6. Dynamic Zebra Striping (Conditional Formatting Rule on Even Rows for pure data rows only)
    if (pureDataRowCount > 1) {
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [
              {
                sheetId,
                startRowIndex: 1,
                endRowIndex: 1 + pureDataRowCount,
                startColumnIndex: 0,
                endColumnIndex: numColumns
              }
            ],
            booleanRule: {
              condition: {
                type: 'CUSTOM_FORMULA',
                values: [{ userEnteredValue: '=ISEVEN(ROW())' }]
              },
              format: {
                backgroundColor: this.hexToRgb(this.ZEBRA_ROW_COLOR)
              }
            }
          },
          index: 0
        }
      });
    }

    // 7. Status Badges Conditional Formatting Rules (for any status column)
    inferences.forEach((colInf, colIndex) => {
      const isStatus =
        colInf.type === 'status' ||
        headers[colIndex]?.toLowerCase().includes('status') ||
        headers[colIndex]?.toLowerCase().includes('state');

      if (isStatus && numRows > 0) {
        const statusRange = {
          sheetId,
          startRowIndex: 1,
          endRowIndex: totalRowCount,
          startColumnIndex: colIndex,
          endColumnIndex: colIndex + 1
        };

        // Green Badges (Completed, Success, Paid, Active, Lunas, Selesai)
        requests.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [statusRange],
              booleanRule: {
                condition: {
                  type: 'CUSTOM_FORMULA',
                  values: [
                    {
                      userEnteredValue:
                        '=REGEXMATCH(LOWER(INDIRECT(ADDRESS(ROW(), COLUMN()))), "(completed|complete|success|successful|paid|approved|done|active|profit|win|lunas|selesai|berhasil|disetujui)")'
                    }
                  ]
                },
                format: {
                  backgroundColor: this.hexToRgb('DCFCE7'),
                  textFormat: {
                    foregroundColor: this.hexToRgb('15803D'),
                    bold: true
                  }
                }
              }
            },
            index: 0
          }
        });

        // Amber Badges (Pending, In Progress, Review, Draft, Proses, Menunggu)
        requests.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [statusRange],
              booleanRule: {
                condition: {
                  type: 'CUSTOM_FORMULA',
                  values: [
                    {
                      userEnteredValue:
                        '=REGEXMATCH(LOWER(INDIRECT(ADDRESS(ROW(), COLUMN()))), "(pending|progress|processing|review|waiting|hold|draft|proses|menunggu|tinjau|antrian)")'
                    }
                  ]
                },
                format: {
                  backgroundColor: this.hexToRgb('FEF3C7'),
                  textFormat: {
                    foregroundColor: this.hexToRgb('B45309'),
                    bold: true
                  }
                }
              }
            },
            index: 0
          }
        });

        // Red Badges (Failed, Rejected, Canceled, Error, Overdue, Gagal, Batal, Ditolak)
        requests.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [statusRange],
              booleanRule: {
                condition: {
                  type: 'CUSTOM_FORMULA',
                  values: [
                    {
                      userEnteredValue:
                        '=REGEXMATCH(LOWER(INDIRECT(ADDRESS(ROW(), COLUMN()))), "(fail|failed|reject|rejected|cancel|cancelled|canceled|loss|error|overdue|batal|gagal|ditolak|kadaluarsa)")'
                    }
                  ]
                },
                format: {
                  backgroundColor: this.hexToRgb('FEE2E2'),
                  textFormat: {
                    foregroundColor: this.hexToRgb('B91C1C'),
                    bold: true
                  }
                }
              }
            },
            index: 0
          }
        });

        // Blue Badges (Open, New, Baru, Info)
        requests.push({
          addConditionalFormatRule: {
            rule: {
              ranges: [statusRange],
              booleanRule: {
                condition: {
                  type: 'CUSTOM_FORMULA',
                  values: [
                    {
                      userEnteredValue:
                        '=REGEXMATCH(LOWER(INDIRECT(ADDRESS(ROW(), COLUMN()))), "(open|new|info|baru)")'
                    }
                  ]
                },
                format: {
                  backgroundColor: this.hexToRgb('DBEAFE'),
                  textFormat: {
                    foregroundColor: this.hexToRgb('1D4ED8'),
                    bold: true
                  }
                }
              }
            },
            index: 0
          }
        });
      }
    });

    // 7b. Executive Summary / TOTAL Row Styling (Slate-100, Bold Text, Top Thin & Bottom DOUBLE Border)
    if (hasSummaryRow) {
      const summaryRowIdx = totalRowCount - 1;
      const summaryRgb = this.hexToRgb(this.SUMMARY_ROW_COLOR);
      const textNavyRgb = this.hexToRgb('0F172A');

      // Summary row background & bold text
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: summaryRowIdx,
            endRowIndex: summaryRowIdx + 1,
            startColumnIndex: 0,
            endColumnIndex: numColumns
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: summaryRgb,
              textFormat: {
                foregroundColor: textNavyRgb,
                bold: true,
                fontSize: 10
              },
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
        }
      });

      // Accounting standard double underline on the bottom of the Total row
      requests.push({
        updateBorders: {
          range: {
            sheetId,
            startRowIndex: summaryRowIdx,
            endRowIndex: summaryRowIdx + 1,
            startColumnIndex: 0,
            endColumnIndex: numColumns
          },
          top: { style: 'SOLID', color: borderRgb },
          bottom: { style: 'DOUBLE', color: borderRgb }
        }
      });

      // Set summary row height (26px)
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: summaryRowIdx,
            endIndex: summaryRowIdx + 1
          },
          properties: {
            pixelSize: 26
          },
          fields: 'pixelSize'
        }
      });
    }

    // 7c. Ensure all buffer rows below Total row are clean white with no custom borders
    if (gridRowCount > totalRowCount) {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: totalRowCount,
            endRowIndex: gridRowCount,
            startColumnIndex: 0,
            endColumnIndex: gridColCount
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 1, green: 1, blue: 1 },
              textFormat: { bold: false },
              horizontalAlignment: 'LEFT',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat.bold,horizontalAlignment,verticalAlignment)'
        }
      });
    }

    // 8. Auto-fit column widths
    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: numColumns
        }
      }
    });

    return requests;
  }

  /**
   * Generates a native Google Sheets summary row (with live =SUM() formulas and accounting unit-price dashes)
   * if the dataset contains numeric/currency columns and does not already include an existing Total row.
   */
  public static generateNativeSummaryRow(
    headers: string[],
    rows: any[][],
    options?: SpreadsheetOptions
  ): any[] | null {
    if (!headers || headers.length === 0 || !rows || rows.length === 0) return null;

    // 1. Check if rows already contains an existing Total / Summary row
    const hasExistingSummary = rows.some(r => {
      const firstCell = String(r[0] || '').toLowerCase().trim();
      return firstCell === 'total' || firstCell === 'summary' || firstCell === 'jumlah' || firstCell === 'rata-rata' || firstCell === 'average';
    });
    if (hasExistingSummary) return null;

    // 2. Determine if summary row should be added
    const inferences = SpreadsheetFormatter.inferColumnInferences(headers, rows);
    const shouldAddSummary = options?.includeSummaryRow !== false && (
      options?.includeSummaryRow === true ||
      (rows.length > 1 && inferences.some(t => t.type === 'currency' || t.type === 'number' || t.type === 'formula'))
    );
    if (!shouldAddSummary) return null;

    const firstDataRowNum = 2; // Row 1 is header
    const lastDataRowNum = 1 + rows.length;
    const summaryRowNum = 2 + rows.length;

    // Pre-identify Profit, Revenue, and Cost columns for ratio formulas
    const profitColIdx = headers.findIndex(h => {
      const lh = h.toLowerCase();
      return lh.includes('profit') || lh.includes('laba') || lh.includes('net');
    });
    let revColIdx = headers.findIndex(h => {
      const lh = h.toLowerCase();
      return (lh.includes('revenue') || lh.includes('pendapatan') || lh.includes('omset') || lh.includes('penjualan') || lh.includes('sales') || (lh.includes('total') && !lh.includes('unit') && !lh.includes('qty'))) && h !== headers[profitColIdx];
    });
    if (revColIdx === -1) {
      revColIdx = headers.findIndex(h => {
        const lh = h.toLowerCase();
        return (lh.includes('harga') || lh.includes('price')) && h !== headers[profitColIdx];
      });
    }
    let costColIdx = headers.findIndex(h => {
      const lh = h.toLowerCase();
      return (lh.includes('hpp') || (lh.includes('cost') && !lh.includes('unit')) || lh.includes('biaya') || lh.includes('expense') || (lh.includes('modal') && !lh.includes('unit') && !lh.includes('satuan')));
    });
    if (costColIdx === -1) {
      costColIdx = headers.findIndex(h => {
        const lh = h.toLowerCase();
        return lh.includes('cost') || lh.includes('modal');
      });
    }

    const summaryRow: any[] = [];
    headers.forEach((h, colIndex) => {
      if (colIndex === 0) {
        summaryRow.push('Total');
        return;
      }

      const colInf = inferences[colIndex];
      const colLetter = SpreadsheetChartBuilder.getColumnLetter(colIndex + 1);
      const lowerH = (h || '').toLowerCase().trim();

      const isPercentageOrRatio = (
        colInf.type === 'percentage' ||
        lowerH.includes('%') ||
        lowerH.includes('persen') ||
        lowerH.includes('percent') ||
        lowerH.includes('growth') ||
        lowerH.includes('rasio') ||
        lowerH.includes('ratio') ||
        lowerH.includes('roi') ||
        lowerH.includes('yield') ||
        lowerH.includes('terpakai') ||
        lowerH.includes('realisasi') ||
        lowerH.includes('pencapaian') ||
        lowerH.includes('margin')
      ) && !lowerH.includes('bobot') && !lowerH.includes('alokasi') && !lowerH.includes('porsi') && !lowerH.includes('share');

      // Explicit unit prices and rates should never be summed
      const isExplicitUnitPrice =
        lowerH.includes('unit price') || lowerH.includes('unit_price') ||
        lowerH.includes('harga satuan') || lowerH.includes('harga_satuan') ||
        lowerH.includes('modal unit') || lowerH.includes('modal satuan') ||
        lowerH.includes('unit cost') || lowerH.includes('cost per unit') ||
        lowerH.includes('price per unit') || lowerH.includes('price/unit') ||
        lowerH.includes('harga/unit') || lowerH.includes('harga per unit') ||
        lowerH.includes('harga unit') || lowerH.includes('fee_per') || lowerH.includes('fee per') ||
        lowerH.includes('rate per') || lowerH.includes('kurs') ||
        lowerH.includes('bid') || lowerH.includes('ask') || lowerH.includes('mid') ||
        (/\b(id|no|rank|kode|ticker)\b/i.test(lowerH));

      // Contextual unit price (e.g. 'Harga Jual' / 'Selling Price') when a separate revenue/turnover column exists
      // Contextual unit price (e.g. 'Harga Jual' / 'Selling Price' / 'Harga Beli' / 'Harga (USDC)') when a separate revenue/turnover/valuation column exists
      const isSellingOrBuyPrice = lowerH.includes('harga jual') || lowerH.includes('harga beli') ||
        lowerH.includes('selling price') || lowerH.includes('buy price') ||
        lowerH === 'harga' || lowerH.startsWith('harga (') || lowerH.startsWith('harga /') ||
        lowerH === 'price' || lowerH.startsWith('price (') || lowerH.startsWith('price /');
      const hasSeparateRevenue = isSellingOrBuyPrice && (
        headers.some(hdr => {
          const l = (hdr || '').toLowerCase().trim();
          return l !== lowerH && (
            l.includes('pendapatan') || l.includes('omset') || l.includes('omzet') || l.includes('revenue') ||
            l.includes('total penjualan') || l.includes('sales') || l.includes('volume') ||
            l.includes('nilai') || l.includes('valuasi') || l.includes('valuation') ||
            l.includes('inventory') || l.includes('persediaan') || l.includes('subtotal') ||
            (l.includes('total') && !l.includes('unit') && !l.includes('sku'))
          );
        }) ||
        (lowerH.includes('harga beli') && headers.some(h => (h || '').toLowerCase().includes('harga jual'))) ||
        (lowerH.includes('harga jual') && headers.some(h => (h || '').toLowerCase().includes('harga beli'))) ||
        headers.some(h => {
          const lh = (h || '').toLowerCase();
          return lh.includes('stok') || lh.includes('stock') || lh.includes('qty') || lh.includes('jumlah') || lh.includes('kuantitas');
        })
      );

      const isUnitPriceOrRate = isExplicitUnitPrice || hasSeparateRevenue || colInf.type === 'boolean';

      if (colInf.isMixedCurrency || (isUnitPriceOrRate && !isPercentageOrRatio)) {
        summaryRow.push('-');
        return;
      }

      if (colInf.type === 'text' || colInf.type === 'status' || colInf.type === 'date' || colInf.type === 'boolean') {
        summaryRow.push('-');
        return;
      }

      if (isPercentageOrRatio) {
        // Look for formula in data rows
        let firstRowFormula: string | undefined;
        for (const r of rows) {
          const raw = r[colIndex];
          if (typeof raw === 'string' && raw.trim().startsWith('=')) {
            firstRowFormula = raw.trim();
            break;
          }
        }
        if (firstRowFormula) {
          const adapted = SpreadsheetFormulaEngine.adaptRowFormulaToSummaryRow(firstRowFormula, summaryRowNum);
          summaryRow.push(adapted.startsWith('=') ? adapted : `=${adapted}`);
          return;
        }

        // GAAP: Catalog discount rate per item without derived row formula should not be averaged on a Total row
        const isDiscountRate = lowerH.includes('diskon') || lowerH.includes('discount');
        if (isDiscountRate) {
          summaryRow.push('-');
          return;
        }

        // Ratio of profit and revenue
        if (profitColIdx !== -1 && revColIdx !== -1) {
          const pLetter = SpreadsheetChartBuilder.getColumnLetter(profitColIdx + 1);
          const rLetter = SpreadsheetChartBuilder.getColumnLetter(revColIdx + 1);
          summaryRow.push(`=IFERROR(${pLetter}${summaryRowNum}/${rLetter}${summaryRowNum}, "-")`);
          return;
        }

        // Fallback: statistical average
        summaryRow.push(`=IFERROR(AVERAGE(${colLetter}${firstDataRowNum}:${colLetter}${lastDataRowNum}), "-")`);
        return;
      }

      const isSummable = !isUnitPriceOrRate && (
        options?.includeSummaryRow === true ||
        colInf.type === 'currency' ||
        lowerH.includes('interest') || lowerH.includes('liquidity') || lowerH.includes('turnover') ||
        lowerH.includes('collateral') || lowerH.includes('tvl') || lowerH.includes('funding') ||
        lowerH.includes('price') || lowerH.includes('harga') || lowerH.includes('fee') ||
        lowerH.includes('cost') || lowerH.includes('hpp') || lowerH.includes('modal') ||
        lowerH.includes('volume') || lowerH.includes('nominal') || lowerH.includes('total') ||
        lowerH.includes('omset') || lowerH.includes('revenue') || lowerH.includes('pendapatan') ||
        lowerH.includes('penjualan') || lowerH.includes('sales') ||
        lowerH.includes('biaya') || lowerH.includes('expense') || lowerH.includes('amount') ||
        lowerH.includes('saldo') || lowerH.includes('balance') || lowerH.includes('cap') ||
        lowerH.includes('subtotal') || lowerH.includes('laba') || lowerH.includes('profit') || lowerH.includes('loss') ||
        lowerH.includes('qty') || lowerH.includes('quantity') || lowerH.includes('jumlah') ||
        lowerH.includes('terjual') || lowerH.includes('unit') ||
        lowerH.includes('stok') || lowerH.includes('stock') || lowerH.includes('inventory') ||
        lowerH.includes('count') || lowerH.includes('porsi') || lowerH.includes('share') ||
        lowerH.includes('bobot') || lowerH.includes('alokasi') || lowerH.includes('budget') || lowerH.includes('anggaran') ||
        lowerH.includes('spend') || lowerH.includes('actual') || lowerH.includes('aktual') || lowerH.includes('target') ||
        lowerH.includes('variance') || lowerH.includes('selisih')
      );

      if (isSummable && (colInf.type === 'currency' || colInf.type === 'number' || colInf.type === 'formula')) {
        summaryRow.push(`=SUM(${colLetter}${firstDataRowNum}:${colLetter}${lastDataRowNum})`);
      } else {
        summaryRow.push('-');
      }
    });

    return summaryRow;
  }

  /**
   * Sanitizes and normalizes raw spreadsheet input from LLMs, APIs, or user prompts.
   * Handles stringified JSON payloads, array-of-objects schemas, and unaligned columns.
   */
  public static normalizeSpreadsheetInput(
    rawHeaders?: any,
    rawRows?: any
  ): { headers: string[]; rows: any[][] } {
    let headers: string[] = [];
    let rows: any[][] = [];

    // 1. Normalize headers
    if (typeof rawHeaders === 'string') {
      try {
        const parsed = JSON.parse(rawHeaders);
        if (Array.isArray(parsed)) headers = parsed.map(String);
      } catch {
        headers = rawHeaders.split(',').map(s => s.trim()).filter(Boolean);
      }
    } else if (Array.isArray(rawHeaders)) {
      headers = rawHeaders.map(String);
    }

    // 2. Normalize rows
    let candidateRows = rawRows;
    if (typeof candidateRows === 'string') {
      const trimmed = candidateRows.trim();
      try {
        candidateRows = JSON.parse(trimmed);
      } catch {
        // Strip markdown code fences if any
        let clean = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
        try {
          candidateRows = JSON.parse(clean);
        } catch {
          // If missing outer array brackets e.g. ["a", 1], ["b", 2] or ["a", 1], ["b", 2]]
          if (!clean.startsWith('[')) clean = `[${clean}`;
          if (!clean.endsWith(']')) clean = `${clean}]`;
          try {
            candidateRows = JSON.parse(clean);
          } catch {
            // Line-by-line JSON line recovery
            const lines = trimmed.split('\n').map(l => l.trim().replace(/^,+|,+$/g, '')).filter(Boolean);
            const recovered: any[][] = [];
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line.startsWith('[') ? line : `[${line}]`);
                if (Array.isArray(parsed)) recovered.push(parsed);
              } catch {}
            }
            if (recovered.length > 0) {
              candidateRows = recovered;
            } else {
              candidateRows = [];
            }
          }
        }
      }
    }

    // Handle nested { rows: [...] } or { data: [...] }
    if (candidateRows && typeof candidateRows === 'object' && !Array.isArray(candidateRows)) {
      if (Array.isArray(candidateRows.rows)) candidateRows = candidateRows.rows;
      else if (Array.isArray(candidateRows.data)) candidateRows = candidateRows.data;
      else candidateRows = Object.values(candidateRows);
    }

    if (Array.isArray(candidateRows)) {
      if (candidateRows.length > 0 && typeof candidateRows[0] === 'object' && !Array.isArray(candidateRows[0]) && candidateRows[0] !== null) {
        // Candidate rows is an array of objects: [ { Token: 'BTC', Price: 65000 }, ... ]
        if (headers.length === 0) {
          headers = Object.keys(candidateRows[0]);
        }
        rows = candidateRows.map(obj => {
          if (typeof obj === 'object' && obj !== null) {
            return headers.map(h => (obj as any)[h] !== undefined ? (obj as any)[h] : '');
          }
          return [obj];
        });
      } else {
        // Candidate rows is array of arrays or primitives
        rows = candidateRows.map(r => {
          if (Array.isArray(r)) return r;
          if (typeof r === 'object' && r !== null) return Object.values(r);
          return [r];
        });
      }
    }

    // Filter out rows that are completely empty (e.g. [[]], [''], or all cells null/undefined)
    rows = rows.filter(r => Array.isArray(r) && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));

    // If headers still empty and we have at least one row
    if (headers.length === 0 && rows.length > 0) {
      headers = rows[0].map((_, i) => `Column ${i + 1}`);
    }

    return { headers, rows };
  }
}
