/**
 * Temporal Reality Utilities for SERA OS
 * 
 * Provides canonical world-clock calculation, timezone resolution from international
 * phone country codes (E.164), localized date-time formatting, and UTC anchoring.
 * Follows Rule 7 (English Only for Code & Architecture).
 */

export interface PhoneCountryMapping {
  prefix: string;
  timezone: string;
  country: string;
}

// Ordered descending by prefix length to avoid prefix collisions (e.g. 966 before 9, 1 before none)
export const KNOWN_PHONE_COUNTRY_PREFIXES: PhoneCountryMapping[] = [
  // 3-digit prefixes
  { prefix: '966', timezone: 'Asia/Riyadh', country: 'Saudi Arabia (+966)' },
  { prefix: '971', timezone: 'Asia/Dubai', country: 'United Arab Emirates (+971)' },
  { prefix: '974', timezone: 'Asia/Qatar', country: 'Qatar (+974)' },
  { prefix: '852', timezone: 'Asia/Hong_Kong', country: 'Hong Kong (+852)' },
  { prefix: '886', timezone: 'Asia/Taipei', country: 'Taiwan (+886)' },
  { prefix: '673', timezone: 'Asia/Brunei', country: 'Brunei (+673)' },

  // 2-digit prefixes
  { prefix: '62', timezone: 'Asia/Jakarta', country: 'Indonesia (+62)' },
  { prefix: '61', timezone: 'Australia/Sydney', country: 'Australia (+61)' },
  { prefix: '65', timezone: 'Asia/Singapore', country: 'Singapore (+65)' },
  { prefix: '60', timezone: 'Asia/Kuala_Lumpur', country: 'Malaysia (+60)' },
  { prefix: '81', timezone: 'Asia/Tokyo', country: 'Japan (+81)' },
  { prefix: '82', timezone: 'Asia/Seoul', country: 'South Korea (+82)' },
  { prefix: '86', timezone: 'Asia/Shanghai', country: 'China (+86)' },
  { prefix: '91', timezone: 'Asia/Kolkata', country: 'India (+91)' },
  { prefix: '44', timezone: 'Europe/London', country: 'United Kingdom (+44)' },
  { prefix: '49', timezone: 'Europe/Berlin', country: 'Germany (+49)' },
  { prefix: '33', timezone: 'Europe/Paris', country: 'France (+33)' },
  { prefix: '31', timezone: 'Europe/Amsterdam', country: 'Netherlands (+31)' },
  { prefix: '39', timezone: 'Europe/Rome', country: 'Italy (+39)' },
  { prefix: '34', timezone: 'Europe/Madrid', country: 'Spain (+34)' },
  { prefix: '41', timezone: 'Europe/Zurich', country: 'Switzerland (+41)' },
  { prefix: '90', timezone: 'Europe/Istanbul', country: 'Turkey (+90)' },
  { prefix: '20', timezone: 'Africa/Cairo', country: 'Egypt (+20)' },
  { prefix: '27', timezone: 'Africa/Johannesburg', country: 'South Africa (+27)' },
  { prefix: '64', timezone: 'Pacific/Auckland', country: 'New Zealand (+64)' },
  { prefix: '63', timezone: 'Asia/Manila', country: 'Philippines (+63)' },
  { prefix: '66', timezone: 'Asia/Bangkok', country: 'Thailand (+66)' },
  { prefix: '84', timezone: 'Asia/Ho_Chi_Minh', country: 'Vietnam (+84)' },
  { prefix: '55', timezone: 'America/Sao_Paulo', country: 'Brazil (+55)' },

  // 1-digit prefixes
  { prefix: '1', timezone: 'America/New_York', country: 'United States / Canada (+1)' },
  { prefix: '7', timezone: 'Europe/Moscow', country: 'Russia (+7)' }
];

const TIMEZONE_ABBREVIATIONS: Record<string, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
  'Asia/Riyadh': 'AST',
  'Asia/Dubai': 'GST',
  'Asia/Singapore': 'SGT',
  'Asia/Kuala_Lumpur': 'MYT',
  'Asia/Tokyo': 'JST',
  'Asia/Seoul': 'KST',
  'Asia/Shanghai': 'CST',
  'Asia/Hong_Kong': 'HKT',
  'Asia/Taipei': 'CST',
  'Asia/Kolkata': 'IST',
  'Australia/Sydney': 'AEST',
  'Australia/Melbourne': 'AEST',
  'Australia/Brisbane': 'AEST',
  'Australia/Perth': 'AWST',
  'Europe/London': 'GMT/BST',
  'Europe/Berlin': 'CET/CEST',
  'Europe/Paris': 'CET/CEST',
  'Europe/Amsterdam': 'CET/CEST',
  'Europe/Rome': 'CET/CEST',
  'Europe/Madrid': 'CET/CEST',
  'America/New_York': 'EST/EDT',
  'America/Chicago': 'CST/CDT',
  'America/Denver': 'MST/MDT',
  'America/Los_Angeles': 'PST/PDT',
  'UTC': 'UTC'
};

/**
 * Validates whether an IANA timezone identifier is recognized by the runtime environment.
 */
export function isValidTimezone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves regional timezone from international E.164 phone string (with or without leading '+').
 */
export function resolveTimezoneFromPhone(phone?: string): { timezone: string; country: string } | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  for (const item of KNOWN_PHONE_COUNTRY_PREFIXES) {
    if (digits.startsWith(item.prefix)) {
      return {
        timezone: item.timezone,
        country: item.country
      };
    }
  }

  return null;
}

/**
 * Extracts formatted UTC offset string (e.g., 'UTC+7', 'UTC+3', 'UTC-4').
 */
export function getTimezoneOffsetString(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour12: false
    }).formatToParts(date);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    if (tzPart && tzPart.value) {
      return tzPart.value.replace('GMT', 'UTC');
    }
  } catch {}
  return 'UTC';
}

export interface FormattedTemporalReality {
  currentTime: number;
  utcIso: string;
  utcFormatted: string;
  localFormatted: string;
  timezone: string;
  offsetString: string;
  tzAbbreviation: string;
  detectedCountry?: string;
}

/**
 * Formats canonical UTC and local temporal reality strings.
 */
export function formatTemporalReality(date: Date, timeZone: string, country?: string): FormattedTemporalReality {
  const safeTz = isValidTimezone(timeZone) ? timeZone : 'Asia/Jakarta';
  const offsetString = getTimezoneOffsetString(date, safeTz);
  const tzAbbreviation = TIMEZONE_ABBREVIATIONS[safeTz] || offsetString;

  // UTC Universal Anchor
  const utcDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);

  const utcTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);

  const utcFormatted = `${utcDate}, ${utcTime} UTC`;

  // Local Time in Target Timezone (Indonesian Day/Month format for warmth)
  const localDate = new Intl.DateTimeFormat('id-ID', {
    timeZone: safeTz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);

  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);

  const localFormatted = `${localDate}, ${localTime} ${tzAbbreviation} (${safeTz}, ${offsetString})`;

  return {
    currentTime: date.getTime(),
    utcIso: date.toISOString(),
    utcFormatted,
    localFormatted,
    timezone: safeTz,
    offsetString,
    tzAbbreviation,
    detectedCountry: country
  };
}
