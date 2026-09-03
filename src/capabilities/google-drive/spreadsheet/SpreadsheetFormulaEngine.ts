/**
 * SpreadsheetFormulaEngine — Dedicated validation, parsing, sanitization,
 * and pre-computation for spreadsheet formulas.
 *
 * Enforces:
 * - Anti-formula injection & whitelist
 * - Static arithmetic evaluation
 * - Safe division guard with IFERROR(..., "-")
 * - Dynamic row offset shifting
 */
export class SpreadsheetFormulaEngine {
  /**
   * Guards formulas with division against #DIV/0! errors by wrapping them with IFERROR(..., "-").
   */
  public static sanitizeDivisionFormula(formula: string): string {
    const trimmed = formula.trim();
    if (/^IFERROR\s*\(/i.test(trimmed) || /^IF\s*\(/i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.includes('/')) {
      return `IFERROR(${trimmed}, "-")`;
    }
    return trimmed;
  }

  /**
   * Shifts formula relative row numbers when data rows are offset (e.g. +15 rows for Top Hero banner).
   */
  public static shiftFormulaRowNumbers(formula: string, rowOffset: number): string {
    if (rowOffset === 0) return formula;
    return formula.replace(/\b([A-Z]+)(\d+)\b/g, (match, col, rowStr) => {
      const rowNum = parseInt(rowStr, 10);
      if (rowNum >= 2 && rowNum < 100) {
        return `${col}${rowNum + rowOffset}`;
      }
      return match;
    });
  }

  /**
   * Validates whether a string starting with '=' is a genuine Excel formula or untrusted user text.
   * Prevents formula injection and #NAME? errors from strings like "=BukanFormula+Test".
   */
  public static isValidExcelFormula(cleanFormula: string): boolean {
    const trimmed = cleanFormula.trim();
    if (!trimmed) return false;

    // 1. Standard known Excel functions
    const standardFunctions = /^(SUM|AVERAGE|COUNT|COUNTA|COUNTIF|COUNTIFS|IF|IFERROR|IFNA|IFS|VLOOKUP|HLOOKUP|XLOOKUP|INDEX|MATCH|MAX|MIN|ROUND|ROUNDUP|ROUNDDOWN|PRODUCT|SUBTOTAL|ABS|AND|OR|NOT|CONCAT|CONCATENATE|TEXT|DATE|YEAR|MONTH|DAY|TODAY|NOW)\s*\(/i;
    if (standardFunctions.test(trimmed)) return true;

    // 2. Cell references with basic arithmetic: e.g. C2-D2, B2*(1-F2/100), (B4-C4)/B4
    const cellArithmetic = /^[\(\s]*\$?[A-Z]+\$?[0-9]+([\s\+\-\*\/\^][\(\s]*(\$?[A-Z]+\$?[0-9]+|[0-9\.]+)\)*)*$/i;
    if (cellArithmetic.test(trimmed)) return true;

    // 3. Static arithmetic: e.g. 1+1, (10 * 5) / 2
    const staticMath = /^[\(\s]*[0-9\.]+([\s\+\-\*\/\^][\(\s]*[0-9\.]+\)*)+$/;
    if (staticMath.test(trimmed)) return true;

    return false;
  }

  /**
   * Safely evaluates basic static arithmetic (e.g. 1+1 -> 2) so Google Sheets displays the precomputed value on upload.
   */
  public static evaluateStaticFormula(formula: string): number | undefined {
    const trimmed = formula.trim();
    if (/^[\s0-9\.\+\-\*\/\(\)]+$/.test(trimmed) && !trimmed.includes('//')) {
      try {
        const sanitized = trimmed.replace(/[^0-9\.\+\-\*\/\(\)]/g, '');
        const fn = new Function(`return (${sanitized})`);
        const res = fn();
        if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
          return res;
        }
      } catch {}
    }
    return undefined;
  }

  /**
   * Translates column letter (e.g. "A", "B", "AA") to 0-indexed column number.
   */
  public static columnLetterToIndex(letter: string): number {
    let index = 0;
    const clean = letter.toUpperCase().trim();
    for (let i = 0; i < clean.length; i++) {
      index = index * 26 + (clean.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  /**
   * Adapts a relative row formula (e.g. "=C2/B2" or "=(B2-C2)/B2") to a summary row number (e.g. 8).
   * Generates a clean Excel formula guarded against division by zero: e.g. "IFERROR(C8/B8, "-")".
   */
  public static adaptRowFormulaToSummaryRow(formula: string, summaryRowNum: number): string {
    const trimmed = (formula || '').trim();
    if (!trimmed) return '-';
    let clean = trimmed.startsWith('=') ? trimmed.substring(1).trim() : trimmed;

    // Strip existing IFERROR wrapper if present
    if (/^IFERROR\s*\(/i.test(clean)) {
      clean = clean.replace(/^IFERROR\s*\(/i, '').replace(/,\s*["'0-9-]+\s*\)$/, '').trim();
    }

    // Replace all row numbers in cell references with summaryRowNum
    const adapted = clean.replace(/\$?([A-Z]+)\$?[0-9]+/gi, (_match, colLetter) => {
      return `${colLetter.toUpperCase()}${summaryRowNum}`;
    });

    return SpreadsheetFormulaEngine.sanitizeDivisionFormula(adapted);
  }

  /**
   * Safely evaluates basic cell arithmetic formulas in a given row context (e.g. "=B2-C2" or "=C2/B2").
   * Replaces cell references targeting this row with their actual numeric values and calculates the result.
   */
  public static evaluateRowFormula(
    formula: string,
    rowValues: any[],
    targetRowNum: number
  ): number | undefined {
    const trimmed = (formula || '').trim();
    if (!trimmed) return undefined;
    const cleanFormula = trimmed.startsWith('=') ? trimmed.substring(1).trim() : trimmed;

    // Strip IFERROR wrapper if present: e.g. IFERROR(C2/B2, "-") -> C2/B2
    let stripped = cleanFormula;
    if (/^IFERROR\s*\(/i.test(stripped)) {
      stripped = stripped.replace(/^IFERROR\s*\(/i, '').replace(/,\s*["'0-9-]+\s*\)$/, '').trim();
    }

    // Match cell references like $B$2, B2, C2
    const cellRegex = /\$?([A-Z]+)\$?([0-9]+)/gi;
    let resolvable = true;

    const substituted = stripped.replace(cellRegex, (_match, colStr, rowStr) => {
      const rNum = parseInt(rowStr, 10);
      if (rNum !== targetRowNum && !(targetRowNum === 2 && rNum === 1)) {
        // References a different row, cannot resolve purely locally in single-row context
        resolvable = false;
        return '0';
      }
      const colIdx = SpreadsheetFormulaEngine.columnLetterToIndex(colStr);
      if (colIdx < 0 || colIdx >= rowValues.length) {
        resolvable = false;
        return '0';
      }
      const val = rowValues[colIdx];
      if (val === null || val === undefined || val === '') {
        resolvable = false;
        return '0';
      }
      let num: number;
      if (typeof val === 'number') {
        num = val;
      } else if (typeof val === 'object' && val !== null && 'result' in val && typeof val.result === 'number') {
        num = val.result;
      } else {
        const clean = String(val).replace(/Rp\s?/gi, '').replace(/\$/g, '').trim();
        const isPct = clean.includes('%');
        let parsed = parseFloat(clean.replace(/[^0-9.,-]/g, ''));
        // If it has dot thousands: e.g. 150.000
        if (clean.includes('.') && (clean.match(/\./g) || []).length === 1 && clean.split('.')[1].length === 3) {
          parsed = parseFloat(clean.replace(/\./g, ''));
        }
        if (isNaN(parsed)) {
          resolvable = false;
          return '0';
        }
        num = isPct ? parsed / 100 : parsed;
      }
      return String(num);
    });

    if (!resolvable) return undefined;

    // Validate that substituted string is pure safe arithmetic (digits, operators, parentheses)
    if (/^[\s0-9\.\+\-\*\/\(\)]+$/.test(substituted) && !substituted.includes('//')) {
      try {
        const fn = new Function(`return (${substituted})`);
        const res = fn();
        if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
          return res;
        }
      } catch {}
    }
    return undefined;
  }
}
