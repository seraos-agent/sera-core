/**
 * CurrencyRegistry — Universal ISO 4217 Currency Engine for SERA OS.
 *
 * Provides:
 * - Deterministic support for all 160+ official ISO 4217 world currencies
 * - Accurate decimal precision rules (0-decimal, 2-decimal, 3-decimal)
 * - Native symbol & prefix resolution for global accounting standards
 * - Top crypto & stablecoin support (USDT, USDC, BTC, ETH, SOL)
 * - Robust regex text & header currency detection with word boundary precision
 *
 * Architectural Role: Domain Capability Engine (Enforces Rule 7 - Universal English)
 */

export interface CurrencyMetadata {
  code: string;
  symbol?: string;
  decimals: number;
  numFmt: string;
  name: string;
}

export class CurrencyRegistry {
  /**
   * Complete Official ISO 4217 Currency Codes + Major Digital Assets.
   */
  private static readonly ALL_ISO_CODES = new Set<string>([
    // A
    'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
    // B
    'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD',
    // C
    'CAD', 'CDF', 'CHF', 'CLP', 'CNY', 'COP', 'CRC', 'CUC', 'CUP', 'CVE', 'CZK',
    // D
    'DJF', 'DKK', 'DOP', 'DZD',
    // E
    'EGP', 'ERN', 'ETB', 'EUR',
    // F
    'FJD', 'FKP',
    // G
    'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD',
    // H
    'HKD', 'HNL', 'HRK', 'HTG', 'HUF',
    // I
    'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK',
    // J
    'JMD', 'JOD', 'JPY',
    // K
    'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT',
    // L
    'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD',
    // M
    'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN',
    // N
    'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD',
    // O
    'OMR',
    // P
    'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG',
    // Q
    'QAR',
    // R
    'RON', 'RSD', 'RUB', 'RWF',
    // S
    'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLL', 'SOS', 'SRD', 'STN', 'SVC', 'SYP', 'SZL',
    // T
    'THB', 'TJS', 'TMT', 'TND', 'TRY', 'TTD', 'TWD', 'TZS',
    // U
    'UAH', 'UGX', 'USD', 'UYU', 'UZS',
    // V
    'VES', 'VND', 'VUV',
    // W
    'WST',
    // X
    'XAF', 'XCD', 'XOF', 'XPF',
    // Y
    'YER',
    // Z
    'ZAR', 'ZMW', 'ZWL',
    // Digital Assets & Stablecoins
    'USDT', 'USDC', 'BTC', 'ETH', 'SOL', 'DAI'
  ]);

  /**
   * ISO 4217 Zero-Decimal Currencies (No sub-units/cents).
   */
  private static readonly ZERO_DECIMAL_CODES = new Set<string>([
    'BIF', 'CLP', 'DJF', 'GNF', 'HUF', 'IDR', 'JPY', 'KMF', 'KRW',
    'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
  ]);

  /**
   * ISO 4217 Three-Decimal Currencies (1,000 sub-units/fils).
   */
  private static readonly THREE_DECIMAL_CODES = new Set<string>([
    'BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'
  ]);

  /**
   * High-Frequency & Special Symbol Currency Profiles.
   */
  private static readonly SPECIAL_CURRENCY_PROFILES: Record<string, CurrencyMetadata> = {
    IDR: { code: 'IDR', symbol: 'Rp', decimals: 0, numFmt: 'Rp #,##0', name: 'Indonesian Rupiah' },
    USD: { code: 'USD', symbol: '$', decimals: 2, numFmt: '$#,##0.00', name: 'US Dollar' },
    EUR: { code: 'EUR', symbol: '€', decimals: 2, numFmt: '€#,##0.00', name: 'Euro' },
    GBP: { code: 'GBP', symbol: '£', decimals: 2, numFmt: '£#,##0.00', name: 'British Pound' },
    JPY: { code: 'JPY', symbol: '¥', decimals: 0, numFmt: '¥#,##0', name: 'Japanese Yen' },
    CNY: { code: 'CNY', symbol: '¥', decimals: 2, numFmt: '¥#,##0.00', name: 'Chinese Yuan Renminbi' },
    SGD: { code: 'SGD', symbol: 'S$', decimals: 2, numFmt: 'S$#,##0.00', name: 'Singapore Dollar' },
    MYR: { code: 'MYR', symbol: 'RM', decimals: 2, numFmt: '"RM" #,##0.00', name: 'Malaysian Ringgit' },
    INR: { code: 'INR', symbol: '₹', decimals: 2, numFmt: '₹#,##0.00', name: 'Indian Rupee' },
    KRW: { code: 'KRW', symbol: '₩', decimals: 0, numFmt: '₩#,##0', name: 'South Korean Won' },
    THB: { code: 'THB', symbol: '฿', decimals: 2, numFmt: '฿#,##0.00', name: 'Thai Baht' },
    VND: { code: 'VND', symbol: '₫', decimals: 0, numFmt: '₫#,##0', name: 'Vietnamese Dong' },
    PHP: { code: 'PHP', symbol: '₱', decimals: 2, numFmt: '₱#,##0.00', name: 'Philippine Peso' },
    AUD: { code: 'AUD', symbol: 'A$', decimals: 2, numFmt: '"AUD" #,##0.00', name: 'Australian Dollar' },
    CAD: { code: 'CAD', symbol: 'C$', decimals: 2, numFmt: '"CAD" #,##0.00', name: 'Canadian Dollar' },
    CHF: { code: 'CHF', symbol: 'CHF', decimals: 2, numFmt: '"CHF" #,##0.00', name: 'Swiss Franc' },
    SAR: { code: 'SAR', symbol: 'SAR', decimals: 2, numFmt: '"SAR" #,##0.00', name: 'Saudi Riyal' },
    AED: { code: 'AED', symbol: 'AED', decimals: 2, numFmt: '"AED" #,##0.00', name: 'UAE Dirham' },
    QAR: { code: 'QAR', symbol: 'QAR', decimals: 2, numFmt: '"QAR" #,##0.00', name: 'Qatari Riyal' },
    HKD: { code: 'HKD', symbol: 'HK$', decimals: 2, numFmt: '"HKD" #,##0.00', name: 'Hong Kong Dollar' },
    TWD: { code: 'TWD', symbol: 'NT$', decimals: 2, numFmt: '"NT$" #,##0.00', name: 'New Taiwan Dollar' },
    NZD: { code: 'NZD', symbol: 'NZ$', decimals: 2, numFmt: '"NZD" #,##0.00', name: 'New Zealand Dollar' },
    BRL: { code: 'BRL', symbol: 'R$', decimals: 2, numFmt: '"R$" #,##0.00', name: 'Brazilian Real' },
    TRY: { code: 'TRY', symbol: '₺', decimals: 2, numFmt: '₺#,##0.00', name: 'Turkish Lira' },
    RUB: { code: 'RUB', symbol: '₽', decimals: 2, numFmt: '₽#,##0.00', name: 'Russian Ruble' },
    ZAR: { code: 'ZAR', symbol: 'R', decimals: 2, numFmt: '"ZAR" #,##0.00', name: 'South African Rand' },
    SEK: { code: 'SEK', symbol: 'kr', decimals: 2, numFmt: '"SEK" #,##0.00', name: 'Swedish Krona' },
    NOK: { code: 'NOK', symbol: 'kr', decimals: 2, numFmt: '"NOK" #,##0.00', name: 'Norwegian Krone' },
    DKK: { code: 'DKK', symbol: 'kr', decimals: 2, numFmt: '"DKK" #,##0.00', name: 'Danish Krone' },
    PLN: { code: 'PLN', symbol: 'zł', decimals: 2, numFmt: '"zł" #,##0.00', name: 'Polish Zloty' },
    CZK: { code: 'CZK', symbol: 'Kč', decimals: 2, numFmt: '"Kč" #,##0.00', name: 'Czech Koruna' },
    HUF: { code: 'HUF', symbol: 'Ft', decimals: 0, numFmt: '"Ft" #,##0', name: 'Hungarian Forint' },
    KWD: { code: 'KWD', symbol: 'KD', decimals: 3, numFmt: '"KWD" #,##0.000', name: 'Kuwaiti Dinar' },
    BHD: { code: 'BHD', symbol: 'BD', decimals: 3, numFmt: '"BHD" #,##0.000', name: 'Bahraini Dinar' },
    OMR: { code: 'OMR', symbol: 'RO', decimals: 3, numFmt: '"OMR" #,##0.000', name: 'Omani Rial' },
    // Crypto & Stablecoins
    USDT: { code: 'USDT', symbol: 'USDT', decimals: 2, numFmt: '"USDT" #,##0.00', name: 'Tether USD' },
    USDC: { code: 'USDC', symbol: 'USDC', decimals: 2, numFmt: '"USDC" #,##0.00', name: 'USD Coin' },
    BTC: { code: 'BTC', symbol: 'BTC', decimals: 4, numFmt: '"BTC" #,##0.0000', name: 'Bitcoin' },
    ETH: { code: 'ETH', symbol: 'ETH', decimals: 4, numFmt: '"ETH" #,##0.0000', name: 'Ethereum' },
    SOL: { code: 'SOL', symbol: 'SOL', decimals: 2, numFmt: '"SOL" #,##0.00', name: 'Solana' }
  };

  /**
   * Symbol to Currency Code Mapping for Fast Lookup.
   */
  private static readonly SYMBOL_MAP: Record<string, string> = {
    'RP': 'IDR',
    'RP.': 'IDR',
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
    '₹': 'INR',
    '₩': 'KRW',
    '฿': 'THB',
    '₫': 'VND',
    '₱': 'PHP',
    'S$': 'SGD',
    'RM': 'MYR',
    'R$': 'BRL',
    '₺': 'TRY',
    '₽': 'RUB',
    '₦': 'NGN',
    'A$': 'AUD',
    'C$': 'CAD',
    'NT$': 'TWD',
    'NZ$': 'NZD',
    'HK$': 'HKD'
  };

  /**
   * Look up a currency by ISO code or symbol.
   */
  public static lookup(codeOrSymbol: string): CurrencyMetadata | undefined {
    if (!codeOrSymbol) return undefined;
    const clean = codeOrSymbol.trim().toUpperCase();

    // 1. Exact Special Profile match
    if (this.SPECIAL_CURRENCY_PROFILES[clean]) {
      return this.SPECIAL_CURRENCY_PROFILES[clean];
    }

    // 2. Direct symbol match
    if (this.SYMBOL_MAP[clean]) {
      const mappedCode = this.SYMBOL_MAP[clean];
      return this.SPECIAL_CURRENCY_PROFILES[mappedCode] || this.buildStandardProfile(mappedCode);
    }

    // 3. Official ISO 4217 validation
    if (this.ALL_ISO_CODES.has(clean)) {
      return this.buildStandardProfile(clean);
    }

    return undefined;
  }

  /**
   * Builds an ISO 4217 compliant profile dynamically for any global currency code.
   */
  private static buildStandardProfile(code: string): CurrencyMetadata {
    if (this.ZERO_DECIMAL_CODES.has(code)) {
      return {
        code,
        decimals: 0,
        numFmt: `"${code}" #,##0`,
        name: code
      };
    }

    if (this.THREE_DECIMAL_CODES.has(code)) {
      return {
        code,
        decimals: 3,
        numFmt: `"${code}" #,##0.000`,
        name: code
      };
    }

    return {
      code,
      decimals: 2,
      numFmt: `"${code}" #,##0.00`,
      name: code
    };
  }

  /**
   * Detects currency code or symbol from header or cell string content.
   */
  public static detectFromText(text: string): CurrencyMetadata | undefined {
    if (!text) return undefined;
    const s = text.trim();

    // 1. Check parenthetical currency hint first: e.g. "Fee (INR)", "Price (USD)", "Harga (SAR)"
    const parenMatch = s.match(/\(([A-Za-z\$\€\£\¥\₹\₩\฿\₫\₱\s]+)\)/);
    if (parenMatch) {
      const inner = parenMatch[1].trim();
      const meta = this.lookup(inner);
      if (meta) return meta;
    }

    // 2. Check distinct multi-char symbols to avoid prefix clashes (e.g. S$, RM, Rp, NT$)
    if (/\bS\$/i.test(s) || s.includes('S$')) return this.SPECIAL_CURRENCY_PROFILES.SGD;
    if (/\bRM\b/i.test(s)) return this.SPECIAL_CURRENCY_PROFILES.MYR;
    if (/\bRP\.?\b/i.test(s)) return this.SPECIAL_CURRENCY_PROFILES.IDR;
    if (/\bR\$/i.test(s) || s.includes('R$')) return this.SPECIAL_CURRENCY_PROFILES.BRL;
    if (/\bNT\$/i.test(s) || s.includes('NT$')) return this.SPECIAL_CURRENCY_PROFILES.TWD;
    if (/\bA\$/i.test(s) || s.includes('A$')) return this.SPECIAL_CURRENCY_PROFILES.AUD;
    if (/\bC\$/i.test(s) || s.includes('C$')) return this.SPECIAL_CURRENCY_PROFILES.CAD;
    if (/\bHK\$/i.test(s) || s.includes('HK$')) return this.SPECIAL_CURRENCY_PROFILES.HKD;

    // 3. Single-char symbols
    if (s.includes('€')) return this.SPECIAL_CURRENCY_PROFILES.EUR;
    if (s.includes('£')) return this.SPECIAL_CURRENCY_PROFILES.GBP;
    if (s.includes('¥')) return this.SPECIAL_CURRENCY_PROFILES.JPY;
    if (s.includes('₹')) return this.SPECIAL_CURRENCY_PROFILES.INR;
    if (s.includes('₩')) return this.SPECIAL_CURRENCY_PROFILES.KRW;
    if (s.includes('฿')) return this.SPECIAL_CURRENCY_PROFILES.THB;
    if (s.includes('₫')) return this.SPECIAL_CURRENCY_PROFILES.VND;
    if (s.includes('₱')) return this.SPECIAL_CURRENCY_PROFILES.PHP;
    if (s.includes('₺')) return this.SPECIAL_CURRENCY_PROFILES.TRY;
    if (s.includes('₽')) return this.SPECIAL_CURRENCY_PROFILES.RUB;
    if (s.includes('$')) return this.SPECIAL_CURRENCY_PROFILES.USD;

    // 4. Exact uppercase ISO 4217 code match (e.g. "INR", "USD", "SAR", "AED", "CHF")
    const codeMatches = s.match(/\b([A-Z]{3,4})\b/g);
    if (codeMatches) {
      for (const m of codeMatches) {
        const candidate = m.toUpperCase();
        if (this.ALL_ISO_CODES.has(candidate)) {
          return this.lookup(candidate);
        }
      }
    }

    // 5. Common currency names
    const lower = s.toLowerCase();
    if (lower.includes('rupiah')) return this.SPECIAL_CURRENCY_PROFILES.IDR;
    if (lower.includes('dollar') || lower.includes('dolar')) return this.SPECIAL_CURRENCY_PROFILES.USD;
    if (lower.includes('euro')) return this.SPECIAL_CURRENCY_PROFILES.EUR;
    if (lower.includes('pound')) return this.SPECIAL_CURRENCY_PROFILES.GBP;
    if (lower.includes('yen')) return this.SPECIAL_CURRENCY_PROFILES.JPY;
    if (lower.includes('yuan') || lower.includes('renminbi')) return this.SPECIAL_CURRENCY_PROFILES.CNY;
    if (lower.includes('ringgit')) return this.SPECIAL_CURRENCY_PROFILES.MYR;
    if (lower.includes('baht')) return this.SPECIAL_CURRENCY_PROFILES.THB;
    if (lower.includes('won')) return this.SPECIAL_CURRENCY_PROFILES.KRW;
    if (lower.includes('riyal')) return this.SPECIAL_CURRENCY_PROFILES.SAR;
    if (lower.includes('dirham')) return this.SPECIAL_CURRENCY_PROFILES.AED;
    if (lower.includes('franc')) return this.SPECIAL_CURRENCY_PROFILES.CHF;
    if (lower.includes('peso')) return this.SPECIAL_CURRENCY_PROFILES.PHP;
    if (lower.includes('dong')) return this.SPECIAL_CURRENCY_PROFILES.VND;

    return undefined;
  }

  /**
   * Checks whether a header indicates a dedicated currency descriptor column.
   */
  public static isCurrencyColumnHeader(header: string): boolean {
    if (!header) return false;
    const lh = header.toLowerCase().trim();
    return (
      lh.includes('mata uang') ||
      lh.includes('mata_uang') ||
      lh.includes('valas') ||
      lh.includes('currency') ||
      lh.includes('kode valas') ||
      lh === 'curr' ||
      lh.includes('denomination')
    );
  }

  /**
   * Formats an ExcelJS number format string for a given currency code.
   */
  public static getExcelFormat(codeOrSymbol: string): string {
    const meta = this.lookup(codeOrSymbol);
    return meta ? meta.numFmt : '#,##0.00';
  }
}
