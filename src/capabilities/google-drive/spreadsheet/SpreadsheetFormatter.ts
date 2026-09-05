import ExcelJS from 'exceljs';
import { ColumnInference, SupportedCurrency } from './spreadsheet.types';
import { SpreadsheetFormulaEngine } from './SpreadsheetFormulaEngine';
import { CurrencyRegistry } from './CurrencyRegistry';

export class SpreadsheetFormatter {
  // Status Badge Color Definitions (Universal English & Indonesian Synonyms)
  public static readonly STATUS_STYLES: Record<string, { bg: string; font: string }> = {
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
   * Parses various number formats (negative, zero, decimals, big integers, Indonesian currency formatting).
   */
  public static parseFlexibleNumeric(val: any, isCurrencyCol?: boolean): number | null {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    if (typeof val === 'boolean') return null;

    let str = String(val).trim();
    if (!str) return null;

    // Accounting format e.g. (50000) or (50.000)
    let isNegative = false;
    if (str.startsWith('(') && str.endsWith(')')) {
      isNegative = true;
      str = str.slice(1, -1).trim();
    } else if (str.startsWith('-')) {
      isNegative = true;
      str = str.slice(1).trim();
    }

    const isRpOrIdr = /^(rp|idr)\b/i.test(str) || /\b(rp|idr)$/i.test(str);
    str = str.replace(/^(rp|idr|usd|usdc|eur|gbp|jpy|inr|sgd|myr|rm|\$|€|£|¥|₹|s\$)\s*/i, '')
             .replace(/\s*(rp|idr|usd|usdc|eur|gbp|jpy|inr|sgd|myr|rm|\$|€|£|¥|₹|s\$)$/i, '')
             .trim();

    if (!str) return null;

    // Handle thousand vs decimal separators
    if (str.includes('.') && str.includes(',')) {
      const lastDot = str.lastIndexOf('.');
      const lastComma = str.lastIndexOf(',');
      if (lastComma > lastDot) {
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        str = str.replace(/,/g, '');
      }
    } else if (str.includes(',')) {
      const commaCount = (str.match(/,/g) || []).length;
      if (commaCount === 1) {
        const parts = str.split(',');
        if (parts[1].length !== 3) {
          str = str.replace(',', '.');
        } else {
          str = str.replace(',', '');
        }
      } else {
        str = str.replace(/,/g, '');
      }
    } else if (str.includes('.')) {
      const dotCount = (str.match(/\./g) || []).length;
      if (dotCount > 1) {
        str = str.replace(/\./g, '');
      } else {
        const parts = str.split('.');
        // e.g. 25.000 or 50.000 (three zeros or Indonesian thousand)
        if (parts[1].length === 3 && (parts[1] === '000' || isRpOrIdr || isCurrencyCol)) {
          str = str.replace(/\./g, '');
        }
      }
    }

    const num = parseFloat(str);
    if (isNaN(num)) return null;
    return isNegative ? -Math.abs(num) : num;
  }

  public static setFormattedCellValue(
    cell: ExcelJS.Cell,
    rawVal: any,
    colInf: ColumnInference
  ): { bg: string; font: string } | null {
    if (rawVal === null || rawVal === undefined || rawVal === '') {
      cell.value = '';
      return null;
    }

    // 0. Formula Object Support (e.g. { formula: '=B2/B7', type: 'percent', decimals: 1 }) -> Fix BUG-02 & Division Guard
    if (typeof rawVal === 'object' && rawVal !== null && 'formula' in rawVal) {
      const formulaStr = String(rawVal.formula || '').trim();
      const cleanFormula = formulaStr.startsWith('=') ? formulaStr.substring(1) : formulaStr;
      
      if (SpreadsheetFormulaEngine.isValidExcelFormula(cleanFormula)) {
        const cellObj: any = { formula: SpreadsheetFormulaEngine.sanitizeDivisionFormula(cleanFormula) };
        if (rawVal.result !== undefined && rawVal.result !== null) {
          cellObj.result = rawVal.result;
        } else {
          const staticRes = SpreadsheetFormulaEngine.evaluateStaticFormula(cleanFormula);
          if (staticRes !== undefined) cellObj.result = staticRes;
        }
        cell.value = cellObj;
        
        const type = (rawVal.type || colInf.type || '').toLowerCase();
        if (type === 'percent' || type === 'percentage') {
          cell.numFmt = rawVal.decimals ? `0.${'0'.repeat(rawVal.decimals)}%` : (colInf.numFmt || '0.0%');
        } else if (type === 'currency') {
          cell.numFmt = rawVal.numFmt || colInf.numFmt || 'Rp #,##0';
        } else if (type === 'number') {
          cell.numFmt = rawVal.decimals ? `#,##0.${'0'.repeat(rawVal.decimals)}` : (colInf.numFmt || '#,##0');
        } else {
          cell.numFmt = colInf.numFmt || '#,##0';
        }
        return null;
      } else {
        // Not a valid formula -> store safely as literal text without erroring
        cell.value = formulaStr;
        return null;
      }
    }

    const strVal = String(rawVal).trim();

    // 1. Explicit Formula starting with '=' -> Whitelist Guard against Formula Injection & #NAME? / #VALUE!
    if (strVal.startsWith('=')) {
      const cleanFormula = strVal.substring(1).trim();
      if (SpreadsheetFormulaEngine.isValidExcelFormula(cleanFormula)) {
        const cellObj: any = { formula: SpreadsheetFormulaEngine.sanitizeDivisionFormula(cleanFormula) };
        const staticRes = SpreadsheetFormulaEngine.evaluateStaticFormula(cleanFormula);
        if (staticRes !== undefined) {
          cellObj.result = staticRes;
        }
        cell.value = cellObj;
        if (colInf.type === 'currency') {
          cell.numFmt = colInf.numFmt || 'Rp #,##0';
        } else if (colInf.type === 'percentage') {
          cell.numFmt = colInf.numFmt || '0.0%';
        } else if (colInf.type === 'number') {
          cell.numFmt = colInf.numFmt || '#,##0';
        }
        return null;
      } else {
        // String starts with '=' but is NOT a valid formula (e.g. "=BukanFormula+Test" or "=Rp 50.000")
        // Store as literal text to prevent Formula Injection and #NAME? errors
        cell.value = strVal;
        return null;
      }
    }

    // 2. Status Badge Detection (Case-insensitive & whitespace normalized) -> Fix BUG-07
    const normalizedStatus = strVal.toLowerCase().replace(/[_\s-]+/g, ' ').trim();
    if (colInf.type === 'status') {
      cell.value = strVal;
      const match = this.STATUS_STYLES[normalizedStatus] || this.STATUS_STYLES[strVal.toLowerCase()];
      if (match) return match;
      return null;
    }

    // 3. Currency with Multi-Currency Formatting & Universal Numeric Guard
    if (colInf.type === 'currency') {
      const numeric = typeof rawVal === 'number'
        ? rawVal
        : this.parseFlexibleNumeric(rawVal, true);
      if (numeric !== null && !isNaN(numeric)) {
        cell.value = numeric;
        cell.numFmt = this.resolveCellCurrencyFormat(strVal, colInf);
        return null;
      }
    }

    // 4. Percentage (by column inference OR explicit % string) -> Fix BUG-04
    const isPercentageCell = colInf.type === 'percentage' || strVal.includes('%');
    if (isPercentageCell) {
      let numeric: number | null = null;
      if (typeof rawVal === 'number') {
        numeric = rawVal;
      } else {
        const cleanStr = strVal.replace(/%/g, '').replace(/\+/g, '').replace(/\s+/g, '').replace(/,/g, '.');
        const parsed = parseFloat(cleanStr);
        if (!isNaN(parsed)) {
          numeric = strVal.includes('%') ? (parsed / 100) : parsed;
        }
      }

      if (numeric !== null && !isNaN(numeric)) {
        // Fix BUG-04: If value > 1.0 (or < -1.0) and wasn't parsed from explicit '%' string, it's on 0-100 scale -> divide by 100
        if (!strVal.includes('%') && (numeric > 1.0 || numeric < -1.0)) {
          numeric = numeric / 100;
        }
        cell.value = numeric;
        cell.numFmt = colInf.numFmt || '0.0%';
        return null;
      }
    }

    // 5. Number (Handles negative, zero, decimals, big integers >10 digits)
    if (colInf.type === 'number') {
      const numeric = typeof rawVal === 'number'
        ? rawVal
        : this.parseFlexibleNumeric(rawVal, false);
      if (numeric !== null && !isNaN(numeric)) {
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

    // 8. Universal Numeric Guard for generic/unclassified columns (Prevents #VALUE! when numbers appear in text columns)
    if (typeof rawVal === 'number') {
      cell.value = rawVal;
      cell.numFmt = Number.isInteger(rawVal) ? '#,##0' : '#,##0.00';
      return null;
    }

    const fallbackNumeric = this.parseFlexibleNumeric(rawVal, false);
    if (fallbackNumeric !== null && /^-?[\d.,]+$/.test(strVal)) {
      cell.value = fallbackNumeric;
      cell.numFmt = Number.isInteger(fallbackNumeric) ? '#,##0' : '#,##0.00';
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

  public static resolveCellCurrencyFormat(cellStr: string, colInf: ColumnInference): string {
    const meta = CurrencyRegistry.detectFromText(cellStr);
    if (meta) return meta.numFmt;
    if (colInf.currency) {
      const colMeta = CurrencyRegistry.lookup(colInf.currency);
      if (colMeta) return colMeta.numFmt;
    }
    return colInf.numFmt || '#,##0.00';
  }

  public static inferColumnInferences(headers: string[], rows: any[][]): ColumnInference[] {
    // 0. Cross-Column Currency Context Discovery:
    // Identify if the dataset has a dedicated Currency/Valas column with mixed currencies
    let currencyColIdx = -1;
    const tableCurrencies = new Set<string>();

    headers.forEach((h, idx) => {
      if (CurrencyRegistry.isCurrencyColumnHeader(h)) {
        currencyColIdx = idx;
      }
    });

    if (currencyColIdx !== -1) {
      for (const row of rows) {
        const raw = String(row[currencyColIdx] || '').trim();
        const meta = CurrencyRegistry.detectFromText(raw);
        if (meta) {
          tableCurrencies.add(meta.code);
        }
      }
    }
    const isTableMixedCurrency = tableCurrencies.size > 1;

    return headers.map((header, colIndex) => {
      const lowerHeader = header.toLowerCase().trim();

      // Dedicated Currency Code column in multi-currency table is text
      if (colIndex === currencyColIdx) {
        return { type: 'text' };
      }

      // Check if this column is an unconverted original/foreign nominal column in a multi-currency table
      const isUnconvertedNominal = (
        lowerHeader.includes('nominal') ||
        lowerHeader.includes('amount') ||
        lowerHeader.includes('harga') ||
        lowerHeader.includes('price') ||
        lowerHeader.includes('biaya') ||
        lowerHeader.includes('cost') ||
        lowerHeader.includes('asing') ||
        lowerHeader.includes('foreign') ||
        lowerHeader.includes('jumlah')
      ) && (
        !lowerHeader.includes('rupiah') &&
        !lowerHeader.includes('idr') &&
        !lowerHeader.includes('setara') &&
        !lowerHeader.includes('converted') &&
        !lowerHeader.includes('eq') &&
        !lowerHeader.includes('base')
      );

      if (isTableMixedCurrency && isUnconvertedNominal) {
        return {
          type: 'currency',
          currency: 'GENERIC',
          isMixedCurrency: true,
          numFmt: '#,##0.00'
        };
      }

      // Check Status
      if (lowerHeader.includes('status') || lowerHeader.includes('state')) {
        return { type: 'status' };
      }

      // Dedicated Category / Identifier / Name / Asset / Ticker columns are text
      if (
        (lowerHeader === 'aset' || lowerHeader === 'asset' ||
         lowerHeader === 'koin' || lowerHeader === 'coin' ||
         lowerHeader === 'token' || lowerHeader === 'ticker' ||
         lowerHeader === 'symbol' || lowerHeader === 'simbol' ||
         lowerHeader === 'pair' || lowerHeader === 'pasangan' ||
         lowerHeader === 'item' || lowerHeader === 'produk' ||
         lowerHeader === 'product' || lowerHeader === 'name' ||
         lowerHeader === 'nama' || lowerHeader === 'deskripsi' ||
         lowerHeader === 'description' || lowerHeader === 'kategori' ||
         lowerHeader === 'category' || lowerHeader === 'id' ||
         lowerHeader === 'kode' || lowerHeader === 'code') &&
        !lowerHeader.includes('price') && !lowerHeader.includes('harga') &&
        !lowerHeader.includes('nominal') && !lowerHeader.includes('amount') &&
        !lowerHeader.includes('total') && !lowerHeader.includes('vol')
      ) {
        return { type: 'text' };
      }

      // 1. Percentage & Ratio (HIGH PRIORITY: Check before currency to prevent "Bobot Volume" / "Share" being misclassified)
      if (
        lowerHeader.includes('percent') || 
        lowerHeader.includes('%') || 
        lowerHeader.includes('persen') ||
        lowerHeader.includes('persentase') ||
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
        lowerHeader.includes('pertumbuhan') ||
        (lowerHeader.includes('delta') && lowerHeader.includes('%')) ||
        lowerHeader.includes('margin') ||
        lowerHeader.includes('marjin') ||
        lowerHeader.includes('yield') ||
        lowerHeader.includes('roi') ||
        lowerHeader.includes('apr') ||
        lowerHeader.includes('apy') ||
        lowerHeader.includes('win rate') ||
        lowerHeader.includes('churn rate') ||
        lowerHeader.includes('conversion rate') ||
        lowerHeader.includes('success rate') ||
        lowerHeader.includes('interest rate') ||
        lowerHeader.includes('tax rate')
      ) {
        // High-precision 3-decimal formatting for Spread % or slippage/bps
        if (
          lowerHeader.includes('spread') ||
          lowerHeader.includes('slippage') ||
          lowerHeader.includes('bps')
        ) {
          return { type: 'percentage', numFmt: '0.000%' };
        }
        // Professional 2-decimal formatting for portfolio / volume ratios
        if (
          lowerHeader.includes('bobot') ||
          lowerHeader.includes('porsi') ||
          lowerHeader.includes('share') ||
          lowerHeader.includes('proporsi') ||
          lowerHeader.includes('rasio') ||
          lowerHeader.includes('ratio') ||
          lowerHeader.includes('weight') ||
          lowerHeader.includes('allocation') ||
          lowerHeader.includes('alokasi')
        ) {
          return { type: 'percentage', numFmt: '0.00%' };
        }
        return { type: 'percentage', numFmt: '0.0%' };
      }

      // 2. Spread, Differences, and Deltas without currency (Lock to fixed 4-decimal precision)
      if (
        (lowerHeader.includes('spread') ||
         lowerHeader.includes('selisih') ||
         lowerHeader.includes('gap') ||
         lowerHeader.includes('difference') ||
         (lowerHeader.includes('delta') && !lowerHeader.includes('%'))) &&
        !lowerHeader.includes('rp') && !lowerHeader.includes('idr') &&
        !lowerHeader.includes('$') && !lowerHeader.includes('usd') &&
        !lowerHeader.includes('eur')
      ) {
        return { type: 'number', numFmt: '#,##0.0000' };
      }

      // 3. Detect explicit currency directly from header (e.g. "Total (USD)", "Harga (Rp)", "Nominal (SAR)")
      const headerMeta = CurrencyRegistry.detectFromText(header);
      if (headerMeta && (
        lowerHeader.includes('harga') || lowerHeader.includes('price') ||
        lowerHeader.includes('nominal') || lowerHeader.includes('amount') ||
        lowerHeader.includes('total') || lowerHeader.includes('fee') ||
        lowerHeader.includes('cost') || lowerHeader.includes('nilai') ||
        lowerHeader.includes('saldo') || lowerHeader.includes('balance') ||
        lowerHeader.includes('omset') || lowerHeader.includes('revenue') ||
        lowerHeader.includes('biaya') || lowerHeader.includes('laba') ||
        lowerHeader.includes('profit') || lowerHeader.includes('anggaran') ||
        lowerHeader.includes('budget') || lowerHeader.includes('aktual') ||
        lowerHeader.includes('selisih') || lowerHeader.includes('valas')
      )) {
        return {
          type: 'currency',
          currency: headerMeta.code,
          numFmt: headerMeta.numFmt
        };
      }

      // 4. Check data rows for explicit currency symbols or ISO codes across rows
      const detectedCurrencies = new Set<string>();
      let hasNumericCurrencyValues = false;
      for (const row of rows) {
        const raw = row[colIndex];
        if (raw === undefined || raw === null || raw === '') continue;
        const val = String(raw).trim();
        // CRITICAL GUARD: Skip formulas! In Excel formulas, $ is absolute cell reference, NOT currency!
        if (val.startsWith('=')) continue;
        if (typeof raw === 'object' && 'formula' in raw) continue;
        // Require that the value contains numeric digits to be considered a currency amount
        if (!/\d/.test(val)) continue;

        hasNumericCurrencyValues = true;
        const meta = CurrencyRegistry.detectFromText(val);
        if (meta) {
          detectedCurrencies.add(meta.code);
        }
      }

      if (hasNumericCurrencyValues) {
        if (detectedCurrencies.size > 1) {
          // Multi-currency column detected! Flag as mixed currency so summary row won't aggregate blindly
          return {
            type: 'currency',
            currency: 'GENERIC',
            isMixedCurrency: true,
            numFmt: '#,##0.00'
          };
        } else if (detectedCurrencies.size === 1) {
          const singleCode = Array.from(detectedCurrencies)[0];
          const meta = CurrencyRegistry.lookup(singleCode);
          if (meta) {
            return {
              type: 'currency',
              currency: meta.code,
              numFmt: meta.numFmt
            };
          }
        }
      }

      // 5. Generic currency / financial amount keywords
      if (
        lowerHeader.includes('price') ||
        lowerHeader.includes('cost') ||
        lowerHeader.includes('diskon') ||
        lowerHeader.includes('discount') ||
        lowerHeader.includes('amount') ||
        lowerHeader.includes('revenue') ||
        lowerHeader.includes('expense') ||
        lowerHeader.includes('balance') ||
        lowerHeader.includes('nominal') ||
        lowerHeader.includes('total') ||
        lowerHeader.includes('fee') ||
        lowerHeader.includes('retainer') ||
        lowerHeader.includes('anggaran') ||
        lowerHeader.includes('budget') ||
        lowerHeader.includes('aktual') ||
        lowerHeader.includes('actual') ||
        lowerHeader.includes('variance') ||
        lowerHeader.includes('biaya') ||
        lowerHeader.includes('omset') ||
        lowerHeader.includes('penjualan') ||
        lowerHeader.includes('laba') ||
        lowerHeader.includes('profit') ||
        lowerHeader.includes('saldo')
      ) {
        return { type: 'currency', currency: 'IDR', numFmt: 'Rp #,##0' };
      }

      if (lowerHeader.includes('date') || lowerHeader.includes('time')) {
        return { type: 'date' };
      }

      if (lowerHeader.includes('qty') || lowerHeader.includes('quantity') || lowerHeader.includes('count')) {
        return { type: 'number', numFmt: '#,##0' };
      }

      if (lowerHeader.includes('rate') && !lowerHeader.includes('currency') && !lowerHeader.includes('kurs') && !lowerHeader.includes('fx')) {
        return { type: 'percentage', numFmt: '0.0%' };
      }

      // 6. Check data values for numeric and currency symbols
      let hasNumbers = false;
      let allIntegers = true;
      let hasFormulas = false;

      for (const row of rows) {
        const val = row[colIndex];
        if (val !== undefined && val !== null && val !== '') {
          const str = String(val).trim();
          if (str.startsWith('=')) {
            hasFormulas = true;
            continue;
          }
          if (str.includes('₹') || str.includes('INR')) return { type: 'currency', currency: 'INR', numFmt: '₹#,##0.00' };
          if (str.includes('€') || str.includes('EUR')) return { type: 'currency', currency: 'EUR', numFmt: '€#,##0.00' };
          if (str.includes('£') || str.includes('GBP')) return { type: 'currency', currency: 'GBP', numFmt: '£#,##0.00' };
          if (str.includes('¥') || str.includes('JPY')) return { type: 'currency', currency: 'JPY', numFmt: '¥#,##0' };
          if (str.includes('S$') || str.includes('SGD')) return { type: 'currency', currency: 'SGD', numFmt: 'S$#,##0.00' };
          if (str.includes('RM') || str.includes('MYR')) return { type: 'currency', currency: 'MYR', numFmt: 'RM #,##0.00' };
          if (str.includes('Rp') || str.includes('IDR')) return { type: 'currency', currency: 'IDR', numFmt: 'Rp #,##0' };
          if (str.includes('$') || str.includes('USD')) return { type: 'currency', currency: 'USD', numFmt: '$#,##0.00' };
          if (str.endsWith('%') || str.includes('%')) return { type: 'percentage', numFmt: '0.00%' };
          
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

      if (hasFormulas && !hasNumbers) {
        if (lowerHeader.includes('spread') || lowerHeader.includes('selisih') || lowerHeader.includes('delta')) {
          return { type: 'number', numFmt: '#,##0.0000' };
        }
        if (lowerHeader.includes('bobot') || lowerHeader.includes('rasio') || lowerHeader.includes('ratio') || lowerHeader.includes('%') || lowerHeader.includes('percent')) {
          return { type: 'percentage', numFmt: '0.00%' };
        }
        return { type: 'number', numFmt: '#,##0.00' };
      }

      if (hasNumbers) {
        return { type: 'number', numFmt: allIntegers ? '#,##0' : '#,##0.00' };
      }

      return { type: 'text' };
    });
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
