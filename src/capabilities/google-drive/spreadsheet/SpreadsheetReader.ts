import ExcelJS from 'exceljs';
import { SpreadsheetChartBuilder } from './SpreadsheetChartBuilder';
import { SpreadsheetFormulaEngine } from './SpreadsheetFormulaEngine';

export class SpreadsheetReader {
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
      const cIdx = SpreadsheetChartBuilder.columnLetterToIndex(colLetter);
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
        // 1. Resolve Formula if present
        if (val !== null && typeof val === 'object') {
          if ('result' in val) {
            if (typeof val.result === 'object' && val.result !== null && 'error' in val.result) {
              val = val.result.error;
            } else if (val.result !== undefined && val.result !== null) {
              val = val.result;
            }
          }
        }

        if (val !== null && typeof val === 'object' && 'formula' in val) {
          const formulaStr = String(val.formula || '').replace(/\$/g, '').trim();
          
          let evalFormula = formulaStr;
          let ifErrorFallback: string | number | null = null;
          const ifErrorMatch = formulaStr.match(/^IFERROR\((.+?),\s*["']?([^"']*)["']?\)$/i);
          if (ifErrorMatch) {
            evalFormula = ifErrorMatch[1].trim();
            ifErrorFallback = ifErrorMatch[2] === '-' ? '-' : (!isNaN(parseFloat(ifErrorMatch[2])) ? parseFloat(ifErrorMatch[2]) : ifErrorMatch[2]);
          }

          // Formula: SUM(B2:B6) or SUM(B17:B21)
          const sumMatch = evalFormula.match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/i);
          if (sumMatch) {
            const [, col1, startRow, , endRow] = sumMatch;
            let sum = 0;
            for (let r = parseInt(startRow, 10); r <= parseInt(endRow, 10); r++) {
              sum += getCellNumeric(col1, r);
            }
            val = sum;
          } else {
            // Formula: AVERAGE(B2:B6) or AVERAGE(B17:B21)
            const avgMatch = evalFormula.match(/^AVERAGE\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/i);
            if (avgMatch) {
              const [, col1, startRow, , endRow] = avgMatch;
              let sum = 0;
              let count = 0;
              for (let r = parseInt(startRow, 10); r <= parseInt(endRow, 10); r++) {
                sum += getCellNumeric(col1, r);
                count++;
              }
              val = count > 0 ? sum / count : (ifErrorFallback !== null ? ifErrorFallback : 0);
            } else {
              // Try SpreadsheetFormulaEngine in row context
              const targetRow = rIdx + 1;
              const rowVals = matrix[rIdx] || [];
              const evalRes = SpreadsheetFormulaEngine.evaluateRowFormula(evalFormula, rowVals, targetRow);
              if (evalRes !== undefined) {
                val = evalRes;
              } else {
                // Fallback: Cell arithmetic like C2*D2 or B2/B7
                const arithMatch = evalFormula.match(/^([A-Z]+)(\d+)\s*([*+\/-])\s*([A-Z]+)(\d+)$/i);
                if (arithMatch) {
                  const [, colA, rowA, op, colB, rowB] = arithMatch;
                  const numA = getCellNumeric(colA, parseInt(rowA, 10));
                  const numB = getCellNumeric(colB, parseInt(rowB, 10));
                  if (op === '*') val = numA * numB;
                  else if (op === '+') val = numA + numB;
                  else if (op === '-') val = numA - numB;
                  else if (op === '/') val = numB !== 0 ? numA / numB : (ifErrorFallback !== null ? ifErrorFallback : '-');
                } else {
                  val = `=${val.formula}`;
                }
              }
            }
          }
        }

        // 2. Format Value Cleanly for Agent Consumption (Zero [object Object] leaks)
        if (val === null || val === undefined) {
          rowVals.push('');
        } else if (typeof val === 'number') {
          const header = String(matrix[headerRowIdx]?.[cIdx] || '').toLowerCase();
          const isPercent = numFmt.includes('%') || 
            header.includes('porsi') || header.includes('%') || header.includes('percent') || 
            header.includes('share') || header.includes('proporsi') || header.includes('alokasi') ||
            header.includes('rasio') || header.includes('ratio') || header.includes('margin') ||
            header.includes('growth') || header.includes('roi') || header.includes('yield') ||
            header.includes('terpakai') || header.includes('realisasi');

          if (isPercent) {
            // Percentages: if numFmt has %, it is stored as fraction (e.g. 1.133 = 113.3%, 0.5 = 50%)
            let pct: number;
            if (numFmt.includes('%')) {
              pct = val * 100;
            } else {
              pct = Math.abs(val) <= 5.0 ? val * 100 : val;
            }
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
        } else if (typeof val === 'object' && val !== null) {
          // Absolute protection against [object Object]
          if ('text' in val) {
            rowVals.push(String(val.text ?? ''));
          } else if ('richText' in val) {
            const txt = (val as any).richText?.map((t: any) => t.text).join('') || '';
            rowVals.push(txt);
          } else if ('error' in val) {
            rowVals.push(String((val as any).error || '#ERROR!'));
          } else if ('result' in val) {
            rowVals.push(String((val as any).result));
          } else if ('formula' in val) {
            rowVals.push(`=${(val as any).formula}`);
          } else {
            rowVals.push('-');
          }
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
}
