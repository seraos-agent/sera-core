import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { MarketplaceOrderService } from '../src/capabilities/communication/services/MarketplaceOrderService';
import { StoreProfile } from '../src/capabilities/communication/services/StoreProfileService';
import { ParsedIncomingOrder } from '../src/capabilities/communication/services/WhatsAppCatalogService';

describe('MarketplaceOrderService & Merchant Dispatch Flow', () => {
  const testStoragePath = path.resolve(process.cwd(), '.data', 'test_marketplace_orders.json');
  let orderService: MarketplaceOrderService;

  const mockStore: StoreProfile = {
    storeId: 'geprek-joko',
    storeName: 'Dapur Geprek Mas Joko',
    ownerWhatsApp: '6281234567890',
    businessCategory: 'FOOD_INSTANT',
    businessType: 'GOODS',
    operatingHours: { open: '09:00', close: '21:00', days: [1, 2, 3, 4, 5, 6, 7] },
    allowPreOrder: false,
    address: 'Jl. Melati No. 5, Malang',
    timezone: 'Asia/Jakarta',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const mockCart: ParsedIncomingOrder = {
    catalogId: 'cat_123',
    currency: 'IDR',
    items: [
      { product_retailer_id: 'Geprek Keju', quantity: 2, item_price: 25000, currency: 'IDR' },
      { product_retailer_id: 'Es Teh Manis', quantity: 2, item_price: 5000, currency: 'IDR' }
    ],
    totalEstimated: 60000,
    customerNote: 'Sambal dipisah ya mas',
    formattedSummary: '2x Geprek Keju, 2x Es Teh Manis'
  };

  beforeEach(() => {
    if (fs.existsSync(testStoragePath)) {
      fs.unlinkSync(testStoragePath);
    }
    orderService = new MarketplaceOrderService({
      persistLocally: false,
      storageFilePath: testStoragePath
    });
  });

  afterEach(() => {
    if (fs.existsSync(testStoragePath)) {
      try {
        fs.unlinkSync(testStoragePath);
      } catch {}
    }
  });

  it('creates an order in AWAITING_DETAILS state without prematurely notifying merchant', () => {
    const order = orderService.createOrderFromCart('628999888777', mockStore, mockCart, 'Budi');

    expect(order.orderId).toMatch(/^ORD-[A-Z0-9]+$/);
    expect(order.status).toBe('AWAITING_DETAILS');
    expect(order.itemsTotal).toBe(60000);
    expect(order.buyerName).toBe('Budi');
    expect(order.buyerPhone).toBe('628999888777');
    expect(order.customerNote).toBe('Sambal dipisah ya mas');

    // Should NOT be complete because deliveryAddress is not yet provided
    expect(orderService.isOrderComplete(order)).toBe(false);
  });

  it('correctly marks order complete once deliveryAddress and paymentMethod are provided', () => {
    const order = orderService.createOrderFromCart('628999888777', mockStore, mockCart, 'Budi');

    const updated = orderService.updateOrder(order.orderId, {
      deliveryAddress: 'Jl. Melati No. 5, RT 02/04, Klojen',
      paymentMethod: 'QRIS',
      deliveryFee: 8000
    });

    expect(updated).toBeDefined();
    expect(updated!.totalAmount).toBe(68000);
    expect(orderService.isOrderComplete(updated!)).toBe(true);
  });

  it('refuses to dispatch if order is incomplete (missing delivery address)', async () => {
    const order = orderService.createOrderFromCart('628999888777', mockStore, mockCart, 'Budi');

    const result = await orderService.dispatchToMerchant(order.orderId, {
      accessToken: 'dummy_token',
      phoneNumberId: 'dummy_id'
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('INCOMPLETE_DATA');
    expect(order.status).toBe('AWAITING_DETAILS');
  });

  it('formats merchant alert with NO ICONS, NO BUYER PHONE NUMBER, and includes payment and delivery methods', () => {
    const order = orderService.createOrderFromCart('628999888777', mockStore, mockCart, 'Budi');
    orderService.updateOrder(order.orderId, {
      deliveryAddress: 'Jl. Melati No. 5, RT 02/04, Klojen',
      paymentMethod: 'QRIS',
      paymentStatus: 'PAID',
      deliveryFee: 8000
    });

    const completedOrder = orderService.getOrder(order.orderId)!;
    const alertText = orderService.formatMerchantAlert(completedOrder);

    // Rule 1: NO ICONS or emojis
    expect(alertText).not.toMatch(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
    expect(alertText).not.toContain('🔔');
    expect(alertText).not.toContain('👤');
    expect(alertText).not.toContain('📍');
    expect(alertText).not.toContain('✅');
    expect(alertText).not.toContain('❌');

    // Rule 2: NEVER leak buyer phone number (anti-disintermediation / platform retention)
    expect(alertText).not.toContain('628999888777');
    expect(alertText).not.toContain('+628999888777');
    expect(alertText).toContain('Pembeli: Budi (via SERA)');

    // Rule 3: Explicit payment and delivery methods
    expect(alertText).toContain('Metode Pengiriman: Diantar Kurir');
    expect(alertText).toContain('Metode Pembayaran: QRIS (Sudah Lunas)');
    expect(alertText).toContain('Total Pembayaran: Rp 68.000');
  });

  it('processes merchant ACCEPT decision and generates clean notifications', async () => {
    const order = orderService.createOrderFromCart('628999888777', mockStore, mockCart, 'Budi');
    orderService.updateOrder(order.orderId, {
      deliveryAddress: 'Jl. Melati No. 5',
      paymentMethod: 'QRIS'
    });

    const result = await orderService.handleMerchantDecision(order.orderId, 'ACCEPT', '6281234567890');

    expect(result.success).toBe(true);
    expect(result.order?.status).toBe('ACCEPTED');
    expect(result.merchantConfirmation).toContain(`Pesanan #${order.orderId} telah Anda terima`);
    expect(result.buyerNotification).toContain(`Pesanan Anda (#${order.orderId}) telah diterima oleh Dapur Geprek Mas Joko dan sedang dipersiapkan.`);
    // No emojis
    expect(result.merchantConfirmation).not.toContain('✅');
    expect(result.buyerNotification).not.toContain('🍳');
  });

  it('processes merchant REJECT decision gracefully without exposing buyer contact', async () => {
    const order = orderService.createOrderFromCart('628999888777', mockStore, mockCart, 'Budi');
    const result = await orderService.handleMerchantDecision(order.orderId, 'REJECT', '6281234567890');

    expect(result.success).toBe(true);
    expect(result.order?.status).toBe('REJECTED');
    expect(result.merchantConfirmation).toContain(`Pesanan #${order.orderId} telah ditolak.`);
    expect(result.buyerNotification).toContain(`Mohon maaf, pesanan Anda (#${order.orderId}) tidak dapat diproses`);
  });
});
