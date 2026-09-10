import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { createWhatsAppRouter } from '../src/server/routes/whatsappRoutes';
import { WhatsAppAdapter } from '../src/capabilities/communication/adapters/WhatsAppAdapter';
import { CognitiveContextBuilder } from '../src/capabilities/dialogue/CognitiveContextBuilder';
import { EventTypes } from '../src/core/events/types';

describe('WhatsApp Webhook Routes', () => {
  it('responds with hub.challenge on valid verification handshake', async () => {
    const mockAgentManager: any = {
      getOrCreateInstance: vi.fn()
    };

    const app = express();
    app.use(express.json());
    app.use('/webhook/whatsapp', createWhatsAppRouter({
      agentManager: mockAgentManager,
      verifyToken: 'my_test_verify_token'
    }));

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      // Valid handshake
      const validRes = await fetch(
        `http://127.0.0.1:${port}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=my_test_verify_token&hub.challenge=test_challenge_12345`
      );
      expect(validRes.status).toBe(200);
      const challengeText = await validRes.text();
      expect(challengeText).toBe('test_challenge_12345');

      // Invalid token
      const invalidRes = await fetch(
        `http://127.0.0.1:${port}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test_challenge_12345`
      );
      expect(invalidRes.status).toBe(403);
    } finally {
      server.close();
    }
  });

  it('accepts incoming webhook payload from linked user and emits DIALOGUE_USER_OBSERVED', async () => {
    const emittedEvents: any[] = [];
    const mockEventBus = {
      emit: vi.fn((type: string, payload: any) => {
        emittedEvents.push({ type, payload });
      })
    };

    const mockAgentManager: any = {
      getOrCreateInstance: vi.fn(() => ({
        eventBus: mockEventBus
      }))
    };

    const mockSecretManager: any = {
      getSecret: vi.fn(async (key: string) => (key === 'WA_USER_628123456789' ? 'user-123' : null))
    };

    const app = express();
    app.use(express.json());
    app.use('/webhook/whatsapp', createWhatsAppRouter({
      agentManager: mockAgentManager,
      secretManager: mockSecretManager,
      verifyToken: 'my_test_verify_token'
    }));

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '1555023', phone_number_id: '1267034163164105' },
                  contacts: [{ profile: { name: 'John Doe' }, wa_id: '628123456789' }],
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.HBgTEST123',
                      timestamp: '1725780000',
                      text: { body: 'Halo Sera, apa kabar?' },
                      type: 'text'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const res = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
      const reply = await res.text();
      expect(reply).toBe('EVENT_RECEIVED');

      expect(mockAgentManager.getOrCreateInstance).toHaveBeenCalledWith('user-123');
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EventTypes.DIALOGUE_USER_OBSERVED,
        expect.objectContaining({
          type: EventTypes.DIALOGUE_USER_OBSERVED,
          payload: expect.objectContaining({
            message: 'Halo Sera, apa kabar?',
            senderName: 'John Doe',
            platform: 'whatsapp'
          })
        })
      );
    } finally {
      server.close();
    }
  });

  it('enforces 3-attempt limit with 24-hour cooldown for unlinked phone numbers', async () => {
    const secrets = new Map<string, string>();
    const mockAgentManager: any = {
      getOrCreateInstance: vi.fn()
    };

    const mockSecretManager: any = {
      getSecret: vi.fn(async (k: string) => secrets.get(k) || null),
      setSecret: vi.fn(async (k: string, v: string) => { secrets.set(k, v); })
    };

    const mockWhatsAppManager: any = {
      sendDirectMessage: vi.fn(async () => true)
    };

    const app = express();
    app.use(express.json());
    app.use('/webhook/whatsapp', createWhatsAppRouter({
      agentManager: mockAgentManager,
      secretManager: mockSecretManager,
      whatsAppManager: mockWhatsAppManager,
      verifyToken: 'my_test_verify_token'
    }));

    const server = app.listen(0);
    const port = (server.address() as any).port;

    const makeMsg = (text: string, id: string) => ({
      object: 'whatsapp_business_account',
      entry: [{
        id: '123',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            messages: [{ from: '628000111222', id, timestamp: '1725780000', text: { body: text }, type: 'text' }]
          },
          field: 'messages'
        }]
      }]
    });

    try {
      // Attempt 1
      await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeMsg('Attempt 1', 'msg1'))
      });
      expect(mockWhatsAppManager.sendDirectMessage).toHaveBeenCalledTimes(1);

      // Attempt 2
      await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeMsg('Attempt 2', 'msg2'))
      });
      expect(mockWhatsAppManager.sendDirectMessage).toHaveBeenCalledTimes(2);

      // Attempt 3 (Final warning & activates 24h cooldown)
      await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeMsg('Attempt 3', 'msg3'))
      });
      expect(mockWhatsAppManager.sendDirectMessage).toHaveBeenCalledTimes(3);
      expect(mockWhatsAppManager.sendDirectMessage).toHaveBeenLastCalledWith(
        '628000111222',
        expect.stringContaining('final reminder')
      );

      // Attempt 4 (Silenced by 24h cooldown!)
      await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeMsg('Attempt 4', 'msg4'))
      });
      // sendDirectMessage should NOT have been called on 4th attempt!
      expect(mockWhatsAppManager.sendDirectMessage).toHaveBeenCalledTimes(3);

      // Verify agent instance was NEVER created
      expect(mockAgentManager.getOrCreateInstance).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it('links phone number to user session on valid /connect code', async () => {
    const secrets = new Map<string, string>();
    secrets.set('WA_LINK_SERA-TEST', 'user-session-123');

    const mockSecretManager: any = {
      getSecret: vi.fn(async (key: string) => secrets.get(key) || null),
      setSecret: vi.fn(async (key: string, val: string) => { secrets.set(key, val); }),
      deleteSecret: vi.fn(async (key: string) => { secrets.delete(key); })
    };

    const mockWhatsAppManager: any = {
      sendDirectMessage: vi.fn(async () => true)
    };

    const mockIo: any = {
      to: vi.fn(() => ({
        emit: vi.fn()
      }))
    };

    const mockAgentManager: any = {
      getOrCreateInstance: vi.fn(),
      getInstance: vi.fn()
    };

    const app = express();
    app.use(express.json());
    app.use('/webhook/whatsapp', createWhatsAppRouter({
      agentManager: mockAgentManager,
      secretManager: mockSecretManager,
      whatsAppManager: mockWhatsAppManager,
      io: mockIo,
      verifyToken: 'my_test_verify_token'
    }));

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '1555023', phone_number_id: '1267034163164105' },
                  contacts: [{ profile: { name: 'Alice' }, wa_id: '628999888777' }],
                  messages: [
                    {
                      from: '628999888777',
                      id: 'wamid.HBgTEST456',
                      timestamp: '1725780001',
                      text: { body: '/connect SERA-TEST' },
                      type: 'text'
                    }
                  ]
                },
                field: 'messages'
              }
            ]
          }
        ]
      };

      const res = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);

      // Verify link was stored
      expect(mockSecretManager.setSecret).toHaveBeenCalledWith('WA_USER_628999888777', 'user-session-123');
      expect(mockSecretManager.setSecret).toHaveBeenCalledWith('WA_SESSION_user-session-123', '628999888777');
      expect(mockSecretManager.deleteSecret).toHaveBeenCalledWith('WA_LINK_SERA-TEST');

      // Verify direct message confirmation sent
      expect(mockWhatsAppManager.sendDirectMessage).toHaveBeenCalledWith(
        '628999888777',
        expect.stringContaining('Successfully linked your WhatsApp')
      );

      // Verify socket event emitted to target user room
      expect(mockIo.to).toHaveBeenCalledWith('user:user-session-123');
    } finally {
      server.close();
    }
  });

  it('formats Markdown to WhatsApp-native syntax correctly (formatToWhatsApp)', () => {
    const input = `### Executive Summary
Here is your **portfolio balance** for today.
Please check the [SERA Dashboard](https://app.seraos.xyz) for live details.
---
> *Tip:* Keep your gas tokens ready.`;

    const formatted = WhatsAppAdapter.formatToWhatsApp(input);

    // Headers converted to bold
    expect(formatted).toContain('*Executive Summary*');
    expect(formatted).not.toContain('###');

    // Bold converted from ** to *
    expect(formatted).toContain('*portfolio balance*');
    expect(formatted).not.toContain('**');

    // Hyperlinks converted to Text: URL
    expect(formatted).toContain('SERA Dashboard: https://app.seraos.xyz');
    expect(formatted).not.toContain('[SERA Dashboard]');

    // Separators converted
    expect(formatted).toContain('──────────');
  });

  it('appends active user message to working memory to eliminate context lag', async () => {
    const mockWorldState: any = {
      getWalletState: vi.fn(() => ({ address: '0x1234' }))
    };

    const mockMemoryQuery: any = {
      query: vi.fn(async () => ({ items: [] })),
      toPromptContext: vi.fn(() => ({ items: [] }))
    };

    const mockChatHistory: any = {
      getUiMessages: vi.fn(() => [])
    };

    const builder = new CognitiveContextBuilder(
      mockWorldState,
      mockMemoryQuery,
      mockChatHistory,
      null
    );

    const platformHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();
    platformHistory.set('whatsapp:628123456789', [
      { role: 'user', content: 'mengenai threads' },
      { role: 'assistant', content: 'Threads adalah platform sosial...' }
    ]);

    const activeResponseContext = {
      platform: 'whatsapp',
      channelId: '628123456789'
    };

    // User sends a new turn: "sera lagi apa"
    const messages = await builder.build(
      false,
      'sera lagi apa',
      activeResponseContext,
      platformHistory,
      8
    );

    // Verify WhatsApp channel guidance was injected
    const guidanceMsg = messages.find((m: any) => typeof m.content === 'string' && m.content.includes('[PLATFORM: WHATSAPP - MOBILE CONVERSATION]'));
    expect(guidanceMsg).toBeDefined();

    // Verify the very last message is the ACTIVE user message "sera lagi apa" (Fixes context lag!)
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toBe('sera lagi apa');
  });

  it('formats text to WhatsApp standards and sanitizes blockquotes and em dashes', () => {
    const raw = '> Istirahat dulu gih — jangan begadang ya!\n# Tips Malam\n**Tidur cukup** biar besok fit.';
    const formatted = WhatsAppAdapter.formatToWhatsApp(raw);

    // Blockquote (>) removed
    expect(formatted).not.toContain('>');
    expect(formatted).toContain('Istirahat dulu gih');
    // Em dash (—) converted to spaced en dash (–)
    expect(formatted).not.toContain('—');
    expect(formatted).toContain(' – ');
    // Header (# Tips Malam) converted to bold (*Tips Malam*)
    expect(formatted).toContain('*Tips Malam*');
    // Markdown bold (**Tidur cukup**) converted to WhatsApp bold (*Tidur cukup*)
    expect(formatted).toContain('*Tidur cukup*');
  });

  it('splits responses dynamically into 1 to 3 chat bubbles (splitIntoBubbles)', () => {
    // Case 1: Short casual reply (< 160 chars) -> 1 bubble
    const casual = 'Lagi standby nih, siap bantu pantau tugas kamu.';
    const casualBubbles = WhatsAppAdapter.splitIntoBubbles(casual);
    expect(casualBubbles).toHaveLength(1);
    expect(casualBubbles[0]).toBe(casual);

    // Case 2: Deliverable + Follow-up inquiry (2 paragraphs) -> 2 bubbles
    const twoBlocks = `Done! Sudah aku buatkan Google Spreadsheet *Katalog Hampers Lebaran 2026*:
https://docs.google.com/spreadsheets/d/1abc

Kira-kira ada kolom tambahan atau penyesuaian budget yang perlu diubah?`;
    const twoBubbles = WhatsAppAdapter.splitIntoBubbles(twoBlocks);
    expect(twoBubbles).toHaveLength(2);
    expect(twoBubbles[0]).toContain('Katalog Hampers Lebaran 2026');
    expect(twoBubbles[1]).toContain('Kira-kira ada kolom tambahan');

    // Case 3: Deliverable + Insight + Follow-up (3 paragraphs) -> 3 bubbles
    const threeBlocks = `Done! Sheet 10 paket hampers sudah siap:
https://docs.google.com/spreadsheets/d/1abc

Sebagai catatan, paket *Hampers Premium Gold* memiliki estimasi margin tertinggi (~38%).

Mau langsung aku buatkan draft broadcast WhatsApp untuk promosinya?`;
    const threeBubbles = WhatsAppAdapter.splitIntoBubbles(threeBlocks);
    expect(threeBubbles).toHaveLength(3);
    expect(threeBubbles[0]).toContain('Sheet 10 paket hampers');
    expect(threeBubbles[1]).toContain('Hampers Premium Gold');
    expect(threeBubbles[2]).toContain('draft broadcast WhatsApp');

    // Case 4: Long response with 5 paragraphs (>500 chars) -> Option 2 (2 bubbles: Core substance + Follow-up)
    const fiveBlocks = `*Bagian 1: Ringkasan Eksekutif*
Laporan performa mingguan telah selesai dianalisis secara mendalam oleh sistem operasional. Seluruh pencatatan arus kas dan transaksi harian telah diperiksa dengan cermat.

*Bagian 2: Metrik Utama*
Total volume transaksi meningkat 25% dibandingkan periode minggu sebelumnya. Seluruh order marketplace dan outlet retail tercatat tanpa adanya kendala rekonsiliasi.

*Bagian 3: Analisis Risiko*
Tingkat volatilitas terpantau stabil pada rentang normal. Cadangan kas operasional berada pada tingkat yang sangat sehat untuk mendukung ekspansi persediaan baru.

*Bagian 4: Catatan Khusus*
Terdapat 2 anomali kecil pada pencatatan stok lama yang telah dimitigasi dan disinkronkan kembali ke database sistem tanpa kerugian finansial.

Kira-kira ada bagian metrik atau strategi yang ingin diperdalam lebih lanjut oleh tim manajemen?`;
    const cappedBubbles = WhatsAppAdapter.splitIntoBubbles(fiveBlocks);
    expect(cappedBubbles).toHaveLength(2);
    expect(cappedBubbles[0]).toContain('Bagian 1');
    expect(cappedBubbles[0]).toContain('Bagian 2');
    expect(cappedBubbles[0]).toContain('Bagian 3');
    expect(cappedBubbles[0]).toContain('Bagian 4');
    expect(cappedBubbles[1]).toContain('Kira-kira ada bagian');

    // Case 5: Oversized text (> 3800 chars) -> safe chunking under 3800 chars
    const hugeParagraph = 'Kalimat panjang penjelas informasi sistem operasional. '.repeat(100); // ~5500 chars
    const chunkedBubbles = WhatsAppAdapter.splitIntoBubbles(hugeParagraph);
    expect(chunkedBubbles.length).toBeGreaterThanOrEqual(2);
    for (const bubble of chunkedBubbles) {
      expect(bubble.length).toBeLessThanOrEqual(3800);
    }

    // Case 6: Dangling intro ending with colon (:) + points + closing -> merges intro into Bubble 1, delivers Option 2 (2 bubbles)
    const summaryWithIntro = `Dunia AI agent belakangan ini lagi bergerak cepat banget. Ini beberapa poin utamanya:

*1. Agentic Commerce* – Transaksi mandiri antar-agent melonjak tajam.

*2. Keamanan Falcon* – Deteksi agent siluman makin diperketat.

*3. Iklan Otomatis* – Optimasi campaign mandiri mulai berjalan.

Intinya arahnya makin jelas ke produksi dan security. Menurutmu bagian mana yang paling menarik buat kita gali?`;
    const summaryBubbles = WhatsAppAdapter.splitIntoBubbles(summaryWithIntro);
    expect(summaryBubbles).toHaveLength(2);
    // Bubble 1 contains intro AND points
    expect(summaryBubbles[0]).toContain('Dunia AI agent belakangan ini');
    expect(summaryBubbles[0]).toContain('*1. Agentic Commerce*');
    expect(summaryBubbles[0]).toContain('*3. Iklan Otomatis*');
    // Bubble 2 contains closing question
    expect(summaryBubbles[1]).toContain('Intinya arahnya makin jelas');
    expect(summaryBubbles[1]).toContain('Menurutmu bagian mana');
  });

  it('dispatches multi-bubble messages sequentially via sendMessage', async () => {
    const originalFetch = global.fetch;
    const fetchCalls: any[] = [];

    // Mock global.fetch
    global.fetch = vi.fn(async (url: any, init: any) => {
      fetchCalls.push({ url, init, body: JSON.parse(init.body) });
      return {
        ok: true,
        json: async () => ({ messages: [{ id: `wamid.TEST_${fetchCalls.length}` }] })
      } as any;
    });

    try {
      const adapter = new WhatsAppAdapter(
        'session-test',
        {
          phoneNumberId: 'phone-id-123',
          accessToken: 'test-token-xyz'
        },
        new (await import('events')).EventEmitter()
      );

      const action = {
        platform: 'whatsapp',
        channelId: '+628123456789',
        text: `Done! Sheet 10 hampers sudah siap:\nhttps://docs.google.com/spreadsheets/d/test123\n\nKira-kira ada kolom tambahan yang perlu diubah?`
      };

      const result = await adapter.sendMessage(action);

      expect(result.success).toBe(true);
      expect(result.platformMessageId).toBe('wamid.TEST_2');
      expect(fetchCalls).toHaveLength(2);

      // Bubble 1 contains link -> preview_url: true
      expect(fetchCalls[0].body.text.body).toContain('https://docs.google.com');
      expect(fetchCalls[0].body.text.preview_url).toBe(true);

      // Bubble 2 contains question -> preview_url: false
      expect(fetchCalls[1].body.text.body).toContain('Kira-kira ada kolom tambahan');
      expect(fetchCalls[1].body.text.preview_url).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('stores user preferred name into WorldState and reflects it in CognitiveContextBuilder', async () => {
    const mockWorldState: any = {
      getWalletState: vi.fn(() => ({ address: '0x1234' })),
      getUserProfile: vi.fn(() => ({ preferredName: 'Budi' }))
    };

    const mockMemoryQuery: any = {
      query: vi.fn(async () => ({ items: [] })),
      toPromptContext: vi.fn(() => ({ items: [] }))
    };

    const mockChatHistory: any = {
      getUiMessages: vi.fn(() => [])
    };

    const builder = new CognitiveContextBuilder(
      mockWorldState,
      mockMemoryQuery,
      mockChatHistory,
      null
    );

    const messages = await builder.build(
      false,
      'Halo Sera',
      { platform: 'whatsapp', channelId: '628123456789' },
      new Map()
    );

    const cogStateMsg = messages.find((m: any) => typeof m.content === 'string' && m.content.includes('[COGNITIVE STATE (WORKING MEMORY)]'));
    expect(cogStateMsg).toBeDefined();
    expect(cogStateMsg?.content).toContain('- User Name: Budi');
    expect(cogStateMsg?.content).toContain('- Agent Operational Wallet: 0x1234 (USDC on Base)');
  });
});

