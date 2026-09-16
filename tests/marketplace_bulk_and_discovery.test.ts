import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StoreProfileService, calculateHaversineDistanceKm } from '../src/capabilities/communication/services/StoreProfileService';
import { WhatsAppCatalogGoalHandler } from '../src/runtime/handlers/WhatsAppCatalogGoalHandler';
import { WhatsAppCatalogService } from '../src/capabilities/communication/services/WhatsAppCatalogService';

describe('Marketplace: Fast Onboarding & Store-First Discovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Haversine Distance & Proximity Sorting', () => {
    it('accurately calculates distance between two geographic coordinates in km', () => {
      // Monas (Jakarta) to Tebet (Jakarta Selatan): ~7.5 km
      const monasLat = -6.1754;
      const monasLng = 106.8272;
      const tebetLat = -6.2297;
      const tebetLng = 106.8582;

      const dist = calculateHaversineDistanceKm(monasLat, monasLng, tebetLat, tebetLng);
      expect(dist).toBeGreaterThan(6.5);
      expect(dist).toBeLessThan(8.5);
    });

    it('finds nearby stores and sorts by distance and operational status', async () => {
      const storeService = new StoreProfileService({ persistLocally: false, supabaseClient: null });

      // Register Store 1: Warung Bu Siti (Tebet ~1km from buyer)
      await storeService.upsertStore({
        storeName: 'Warung Bu Siti Tebet',
        category: 'Kuliner',
        businessType: 'GOODS',
        latitude: -6.2300,
        longitude: 106.8590,
        isOpenManualOverride: true
      });

      // Register Store 2: Bakso Pak Min (Menteng ~5km from buyer)
      await storeService.upsertStore({
        storeName: 'Bakso Pak Min Menteng',
        category: 'Kuliner',
        businessType: 'GOODS',
        latitude: -6.1950,
        longitude: 106.8350,
        isOpenManualOverride: true
      });

      // Register Store 3: Bengkel Berkah (Jasa Otomotif, closed)
      await storeService.upsertStore({
        storeName: 'Bengkel Berkah',
        category: 'Otomotif',
        businessType: 'SERVICE',
        latitude: -6.2310,
        longitude: 106.8595,
        isOpenManualOverride: false
      });

      const buyerLat = -6.2297;
      const buyerLng = 106.8582;

      // Search Kuliner stores within 10km
      const nearbyKuliner = storeService.findNearbyStores(buyerLat, buyerLng, 'Kuliner', 10);
      expect(nearbyKuliner.length).toBeGreaterThanOrEqual(2);
      expect(nearbyKuliner[0].store.storeName).toBe('Warung Bu Siti Tebet');
      expect(nearbyKuliner[0].distanceKm).toBeLessThan(0.5);
      expect(nearbyKuliner[1].store.storeName).toBe('Bakso Pak Min Menteng');
      expect(nearbyKuliner[1].distanceKm).toBeGreaterThan(3);
    });
  });

  describe('CATALOG_BULK_CREATE_PRODUCTS (Fast Onboarding)', () => {
    it('creates store profile and registers multiple products in one call', async () => {
      const storeService = new StoreProfileService({ persistLocally: false, supabaseClient: null });
      const catalogService = new WhatsAppCatalogService({
        catalogId: '1460600679458168',
        accessToken: 'mock_token'
      });

      vi.spyOn(catalogService, 'createProduct').mockImplementation(async (input) => ({
        success: true,
        product: {
          id: 'prod_' + Math.random(),
          retailer_id: `SKU-${input.name.toUpperCase().replace(/\s+/g, '-')}`,
          name: input.name,
          price: `IDR ${input.price.toLocaleString('id-ID')}`,
          rawPrice: input.price,
          currency: 'IDR',
          brand: input.brand
        }
      }));

      let emittedSuccess = false;
      let emittedData: any = null;
      const emitResult = (_reqId: string, success: boolean, data: any) => {
        emittedSuccess = success;
        emittedData = data;
      };

      const handler = new WhatsAppCatalogGoalHandler(
        () => catalogService,
        '6281299998888',
        emitResult,
        () => storeService
      );

      await handler.handleBulkCreateProducts('req-bulk-1', {
        storeName: 'Dapur Sambal Maknyus',
        category: 'Kuliner',
        address: 'Jl. Tebet Raya No. 45',
        latitude: -6.2312,
        longitude: 106.8571,
        ownerWhatsApp: '6281299998888',
        products: [
          { name: 'Ayam Geprek Sambal Korek', price: 22000, description: 'Pedas mantap' },
          { name: 'Bebek Goreng Kremes', price: 29000, description: 'Bebek empuk bumbu rempah' },
          { name: 'Nasi Uduk Gurih', price: 6000 },
          { name: 'Es Teh Manis', price: 5000 }
        ]
      });

      expect(emittedSuccess).toBe(true);
      expect(emittedData.successCount).toBe(4);
      expect(emittedData.store.storeName).toBe('Dapur Sambal Maknyus');
      expect(emittedData.store.ownerWhatsApp).toBe('6281299998888');

      // Verify store was saved in StoreProfileService
      const savedStore = storeService.getStore('dapur-sambal-maknyus');
      expect(savedStore).toBeDefined();
      expect(savedStore?.category).toBe('Kuliner');
      expect(savedStore?.latitude).toBe(-6.2312);
    });
  });

  describe('STORE_DISCOVER_NEARBY (Store-First Discovery)', () => {
    it('discovers nearby stores and formats interactive store list', async () => {
      const storeService = new StoreProfileService({ persistLocally: false, supabaseClient: null });
      const catalogService = new WhatsAppCatalogService();

      await storeService.upsertStore({
        storeName: 'Ayam Bakar Pak Ndut',
        category: 'Kuliner',
        latitude: -6.2290,
        longitude: 106.8580,
        isOpenManualOverride: true
      });

      let emittedData: any = null;
      const emitResult = (_reqId: string, _success: boolean, data: any) => {
        emittedData = data;
      };

      const handler = new WhatsAppCatalogGoalHandler(
        () => catalogService,
        'user-session',
        emitResult,
        () => storeService
      );

      await handler.handleDiscoverNearbyStores('req-disc-1', {
        latitude: -6.2297,
        longitude: 106.8582,
        category: 'Kuliner',
        maxDistanceKm: 10
      });

      expect(emittedData).toBeDefined();
      expect(emittedData.stores.length).toBeGreaterThanOrEqual(1);
      expect(emittedData.stores[0].storeName).toBe('Ayam Bakar Pak Ndut');
      expect(emittedData.richContent.storeList).toBeDefined();
      expect(emittedData.richContent.storeList.stores.length).toBeGreaterThanOrEqual(1);
    });

    it('strictly excludes stores with zero active catalog products from discovery', async () => {
      const storeService = new StoreProfileService({ persistLocally: false, supabaseClient: null });
      const catalogService = new WhatsAppCatalogService({
        catalogId: '1460600679458168',
        accessToken: 'mock_token'
      });

      // Register Store A (with menu) and Store B (0 menu)
      await storeService.upsertStore({
        storeName: 'Warung Banyak Menu',
        category: 'Kuliner',
        latitude: -6.2290,
        longitude: 106.8580,
        isOpenManualOverride: true
      });
      await storeService.upsertStore({
        storeName: 'Katering Sedap Kosong',
        category: 'Kuliner',
        latitude: -6.2292,
        longitude: 106.8583,
        isOpenManualOverride: true
      });

      // Mock catalog to only have products for "Warung Banyak Menu"
      vi.spyOn(catalogService, 'getProducts').mockResolvedValue([
        {
          id: 'prod_1',
          retailer_id: 'SKU-WARUNG-01',
          name: 'Nasi Goreng Spesial',
          price: 'IDR25,000',
          rawPrice: 25000,
          currency: 'IDR',
          brand: 'Warung Banyak Menu'
        }
      ]);

      let emittedData: any = null;
      const handler = new WhatsAppCatalogGoalHandler(
        () => catalogService,
        'user-session',
        (_id, _success, data) => { emittedData = data; },
        () => storeService
      );

      await handler.handleDiscoverNearbyStores('req-disc-filter', {
        latitude: -6.2297,
        longitude: 106.8582,
        category: 'Kuliner'
      });

      expect(emittedData).toBeDefined();
      expect(emittedData.stores.some((s: any) => s.storeName === 'Warung Banyak Menu')).toBe(true);
      // "Katering Sedap Kosong" must be excluded because it has 0 items!
      expect(emittedData.stores.some((s: any) => s.storeName === 'Katering Sedap Kosong')).toBe(false);
    });

    it('does not display fake 2.5 km when user coordinates are omitted', async () => {
      const storeService = new StoreProfileService({ persistLocally: false, supabaseClient: null });
      const catalogService = new WhatsAppCatalogService();

      await storeService.upsertStore({
        storeName: 'Warung Tanpa GPS',
        category: 'Kuliner',
        address: 'Jl. Melati No. 5',
        isOpenManualOverride: true
      });

      let emittedData: any = null;
      const handler = new WhatsAppCatalogGoalHandler(
        () => catalogService,
        'user-session',
        (_id, _success, data) => { emittedData = data; },
        () => storeService
      );

      // Call discovery without latitude/longitude
      await handler.handleDiscoverNearbyStores('req-no-gps', {
        category: 'Kuliner'
      });

      expect(emittedData).toBeDefined();
      expect(emittedData.stores.length).toBeGreaterThanOrEqual(1);
      // distanceKm must be undefined (not fake 2.5)
      expect(emittedData.stores[0].distanceKm).toBeUndefined();
      // summary and rich content must NOT contain "2.5 km"
      expect(emittedData.summary).not.toContain('2.5 km');
      expect(emittedData.richContent.storeList.stores[0].description).not.toContain('2.5 km');
    });
  });
});
