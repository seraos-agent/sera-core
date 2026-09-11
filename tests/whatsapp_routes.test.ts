import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { createWhatsAppRouter } from '../src/server/routes/whatsappRoutes';
import { EventEmitter } from 'events';
import { WhatsAppAdapter } from '../src/capabilities/communication/adapters/WhatsAppAdapter';
import { WhatsAppManager } from '../src/capabilities/communication/adapters/WhatsAppManager';
import { CommunicationBridge } from '../src/capabilities/communication/CommunicationBridge';
import { GoalBridge } from '../src/runtime/GoalBridge';
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

  it('formats text to WhatsApp standards and sanitizes blockquotes, em dashes, and HTML tags', () => {
    const raw = '> Istirahat dulu gih — jangan begadang ya!\n# Tips Malam\n**Tidur cukup** biar besok fit.<br><br>• Poin 1<br/>• Poin 2<span>info</span>';
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
    // HTML tags (<br>, <br/>, <span>) sanitized
    expect(formatted).not.toContain('<br>');
    expect(formatted).not.toContain('<br/>');
    expect(formatted).not.toContain('<span>');
    expect(formatted).not.toContain('</span>');
    expect(formatted).toContain('• Poin 1');
    expect(formatted).toContain('• Poin 2');
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

  it('downloads and processes incoming WhatsApp image attachments with multimodal payload', async () => {
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

    const fakeImageBytes = Buffer.from('fake-image-bytes-jpeg');
    const mockWhatsAppManager: any = {
      downloadMedia: vi.fn(async () => ({
        buffer: fakeImageBytes,
        mimeType: 'image/jpeg'
      }))
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

    try {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '123456789',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              contacts: [{ profile: { name: 'Alice' }, wa_id: '628123456789' }],
              messages: [{
                from: '628123456789',
                id: 'wamid.IMG123',
                timestamp: '1725780000',
                type: 'image',
                image: {
                  id: 'meta-img-id-999',
                  caption: 'Tolong analisa nota kasir ini',
                  mime_type: 'image/jpeg'
                }
              }]
            },
            field: 'messages'
          }]
        }]
      };

      const res = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('EVENT_RECEIVED');

      expect(mockWhatsAppManager.downloadMedia).toHaveBeenCalledWith(
        'meta-img-id-999',
        expect.objectContaining({ maxSizeBytes: 15 * 1024 * 1024, timeoutMs: 30_000 })
      );

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        EventTypes.DIALOGUE_USER_OBSERVED,
        expect.objectContaining({
          type: EventTypes.DIALOGUE_USER_OBSERVED,
          payload: expect.objectContaining({
            message: 'Tolong analisa nota kasir ini',
            images: [`data:image/jpeg;base64,${fakeImageBytes.toString('base64')}`],
            platform: 'whatsapp'
          })
        })
      );
    } finally {
      server.close();
    }
  });

  it('downloads and parses incoming WhatsApp document attachments (CSV/Excel)', async () => {
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

    const csvContent = 'sku,product,qty,price\nSKU-001,Beras Premium,5,75000\nSKU-002,Minyak Goreng,10,35000\n';
    const mockWhatsAppManager: any = {
      downloadMedia: vi.fn(async () => ({
        buffer: Buffer.from(csvContent),
        mimeType: 'text/csv'
      }))
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

    try {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '123456789',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              contacts: [{ profile: { name: 'Bob' }, wa_id: '628123456789' }],
              messages: [{
                from: '628123456789',
                id: 'wamid.DOC456',
                timestamp: '1725780000',
                type: 'document',
                document: {
                  id: 'meta-doc-id-888',
                  filename: 'laporan_stok.csv',
                  caption: 'Tolong hitung total omzet',
                  mime_type: 'text/csv'
                }
              }]
            },
            field: 'messages'
          }]
        }]
      };

      const res = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('EVENT_RECEIVED');

      expect(mockWhatsAppManager.downloadMedia).toHaveBeenCalledWith(
        'meta-doc-id-888',
        expect.objectContaining({ maxSizeBytes: 20 * 1024 * 1024, timeoutMs: 30_000 })
      );

      const observedCall = mockEventBus.emit.mock.calls.find(c => c[0] === EventTypes.DIALOGUE_USER_OBSERVED);
      expect(observedCall).toBeDefined();
      const payloadObj = observedCall![1].payload;

      expect(payloadObj.message).toBe('Tolong hitung total omzet');
      expect(payloadObj.documents).toHaveLength(1);
      expect(payloadObj.documents[0].filename).toBe('laporan_stok.csv');
      expect(payloadObj.documents[0].totalRows).toBe(2);
      expect(payloadObj.documents[0].headers).toEqual(['sku', 'product', 'qty', 'price']);
    } finally {
      server.close();
    }
  });

  it('handles image without caption and applies default visual analysis prompt', async () => {
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

    const fakeImageBytes = Buffer.from('fake-bytes');
    const mockWhatsAppManager: any = {
      downloadMedia: vi.fn(async () => ({
        buffer: fakeImageBytes,
        mimeType: 'image/png'
      }))
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

    try {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '123456789',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              contacts: [{ profile: { name: 'Charlie' }, wa_id: '628123456789' }],
              messages: [{
                from: '628123456789',
                id: 'wamid.IMG789',
                timestamp: '1725780000',
                type: 'image',
                image: {
                  id: 'meta-img-id-777',
                  mime_type: 'image/png'
                }
              }]
            },
            field: 'messages'
          }]
        }]
      };

      const res = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);

      const observedCall = mockEventBus.emit.mock.calls.find(c => c[0] === EventTypes.DIALOGUE_USER_OBSERVED);
      expect(observedCall).toBeDefined();
      expect(observedCall![1].payload.message).toBe('Tolong analisa foto/gambar ini secara detail.');
      expect(observedCall![1].payload.images).toEqual([`data:image/png;base64,${fakeImageBytes.toString('base64')}`]);
    } finally {
      server.close();
    }
  });

  describe('WhatsAppManager.downloadMedia', () => {
    it('successfully fetches metadata and downloads binary buffer from Meta CDN', async () => {
      const originalFetch = global.fetch;
      const fakeBuffer = Buffer.from('meta-cdn-binary-content');

      global.fetch = vi.fn(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('graph.facebook.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123',
              mime_type: 'image/jpeg',
              file_size: fakeBuffer.byteLength
            })
          } as any;
        }
        if (urlStr.includes('lookaside.fbsbx.com')) {
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => fakeBuffer.buffer.slice(fakeBuffer.byteOffset, fakeBuffer.byteOffset + fakeBuffer.byteLength)
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      try {
        const manager = new WhatsAppManager({} as any, {
          phoneNumberId: 'phone-123',
          accessToken: 'test-token'
        });

        const result = await manager.downloadMedia('media-123');
        expect(result).not.toBeNull();
        expect(result?.mimeType).toBe('image/jpeg');
        expect(result?.buffer.toString()).toBe('meta-cdn-binary-content');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('blocks SSRF download URLs from untrusted hostnames', async () => {
      const originalFetch = global.fetch;

      global.fetch = vi.fn(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('graph.facebook.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              url: 'http://malicious-external-site.com/payload.exe',
              mime_type: 'application/octet-stream',
              file_size: 1024
            })
          } as any;
        }
        return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(1024) } as any;
      });

      try {
        const manager = new WhatsAppManager({} as any, {
          phoneNumberId: 'phone-123',
          accessToken: 'test-token'
        });

        const result = await manager.downloadMedia('media-ssrf-attack');
        expect(result).toBeNull();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('rejects media exceeding maximum file size', async () => {
      const originalFetch = global.fetch;

      global.fetch = vi.fn(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('graph.facebook.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              url: 'https://lookaside.fbsbx.com/attachments/huge.zip',
              mime_type: 'application/zip',
              file_size: 50 * 1024 * 1024 // 50 MB
            })
          } as any;
        }
        return { ok: true } as any;
      });

      try {
        const manager = new WhatsAppManager({} as any, {
          phoneNumberId: 'phone-123',
          accessToken: 'test-token'
        });

        // 20 MB limit
        const result = await manager.downloadMedia('huge-file', { maxSizeBytes: 20 * 1024 * 1024 });
        expect(result).toBeNull();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('Scheduled Goal & Communication Delivery Integrity', () => {
    it('CommunicationBridge resolves flexible parameters (message, reminder) and origin _responseContext to send WhatsApp message', async () => {
      const eventBus = new EventEmitter();
      const commBridge = new CommunicationBridge(eventBus);

      const mockAdapter: any = {
        start: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
        sendMessage: vi.fn(async () => ({ success: true, platformMessageId: 'wamid.test_reminder' }))
      };

      commBridge.registerAdapter('whatsapp', mockAdapter);

      // Simulate TriggerEngine / ExecutionDispatcher firing SEND_MESSAGE with origin response context and "message" key
      eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, {
        id: 'evt-dispatch-1',
        type: EventTypes.DOMAIN_ACTION_DISPATCHED,
        source: 'ExecutionDispatcher',
        payload: {
          actionType: 'SEND_MESSAGE',
          actionPayload: {
            message: 'hey 5mnt sudah tiba',
            _responseContext: {
              platform: 'whatsapp',
              channelId: '628123456789'
            }
          },
          context: { triggerId: 'trg-123' }
        },
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockAdapter.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'whatsapp',
          channelId: '628123456789',
          text: 'hey 5mnt sudah tiba'
        })
      );
    });

    it('CommunicationBridge supports NOTIFY_USER and REMIND_USER action types', async () => {
      const eventBus = new EventEmitter();
      const commBridge = new CommunicationBridge(eventBus);

      const mockAdapter: any = {
        start: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
        sendMessage: vi.fn(async () => ({ success: true, platformMessageId: 'wamid.test_notif' }))
      };

      commBridge.registerAdapter('whatsapp', mockAdapter);

      eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, {
        id: 'evt-dispatch-2',
        type: EventTypes.DOMAIN_ACTION_DISPATCHED,
        source: 'ExecutionDispatcher',
        payload: {
          actionType: 'REMIND_USER',
          actionPayload: {
            reminder: 'Waktunya minum obat',
            platform: 'whatsapp',
            channelId: '628999000111'
          },
          context: { triggerId: 'trg-456' }
        },
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockAdapter.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'whatsapp',
          channelId: '628999000111',
          text: 'Waktunya minum obat'
        })
      );
    });

    it('GoalBridge.handleScheduleGoal inherits _responseContext into trigger action payload', async () => {
      const eventBus = new EventEmitter();
      const registeredTriggers: any[] = [];
      const mockTriggerEngine: any = {
        register: vi.fn((trg: any) => {
          registeredTriggers.push(trg);
        })
      };

      const mockWalletAdapter: any = {};
      const goalBridge = new GoalBridge(
        eventBus,
        'test-session',
        mockWalletAdapter,
        undefined,
        undefined,
        mockTriggerEngine
      );

      // Simulate SCHEDULE_GOAL action dispatched from WhatsApp conversation turn
      eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, {
        id: 'evt-dispatch-sched',
        type: EventTypes.DOMAIN_ACTION_DISPATCHED,
        source: 'ExecutionDispatcher',
        payload: {
          actionType: 'SCHEDULE_GOAL',
          actionPayload: {
            scheduleType: 'exact',
            delaySeconds: 300,
            humanIntent: 'Reminder in 5 minutes',
            actionIntent: 'SEND_MESSAGE',
            actionParameters: {
              message: 'hey 5mnt sudah tiba'
            },
            _responseContext: {
              platform: 'whatsapp',
              channelId: '628123456789'
            }
          },
          context: { triggerId: 'req-sched-1' }
        },
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockTriggerEngine.register).toHaveBeenCalledTimes(1);
      const trigger = registeredTriggers[0];
      expect(trigger).toBeDefined();
      expect(trigger.action.type).toBe('SEND_MESSAGE');
      expect(trigger.action.payload).toMatchObject({
        message: 'hey 5mnt sudah tiba',
        platform: 'whatsapp',
        channelId: '628123456789'
      });
      expect(trigger.action.payload._responseContext).toBeDefined();
      expect(trigger.action.payload._responseContext.channelId).toBe('628123456789');
    });

    it('GoalBridge silently delegates SEND_MESSAGE without emitting an Unknown action error', async () => {
      const eventBus = new EventEmitter();
      const emittedResults: any[] = [];
      eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, (evt: any) => {
        emittedResults.push(evt);
      });

      const mockWalletAdapter: any = {};
      const goalBridge = new GoalBridge(
        eventBus,
        'test-session',
        mockWalletAdapter
      );

      eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, {
        id: 'evt-dispatch-msg',
        type: EventTypes.DOMAIN_ACTION_DISPATCHED,
        source: 'ExecutionDispatcher',
        payload: {
          actionType: 'SEND_MESSAGE',
          actionPayload: {
            text: 'test'
          }
        },
        timestamp: Date.now()
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Must NOT have emitted an unknown action error!
      const unknownError = emittedResults.find(r => r.payload?.errorMessage?.includes('Unknown action'));
      expect(unknownError).toBeUndefined();
    });
  });
});



