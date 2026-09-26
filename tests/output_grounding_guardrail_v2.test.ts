import { describe, it, expect } from 'vitest';
import { OutputGroundingGuardrail } from '../src/capabilities/dialogue/cognitive/OutputGroundingGuardrail';

describe('OutputGroundingGuardrail v2 (Bilingual & Multi-Domain)', () => {
  it('detects ungrounded fund transfers in English and Indonesian', () => {
    // English
    const enResult = OutputGroundingGuardrail.verify({
      userMessage: 'Transfer 50 USDC to Bob',
      finalAnswer: 'I have successfully transferred the 50 USDC to Bob.',
      successfulToolResults: [],
      hadTools: false,
    });
    expect(enResult.passed).toBe(false);
    expect(enResult.violations).toContain('UNGROUNDED_TRANSFER_CLAIM');
    expect(enResult.sanitizedAnswer).toContain('has not been transferred');

    // Indonesian
    const idResult = OutputGroundingGuardrail.verify({
      userMessage: 'Transfer 50 USDC ke Bob',
      finalAnswer: 'Saya sudah transfer dana 50 USDC ke dompet Bob.',
      successfulToolResults: [],
      hadTools: false,
    });
    expect(idResult.passed).toBe(false);
    expect(idResult.violations).toContain('UNGROUNDED_TRANSFER_CLAIM');
    expect(idResult.sanitizedAnswer).toContain('belum ditransfer');
  });

  it('allows fund transfer claim when TRANSFER_FUNDS was executed', () => {
    const result = OutputGroundingGuardrail.verify({
      userMessage: 'Transfer 50 USDC',
      finalAnswer: 'Saya sudah transfer dana 50 USDC dengan tx hash 0x123.',
      successfulToolResults: [{ name: 'TRANSFER_FUNDS', output: { txHash: '0x123' } }],
      hadTools: true,
    });
    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('detects ungrounded token swap claims', () => {
    const result = OutputGroundingGuardrail.verify({
      userMessage: 'Swap 1 SOL to USDC',
      finalAnswer: 'Saya sudah berhasil swap token SOL ke USDC.',
      successfulToolResults: [],
      hadTools: false,
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('UNGROUNDED_SWAP_CLAIM');
    expect(result.sanitizedAnswer).toContain('swap token belum dieksekusi');
  });

  it('detects ungrounded email sending claims', () => {
    const result = OutputGroundingGuardrail.verify({
      userMessage: 'Kirim invoice ke client',
      finalAnswer: 'Email telah berhasil dikirim ke alamat klien.',
      successfulToolResults: [],
      hadTools: false,
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('UNGROUNDED_EMAIL_CLAIM');
    expect(result.sanitizedAnswer).toContain('email belum dikirim');
  });

  it('detects ungrounded Twitter/X posts', () => {
    const result = OutputGroundingGuardrail.verify({
      userMessage: 'Post updates to X',
      finalAnswer: 'Tweet telah berhasil diposting ke linimasa Anda.',
      successfulToolResults: [],
      hadTools: false,
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('UNGROUNDED_TWITTER_POST_CLAIM');
    expect(result.sanitizedAnswer).toContain('tweet belum diunggah ke Twitter/X');
  });

  it('prevents fabricated list on empty observation in English', () => {
    const result = OutputGroundingGuardrail.verify({
      userMessage: 'Check my threads',
      finalAnswer: 'Here are your latest threads:\n- Post 1: Hello World\n- Post 2: Building Sera',
      successfulToolResults: [{ name: 'THREADS_GET_POSTS', output: { data: [] } }],
      hadTools: true,
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('FABRICATED_EMPTY_THREADS_POSTS');
    expect(result.sanitizedAnswer).toContain('no recent posts were found');
  });

  it('detects ungrounded private data claims without sensory tools', () => {
    const result = OutputGroundingGuardrail.verify({
      userMessage: 'Baca pesan pribadi pacar saya',
      finalAnswer: 'Saya telah memeriksa pesan pribadi Anda dan menemukan...',
      successfulToolResults: [],
      hadTools: false,
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('UNGROUNDED_PRIVATE_DATA_ACCESS');
    expect(result.sanitizedAnswer).toContain('tidak memiliki akses langsung ke pesan atau data pribadi Anda');
  });
});
