import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { CurrencyRegistry } from '../src/capabilities/google-drive/spreadsheet/CurrencyRegistry';
import { SpreadsheetFormatter } from '../src/capabilities/google-drive/spreadsheet/SpreadsheetFormatter';
import { SpreadsheetLayoutBuilder } from '../src/capabilities/google-drive/spreadsheet/SpreadsheetLayoutBuilder';
import { SpreadsheetMetrics } from '../src/capabilities/google-drive/spreadsheet/SpreadsheetMetrics';

describe('Universal ISO 4217 Currency Engine', () => {
  it('correctly maps zero-decimal, two-decimal, and three-decimal global currencies', () => {
    // Zero-decimal
    expect(CurrencyRegistry.lookup('IDR')?.decimals).toBe(0);
    expect(CurrencyRegistry.lookup('IDR')?.numFmt).toBe('Rp #,##0');
    expect(CurrencyRegistry.lookup('JPY')?.decimals).toBe(0);
    expect(CurrencyRegistry.lookup('JPY')?.numFmt).toBe('¥#,##0');
    expect(CurrencyRegistry.lookup('KRW')?.decimals).toBe(0);
    expect(CurrencyRegistry.lookup('KRW')?.numFmt).toBe('₩#,##0');
    expect(CurrencyRegistry.lookup('VND')?.decimals).toBe(0);
    expect(CurrencyRegistry.lookup('VND')?.numFmt).toBe('₫#,##0');

    // Three-decimal (Middle Eastern dinars)
    expect(CurrencyRegistry.lookup('KWD')?.decimals).toBe(3);
    expect(CurrencyRegistry.lookup('KWD')?.numFmt).toBe('"KWD" #,##0.000');
    expect(CurrencyRegistry.lookup('BHD')?.decimals).toBe(3);
    expect(CurrencyRegistry.lookup('BHD')?.numFmt).toBe('"BHD" #,##0.000');
    expect(CurrencyRegistry.lookup('OMR')?.decimals).toBe(3);
    expect(CurrencyRegistry.lookup('OMR')?.numFmt).toBe('"OMR" #,##0.000');

    // Two-decimal standard world currencies
    expect(CurrencyRegistry.lookup('USD')?.numFmt).toBe('$#,##0.00');
    expect(CurrencyRegistry.lookup('EUR')?.numFmt).toBe('€#,##0.00');
    expect(CurrencyRegistry.lookup('GBP')?.numFmt).toBe('£#,##0.00');
    expect(CurrencyRegistry.lookup('SAR')?.numFmt).toBe('"SAR" #,##0.00');
    expect(CurrencyRegistry.lookup('AED')?.numFmt).toBe('"AED" #,##0.00');
    expect(CurrencyRegistry.lookup('CHF')?.numFmt).toBe('"CHF" #,##0.00');
    expect(CurrencyRegistry.lookup('AUD')?.numFmt).toBe('"AUD" #,##0.00');
    expect(CurrencyRegistry.lookup('CAD')?.numFmt).toBe('"CAD" #,##0.00');
    expect(CurrencyRegistry.lookup('SGD')?.numFmt).toBe('S$#,##0.00');
    expect(CurrencyRegistry.lookup('MYR')?.numFmt).toBe('"RM" #,##0.00');

    // Crypto & Stablecoins
    expect(CurrencyRegistry.lookup('USDT')?.numFmt).toBe('"USDT" #,##0.00');
    expect(CurrencyRegistry.lookup('BTC')?.numFmt).toBe('"BTC" #,##0.0000');
  });

  it('detects currency from headers and cells with parenthetical hints, symbols, and ISO codes', () => {
    expect(CurrencyRegistry.detectFromText('Total Biaya (SAR)')?.code).toBe('SAR');
    expect(CurrencyRegistry.detectFromText('Hotel Fee (USD)')?.code).toBe('USD');
    expect(CurrencyRegistry.detectFromText('Harga (Rp)')?.code).toBe('IDR');
    expect(CurrencyRegistry.detectFromText('Donation (KWD)')?.code).toBe('KWD');
    expect(CurrencyRegistry.detectFromText('Transport (AED)')?.code).toBe('AED');
    expect(CurrencyRegistry.detectFromText('Tech Stash (SOL)')?.code).toBe('SOL');

    // Distinguishes common words from currency codes (e.g. Fee is NOT a currency)
    expect(CurrencyRegistry.detectFromText('Consultant Fee')?.code).toBeUndefined();
    expect(CurrencyRegistry.detectFromText('Net Salary')?.code).toBeUndefined();
  });

  it('formats single global currency table with exact ISO number format in ExcelJS', async () => {
    // Saudi Riyal (SAR) single-currency report
    const headers = ['Proyek', 'Kategori', 'Nominal (SAR)', 'Status'];
    const rows = [
      ['Riyadh Metro Expansion', 'Konstruksi', 1250000.50, 'Completed'],
      ['Jeddah Tower Consulting', 'Teknik', 450000.00, 'Pending']
    ];

    const buf = await SpreadsheetLayoutBuilder.generateWorkbook('Laporan SAR', headers, rows, { includeSummaryRow: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(1)!;

    // Check data row format
    expect(ws.getRow(2).getCell(3).numFmt).toBe('"SAR" #,##0.00');
    expect(ws.getRow(2).getCell(3).value).toBe(1250000.50);

    // Check summary row format
    const summaryRow = ws.getRow(4);
    expect(summaryRow.getCell(1).value).toBe('Total');
    expect((summaryRow.getCell(3).value as any)?.formula).toBe('SUM(C2:C3)');
    expect((summaryRow.getCell(3).value as any)?.result).toBe(1700000.50);
    expect(summaryRow.getCell(3).numFmt).toBe('"SAR" #,##0.00');
  });

  it('prevents cross-currency summation across global currencies and calculates weighted ratio', async () => {
    // Global multi-valas table with SAR, AED, USD, EUR, IDR, JPY
    const headers = ['Deskripsi', 'Mata Uang', 'Nominal Asing', 'Kurs IDR', 'Total Nilai (IDR)'];
    const rows = [
      ['Server Cloud', 'USD', 500, 16000, '=C2*D2'],
      ['Hotel Riyadh', 'SAR', 2000, 4200, '=C3*D3'],
      ['Dubai Event', 'AED', 3500, 4300, '=C4*D4'],
      ['Tokyo Office', 'JPY', 100000, 105, '=C5*D5'],
      ['Konsultan Lokal', 'IDR', 15000000, 1, '=C6*D6']
    ];

    const inferences = SpreadsheetFormatter.inferColumnInferences(headers, rows);
    // Currency code column is text
    expect(inferences[1].type).toBe('text');
    // Nominal Asing is flagged as mixed currency
    expect(inferences[2].isMixedCurrency).toBe(true);

    const metrics = SpreadsheetMetrics.calculateSummaryMetrics(headers, rows, { includeSummaryRow: true });
    // Nominal Asing must NOT be summed across mixed currencies
    expect(metrics.totals['Nominal Asing']).toBe('-');
    // Total Nilai IDR must be summed
    expect(metrics.totals['Total Nilai (IDR)']).toBe(56950000);

    const buf = await SpreadsheetLayoutBuilder.generateWorkbook('Global Multi Valas', headers, rows, { includeSummaryRow: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(1)!;

    const summaryRow = ws.getRow(7);
    expect(summaryRow.getCell(2).value).toBe('-'); // Mata Uang
    expect(summaryRow.getCell(3).value).toBe('-'); // Nominal Asing
    expect(summaryRow.getCell(4).value).toBe('-'); // Kurs
    expect((summaryRow.getCell(5).value as any)?.result).toBe(56950000);
    expect(summaryRow.getCell(5).numFmt).toBe('Rp #,##0');
  });
});
