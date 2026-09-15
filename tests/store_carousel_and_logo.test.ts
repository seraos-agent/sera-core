import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppCatalogService } from '../src/capabilities/communication/services/WhatsAppCatalogService';
import { StoreProfileService } from '../src/capabilities/communication/services/StoreProfileService';
import { WhatsAppCatalogGoalHandler } from '../src/runtime/handlers/WhatsAppCatalogGoalHandler';

describe('Store Carousel Discovery, Logo Support & Showcase Sync', () => {
  const mockCatalogId = '1460600679458168';
  const mockAccessToken = 'mock_meta_token_123';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateStoreMinPrice', () => {
    it('calculates the minimum price among products matching the store brand', () => {
      const storeService = new StoreProfileService({ persistLocally: false, supabaseClient: null });
      const mockProducts = [
        { brand: 'Geprek Cak Jiban', name: 'Paket Geprek Jumbo', rawPrice: 25000, price: 'Rp 25.000' },
        { brand: 'Geprek Cak Jiban', name: 'Paket Geprek Hemat', rawPrice: 15000, price: 'Rp 15.000' },
        { brand: 'Geprek Cak Jiban', name: 'Es Teh Manis', rawPrice: 5000, price: 'Rp 5.000' },
        { brand: 'SERA Mart', name: 'Minyak Goreng 2L', rawPrice: 38000, price: 'Rp 38.000' }
      ];

      const minPrice = storeService.calculateStoreMinPrice('Geprek Cak Jiban', mockProducts);
      expect(minPrice).toBe(5000);
    });

    it('falls back to 10000 if no products or zero prices exist for the store', () => {
      const storeService = new StoreProfileService({ persistLocally: false, supabaseClient: null });
      const minPrice = storeService.calculateStoreMinPrice('Warung Baru Tanpa Produk', []);
      expect(minPrice).toBe(10000);
    });
  });

  describe('buildStoreCarouselPayload', () => {
    it('constructs a valid WhatsApp Cloud API Product Carousel with 2 to 10 cards', () => {
      const catalogService = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      const mockStores = [
        {
          store: {
            storeId: 'geprek-cak-jiban',
            storeName: 'Geprek Cak Jiban',
            businessType: 'GOODS' as const,
            businessCategory: 'FOOD_INSTANT' as const,
            ownerWhatsApp: '62812345678',
            timezone: 'Asia/Jakarta',
            operatingHours: { open: '10:00', close: '21:00', days: [1, 2, 3, 4, 5, 6, 7] },
            allowPreOrder: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          },
          minPrice: 15000
        },
        {
          store: {
            storeId: 'bakso-mas-kumis',
            storeName: 'Bakso Mas Kumis',
            businessType: 'GOODS' as const,
            businessCategory: 'FOOD_INSTANT' as const,
            ownerWhatsApp: '62899887766',
            timezone: 'Asia/Jakarta',
            operatingHours: { open: '10:00', close: '22:00', days: [1, 2, 3, 4, 5, 6, 7] },
            allowPreOrder: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          },
          minPrice: 20000
        }
      ];

      const payload = catalogService.buildStoreCarouselPayload('6281234567890', mockStores);

      expect(payload.messaging_product).toBe('whatsapp');
      expect(payload.type).toBe('interactive');
      expect(payload.interactive.type).toBe('carousel');
      expect(payload.interactive.action.cards).toHaveLength(2);
      expect(payload.interactive.action.cards[0]).toEqual({
        card_index: 0,
        type: 'product',
        action: {
          catalog_id: mockCatalogId,
          product_retailer_id: 'showcase_geprek-cak-jiban'
        }
      });
      expect(payload.interactive.action.cards[1]).toEqual({
        card_index: 1,
        type: 'product',
        action: {
          catalog_id: mockCatalogId,
          product_retailer_id: 'showcase_bakso-mas-kumis'
        }
      });
    });

    it('throws error if fewer than 2 stores are provided for Carousel', () => {
      const catalogService = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      const singleStore = [
        {
          store: {
            storeId: 'single-store',
            storeName: 'Single Store',
            businessType: 'GOODS' as const,
            businessCategory: 'RETAIL_GOODS' as const,
            ownerWhatsApp: '6281111111',
            timezone: 'Asia/Jakarta',
            operatingHours: { open: '08:00', close: '20:00', days: [1, 2, 3] },
            allowPreOrder: true,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        }
      ];

      expect(() => {
        catalogService.buildStoreCarouselPayload('6281234567890', singleStore);
      }).toThrow('WhatsApp Product Carousel requires at least 2 cards.');
    });
  });

  describe('ensureStoreShowcaseProduct', () => {
    it('creates or updates a showcase item in Meta Catalog with logoUrl and minPrice', async () => {
      const catalogService = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      const store = {
        storeId: 'dapur-geprek-mas-joko',
        storeName: 'Dapur Geprek Mas Joko',
        businessType: 'GOODS' as const,
        businessCategory: 'FOOD_INSTANT' as const,
        category: 'Kuliner',
        ownerWhatsApp: '62812345678',
        address: 'Jl. Tebet Raya No. 45 Jakarta Selatan',
        logoUrl: 'https://example.com/logo-joko.png',
        timezone: 'Asia/Jakarta',
        operatingHours: { open: '10:00', close: '21:00', days: [1, 2, 3, 4, 5, 6, 7] },
        allowPreOrder: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Mock getProductByRetailerId returning null (new product)
      vi.spyOn(catalogService, 'getProductByRetailerId').mockResolvedValue(null);
      const createSpy = vi.spyOn(catalogService, 'createProduct').mockResolvedValue({
        success: true,
        product: {
          id: 'meta_prod_showcase_1',
          retailer_id: 'showcase_dapur-geprek-mas-joko',
          name: '🏪 Dapur Geprek Mas Joko',
          price: 'Rp 15.000',
          currency: 'IDR',
          image_url: 'https://example.com/logo-joko.png',
          availability: 'in stock',
          brand: 'Dapur Geprek Mas Joko'
        }
      });

      const res = await catalogService.ensureStoreShowcaseProduct(store, 15000);
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        retailer_id: 'showcase_dapur-geprek-mas-joko',
        name: '🏪 Dapur Geprek Mas Joko',
        price: 15000,
        image_url: 'https://example.com/logo-joko.png',
        brand: 'Dapur Geprek Mas Joko'
      }));
      expect(res?.retailer_id).toBe('showcase_dapur-geprek-mas-joko');
    });
  });

  describe('WhatsAppCatalogGoalHandler with STORE_CONFIG_PROFILE and logoUrl', () => {
    it('accepts logoUrl and updates store profile with confirmation in message', async () => {
      const storeService = new StoreProfileService({ persistLocally: false, supabaseClient: null });
      const catalogService = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      let capturedResult: any = null;
      const handler = new WhatsAppCatalogGoalHandler(
        () => catalogService,
        'test-session',
        (_id, _ok, data) => { capturedResult = data; },
        () => storeService
      );

      await handler.handleConfigureStore('req-1', {
        storeName: 'Geprek Cak Jiban',
        logoUrl: 'https://res.cloudinary.com/demo/image/upload/v1/cakjiban-logo.jpg',
        address: 'Jl. Tebet Raya No. 45'
      });

      expect(capturedResult).not.toBeNull();
      expect(capturedResult.store.logoUrl).toBe('https://res.cloudinary.com/demo/image/upload/v1/cakjiban-logo.jpg');
      expect(capturedResult.message).toContain('Logo/Foto Profil terpasang');
    });
  });
});
