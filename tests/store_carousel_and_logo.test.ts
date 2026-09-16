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

  describe('buildInteractiveStoreListPayload', () => {
    it('constructs a valid WhatsApp Cloud API Interactive List with store rows', () => {
      const catalogService = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      const mockStores = [
        {
          id: 'store_geprek-cak-jiban',
          title: 'Geprek Cak Jiban',
          description: '0.8 km • 🟢 Buka • 📍 Jl. Tebet Raya No. 45'
        },
        {
          id: 'store_bakso-mas-kumis',
          title: 'Bakso Mas Kumis',
          description: '1.2 km • 🟢 Buka • 📍 Jl. Merdeka No. 10'
        }
      ];

      const payload = catalogService.buildInteractiveStoreListPayload(
        '6281234567890',
        mockStores,
        'Toko Terdekat',
        'Pilih warung terdekat untuk membuka menu:',
        'Pilih Toko'
      );

      expect(payload.messaging_product).toBe('whatsapp');
      expect(payload.type).toBe('interactive');
      expect(payload.interactive.type).toBe('list');
      expect(payload.interactive.action.button).toBe('Pilih Toko');
      expect(payload.interactive.action.sections[0].rows).toHaveLength(2);
      expect(payload.interactive.action.sections[0].rows[0].id).toBe('store_geprek-cak-jiban');
      expect(payload.interactive.action.sections[0].rows[1].id).toBe('store_bakso-mas-kumis');
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

  describe('calculateStoreMinPrice', () => {
    it('accurately calculates min price for store slug even when showcase item exists', () => {
      const storeService = new StoreProfileService({ persistLocally: false, supabaseClient: null });

      const products = [
        { retailer_id: 'showcase_baso-pak-kumis', name: '🏪 Baso Pak Kumis', brand: 'Baso Pak Kumis', price: 'IDR10,000' },
        { retailer_id: 'SKU-baso-1', name: 'Baso Iga Komplit', brand: 'Baso Pak Kumis', price: 'IDR45,000', rawPrice: 45000 },
        { retailer_id: 'SKU-baso-2', name: 'Baso Iga Super', brand: 'Baso Pak Kumis', price: 'IDR39,000', rawPrice: 39000 },
        { retailer_id: 'SKU-other', name: 'Ayam Bakar Madu', brand: 'Ayam Bakar Cak Cuk', price: 'IDR23,000', rawPrice: 23000 }
      ];

      // Using store slug (e.g. baso-pak-kumis)
      const minPriceSlug = storeService.calculateStoreMinPrice('baso-pak-kumis', products);
      expect(minPriceSlug).toBe(39000);

      // Using store display name
      const minPriceName = storeService.calculateStoreMinPrice('Baso Pak Kumis', products);
      expect(minPriceName).toBe(39000);
    });

    it('accurately detects min price for Geprek Cak Jiban including drinks', () => {
      const storeService = new StoreProfileService({ persistLocally: false, supabaseClient: null });

      const products = [
        { retailer_id: 'showcase_geprek-cak-jiban', name: '🏪 Geprek Cak Jiban', brand: 'Geprek Cak Jiban', price: 'IDR5,000' },
        { retailer_id: 'SKU-1', name: 'Es Teh Manis Jumbo', brand: 'Geprek Cak Jiban', price: 'IDR5,000', rawPrice: 5000 },
        { retailer_id: 'SKU-2', name: 'Geprek Original', brand: 'Geprek Cak Jiban', price: 'IDR13,000', rawPrice: 13000 },
        { retailer_id: 'SKU-3', name: 'Geprek Mozarella', brand: 'Geprek Cak Jiban', price: 'IDR22,000', rawPrice: 22000 }
      ];

      const minPrice = storeService.calculateStoreMinPrice('geprek-cak-jiban', products);
      expect(minPrice).toBe(5000);
    });
  });
});
