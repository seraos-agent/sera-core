import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppCatalogService } from '../src/capabilities/communication/services/WhatsAppCatalogService';
import { StoreProfileService, inferBusinessCategory } from '../src/capabilities/communication/services/StoreProfileService';
import { WhatsAppCatalogGoalHandler } from '../src/runtime/handlers/WhatsAppCatalogGoalHandler';

describe('Inventory Stock Management & Contextual Closing Behaviors', () => {
  const mockCatalogId = '1460600679458168';
  const mockAccessToken = 'mock_meta_token_123';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('BusinessCategory & inferBusinessCategory', () => {
    it('infers FOOD_INSTANT for culinary and eateries', () => {
      expect(inferBusinessCategory('Kuliner', 'GOODS', 'Geprek Cak Jiban')).toBe('FOOD_INSTANT');
      expect(inferBusinessCategory('Makanan & Minuman', 'GOODS', 'Bakso Malang')).toBe('FOOD_INSTANT');
      expect(inferBusinessCategory('Minuman', 'GOODS', 'Kopi Kenangan')).toBe('FOOD_INSTANT');
    });

    it('infers SERVICE for services, bookings, and repairs', () => {
      expect(inferBusinessCategory('Kebersihan', 'SERVICE', 'Bening Home Care')).toBe('SERVICE');
      expect(inferBusinessCategory('Otomotif', 'SERVICE', 'Bengkel Motor')).toBe('SERVICE');
      expect(inferBusinessCategory('Jasa', 'GOODS', 'Cuci AC')).toBe('SERVICE');
    });

    it('infers RETAIL_GOODS for general goods and sembako', () => {
      expect(inferBusinessCategory('Sembako', 'GOODS', 'SERA Mart')).toBe('RETAIL_GOODS');
      expect(inferBusinessCategory('Elektronik & Listrik', 'GOODS', 'Toko Listrik')).toBe('RETAIL_GOODS');
      expect(inferBusinessCategory('Mainan', 'GOODS', 'Toko Mainan')).toBe('RETAIL_GOODS');
    });

    it('sets default allowPreOrder = false for FOOD_INSTANT, and true for SERVICE/RETAIL', async () => {
      const storeService = new StoreProfileService({ persistLocally: false, supabaseClient: null });

      // Food store defaults allowPreOrder to false
      const foodStore = await storeService.upsertStore({
        storeName: 'Warung Geprek Test',
        category: 'Kuliner',
        businessType: 'GOODS'
      });
      expect(foodStore.businessCategory).toBe('FOOD_INSTANT');
      expect(foodStore.allowPreOrder).toBe(false);

      // Service store defaults allowPreOrder to true
      const serviceStore = await storeService.upsertStore({
        storeName: 'Servis AC Test',
        category: 'Jasa',
        businessType: 'SERVICE'
      });
      expect(serviceStore.businessCategory).toBe('SERVICE');
      expect(serviceStore.allowPreOrder).toBe(true);

      // Retail store defaults allowPreOrder to true
      const retailStore = await storeService.upsertStore({
        storeName: 'Toko Listrik Test',
        category: 'Alat Listrik',
        businessType: 'GOODS'
      });
      expect(retailStore.businessCategory).toBe('RETAIL_GOODS');
      expect(retailStore.allowPreOrder).toBe(true);
    });
  });

  describe('WhatsAppCatalogService Inventory Ledger', () => {
    it('sets stock quantity and triggers out of stock when quantity hits 0', async () => {
      const service = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      // Mock getProductByRetailerId and updateProduct
      vi.spyOn(service, 'getProductByRetailerId').mockResolvedValue({
        id: 'meta_123',
        retailer_id: 'SKU-GEPREK-01',
        name: 'Geprek Original',
        price: 'IDR13,000',
        currency: 'IDR',
        availability: 'in stock'
      });

      const updateSpy = vi.spyOn(service, 'updateProduct').mockResolvedValue({
        success: true,
        product: {
          id: 'meta_123',
          retailer_id: 'SKU-GEPREK-01',
          name: 'Geprek Original',
          price: 'IDR13,000',
          currency: 'IDR',
          availability: 'out of stock'
        }
      });

      // Set stock to 20
      const res1 = await service.setProductStock('SKU-GEPREK-01', 20);
      expect(res1.stock).toBe(20);
      expect(res1.triggeredOutOfStock).toBe(false);
      expect(service.getProductStock('SKU-GEPREK-01')).toBe(20);

      // Set stock to 0 -> should trigger updateProduct with 'out of stock'
      const res2 = await service.setProductStock('SKU-GEPREK-01', 0);
      expect(res2.stock).toBe(0);
      expect(res2.triggeredOutOfStock).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith('SKU-GEPREK-01', { availability: 'out of stock' });
    });

    it('deducts stock on order confirmation and triggers out of stock at zero', async () => {
      const service = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      vi.spyOn(service, 'getProductByRetailerId').mockResolvedValue({
        id: 'meta_123',
        retailer_id: 'SKU-GEPREK-01',
        name: 'Geprek Original',
        price: 'IDR13,000',
        currency: 'IDR',
        availability: 'in stock'
      });

      const updateSpy = vi.spyOn(service, 'updateProduct').mockResolvedValue({
        success: true,
        product: {} as any
      });

      // Set initial stock 5
      await service.setProductStock('SKU-GEPREK-01', 5);

      // Deduct 3 (order confirmed) -> remaining 2
      const res1 = await service.deductProductStock('SKU-GEPREK-01', 3);
      expect(res1.remaining).toBe(2);
      expect(res1.triggeredOutOfStock).toBe(false);

      // Deduct 2 -> remaining 0, triggers out of stock
      const res2 = await service.deductProductStock('SKU-GEPREK-01', 2);
      expect(res2.remaining).toBe(0);
      expect(res2.triggeredOutOfStock).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith('SKU-GEPREK-01', { availability: 'out of stock' });
    });

    it('restores stock on cancellation/refund and triggers in stock when recovering from 0', async () => {
      const service = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      vi.spyOn(service, 'getProductByRetailerId').mockResolvedValue({
        id: 'meta_123',
        retailer_id: 'SKU-GEPREK-01',
        name: 'Geprek Original',
        price: 'IDR13,000',
        currency: 'IDR',
        availability: 'out of stock'
      });

      const updateSpy = vi.spyOn(service, 'updateProduct').mockResolvedValue({
        success: true,
        product: {} as any
      });

      // Current stock is 0
      await service.setProductStock('SKU-GEPREK-01', 0);

      // Restore 2 (refund/cancellation) -> remaining 2, triggers in stock
      const res = await service.restoreProductStock('SKU-GEPREK-01', 2);
      expect(res.remaining).toBe(2);
      expect(res.triggeredInStock).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith('SKU-GEPREK-01', { availability: 'in stock' });
    });
  });

  describe('WhatsAppCatalogGoalHandler Stock Goals', () => {
    it('executes handleSetStock and handleAdjustStock successfully', async () => {
      const service = new WhatsAppCatalogService({
        catalogId: mockCatalogId,
        accessToken: mockAccessToken
      });

      vi.spyOn(service, 'getProductByRetailerId').mockResolvedValue({
        id: 'meta_123',
        retailer_id: 'SKU-GEPREK-01',
        name: 'Geprek Original',
        price: 'IDR13,000',
        currency: 'IDR',
        availability: 'in stock'
      });

      let emitted: any = null;
      const handler = new WhatsAppCatalogGoalHandler(
        () => service,
        'test-session',
        (reqId, success, data, err) => {
          emitted = { reqId, success, data, err };
        }
      );

      // Test handleSetStock
      await handler.handleSetStock('req-1', {
        query: 'SKU-GEPREK-01',
        stockQuantity: 15
      });
      expect(emitted.success).toBe(true);
      expect(emitted.data.stock).toBe(15);
      expect(emitted.data.message).toContain('15');

      // Test handleAdjustStock (deduct 5)
      await handler.handleAdjustStock('req-2', {
        query: 'SKU-GEPREK-01',
        change: -5,
        reason: 'order_confirmed'
      });
      expect(emitted.success).toBe(true);
      expect(emitted.data.remaining).toBe(10);
      expect(emitted.data.message).toContain('-5');
    });
  });
});
