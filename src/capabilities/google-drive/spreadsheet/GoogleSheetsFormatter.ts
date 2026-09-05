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
        return { type: 'CURRENCY', pattern: '"Rp"#,##0' };
      }
      if (curr === 'USD' || curr === 'USDC' || curr === 'USDT') {
        return { type: 'CURRENCY', pattern: '$#,##0.00' };
      }
      if (curr === 'EUR') {
        return { type: 'CURRENCY', pattern: '€#,##0.00' };
      }
      if (curr === 'GBP') {
        return { type: 'CURRENCY', pattern: '£#,##0.00' };
      }
      if (curr === 'JPY') {
        return { type: 'CURRENCY', pattern: '¥#,##0' };
      }
      if (curr === 'SGD' || curr === 'S$') {
        return { type: 'CURRENCY', pattern: 'S$#,##0.00' };
      }
      if (curr === 'MYR' || curr === 'RM') {
        return { type: 'CURRENCY', pattern: '"RM"#,##0.00' };
      }
      if (curr === 'SAR') {
        return { type: 'CURRENCY', pattern: '"SAR"#,##0.00' };
      }
      if (colInf.numFmt) {
        return { type: 'NUMBER', pattern: colInf.numFmt };
      }
      return { type: 'CURRENCY', pattern: '$#,##0.00' };
    }

    if (colInf.type === 'percentage') {
      return { type: 'PERCENT', pattern: colInf.numFmt || '0.0%' };
    }

    if (colInf.type === 'number') {
      return { type: 'NUMBER', pattern: colInf.numFmt || '#,##0.00' };
    }

    if (colInf.type === 'formula') {
      return { type: 'NUMBER', pattern: colInf.numFmt || '#,##0.00' };
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
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(numberFormat,horizontalAlignment,verticalAlignment)'
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
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
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
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(verticalAlignment)'
          }
        });
      }
    });

    // 6. Dynamic Zebra Striping (Conditional Formatting Rule on Even Rows)
    if (numRows > 1) {
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [
              {
                sheetId,
                startRowIndex: 1,
                endRowIndex: totalRowCount,
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
}
