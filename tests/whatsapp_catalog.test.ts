import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { WhatsAppCatalogService } from '../src/capabilities/communication/services/WhatsAppCatalogService';
import { WhatsAppAdapter } from '../src/capabilities/communication/adapters/WhatsAppAdapter';
import { WhatsAppCatalogGoalHandler } from '../src/runtime/handlers/WhatsAppCatalogGoalHandler';
import { createWhatsAppRouter } from '../src/server/routes/whatsappRoutes';
import { SeraAgentInstance } from '../src/server/SeraAgentInstance';
import { EventTypes } from '../src/core/events/types';
import express from 'express';

describe('WhatsApp Catalog & Commerce Integration', () => {
  const mockCatalogId = '1460600679458168';
  const mockAccessToken = 'mock_meta_token_123';
  const mockPhoneNumberId = '109876543210';

  const sampleProductsData = [
    {
      id: 'prod_1',
      retailer_id: 'SKU-BERAS-01',
      name: 'Beras Premium Ramos 5kg',
      description: 'Beras pulen berkualitas',
      price: 'IDR75,000',
      currency: 'IDR',
      availability: 'in stock',
      brand: 'Ramos'
    },
    {
      id: 'prod_2',
      retailer_id: 'SKU-MINYAK-01',
      name: 'Minyak Goreng Bimoli 2 Liter',
      description: 'Minyak goreng kelapa sawit',
      price: 'IDR38,000',
      currency: 'IDR',
      availability: 'in stock',
      brand: 'Bimoli'
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('WhatsAppCatalogService', () => {
    it('initializes with configuration and verifies isConfigured', () => {
      const service = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken,
        defaultStoreName: 'Toko Sembako SERA'
      });
      expect(service.isConfigured).toBe(true);
      expect(service.getCatalogId()).toBe(mockCatalogId);
    });

    it('fetches products from Meta Graph API and parses price', async () => {
      const globalFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: sampleProductsData })
      } as any);

      const service = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      const products = await service.getProducts();
      expect(products).toHaveLength(2);
      expect(products[0].retailer_id).toBe('SKU-BERAS-01');
      expect(products[0].rawPrice).toBe(75000);
      expect(globalFetch).toHaveBeenCalled();
    });

    it('searches products by keyword (case-insensitive)', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: sampleProductsData })
      } as any);

      const service = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      const berasResults = await service.searchProducts('beras');
      expect(berasResults).toHaveLength(1);
      expect(berasResults[0].retailer_id).toBe('SKU-BERAS-01');

      const minyakResults = await service.searchProducts('BIMOLI');
      expect(minyakResults).toHaveLength(1);
      expect(minyakResults[0].retailer_id).toBe('SKU-MINYAK-01');
    });

    it('builds Single-Product Message (SPM) payload correctly', () => {
      const service = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken,
        defaultStoreName: 'SERA Mart'
      });

      const payload = service.buildSingleProductPayload(
        '628123456789',
        'SKU-BERAS-01',
        'Beras pulen favorit keluarga',
        'SERA Mart'
      );

      expect(payload.messaging_product).toBe('whatsapp');
      expect(payload.to).toBe('628123456789');
      expect(payload.type).toBe('interactive');
      expect(payload.interactive.type).toBe('product');
      expect(payload.interactive.action.catalog_id).toBe(mockCatalogId);
      expect(payload.interactive.action.product_retailer_id).toBe('SKU-BERAS-01');
      expect(payload.interactive.body.text).toBe('Beras pulen favorit keluarga');
      expect(payload.interactive.footer.text).toBe('SERA Mart');
    });

    it('builds Multi-Product Message (MPM) payload correctly', () => {
      const service = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      const payload = service.buildMultiProductPayload(
        '628123456789',
        [
          { title: 'Bahan Pokok', productRetailerIds: ['SKU-BERAS-01', 'SKU-MINYAK-01'] }
        ],
        'Katalog Sembako',
        'Silakan pilih produk:'
      );

      expect(payload.interactive.type).toBe('product_list');
      expect(payload.interactive.action.catalog_id).toBe(mockCatalogId);
      expect(payload.interactive.action.sections).toHaveLength(1);
      expect(payload.interactive.action.sections[0].title).toBe('Bahan Pokok');
      expect(payload.interactive.action.sections[0].product_items).toHaveLength(2);
    });

    it('builds Catalog link payload correctly', () => {
      const service = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      const payload = service.buildCatalogPayload('628123456789', 'Lihat katalog kami', 'SERA Mart', 'SKU-BERAS-01');
      expect(payload.interactive.type).toBe('catalog_message');
      expect(payload.interactive.action.name).toBe('catalog_message');
      expect(payload.interactive.action.parameters.thumbnail_product_retailer_id).toBe('SKU-BERAS-01');
    });

    it('parses incoming order webhook payload with total computation', () => {
      const rawOrder = {
        catalog_id: mockCatalogId,
        text: 'Tolong kirim sebelum jam 12 siang ya',
        product_items: [
          {
            product_retailer_id: 'SKU-BERAS-01',
            quantity: '2',
            item_price: '75000',
            currency: 'IDR'
          },
          {
            product_retailer_id: 'SKU-MINYAK-01',
            quantity: '1',
            item_price: '38000',
            currency: 'IDR'
          }
        ]
      };

      const parsed = WhatsAppCatalogService.parseIncomingOrder(rawOrder);
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].quantity).toBe(2);
      expect(parsed.items[0].item_price).toBe(75000);
      expect(parsed.totalEstimated).toBe(2 * 75000 + 1 * 38000); // 188,000
      expect(parsed.customerNote).toBe('Tolong kirim sebelum jam 12 siang ya');
      expect(parsed.formattedSummary).toContain('SKU-BERAS-01');
      expect(parsed.formattedSummary).toContain('188.000');
    });
  });

  describe('WhatsAppAdapter Interactive Products', () => {
    it('dispatches Single Product Message (SPM) when action.richContent.product is provided', async () => {
      const eventBus = new EventEmitter();
      const catalogService = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      const adapter = new WhatsAppAdapter('session-1', {
        phoneNumberId: mockPhoneNumberId,
        accessToken: mockAccessToken,
        catalogService
      }, eventBus);

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.HBg123' }] })
      } as any);

      const res = await adapter.sendMessage({
        platform: 'whatsapp',
        channelId: '628123456789',
        text: 'Ini detail beras premium ramos:',
        richContent: {
          product: {
            retailerId: 'SKU-BERAS-01',
            bodyText: 'Beras Premium Ramos 5kg'
          }
        }
      });

      expect(res.success).toBe(true);
      expect(res.platformMessageId).toBe('wamid.HBg123');
      expect(fetchSpy).toHaveBeenCalled();
      const reqBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(reqBody.interactive.type).toBe('product');
      expect(reqBody.interactive.action.product_retailer_id).toBe('SKU-BERAS-01');
    });

    it('dispatches Multi-Product Message (MPM) when action.richContent.productList is provided', async () => {
      const eventBus = new EventEmitter();
      const catalogService = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      const adapter = new WhatsAppAdapter('session-1', {
        phoneNumberId: mockPhoneNumberId,
        accessToken: mockAccessToken,
        catalogService
      }, eventBus);

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.HBg456' }] })
      } as any);

      const res = await adapter.sendMessage({
        platform: 'whatsapp',
        channelId: '628123456789',
        text: 'Katalog sembako kami:',
        richContent: {
          productList: {
            headerText: 'Sembako Mart',
            bodyText: 'Silakan pilih produk:',
            sections: [
              { title: 'Beras & Minyak', productRetailerIds: ['SKU-BERAS-01', 'SKU-MINYAK-01'] }
            ]
          }
        }
      });

      expect(res.success).toBe(true);
      expect(res.platformMessageId).toBe('wamid.HBg456');
      const reqBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(reqBody.interactive.type).toBe('product_list');
    });
  });

  describe('WhatsAppCatalogGoalHandler', () => {
    it('executes handleSearchProducts and emits result', async () => {
      const mockCatalogService = {
        searchProducts: vi.fn().mockResolvedValue([
          {
            retailer_id: 'SKU-BERAS-01',
            name: 'Beras Ramos 5kg',
            price: 'IDR75,000',
            rawPrice: 75000,
            currency: 'IDR',
            availability: 'in stock'
          }
        ])
      } as any;

      const emitResult = vi.fn();
      const handler = new WhatsAppCatalogGoalHandler(
        () => mockCatalogService,
        'session-1',
        emitResult
      );

      await handler.handleSearchProducts('req-1', { query: 'beras' });

      expect(emitResult).toHaveBeenCalledWith(
        'req-1',
        true,
        expect.objectContaining({
          count: 1,
          products: expect.arrayContaining([
            expect.objectContaining({ retailerId: 'SKU-BERAS-01' })
          ])
        })
      );
    });

    it('executes handleSendProduct and attaches richContent', async () => {
      const mockCatalogService = {
        getProductByRetailerId: vi.fn().mockResolvedValue({
          retailer_id: 'SKU-BERAS-01',
          name: 'Beras Ramos 5kg',
          price: 'IDR75,000',
          rawPrice: 75000,
          currency: 'IDR'
        })
      } as any;

      const emitResult = vi.fn();
      const handler = new WhatsAppCatalogGoalHandler(
        () => mockCatalogService,
        'session-1',
        emitResult
      );

      await handler.handleSendProduct('req-2', { retailerId: 'SKU-BERAS-01' });

      expect(emitResult).toHaveBeenCalledWith(
        'req-2',
        true,
        expect.objectContaining({
          richContent: {
            product: {
              retailerId: 'SKU-BERAS-01',
              bodyText: expect.any(String)
            }
          }
        })
      );
    });

    it('auto-resolves merchant owner WhatsApp from _responseContext when configuring store', async () => {
      const mockCatalogService = {} as any;
      const emitResult = vi.fn();
      const handler = new WhatsAppCatalogGoalHandler(
        () => mockCatalogService,
        'session-1',
        emitResult
      );

      await handler.handleConfigureStore('req-store-1', {
        storeName: 'Katering Sedap',
        openTime: '08:00',
        closeTime: '20:00',
        _responseContext: {
          platform: 'whatsapp',
          senderPhone: '6287766554433'
        }
      });

      expect(emitResult).toHaveBeenCalledWith(
        'req-store-1',
        true,
        expect.objectContaining({
          store: expect.objectContaining({
            storeName: 'Katering Sedap',
            ownerWhatsApp: '6287766554433'
          })
        })
      );
    });

    it('auto-links existing store and merchant phone when creating product without explicit storeName', async () => {
      const mockCatalogService = {
        createProduct: vi.fn().mockResolvedValue({
          success: true,
          product: {
            id: 'meta_p1',
            retailer_id: 'prod-es-teh',
            name: 'Es Teh Manis',
            rawPrice: 5000,
            price: 'IDR5,000',
            currency: 'IDR',
            availability: 'in stock',
            brand: 'Katering Sedap'
          }
        })
      } as any;

      const emitResult = vi.fn();
      const handler = new WhatsAppCatalogGoalHandler(
        () => mockCatalogService,
        'session-1',
        emitResult
      );

      await handler.handleCreateProduct('req-prod-1', {
        name: 'Es Teh Manis',
        price: 5000,
        _responseContext: {
          platform: 'whatsapp',
          senderPhone: '6287766554433'
        }
      });

      expect(mockCatalogService.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Es Teh Manis',
          brand: 'Katering Sedap'
        })
      );
      expect(emitResult).toHaveBeenCalledWith('req-prod-1', true, expect.any(Object));
    });
  });

  describe('WhatsApp Webhook Order Ingress', () => {
    it('receives and parses incoming order message into dialogue observation event', async () => {
      const eventBus = new EventEmitter();
      const emittedEvents: any[] = [];
      eventBus.on(EventTypes.DIALOGUE_USER_OBSERVED, (evt) => emittedEvents.push(evt));

      const mockAgentManager = {
        getOrCreateInstance: vi.fn().mockReturnValue({ eventBus })
      } as any;

      const mockSecretManager = {
        getSecret: vi.fn(async (key: string) => (key === 'WA_USER_628123456789' ? 'session-123' : null))
      } as any;

      const router = createWhatsAppRouter({
        agentManager: mockAgentManager,
        secretManager: mockSecretManager,
        verifyToken: 'test_token',
        phoneNumberId: mockPhoneNumberId,
        accessToken: mockAccessToken
      });

      const app = express();
      app.use(express.json());
      app.use('/whatsapp', router);

      const server = app.listen(0);
      const port = (server.address() as any).port;

      const orderPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '628000', phone_number_id: mockPhoneNumberId },
                  contacts: [{ profile: { name: 'Budi Santoso' }, wa_id: '628123456789' }],
                  messages: [
                    {
                      from: '628123456789',
                      id: 'wamid.ORD123',
                      timestamp: '1710000000',
                      type: 'order',
                      order: {
                        catalog_id: mockCatalogId,
                        text: 'Tolong proses segera ya',
                        product_items: [
                          {
                            product_retailer_id: 'SKU-BERAS-01',
                            quantity: '2',
                            item_price: '75000',
                            currency: 'IDR'
                          }
                        ]
                      }
                    }
                  ]
                }
              }
            ]
          }
        ]
      };

      try {
        const res = await fetch(`http://127.0.0.1:${port}/whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload)
        });
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toBe('EVENT_RECEIVED');

        // Allow event emission to settle
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(emittedEvents).toHaveLength(1);
        const observedMsg = emittedEvents[0].payload.message;
        expect(observedMsg).toContain('PESANAN DITERIMA DARI KATALOG WHATSAPP');
        expect(observedMsg).toContain('SKU-BERAS-01');
        expect(observedMsg).toContain('150.000');
        expect(observedMsg).toContain('Tolong proses segera ya');
      } finally {
        server.close();
      }
    });
  });

  describe('SeraAgentInstance Commerce Tools Registration', () => {
    it('registers catalog tools directly into runtime.capabilityCatalog.availableTools()', () => {
      const instance = new SeraAgentInstance('test-user-session');
      const tools = instance.runtime.capabilityCatalog.availableTools();
      const toolNames = tools.map((t: any) => t.name);

      expect(toolNames).toContain('CATALOG_SEARCH_PRODUCTS');
      expect(toolNames).toContain('WHATSAPP_SEND_PRODUCT');
      expect(toolNames).toContain('WHATSAPP_SEND_CATALOG');
      expect(toolNames).toContain('CATALOG_CREATE_PRODUCT');
      expect(toolNames).toContain('CATALOG_UPDATE_PRODUCT');
      expect(toolNames).toContain('CATALOG_DELETE_PRODUCT');
      expect(toolNames).toContain('STORE_CONFIG_PROFILE');
      expect(toolNames).toContain('STORE_CHECK_STATUS');
    });

    it('propagates richContent from tool execution to ReActExecutor result', async () => {
      const mockOrchestrator: any = {
        generate: vi.fn()
          .mockResolvedValueOnce({
            text: '',
            toolCalls: [{
              id: 'call-1',
              name: 'WHATSAPP_SEND_PRODUCT',
              arguments: { retailerId: 'SKU-BERAS-01' }
            }]
          })
          .mockResolvedValueOnce({
            text: 'Ini kartu produknya ya.',
            toolCalls: []
          })
      };

      const mockToolHandler: any = {
        executeSingleTool: vi.fn().mockResolvedValue({
          isProposal: false,
          output: {
            success: true,
            richContent: {
              product: {
                retailerId: 'SKU-BERAS-01',
                bodyText: 'Beras Premium Ramos 5kg'
              }
            }
          }
        })
      };

      const { ReActExecutor } = await import('../src/capabilities/dialogue/cognitive/ReActExecutor.js');
      const executor = new ReActExecutor(mockOrchestrator, mockToolHandler);

      const res = await executor.execute({
        messages: [{ role: 'user', content: 'Coba beras' }],
        rawTools: [],
        turnStartTime: Date.now(),
        hasImages: false,
        event: { id: 'evt-1', type: 'USER_SPEAK', payload: {}, timestamp: Date.now() } as any,
        userMessage: 'Coba beras',
        sessionId: 'test-session',
        capabilityCatalog: null,
        emitEvent: vi.fn(),
        spawnGoalAndAwaitResult: vi.fn(),
        buildWorkingMemory: vi.fn().mockResolvedValue([])
      });

      expect(res.richContent).toBeDefined();
      expect(res.richContent?.product?.retailerId).toBe('SKU-BERAS-01');
      expect(res.finalAnswer).toContain('Ini kartu produknya ya.');
    });
  });
});

