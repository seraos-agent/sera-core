import ExcelJS from 'exceljs';
import { SheetDefinition, SpreadsheetOptions } from './spreadsheet.types';
import { SpreadsheetChartBuilder } from './SpreadsheetChartBuilder';
import { SpreadsheetFormulaEngine } from './SpreadsheetFormulaEngine';
import { SpreadsheetFormatter } from './SpreadsheetFormatter';

export class SpreadsheetLayoutBuilder {
  public static readonly DEFAULT_HEADER_COLOR = '0F172A'; // Slate 900 / Dark Navy
  public static readonly ZEBRA_ROW_COLOR = 'F8FAFC';     // Slate 50
  public static readonly SUMMARY_ROW_COLOR = 'F1F5F9';   // Slate 100
  public static readonly BORDER_COLOR = 'CBD5E1';        // Slate 300

  public static sanitizeSheetName(name: string): string {
    // Excel sheet names cannot contain: \ / ? * : [ ] and max 31 chars
    return (name || 'Sheet1')
      .replace(/[\\/?*:\[\]]/g, '_')
      .slice(0, 31);
  }

  public static async generateWorkbook(
    title: string,
    headers: string[],
    rows: any[][],
    options?: SpreadsheetOptions
  ): Promise<Buffer> {
    const sheetDef: SheetDefinition = {
      name: options?.sheetName || title || 'Sheet1',
      headers,
      rows,
      options
    };
    return this.generateMultiSheetWorkbook([sheetDef]);
  }

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

  public static populateWorksheet(worksheet: ExcelJS.Worksheet, def: SheetDefinition): void {
    const { headers, rows, options } = def;
    const headerColor = options?.themeColor || this.DEFAULT_HEADER_COLOR;
    const isHero = !!options?.chart && SpreadsheetChartBuilder.isTopHeroLayout(headers, rows, options.chart);

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

    worksheet.views = [
      { showGridLines: true }
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
    const columnInferences = SpreadsheetFormatter.inferColumnInferences(headers, pureDataRows);
    const rowOffset = isHero ? 15 : 0;

    // Pre-identify Revenue/Omset and Cost/HPP columns for Margin computation
    const profitColIdx = headers.findIndex(h => {
      const lh = h.toLowerCase();
      return lh.includes('profit') || lh.includes('laba') || lh.includes('net');
    });
    const revColIdx = headers.findIndex(h => {
      const lh = h.toLowerCase();
      return (lh.includes('revenue') || lh.includes('omset') || lh.includes('penjualan') || lh.includes('sales') || lh.includes('harga') || lh.includes('price')) && h !== headers[profitColIdx];
    });
    const costColIdx = headers.findIndex(h => {
      const lh = h.toLowerCase();
      return lh.includes('cost') || lh.includes('hpp') || lh.includes('biaya') || lh.includes('expense');
    });

    // 2. Add Pure Data Rows (Strictly excludes Total row)
    pureDataRows.forEach((rowValues, rowIndex) => {
      const row = worksheet.addRow([]);
      row.height = 22;
      const isZebra = rowIndex % 2 === 1;

      headers.forEach((h, colIndex) => {
        let rawVal = rowValues[colIndex] !== undefined ? rowValues[colIndex] : '';
        const cell = row.getCell(colIndex + 1);
        const colInf = columnInferences[colIndex];
        const lowerH = (h || '').toLowerCase().trim();

        // 1. If formula is present, validate, shift relative row numbers, and evaluate
        if (typeof rawVal === 'string' && rawVal.trim().startsWith('=')) {
          const cleanF = rawVal.trim().substring(1);
          if (SpreadsheetFormulaEngine.isValidExcelFormula(cleanF)) {
            const shifted = SpreadsheetFormulaEngine.shiftFormulaRowNumbers(rawVal.trim(), rowOffset);
            const evalRes = SpreadsheetFormulaEngine.evaluateRowFormula(shifted, rowValues, row.number);
            rawVal = {
              formula: shifted.startsWith('=') ? shifted.substring(1) : shifted,
              ...(evalRes !== undefined ? { result: evalRes } : {})
            };
            if (evalRes !== undefined) {
              rowValues[colIndex] = evalRes;
            }
          } else {
            // Literal text starting with '=' (e.g. "=BukanFormula+Test") -> preserve literal string
            rawVal = rawVal.trim();
          }
        } else if (typeof rawVal === 'object' && rawVal !== null && 'formula' in rawVal) {
          const shifted = SpreadsheetFormulaEngine.shiftFormulaRowNumbers(String(rawVal.formula || ''), rowOffset);
          const evalRes = rawVal.result !== undefined ? rawVal.result : SpreadsheetFormulaEngine.evaluateRowFormula(shifted, rowValues, row.number);
          rawVal = {
            ...rawVal,
            formula: shifted.startsWith('=') ? shifted.substring(1) : shifted,
            ...(evalRes !== undefined ? { result: evalRes } : {})
          };
          if (evalRes !== undefined) {
            rowValues[colIndex] = evalRes;
          }
        }

        // 2. Intelligent Margin calculation & result binding
        if (lowerH.includes('margin')) {
          let computedMargin: number | undefined;
          const parseNum = (v: any) => {
            if (typeof v === 'number') return v;
            const parsed = parseFloat(String(v || '').replace(/[^0-9.-]+/g, ''));
            return isNaN(parsed) ? 0 : parsed;
          };

          if (profitColIdx !== -1 && revColIdx !== -1) {
            const pVal = parseNum(rowValues[profitColIdx]);
            const rVal = parseNum(rowValues[revColIdx]);
            if (rVal > 0) computedMargin = pVal / rVal;
          } else if (revColIdx !== -1 && costColIdx !== -1) {
            const rVal = parseNum(rowValues[revColIdx]);
            const cVal = parseNum(rowValues[costColIdx]);
            if (rVal > 0) computedMargin = (rVal - cVal) / rVal;
          }

          if (computedMargin !== undefined) {
            const currentTargetRow = row.number; // e.g. 17 in Top Hero or 2 in Side-by-Side
            let boundFormula: string;
            if (profitColIdx !== -1 && revColIdx !== -1) {
              const pLetter = SpreadsheetChartBuilder.getColumnLetter(profitColIdx + 1);
              const rLetter = SpreadsheetChartBuilder.getColumnLetter(revColIdx + 1);
              boundFormula = `IFERROR(${pLetter}${currentTargetRow}/${rLetter}${currentTargetRow}, "-")`;
            } else if (revColIdx !== -1 && costColIdx !== -1) {
              const rLetter = SpreadsheetChartBuilder.getColumnLetter(revColIdx + 1);
              const cLetter = SpreadsheetChartBuilder.getColumnLetter(costColIdx + 1);
              boundFormula = `IFERROR((${rLetter}${currentTargetRow}-${cLetter}${currentTargetRow})/${rLetter}${currentTargetRow}, "-")`;
            } else {
              boundFormula = typeof rawVal === 'string' && rawVal.startsWith('=') ? rawVal.substring(1) : '';
            }

            const rawStr = String(rawVal ?? '').trim();
            if (!rawVal || rawStr === '0' || rawStr === '0%' || rawStr === '-' || rawStr === '0.0%' || rawStr.startsWith('=')) {
              rawVal = {
                formula: boundFormula || (rawStr.startsWith('=') ? rawStr.substring(1) : ''),
                result: parseFloat(computedMargin.toFixed(4)),
                type: 'percent',
                decimals: 1
              };
            } else if (typeof rawVal === 'object' && 'formula' in rawVal) {
              rawVal.result = parseFloat(computedMargin.toFixed(4));
            }
          }
        }

        // Format and assign value
        const statusStyle = SpreadsheetFormatter.setFormattedCellValue(cell, rawVal, colInf);

        // Styling
        if (statusStyle) {
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

        const calculatePercentageOrRatioCell = () => {
          const summaryRowNum = summaryRow.number;
          let firstRowFormula: string | undefined;
          for (let r = firstDataRowNum; r <= lastDataRowNum; r++) {
            const cVal = worksheet.getRow(r).getCell(colIndex + 1).value;
            if (typeof cVal === 'string' && cVal.trim().startsWith('=')) {
              firstRowFormula = cVal.trim();
              break;
            } else if (typeof cVal === 'object' && cVal !== null && 'formula' in cVal && (cVal as any).formula) {
              firstRowFormula = String((cVal as any).formula);
              break;
            }
          }

          if (firstRowFormula) {
            const summaryFormula = SpreadsheetFormulaEngine.adaptRowFormulaToSummaryRow(firstRowFormula, summaryRowNum);
            // Evaluate adapted summary formula against values currently in summary row
            const summaryRowVals = headers.map((_, idx) => summaryRow.getCell(idx + 1).value);
            const evalResult = SpreadsheetFormulaEngine.evaluateRowFormula(summaryFormula, summaryRowVals, summaryRowNum);
            return {
              formula: summaryFormula,
              ...(evalResult !== undefined ? { result: parseFloat(evalResult.toFixed(4)) } : {})
            };
          }

          // 2. Check margin columns (profit & revenue)
          if (profitColIdx !== -1 && revColIdx !== -1) {
            const pLetter = SpreadsheetChartBuilder.getColumnLetter(profitColIdx + 1);
            const rLetter = SpreadsheetChartBuilder.getColumnLetter(revColIdx + 1);
            const parseNum = (v: any) => {
              if (typeof v === 'number') return v;
              if (typeof v === 'object' && v !== null && 'result' in v && typeof v.result === 'number') return v.result;
              const parsed = parseFloat(String(v || '').replace(/[^0-9.-]+/g, ''));
              return isNaN(parsed) ? 0 : parsed;
            };
            const totalProfit = pureDataRows.reduce((acc, r) => acc + parseNum(r[profitColIdx]), 0);
            const totalRev = pureDataRows.reduce((acc, r) => acc + parseNum(r[revColIdx]), 0);
            const calcMargin = totalRev > 0 ? totalProfit / totalRev : undefined;
            return {
              formula: `IFERROR(${pLetter}${summaryRowNum}/${rLetter}${summaryRowNum}, "-")`,
              ...(calcMargin !== undefined ? { result: parseFloat(calcMargin.toFixed(4)) } : {})
            };
          }

          // 3. Fallback: statistical average across rows (never sum blindly!)
          let sumPct = 0;
          let countPct = 0;
          pureDataRows.forEach(r => {
            const raw = r[colIndex];
            if (raw !== null && raw !== undefined && raw !== '' && raw !== '-') {
              let num: number | undefined;
              if (typeof raw === 'number') num = raw;
              else if (typeof raw === 'object' && raw !== null && 'result' in raw && typeof raw.result === 'number') num = raw.result;
              else {
                const parsed = parseFloat(String(raw).replace(/%/g, '').replace(/,/g, '.').trim());
                if (!isNaN(parsed)) num = String(raw).includes('%') ? parsed / 100 : (parsed > 1 ? parsed / 100 : parsed);
              }
              if (num !== undefined && !isNaN(num)) {
                sumPct += num;
                countPct++;
              }
            }
          });
          const avg = countPct > 0 ? sumPct / countPct : undefined;
          return {
            formula: `IFERROR(AVERAGE(${colLetter}${firstDataRowNum}:${colLetter}${lastDataRowNum}), "-")`,
            ...(avg !== undefined ? { result: parseFloat(avg.toFixed(4)) } : {})
          };
        };

        const isUnitPriceOrRate = lowerH.includes('unit price') || lowerH.includes('unit_price') ||
          lowerH.includes('harga satuan') || lowerH.includes('harga_satuan') ||
          lowerH.includes('kurs') || (lowerH.includes('rate') && !lowerH.includes('revenue') && !lowerH.includes('amount') && !lowerH.includes('total') && !lowerH.includes('price')) ||
          lowerH.includes('fee_per') ||
          (/\b(id|no|rank|kode|ticker)\b/i.test(lowerH)) ||
          colInf.type === 'boolean';

        const isSummable = !isUnitPriceOrRate && (
          options?.includeSummaryRow === true ||
          existingSummaryRow !== null ||
          lowerH.includes('price') || lowerH.includes('harga') || lowerH.includes('fee') ||
          lowerH.includes('cost') || lowerH.includes('hpp') ||
          lowerH.includes('volume') || lowerH.includes('nominal') || lowerH.includes('total') ||
          lowerH.includes('omset') || lowerH.includes('revenue') || lowerH.includes('biaya') ||
          lowerH.includes('expense') || lowerH.includes('amount') || lowerH.includes('saldo') ||
          lowerH.includes('balance') || lowerH.includes('cap') || lowerH.includes('subtotal') ||
          lowerH.includes('laba') || lowerH.includes('profit') || lowerH.includes('loss') ||
          lowerH.includes('qty') || lowerH.includes('quantity') || lowerH.includes('jumlah') ||
          lowerH.includes('count') || lowerH.includes('porsi') || lowerH.includes('share') ||
          lowerH.includes('bobot') || lowerH.includes('alokasi') || lowerH.includes('budget') || lowerH.includes('anggaran') ||
          lowerH.includes('spend') || lowerH.includes('actual') || lowerH.includes('aktual') || lowerH.includes('target') ||
          lowerH.includes('variance') || lowerH.includes('selisih')
        );

        if (colIndex === 0) {
          cell.value = existingSummaryRow?.[0] || 'Total';
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else if (colInf.isMixedCurrency) {
          // Multi-currency column: DO NOT blindly aggregate mixed currencies!
          cell.value = '-';
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if (colInf.type === 'text' || colInf.type === 'status' || colInf.type === 'date' || colInf.type === 'boolean') {
          // Text/status/date/currency code column: MUST be '-' in total row (NEVER 0!)
          const userVal = existingSummaryRow?.[colIndex];
          const strU = String(userVal ?? '').trim();
          cell.value = (strU && strU !== '0' && strU !== '-' && isNaN(Number(strU))) ? userVal : '-';
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if (isPercentageOrRatio) {
          // Ratio / Percentage: calculate weighted ratio or average, NEVER sum into meaningless numbers!
          cell.value = calculatePercentageOrRatioCell();
          cell.numFmt = '0.0%';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (existingSummaryRow && typeof existingSummaryRow[colIndex] === 'string' && existingSummaryRow[colIndex].trim().startsWith('=')) {
          // Custom formula supplied by user for this summary cell
          const cleanUserVal = existingSummaryRow[colIndex].trim().substring(1);
          const evalSummary = SpreadsheetFormulaEngine.evaluateRowFormula(cleanUserVal, existingSummaryRow, summaryRow.number);
          cell.value = {
            formula: SpreadsheetFormulaEngine.sanitizeDivisionFormula(cleanUserVal),
            ...(evalSummary !== undefined ? { result: evalSummary } : {})
          };
          cell.numFmt = colInf.numFmt || '#,##0';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (isSummable && (colInf.type === 'currency' || colInf.type === 'number' || colInf.type === 'formula')) {
          // Summable numeric/currency/formula column: ALWAYS compute SUM formula & pre-evaluated total
          let sum = 0;
          let hasNumericValues = false;
          pureDataRows.forEach((r, rIdx) => {
            const rowNum = firstDataRowNum + rIdx;
            const cellVal = worksheet.getRow(rowNum).getCell(colIndex + 1).value;
            const raw = r[colIndex];
            let num: number | undefined;

            if (typeof cellVal === 'number') {
              num = cellVal;
            } else if (typeof cellVal === 'object' && cellVal !== null && 'result' in cellVal && typeof (cellVal as any).result === 'number') {
              num = (cellVal as any).result;
            } else if (typeof raw === 'number') {
              num = raw;
            } else if (typeof raw === 'object' && raw !== null && 'result' in raw && typeof raw.result === 'number') {
              num = raw.result;
            } else if (typeof raw === 'string' && raw.trim().startsWith('=')) {
              num = SpreadsheetFormulaEngine.evaluateRowFormula(raw.trim(), r, rowNum);
            } else {
              const parsed = SpreadsheetFormatter.parseFlexibleNumeric(raw, colInf.type === 'currency');
              if (parsed !== null && !isNaN(parsed)) {
                num = parsed;
              }
            }

            if (num !== undefined && !isNaN(num)) {
              sum += num;
              hasNumericValues = true;
            }
          });

          // Check if user provided an explicit static numeric total in existingSummaryRow
          const userVal = existingSummaryRow?.[colIndex];
          const parsedUserNum = typeof userVal === 'number'
            ? userVal
            : (typeof userVal === 'string' && userVal.trim() !== '' && userVal.trim() !== '-'
                ? SpreadsheetFormatter.parseFlexibleNumeric(userVal, colInf.type === 'currency')
                : null);
          const explicitUserNum = (parsedUserNum !== null && parsedUserNum !== 0) ? parsedUserNum : null;

          cell.value = {
            formula: `SUM(${colLetter}${firstDataRowNum}:${colLetter}${lastDataRowNum})`,
            ...(hasNumericValues
              ? { result: Number.isInteger(sum) ? sum : parseFloat(sum.toFixed(2)) }
              : (explicitUserNum !== null ? { result: explicitUserNum } : {}))
          };
          cell.numFmt = colInf.numFmt || '#,##0';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
          cell.value = '-';
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
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
      column.width = Math.max(16, Math.min(65, maxLen + 6));
    });
  }
}
