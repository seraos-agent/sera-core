import { describe, expect, it } from 'vitest';
import { OutputGroundingGuardrail } from '../src/capabilities/dialogue/cognitive/OutputGroundingGuardrail';

describe('Anti-Hallucination Sprint 3: OutputGroundingGuardrail Pre-Send Verification', () => {
  it('detects ungrounded transfer claims and sanitizes output when TRANSFER_FUNDS was not executed', () => {
    const result = OutputGroundingGuardrail.verify({
      userMessage: 'Kirimkan 10 USDC ke teman saya',
      finalAnswer: 'Baik, sudah saya transfer 10 USDC ke alamat tujuan.',
      successfulToolResults: [],
      hadTools: false
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toContain('UNGROUNDED_TRANSFER_CLAIM');
    expect(result.sanitizedAnswer).toContain('belum ditransfer (memerlukan persetujuan dan eksekusi resmi)');
  });

  it('detects ungrounded spreadsheet creation claims when GDRIVE_CREATE_SPREADSHEET was not executed', () => {
    const result = OutputGroundingGuardrail.verify({
      userMessage: 'Buatkan spreadsheet pengeluaran',
      finalAnswer: 'Spreadsheet telah berhasil dibuat dengan format yang rapi.',
      successfulToolResults: [],
      hadTools: false
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toContain('UNGROUNDED_SPREADSHEET_CLAIM');
    expect(result.sanitizedAnswer).toContain('belum dibuat di Google Drive');
  });

  it('detects ungrounded threads publish claims when THREADS_PUBLISH was not executed', () => {
    const result = OutputGroundingGuardrail.verify({
      userMessage: 'Posting tweet ini ke Threads',
      finalAnswer: 'Postingan telah berhasil diunggah ke Threads!',
      successfulToolResults: [],
      hadTools: false
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toContain('UNGROUNDED_THREADS_PUBLISH_CLAIM');
    expect(result.sanitizedAnswer).toContain('belum diunggah ke Threads');
  });

  it('replaces fabricated post listings when THREADS_GET_POSTS returned 0 posts', () => {
    const result = OutputGroundingGuardrail.verify({
      userMessage: 'Cek postingan Threads saya dong',
      finalAnswer: 'Berikut adalah postingan terbaru Anda:\n1. Halo dunia crypto!\n2. Belajar coding hari ini.',
      successfulToolResults: [
        { name: 'THREADS_GET_POSTS', output: { success: true, posts: [] } }
      ],
      hadTools: true
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toContain('FABRICATED_EMPTY_THREADS_POSTS');
    expect(result.sanitizedAnswer).toBe('Saya telah memeriksa akun Threads Anda, namun saat ini belum ada postingan terbaru yang ditemukan.');
  });

  it('passes cleanly when actual tool results back the claims', () => {
    const result = OutputGroundingGuardrail.verify({
      userMessage: 'Kirimkan 10 USDC',
      finalAnswer: 'Transaksi berhasil dikirim dengan txHash 0xabc123.',
      successfulToolResults: [
        { name: 'TRANSFER_FUNDS', output: { success: true, txHash: '0xabc123' } }
      ],
      hadTools: true
    });

    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
    expect(result.sanitizedAnswer).toBe('Transaksi berhasil dikirim dengan txHash 0xabc123.');
  });
});
