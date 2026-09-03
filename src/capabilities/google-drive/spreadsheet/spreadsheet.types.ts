export type ChartType = 'COLUMN' | 'BAR' | 'LINE' | 'PIE' | 'AREA';

export interface ChartPosition {
  anchorCell?: string;   // e.g. "G2" or cell address
  widthPixels?: number;  // default 600
  heightPixels?: number; // default 380
}

export interface ChartDefinition {
  title?: string;
  type: ChartType;
  categoryColumn?: number; // 0-indexed column for X-axis / labels (default: 0)
  valueColumns?: number[];  // 0-indexed column(s) for Y-axis / series values (default: inferred numeric columns)
  position?: ChartPosition;
}

export interface SpreadsheetOptions {
  sheetName?: string;
  themeColor?: string; // Header background hex without # (default: '0F172A')
  includeSummaryRow?: boolean; // If true, adds a SUM total row for numeric columns
  chart?: ChartDefinition;     // Optional native chart configuration
}

export interface SheetDefinition {
  name: string;
  headers: string[];
  rows: any[][];
  options?: SpreadsheetOptions;
}

export type SupportedCurrency = string;

export interface ColumnInference {
  type: 'currency' | 'percentage' | 'number' | 'date' | 'boolean' | 'formula' | 'status' | 'text';
  currency?: SupportedCurrency;
  numFmt?: string;
  isMixedCurrency?: boolean;
}
