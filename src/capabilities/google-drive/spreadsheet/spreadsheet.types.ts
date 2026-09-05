export type ChartType = 'COLUMN' | 'BAR' | 'LINE' | 'PIE' | 'AREA';

export interface ChartPosition {
  anchorCell?: string;   // e.g. "G2" or cell address
  anchorRow?: number;    // 0-indexed row (e.g. 0 = Row 1, 15 = Row 16)
  anchorCol?: number;    // 0-indexed column (e.g. 0 = Col A, 6 = Col G)
  widthPixels?: number;  // default 600
  heightPixels?: number; // default 380
}

export interface ChartDefinition {
  title?: string;
  type: ChartType;
  categoryColumn?: number; // 0-indexed column for X-axis / labels (default: 0)
  valueColumns?: number[];  // 0-indexed column(s) for Y-axis / series values (default: inferred numeric columns)
  position?: ChartPosition;
  anchorRow?: number;       // Direct 0-indexed row convenience property
  anchorCol?: number;       // Direct 0-indexed column convenience property
}

export interface SpreadsheetOptions {
  sheetName?: string;
  themeColor?: string; // Header background hex without # (default: '0F172A')
  includeSummaryRow?: boolean; // If true, adds a SUM total row for numeric columns
  chart?: ChartDefinition;     // Optional native chart configuration
  mode?: 'overwrite' | 'append'; // Append to existing table or full overwrite (default: 'overwrite')
  targetSheet?: string;        // Target a specific worksheet tab for append/update
  folder?: string;             // Target subfolder inside SERA Vault (e.g. 'Sales & Marketplace')
}

export interface SheetDefinition {
  name: string;
  headers: string[];
  rows: any[][];
  options?: SpreadsheetOptions;
}

export interface WorkbookDefinition {
  title: string;
  sheets: SheetDefinition[];
  folder?: string;
  options?: SpreadsheetOptions;
}

export type SupportedCurrency = string;

export interface ColumnInference {
  type: 'currency' | 'percentage' | 'number' | 'date' | 'boolean' | 'formula' | 'status' | 'text';
  currency?: SupportedCurrency;
  numFmt?: string;
  isMixedCurrency?: boolean;
}
