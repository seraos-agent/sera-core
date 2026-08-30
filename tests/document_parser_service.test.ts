import { describe, it, expect } from 'vitest';
import { DocumentParserService } from '../src/core/ingestion/DocumentParserService';
import ExcelJS from 'exceljs';

describe('DocumentParserService', () => {
  it('should parse standard comma-delimited CSV', async () => {
    const csvContent = `Name,Age,Role\nAlice,30,Developer\nBob,25,Designer\nCharlie,35,Manager`;
    const result = await DocumentParserService.parseDocument(csvContent, 'team.csv', 'text/csv');

    expect(result.detectedType).toBe('TABULAR_DATA');
    expect(result.totalRows).toBe(3);
    expect(result.headers).toEqual(['Name', 'Age', 'Role']);
    expect(result.sampleRows.length).toBe(3);
    expect(result.sampleRows[0]).toEqual(['Alice', '30', 'Developer']);
    expect(result.formattedMarkdownTable).toContain('| Alice | 30 | Developer |');
  });

  it('should parse semicolon-delimited CSV with quotes (Indonesian format)', async () => {
    const csvContent = `"Tanggal";"Keterangan";"Jumlah"\n"2026-08-30";"Beli Kopi";"25.000"\n"2026-08-31";"Gaji";"10.000.000"`;
    const result = await DocumentParserService.parseDocument(csvContent, 'mutasi.csv', 'text/csv');

    expect(result.headers).toEqual(['Tanggal', 'Keterangan', 'Jumlah']);
    expect(result.totalRows).toBe(2);
    expect(result.sampleRows[0]).toEqual(['2026-08-30', 'Beli Kopi', '25.000']);
  });

  it('should detect Shopee order export and calculate revenue, fees, and net payout', async () => {
    const shopeeCsv = `No. Pesanan,Waktu Pesanan Selesai,Status Pesanan,Total Penghasilan,Biaya Administrasi,Biaya Layanan
2408310001,2026-08-30 14:00,Selesai,Rp 150.000,Rp 6.000,Rp 4.000
2408310002,2026-08-30 15:30,Selesai,Rp 250.000,Rp 10.000,Rp 6.000
2408310003,2026-08-30 18:00,Batal,Rp 100.000,Rp 0,Rp 0`;

    const result = await DocumentParserService.parseDocument(shopeeCsv, 'shopee_orders_august.csv', 'text/csv');

    expect(result.detectedType).toBe('SHOPEE_ORDER');
    expect(result.summaryMetrics?.marketplace).toBe('Shopee');
    expect(result.summaryMetrics?.totalOrders).toBe(3);
    expect(result.summaryMetrics?.completedOrders).toBe(2);
    expect(result.summaryMetrics?.cancelledOrders).toBe(1);
    expect(result.summaryMetrics?.grossRevenue).toBe('Rp 500.000');
    expect(result.summaryMetrics?.platformFees).toBe('Rp 16.000');
    expect(result.summaryMetrics?.netPayout).toBe('Rp 484.000');
  });

  it('should detect Bank Statement and calculate Debit, Kredit, and Net Cash Flow', async () => {
    const bankCsv = `Tanggal,Keterangan,Debit,Kredit,Saldo
2026-08-01,Transfer Masuk,0,5.000.000,5.000.000
2026-08-02,Bayar Server,1.200.000,0,3.800.000
2026-08-03,Bayar Listrik,500.000,0,3.300.000`;

    const result = await DocumentParserService.parseDocument(bankCsv, 'rekening_koran.csv', 'text/csv');

    expect(result.detectedType).toBe('BANK_STATEMENT');
    expect(result.summaryMetrics?.totalTransactions).toBe(3);
    expect(result.summaryMetrics?.totalInflow).toBe('Rp 5.000.000');
    expect(result.summaryMetrics?.totalOutflow).toBe('Rp 1.700.000');
    expect(result.summaryMetrics?.netCashFlow).toBe('Rp 3.300.000');
  });

  it('should parse Excel (.xlsx) buffer into structured tables', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sales Report');
    sheet.addRow(['Product', 'Category', 'Price', 'Stock']);
    sheet.addRow(['Wireless Mouse', 'Electronics', 150000, 45]);
    sheet.addRow(['Mechanical Keyboard', 'Electronics', 650000, 12]);
    sheet.addRow(['Desk Mat', 'Accessories', 85000, 80]);

    const rawBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(rawBuffer);

    const result = await DocumentParserService.parseDocument(buffer, 'inventory.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    expect(result.sheetCount).toBe(1);
    expect(result.totalRows).toBe(3);
    expect(result.headers).toEqual(['Product', 'Category', 'Price', 'Stock']);
    expect(result.sampleRows[0][0]).toBe('Wireless Mouse');
    expect(result.sampleRows[1][1]).toBe('Electronics');
  });

  it('should parse JSON arrays of objects', async () => {
    const jsonContent = JSON.stringify([
      { id: 1, name: 'Product A', sales: 120 },
      { id: 2, name: 'Product B', sales: 95 }
    ]);

    const result = await DocumentParserService.parseDocument(jsonContent, 'sales.json', 'application/json');

    expect(result.totalRows).toBe(2);
    expect(result.headers).toEqual(['id', 'name', 'sales']);
    expect(result.sampleRows[0]).toEqual([1, 'Product A', 120]);
  });
});
