import { SpreadsheetOptions } from './spreadsheet.types';
import { SpreadsheetFormatter } from './SpreadsheetFormatter';
import { SpreadsheetFormulaEngine } from './SpreadsheetFormulaEngine';

export class SpreadsheetMetrics {
  /**
   * Calculates comprehensive summary metrics (totals, counts, derived margins).
   */
  public static calculateSummaryMetrics(
    headers: string[],
    rows: any[][],
    options?: SpreadsheetOptions
  ): { renderedRows: number; totals: Record<string, number | string> } {
    const pureDataRows = rows.filter(r => {
      const first = String(r[0] || '').toLowerCase().trim();
      return !['total', 'summary', 'jumlah', 'rata-rata', 'average'].includes(first);
    });

    const columnInferences = SpreadsheetFormatter.inferColumnInferences(headers, pureDataRows);
    const totals: Record<string, number | string> = {};

    headers.forEach((h, colIndex) => {
      const colInf = columnInferences[colIndex];
      const lowerH = (h || '').toLowerCase().trim();

      if (colInf.isMixedCurrency) {
        totals[h] = '-';
        return;
      }

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

      const isUnitPriceOrRate = isPercentageOrRatio || lowerH.includes('unit price') || lowerH.includes('unit_price') ||
        lowerH.includes('harga satuan') || lowerH.includes('harga_satuan') ||
        lowerH.includes('kurs') || (lowerH.includes('rate') && !lowerH.includes('revenue') && !lowerH.includes('amount') && !lowerH.includes('total') && !lowerH.includes('price')) ||
        lowerH.includes('fee_per') ||
        (/\b(id|no|rank|kode|ticker)\b/i.test(lowerH)) ||
        colInf.type === 'date' || colInf.type === 'status' || colInf.type === 'boolean';

      const isSummable = !isUnitPriceOrRate && (
        options?.includeSummaryRow === true ||
        lowerH.includes('price') || lowerH.includes('harga') || lowerH.includes('fee') ||
        lowerH.includes('cost') || lowerH.includes('hpp') ||
        lowerH.includes('volume') || lowerH.includes('nominal') || lowerH.includes('total') ||
        lowerH.includes('omset') || lowerH.includes('revenue') || lowerH.includes('biaya') ||
        lowerH.includes('expense') || lowerH.includes('amount') || lowerH.includes('saldo') ||
        lowerH.includes('balance') || lowerH.includes('cap') || lowerH.includes('subtotal') ||
        lowerH.includes('laba') || lowerH.includes('profit') || lowerH.includes('loss') ||
        lowerH.includes('qty') || lowerH.includes('quantity') || lowerH.includes('jumlah') ||
        lowerH.includes('stok') || lowerH.includes('stock') || lowerH.includes('inventory') ||
        lowerH.includes('count') || lowerH.includes('porsi') || lowerH.includes('share') ||
        lowerH.includes('bobot') || lowerH.includes('alokasi') || lowerH.includes('budget') || lowerH.includes('anggaran') ||
        lowerH.includes('spend') || lowerH.includes('actual') || lowerH.includes('aktual') || lowerH.includes('target') ||
        lowerH.includes('variance') || lowerH.includes('selisih')
      );

      if (isSummable && (colInf.type === 'currency' || colInf.type === 'number' || colInf.type === 'percentage' || colInf.type === 'formula')) {
        let sum = 0;
        let count = 0;
        pureDataRows.forEach((r, rIdx) => {
          const raw = r[colIndex];
          if (raw !== null && raw !== undefined && raw !== '') {
            let num: number | undefined;
            if (typeof raw === 'number') {
              num = raw;
            } else if (typeof raw === 'object' && raw !== null && 'result' in raw && typeof raw.result === 'number') {
              num = raw.result;
            } else if (typeof raw === 'string' && raw.trim().startsWith('=')) {
              num = SpreadsheetFormulaEngine.evaluateRowFormula(raw.trim(), r, rIdx + 2);
            } else {
              const parsed = SpreadsheetFormatter.parseFlexibleNumeric(raw, colInf.type === 'currency');
              if (parsed !== null && !isNaN(parsed)) {
                num = parsed;
              }
            }
            if (num !== undefined && !isNaN(num)) {
              sum += num;
              count++;
            }
          }
        });
        if (count > 0) {
          totals[h] = Number.isInteger(sum) ? sum : parseFloat(sum.toFixed(2));
        }
      }
    });

    // Derived calculation for Margin & Ratios
    headers.forEach((h, colIndex) => {
      const colInf = columnInferences[colIndex];
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

      if (isPercentageOrRatio) {
        // 1. Check if data rows use a formula (e.g. "=C2/B2" or "=(B2-C2)/B2")
        const firstRowFormula = pureDataRows.map(r => r[colIndex]).find(v => typeof v === 'string' && v.trim().startsWith('='));
        if (firstRowFormula) {
          const summaryRowNum = pureDataRows.length + 2;
          const summaryFormula = SpreadsheetFormulaEngine.adaptRowFormulaToSummaryRow(firstRowFormula, summaryRowNum);
          const summaryRowValues = headers.map(hdr => totals[hdr]);
          const evalResult = SpreadsheetFormulaEngine.evaluateRowFormula(summaryFormula, summaryRowValues, summaryRowNum);
          if (evalResult !== undefined) {
            totals[h] = `${(evalResult * 100).toFixed(1)}%`;
            return;
          }
        }

        // 2. Margin column check
        const profitKey = Object.keys(totals).find(k => {
          const lk = k.toLowerCase();
          return lk.includes('profit') || lk.includes('laba') || lk.includes('net');
        });
        const revenueKey = Object.keys(totals).find(k => {
          const lk = k.toLowerCase();
          return (lk.includes('revenue') || lk.includes('omset') || lk.includes('penjualan') || lk.includes('sales') || lk.includes('total') || lk.includes('harga')) && k !== profitKey;
        });
        const costKey = Object.keys(totals).find(k => {
          const lk = k.toLowerCase();
          return lk.includes('cost') || lk.includes('hpp') || lk.includes('biaya') || lk.includes('expense');
        });

        if (profitKey && revenueKey && typeof totals[profitKey] === 'number' && typeof totals[revenueKey] === 'number' && (totals[revenueKey] as number) > 0) {
          const marginVal = ((totals[profitKey] as number) / (totals[revenueKey] as number)) * 100;
          totals[h] = `${marginVal.toFixed(1)}%`;
          return;
        } else if (revenueKey && costKey && typeof totals[revenueKey] === 'number' && typeof totals[costKey] === 'number' && (totals[revenueKey] as number) > 0) {
          const marginVal = (((totals[revenueKey] as number) - (totals[costKey] as number)) / (totals[revenueKey] as number)) * 100;
          totals[h] = `${marginVal.toFixed(1)}%`;
          return;
        }

        // 3. Fallback: statistical average across percentage rows
        let sumVal = 0;
        let countVal = 0;
        pureDataRows.forEach(r => {
          const raw = r[colIndex];
          if (raw !== null && raw !== undefined && raw !== '' && raw !== '-') {
            let num: number = 0;
            if (typeof raw === 'number') num = raw;
            else if (typeof raw === 'object' && 'result' in raw && typeof raw.result === 'number') num = raw.result;
            else {
              const parsed = parseFloat(String(raw).replace(/%/g, '').replace(/,/g, '.').trim());
              if (!isNaN(parsed)) num = String(raw).includes('%') || parsed > 1 ? parsed : parsed * 100;
            }
            if (num > 0) {
              sumVal += num;
              countVal++;
            }
          }
        });
        if (countVal > 0) {
          totals[h] = `${(sumVal / countVal).toFixed(1)}%`;
        }
      }
    });

    return {
      renderedRows: pureDataRows.length,
      totals
    };
  }
}
