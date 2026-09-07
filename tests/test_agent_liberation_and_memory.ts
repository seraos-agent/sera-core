import assert from 'assert';
import { ConversationContextCompressor } from '../src/capabilities/dialogue/ConversationContextCompressor';
import { DynamicPromptAssembler } from '../src/capabilities/dialogue/cognitive/DynamicPromptAssembler';
import { SubAgentCoordinator } from '../src/capabilities/agents/SubAgentCoordinator';
import { ThreadsAPI } from '../src/capabilities/threads/ThreadsAPI';
import { SecretManager } from '../src/core/secrets/SecretManager';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING TEST: AGENT LIBERATION & MEMORY OPTIMIZATION');
  console.log('================================================================');

  // Test 1: Memory Compressor retains 8 messages with long tables without truncation
  console.log('\n▶ Test 1: ConversationContextCompressor with 8 large messages...');
  const compressor = new ConversationContextCompressor();
  
  const longTableText = `Ini hasilnya:

| Postingan | Views | Likes | Replies | Reposts |
|---|---|---|---|---|
| AGI era / 62.7% (teks, 5 Sep) | 162 | 0 | 0 | 0 |
| "Legitimacy is a late signal" (teks) | 177 | 0 | 0 | 0 |
| "MCP is a relationship" (gambar) | 55 | 2 | 0 | 0 |
| "I don't store files" (gambar) | 40 | 0 | 0 | 0 |
| **Akun (jendela metrik)** | 170 | 0 | 0 | 0 |

Dua hal yang menurutku menarik:

**Teks ngalahin gambar, jauh.** 162 dan 177 views buat yang teks-only, vs 40 dan 55 buat yang pakai gambar. 3-4x lipatnya. Ini agak melawan intuisi "visual selalu menang", tapi masuk akal buat Threads yang memang platform berbasis baca.

**View ada, engagement nol.** Dari 177 view, likes cuma 2 di satu postingan gambar, sisanya kosong. Ini wajar buat akun baru di Threads (algoritma lebih loyal ke akun lama).

Mau sekalian kita rancang strategi posting berikutnya?`;

  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: 'Halo Sera' },
    { role: 'assistant', content: 'Halo! Ada yang bisa kubantu hari ini?' },
    { role: 'user', content: 'Tolong cek postingan Threads saya' },
    { role: 'assistant', content: 'Baik, saya akan cek postingan terakhir kamu di Threads.' },
    { role: 'user', content: 'Bagaimana hasilnya?' },
    { role: 'assistant', content: longTableText },
    { role: 'user', content: 'Boleh' },
    { role: 'assistant', content: 'Memproses analisis lebih lanjut...' }
  ];

  const compressed = compressor.compress(turns, {
    tokenBudget: 24000,
    maxRecentTurns: 8
  });

  assert.strictEqual(compressed.messages.length, 8, 'All 8 turns must be retained');
  const tableMsg = compressed.messages.find(m => typeof m.content === 'string' && m.content.includes('Teks ngalahin gambar'));
  assert.ok(tableMsg && typeof tableMsg.content === 'string', 'Long table message must be present in compressed context');
  const tableText = tableMsg.content as string;
  assert.ok(!tableText.endsWith('…'), 'Long table message must NOT be sliced or truncated with ellipsis');
  assert.ok(tableText.includes('View ada, engagement nol'), 'Message must retain full text including ending paragraphs');
  console.log('  ✅ Test 1 Passed: 8 full messages retained with zero truncation.');

  // Test 2: DynamicPromptAssembler always binds all tools even on "DIRECT_ANSWER" / "Boleh"
  console.log('\n▶ Test 2: DynamicPromptAssembler unchained tool spectrum...');
  const subAgentCoordinator = new SubAgentCoordinator();
  const assembled = DynamicPromptAssembler.assemble({
    domains: ['general'],
    executionStrategy: 'DIRECT_ANSWER',
    subAgentCoordinator
  });

  assert.ok(assembled.tools.length >= 10, `Expected at least 10 active tools, got ${assembled.tools.length}`);
  const toolNames = assembled.tools.map(t => t.name);
  assert.ok(toolNames.includes('THREADS_GET_INSIGHTS'), 'THREADS_GET_INSIGHTS must be available');
  assert.ok(toolNames.includes('THREADS_PUBLISH'), 'THREADS_PUBLISH must be available');
  assert.ok(toolNames.includes('GDRIVE_CREATE_SPREADSHEET'), 'GDRIVE_CREATE_SPREADSHEET must be available');
  assert.ok(toolNames.includes('TRANSFER_FUNDS'), 'TRANSFER_FUNDS must be available');
  console.log(`  ✅ Test 2 Passed: Full ecosystem (${assembled.tools.length} tools) always available.`);

  // Test 3: ThreadsAPI shortcode resolution
  console.log('\n▶ Test 3: ThreadsAPI Shortcode Resolution (Dc7LZs1H4O_)...');
  const mockSecretStore = {
    getSecret: async () => 'mock-token',
    setSecret: async () => {},
    deleteSecret: async () => {},
    listSecrets: async () => []
  };
  const secretManager = new SecretManager(mockSecretStore as any);

  const mockFetch: typeof fetch = async (input: any) => {
    const urlStr = input.toString();
    if (urlStr.includes('/me/threads')) {
      return new Response(JSON.stringify({
        data: [
          {
            id: '18110970316971989',
            text: 'Test post content',
            timestamp: '2026-09-07T00:00:00Z',
            permalink: 'https://www.threads.net/@sera.agent/post/Dc7LZs1H4O_',
            media_type: 'TEXT_POST'
          }
        ]
      }), { status: 200 });
    }
    if (urlStr.includes('/18110970316971989/insights')) {
      return new Response(JSON.stringify({
        data: [
          { name: 'views', total_value: { value: 177 } },
          { name: 'likes', total_value: { value: 2 } }
        ]
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };

  const api = new ThreadsAPI(secretManager, mockFetch);
  const resolvedId = await api.resolveNumericPostId('session-1', 'Dc7LZs1H4O_');
  assert.strictEqual(resolvedId, '18110970316971989', 'Shortcode Dc7LZs1H4O_ must resolve to 18110970316971989');

  const resolvedUrlId = await api.resolveNumericPostId('session-1', 'https://www.threads.net/@sera.agent/post/Dc7LZs1H4O_');
  assert.strictEqual(resolvedUrlId, '18110970316971989', 'URL with shortcode must resolve to 18110970316971989');

  const insights = await api.getPostInsights('session-1', 'Dc7LZs1H4O_');
  assert.strictEqual(insights.views, 177, 'Views must match mock response');
  assert.strictEqual(insights.likes, 2, 'Likes must match mock response');
  console.log('  ✅ Test 3 Passed: Shortcode Dc7LZs1H4O_ and permalink correctly resolved to numeric ID.');

  console.log('\n================================================================');
  console.log('🎉 ALL AGENT LIBERATION & MEMORY TESTS PASSED (100%)!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
