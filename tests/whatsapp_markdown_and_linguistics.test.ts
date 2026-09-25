import { describe, it, expect } from 'vitest';
import { WhatsAppAdapter } from '../src/capabilities/communication/adapters/WhatsAppAdapter';
import { CORE_SYSTEM_PROMPT } from '../src/capabilities/dialogue/prompts/coreSystemPrompt';
import { CognitiveContextBuilder } from '../src/capabilities/dialogue/CognitiveContextBuilder';

describe('WhatsApp Markdown Formatter & Tag Balancer', () => {
  it('converts markdown headers and bold correctly', () => {
    const raw = '# Executive Summary\nThis is **bold statement** and ***bold italic***.';
    const formatted = WhatsAppAdapter.formatToWhatsApp(raw);

    expect(formatted).toContain('*Executive Summary*');
    expect(formatted).toContain('*bold statement*');
    expect(formatted).toContain('_*bold italic*_');
  });

  it('converts asterisk bullet lists to bullet dots to prevent bold syntax clash', () => {
    const raw = `Berikut poin utamanya:
* Poin pertama penjelasan sistem.
* Poin kedua analisis mendalam.
* Poin ketiga tindak lanjut.`;

    const formatted = WhatsAppAdapter.formatToWhatsApp(raw);
    expect(formatted).toContain('• Poin pertama penjelasan sistem.');
    expect(formatted).toContain('• Poin kedua analisis mendalam.');
    expect(formatted).toContain('• Poin ketiga tindak lanjut.');
    // Must NOT retain starting asterisk bullets
    expect(formatted).not.toMatch(/^\s*[*]\s+/m);
  });

  it('transforms dash-separated list items into Style B with bold titles and breathable spacing', () => {
    const raw = `* Konvenien secara politik – Menunjuk Korea Utara nyaris tidak menimbulkan biaya diplomatik bagi siapa pun, berbeda dengan menyebut aktor negara besar atau sindikat terorganisir yang punya pengaruh.
* Atribusi itu sulit, bukan mustahil – Penyerang lintas negara biasa menyamar lewat IP pinjaman, menaruh komentar kode berbahasa Rusia atau Mandarin, dan meniru taktik grup lain supaya jejaknya kabur.
* Bursa punya insentif sendiri – Narratives "kita korban negara asing" jauh lebih menyelamatkan reputasi ket`;

    const formatted = WhatsAppAdapter.formatToWhatsApp(raw);

    // Style B format assertions:
    expect(formatted).toContain('• *Konvenien secara politik*\nMenunjuk Korea Utara nyaris tidak menimbulkan biaya diplomatik bagi siapa pun');
    expect(formatted).toContain('• *Atribusi itu sulit, bukan mustahil*\nPenyerang lintas negara biasa menyamar lewat IP pinjaman');
    expect(formatted).toContain('• *Bursa punya insentif sendiri*\nNarratives "kita korban negara asing"');

    // Must have double newlines between items
    expect(formatted).toContain('\n\n• *Atribusi itu sulit, bukan mustahil*');
    expect(formatted).toContain('\n\n• *Bursa punya insentif sendiri*');

    // No raw dash separators left between title and description
    expect(formatted).not.toContain('• *Konvenien secara politik* –');
  });

  it('normalizes spaces inside bold markers so WhatsApp parses them cleanly', () => {
    const raw = 'Ini adalah * teks penting * yang harus dibaca.';
    const formatted = WhatsAppAdapter.formatToWhatsApp(raw);
    expect(formatted).toBe('Ini adalah *teks penting* yang harus dibaca.');
  });

  it('balances markdown tags when tags are unclosed', () => {
    // Unclosed code block
    const unclosedCode = 'Ini kodenya:\n```typescript\nconst x = 10;';
    const balancedCode = WhatsAppAdapter.balanceMarkdownTags(unclosedCode);
    expect(balancedCode).toContain('```typescript\nconst x = 10;\n```');

    // Unclosed inline backtick
    const unclosedTick = 'Periksa nilai `tokenCount pada variabel.';
    const balancedTick = WhatsAppAdapter.balanceMarkdownTags(unclosedTick);
    expect(balancedTick.endsWith('`')).toBe(true);

    // Unclosed bold
    const unclosedBold = 'Periksa *bagian penting';
    const balancedBold = WhatsAppAdapter.balanceMarkdownTags(unclosedBold);
    expect(balancedBold).toBe('Periksa *bagian penting*');
  });
});

describe('WhatsApp Bubble Splitter on Long-Form Content', () => {
  it('partitions long multi-point explanations strictly on paragraph boundaries without splitting mid-sentence', () => {
    // Simulating a real multi-point deep dive like in the user screenshot
    const point1 = `*1. Pola Pertama: Oportunisme Tanpa Niat Buruk*\n• *Dinamika:* Sering kali tindakan yang menyakiti tidak berakar dari kebencian aktif, melainkan dari dorongan pragmatis yang mengabaikan beban orang lain.\n• *Dampak:* Korban merasa diabaikan karena pelaku sekadar memilih kemudahan bagi dirinya sendiri.`.repeat(3);
    const point2 = `*2. Pola Kedua: Ilusi Penyelesaian Instan*\n• *Dinamika:* Menjual aset bersama sering kali dianggap sebagai jalan keluar tercepat untuk meredakan ketegangan keluarga.\n• *Dampak:* Hubungan kekeluargaan justru semakin renggang setelah aset berpindah tangan.`.repeat(3);
    const point3 = `*3. Pola Ketiga: Bertahan dengan Menjaga Batasan*\n• *Dinamika:* Tidak menyerahkan segalanya namun tetap membuka ruang komunikasi yang sehat.\n• *Dampak:* Menghindarkan penyesalan jangka panjang sembari mempertahankan martabat pribadi.`.repeat(3);
    const point4 = `*4. Pola Keempat: Menata Ulang Orientasi Hidup*\n• *Dinamika:* Mengalihkan energi dari konflik fisik menuju kebermanfaatan yang lebih bermakna.\n• *Dampak:* Nilai dan kenangan luhur tetap terjaga meskipun wujud materi telah tiada.`.repeat(3);
    const closing = `Dari keempat dinamika di atas, mana yang menurutmu paling mencerminkan kondisi yang sedang kamu hadapi saat ini?`;

    const fullResponse = `${point1}\n\n${point2}\n\n${point3}\n\n${point4}\n\n${closing}`;
    expect(fullResponse.length).toBeGreaterThan(3000);

    const bubbles = WhatsAppAdapter.splitIntoBubbles(fullResponse);

    // Must be split into clean bubbles
    expect(bubbles.length).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < bubbles.length; i++) {
      const bubble = bubbles[i];
      // No bubble should exceed the 3800 character safety limit
      expect(bubble.length).toBeLessThanOrEqual(3800);

      // No bubble should start with an awkward dangling lowercase continuation
      expect(bubble[0]).toMatch(/[A-Z*•0-9_]/);

      // Verify tag balancing on each bubble
      const asteriskCount = (bubble.match(/\*/g) || []).length;
      expect(asteriskCount % 2).toBe(0);
    }

    // Last bubble should be the closing question
    expect(bubbles[bubbles.length - 1]).toContain('Dari keempat dinamika di atas');
  });
});

describe('Linguistic & Semantic Prompt Integrity', () => {
  it('ensures core system prompt enforces Anti-Calque and High-Order Indonesian directives', () => {
    expect(CORE_SYSTEM_PROMPT).toContain('CRITICAL - LINGUISTIC MASTERY, DEEP SEMANTICS & HIGH-ORDER INDONESIAN (ANTI-CALQUE)');
    expect(CORE_SYSTEM_PROMPT).toContain('ANTI-CALQUE (SEMANTIC PRECISION OVER LITERAL TRANSLATION)');
    expect(CORE_SYSTEM_PROMPT).toContain('FORBIDDEN SLANG & LAZY CALQUES');
    expect(CORE_SYSTEM_PROMPT).toContain('SYNTACTIC INTEGRITY (NO BROKEN CLAUSES)');
  });

  it('ensures WhatsApp channel guidance includes Indonesian linguistic caliber directives', async () => {
    const mockWorldState = {
      getWalletState: () => ({ address: '0x123' }),
      getUserProfile: () => ({ preferredName: 'Budi' }),
      resolveTemporalReality: () => ({ utcFormatted: '2026-09-21', localFormatted: '2026-09-21 14:00' })
    } as any;
    const mockMemoryQuery = {
      query: async () => [],
      toPromptContext: () => ({ items: [] })
    } as any;
    const mockChatStore = {
      getUiMessages: () => []
    } as any;

    const builder = new CognitiveContextBuilder(mockWorldState, mockMemoryQuery, mockChatStore, null);
    const messages = await builder.build(false, 'halo sera', { platform: 'whatsapp', channelId: '62812345678' });

    const channelMsg = messages.find(m => typeof m.content === 'string' && m.content.includes('[PLATFORM: WHATSAPP - MOBILE CONVERSATION]'));
    expect(channelMsg).toBeDefined();
    expect(channelMsg!.content).toContain('INDONESIAN LINGUISTIC CALIBER (SOPHISTICATED CASUAL)');
    expect(channelMsg!.content).toContain('FORBIDDEN STREET SLANG');
    expect(channelMsg!.content).toContain('ANTI-CALQUE');
  });
});
