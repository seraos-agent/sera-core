import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { SpreadsheetLayoutBuilder } from '../src/capabilities/google-drive/spreadsheet/SpreadsheetLayoutBuilder';
import { SpreadsheetReader } from '../src/capabilities/google-drive/spreadsheet/SpreadsheetReader';

describe('Spreadsheet Engine Stress Test Deficiencies Fixes', () => {
  it('Fixes Uji Guard (#3): row TOTAL is populated with formulas and values even if user supplies empty summary row', async () => {
    const headers = ['Kategori', 'Pendapatan', 'Biaya', 'Margin %'];
    const rows = [
      ['Produk A', 1000000, 400000, '=(B2-C2)/B2'],
      ['Produk B', 900000, 565000, '=(B3-C3)/B3'],
      ['Total', '', '', ''] // User/LLM supplied empty summary row
    ];

    const buf = await SpreadsheetLayoutBuilder.generateWorkbook('Uji Guard 3', headers, rows, { includeSummaryRow: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(1)!;

    const summaryRow = ws.getRow(4);
    expect(summaryRow.getCell(1).value).toBe('Total');

    // Pendapatan must be summed, NOT empty!
    expect((summaryRow.getCell(2).value as any)?.formula).toBe('SUM(B2:B3)');
    expect((summaryRow.getCell(2).value as any)?.result).toBe(1900000);

    // Biaya must be summed, NOT empty!
    expect((summaryRow.getCell(3).value as any)?.formula).toBe('SUM(C2:C3)');
    expect((summaryRow.getCell(3).value as any)?.result).toBe(965000);

    // Margin % must be weighted ratio (1900000-965000)/1900000 = 49.2%, NOT empty!
    expect((summaryRow.getCell(4).value as any)?.formula).toBe('IFERROR((B4-C4)/B4, "-")');
    expect((summaryRow.getCell(4).value as any)?.result).toBeCloseTo(0.4921, 3);
  });

  it('Fixes Multi Valas (#2): cell B8 (Mata Uang) renders "-" and never "0" when existing summary row contains 0', async () => {
    const headers = ['Deskripsi', 'Mata Uang', 'Nominal Asing', 'Kurs', 'Total IDR'];
    const rows = [
      ['Server Cloud', 'USD', 500, 16000, '=C2*D2'],
      ['Hotel Riyadh', 'SAR', 2000, 4200, '=C3*D3'],
      ['Total', 0, 0, 0, 0] // LLM provided summary row filled with 0s
    ];

    const buf = await SpreadsheetLayoutBuilder.generateWorkbook('Multi Valas 2', headers, rows, { includeSummaryRow: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet(1)!;

    const summaryRow = ws.getRow(4);
    expect(summaryRow.getCell(1).value).toBe('Total');
    // Column B (Mata Uang): MUST BE '-', NEVER 0!
    expect(summaryRow.getCell(2).value).toBe('-');
    // Column C (Nominal Asing - mixed currency): MUST BE '-', NEVER 0!
    expect(summaryRow.getCell(3).value).toBe('-');
    // Column D (Kurs): MUST BE '-', NEVER 0!
    expect(summaryRow.getCell(4).value).toBe('-');
    // Column E (Total IDR): MUST BE SUM(E2:E3) = 16,400,000!
    expect((summaryRow.getCell(5).value as any)?.formula).toBe('SUM(E2:E3)');
    expect((summaryRow.getCell(5).value as any)?.result).toBe(16400000);
  });

  it('Fixes Ledger (#1): Selisih DD-01 never leaks [object Object] and % Makan renders 113.3% (not 1.1%)', async () => {
    const headers = ['Kode', 'Kategori', 'Anggaran', 'Aktual', 'Selisih', '% Terpakai'];
    const rows = [
      ['DD-01', 'Makan', 150000, 170000, '=C2-D2', '=D2/C2'], // 170000 / 150000 = 113.33%
      ['DD-02', 'Transport', 100000, 80000, '=C3-D3', '=D3/C3']
    ];

    const buf = await SpreadsheetLayoutBuilder.generateWorkbook('Ledger 1', headers, rows, { includeSummaryRow: true });

    // Read back as markdown table (exactly how agent verifies sheets)
    const markdown = await SpreadsheetReader.readWorkbookAsMarkdown(buf);

    // 1. Must NOT contain [object Object] anywhere in the markdown!
    expect(markdown).not.toContain('[object Object]');

    // 2. Selisih DD-01 must have a valid value (e.g. -20.000)
    expect(markdown).toContain('DD-01');
    expect(markdown).toContain('20.000');

    // 3. % Makan must be 113.3% (NEVER 1.1%!)
    expect(markdown).toContain('113.3%');
    expect(markdown).not.toContain('1.1%');
  });
});
