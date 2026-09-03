/**
 * SpreadsheetEngine — High-Performance Facade for Spreadsheet operations.
 *
 * Architecture:
 * - Submodules decomposed in src/capabilities/google-drive/spreadsheet/
 * - 100% backward compatible public API surface.
 */
import {
  ChartType,
  ChartPosition,
  ChartDefinition,
  SpreadsheetOptions,
  SheetDefinition,
  SupportedCurrency,
  ColumnInference
} from './spreadsheet/spreadsheet.types';
import { SpreadsheetFormulaEngine } from './spreadsheet/SpreadsheetFormulaEngine';
import { SpreadsheetFormatter } from './spreadsheet/SpreadsheetFormatter';
import { SpreadsheetMetrics } from './spreadsheet/SpreadsheetMetrics';
import { SpreadsheetChartBuilder } from './spreadsheet/SpreadsheetChartBuilder';
import { SpreadsheetLayoutBuilder } from './spreadsheet/SpreadsheetLayoutBuilder';
import { SpreadsheetReader } from './spreadsheet/SpreadsheetReader';

export {
  ChartType,
  ChartPosition,
  ChartDefinition,
  SpreadsheetOptions,
  SheetDefinition,
  SupportedCurrency,
  ColumnInference
};

export class SpreadsheetEngine {
  public static readonly DEFAULT_HEADER_COLOR = SpreadsheetLayoutBuilder.DEFAULT_HEADER_COLOR;
  public static readonly ZEBRA_ROW_COLOR = SpreadsheetLayoutBuilder.ZEBRA_ROW_COLOR;
  public static readonly SUMMARY_ROW_COLOR = SpreadsheetLayoutBuilder.SUMMARY_ROW_COLOR;
  public static readonly BORDER_COLOR = SpreadsheetLayoutBuilder.BORDER_COLOR;
  public static readonly STATUS_STYLES = SpreadsheetFormatter.STATUS_STYLES;

  public static async generateWorkbook(
    title: string,
    headers: string[],
    rows: any[][],
    options?: SpreadsheetOptions
  ): Promise<Buffer> {
    return SpreadsheetLayoutBuilder.generateWorkbook(title, headers, rows, options);
  }

  public static async generateMultiSheetWorkbook(sheets: SheetDefinition[]): Promise<Buffer> {
    return SpreadsheetLayoutBuilder.generateMultiSheetWorkbook(sheets);
  }

  public static validateChartDefinition(
    headers: string[],
    rows: any[][],
    chartDef?: ChartDefinition
  ): { valid: boolean; reason?: string } {
    return SpreadsheetChartBuilder.validateChartDefinition(headers, rows, chartDef);
  }

  public static isTopHeroLayout(
    headers: string[],
    rows: any[][],
    chartDef?: ChartDefinition
  ): boolean {
    return SpreadsheetChartBuilder.isTopHeroLayout(headers, rows, chartDef);
  }

  public static calculateSummaryMetrics(
    headers: string[],
    rows: any[][],
    options?: SpreadsheetOptions
  ): { renderedRows: number; totals: Record<string, number | string> } {
    return SpreadsheetMetrics.calculateSummaryMetrics(headers, rows, options);
  }

  public static sanitizeDivisionFormula(formula: string): string {
    return SpreadsheetFormulaEngine.sanitizeDivisionFormula(formula);
  }

  public static shiftFormulaRowNumbers(formula: string, rowOffset: number): string {
    return SpreadsheetFormulaEngine.shiftFormulaRowNumbers(formula, rowOffset);
  }

  public static isValidExcelFormula(cleanFormula: string): boolean {
    return SpreadsheetFormulaEngine.isValidExcelFormula(cleanFormula);
  }

  public static evaluateStaticFormula(formula: string): number | undefined {
    return SpreadsheetFormulaEngine.evaluateStaticFormula(formula);
  }

  public static parseFlexibleNumeric(val: any, isCurrencyCol?: boolean): number | null {
    return SpreadsheetFormatter.parseFlexibleNumeric(val, isCurrencyCol);
  }

  public static formatCompactNumber(val: number, currency: string = 'USD'): string {
    return SpreadsheetFormatter.formatCompactNumber(val, currency);
  }

  public static inferAutomaticChart(
    headers: string[],
    rows: any[][]
  ): ChartDefinition | undefined {
    return SpreadsheetChartBuilder.inferAutomaticChart(headers, rows);
  }

  public static buildGoogleSheetsChartRequest(
    sheetId: number,
    numRows: number,
    headers: string[],
    rows: any[][],
    chartDef: ChartDefinition
  ): any {
    return SpreadsheetChartBuilder.buildGoogleSheetsChartRequest(sheetId, numRows, headers, rows, chartDef);
  }

  public static parseCellAddress(address: string = 'G2'): { rowIndex: number; columnIndex: number } {
    return SpreadsheetChartBuilder.parseCellAddress(address);
  }

  public static getColumnLetter(colNum: number): string {
    return SpreadsheetChartBuilder.getColumnLetter(colNum);
  }

  public static columnLetterToIndex(letter: string): number {
    return SpreadsheetChartBuilder.columnLetterToIndex(letter);
  }

  public static async appendRowsToWorkbook(
    existingBuffer: Buffer,
    newRows: any[][]
  ): Promise<Buffer> {
    return SpreadsheetReader.appendRowsToWorkbook(existingBuffer, newRows);
  }

  public static async readWorkbookAsMarkdown(buffer: Buffer): Promise<string> {
    return SpreadsheetReader.readWorkbookAsMarkdown(buffer);
  }
}
