import * as fs from 'fs';
import * as path from 'path';
import { StoreProfile } from './StoreProfileService';
import { ParsedIncomingOrder } from './WhatsAppCatalogService';

export type MarketplaceOrderStatus =
  | 'AWAITING_DETAILS'
  | 'DISPATCHED_TO_MERCHANT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PREPARING'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'CANCELLED';

export type DeliveryMethod = 'DELIVERY' | 'SELF_PICKUP';
export type PaymentMethod = 'QRIS' | 'COD' | 'TRANSFER' | 'WALLET';
export type PaymentStatus = 'PAID' | 'PENDING';

export interface MarketplaceOrderItem {
  retailer_id: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface MarketplaceOrder {
  orderId: string;
  storeId: string;
  storeName: string;
  buyerPhone: string;
  buyerName?: string;
  items: MarketplaceOrderItem[];
  itemsTotal: number;
  deliveryFee: number;
  totalAmount: number;
  deliveryAddress?: string;
  deliveryMethod?: DeliveryMethod;
  paymentMethod?: PaymentMethod;
  paymentStatus: PaymentStatus;
  customerNote?: string;
  status: MarketplaceOrderStatus;
  merchantPhone?: string;
  createdAt: number;
  updatedAt: number;
  dispatchedAt?: number;
  decidedAt?: number;
  rejectionReason?: string;
}

export interface DispatchApiConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion?: string;
}

/**
 * MarketplaceOrderService — Manages end-to-end marketplace order lifecycles,
 * merchant dispatching via native WhatsApp interactive buttons, customer privacy
 * protection (anti-disintermediation), and real-time bidirectional status notifications.
 *
 * Architecture Role: Communication Capability Sub-Service (src/capabilities/communication/services/)
 * Strictly conforms to Rule 7 (Universal Codebase Language: English Standard).
 */
export class MarketplaceOrderService {
  private static instance: MarketplaceOrderService | null = null;
  private readonly orders = new Map<string, MarketplaceOrder>();
  private readonly userActiveOrder = new Map<string, string>(); // buyerPhone -> orderId
  private readonly filePath: string;
  private readonly persistLocally: boolean;

  constructor(options?: { persistLocally?: boolean; storageFilePath?: string }) {
    this.persistLocally = options?.persistLocally ?? true;
    this.filePath = options?.storageFilePath || path.resolve(process.cwd(), '.data', 'marketplace_orders.json');
    this.loadOrders();
  }

  public static getInstance(options?: { persistLocally?: boolean; storageFilePath?: string }): MarketplaceOrderService {
    if (!MarketplaceOrderService.instance) {
      MarketplaceOrderService.instance = new MarketplaceOrderService(options);
    }
    return MarketplaceOrderService.instance;
  }

  private loadOrders(): void {
    if (!this.persistLocally) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.orderId) {
              this.orders.set(item.orderId, item);
              if (item.buyerPhone && ['AWAITING_DETAILS', 'DISPATCHED_TO_MERCHANT', 'ACCEPTED', 'PREPARING'].includes(item.status)) {
                this.userActiveOrder.set(item.buyerPhone, item.orderId);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[MarketplaceOrderService] Failed to load local order records:', err.message);
    }
  }

  private saveOrders(): void {
    if (!this.persistLocally) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.orders.values());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('[MarketplaceOrderService] Failed to persist order records:', err.message);
    }
  }

  /**
   * Generates a concise, unique order identifier (e.g. ORD-M1K9X).
   */
  public generateOrderId(): string {
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const timeSuffix = Date.now().toString(36).slice(-4).toUpperCase();
    return `ORD-${timeSuffix}${randomSuffix}`;
  }

  /**
   * Creates a new pending order from an inbound WhatsApp catalog cart submission.
   */
  public createOrderFromCart(
    buyerPhone: string,
    store: StoreProfile,
    parsedOrder: ParsedIncomingOrder,
    buyerName?: string
  ): MarketplaceOrder {
    const cleanBuyerPhone = buyerPhone.replace(/[^0-9]/g, '');
    const cleanMerchantPhone = (store.ownerWhatsApp || '').replace(/[^0-9]/g, '');
    const orderId = this.generateOrderId();

    const items: MarketplaceOrderItem[] = parsedOrder.items.map((it) => ({
      retailer_id: it.product_retailer_id,
      name: it.product_retailer_id,
      quantity: it.quantity,
      price: it.item_price,
      subtotal: it.quantity * it.item_price
    }));

    const order: MarketplaceOrder = {
      orderId,
      storeId: store.storeId,
      storeName: store.storeName,
      buyerPhone: cleanBuyerPhone,
      buyerName: buyerName || 'Pelanggan',
      items,
      itemsTotal: parsedOrder.totalEstimated,
      deliveryFee: 0,
      totalAmount: parsedOrder.totalEstimated,
      deliveryMethod: 'DELIVERY', // default intent
      paymentMethod: 'QRIS', // default standard
      paymentStatus: 'PENDING',
      customerNote: parsedOrder.customerNote,
      status: 'AWAITING_DETAILS',
      merchantPhone: cleanMerchantPhone || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.orders.set(orderId, order);
    this.userActiveOrder.set(cleanBuyerPhone, orderId);
    this.saveOrders();

    console.log(`[MarketplaceOrderService] Created order ${orderId} for store "${store.storeName}" from buyer +${cleanBuyerPhone}. Awaiting full delivery details.`);
    return order;
  }

  public getOrder(orderId: string): MarketplaceOrder | undefined {
    return this.orders.get(orderId);
  }

  public getActiveOrderByBuyer(buyerPhone: string): MarketplaceOrder | undefined {
    const clean = buyerPhone.replace(/[^0-9]/g, '');
    const orderId = this.userActiveOrder.get(clean);
    if (!orderId) return undefined;
    return this.orders.get(orderId);
  }

  /**
   * Updates an existing order with delivery address, delivery method, payment method, or notes.
   */
  public updateOrder(orderId: string, updates: Partial<MarketplaceOrder>): MarketplaceOrder | undefined {
    const existing = this.orders.get(orderId);
    if (!existing) return undefined;

    const updated: MarketplaceOrder = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    };

    if (updates.itemsTotal !== undefined || updates.deliveryFee !== undefined) {
      const itemsTotal = updates.itemsTotal !== undefined ? updates.itemsTotal : existing.itemsTotal;
      const deliveryFee = updates.deliveryFee !== undefined ? updates.deliveryFee : existing.deliveryFee;
      updated.totalAmount = itemsTotal + deliveryFee;
    }

    this.orders.set(orderId, updated);
    this.saveOrders();
    return updated;
  }

  /**
   * Evaluates whether all required order details are present before dispatching to merchant.
   * Requirement: Items exist, delivery method is defined, delivery address is provided if DELIVERY,
   * and payment method is selected.
   */
  public isOrderComplete(order: MarketplaceOrder): boolean {
    if (!order.items || order.items.length === 0) return false;
    if (!order.deliveryMethod) return false;
    if (order.deliveryMethod === 'DELIVERY' && (!order.deliveryAddress || order.deliveryAddress.trim().length < 5)) {
      return false;
    }
    if (!order.paymentMethod) return false;
    return true;
  }

  /**
   * Formats the clean text body for the merchant alert.
   * STRICT POLICY CONSTRAINTS (USER MANDATE):
   * 1. NO EMOJIS OR ICONS.
   * 2. NEVER EXPOSE BUYER PHONE NUMBER (Anti-disintermediation / platform retention).
   * 3. EXPLICITLY INCLUDE PAYMENT METHOD AND DELIVERY METHOD.
   * 4. BREATHABLE STYLE B TYPOGRAPHY.
   */
  public formatMerchantAlert(order: MarketplaceOrder): string {
    const buyerDisplay = `${order.buyerName || 'Pelanggan'} (via SERA)`;
    const deliveryMethodLabel = order.deliveryMethod === 'SELF_PICKUP' ? 'Ambil Sendiri di Toko' : 'Diantar Kurir';
    const addressDisplay = order.deliveryMethod === 'SELF_PICKUP' ? 'Ambil Sendiri di Toko' : (order.deliveryAddress || 'Belum diisi');
    const paymentMethodLabel = `${order.paymentMethod || 'QRIS'} (${order.paymentStatus === 'PAID' ? 'Sudah Lunas' : 'Menunggu Pembayaran'})`;

    const itemLines = order.items.map((it, idx) => {
      const sub = it.subtotal || (it.quantity * it.price);
      return `${idx + 1}. ${it.name} (${it.quantity}x @ Rp ${it.price.toLocaleString('id-ID')}) - Rp ${sub.toLocaleString('id-ID')}`;
    }).join('\n');

    let text = `PESANAN BARU MASUK (#${order.orderId})\n` +
      `Toko: ${order.storeName}\n\n` +
      `Pembeli: ${buyerDisplay}\n` +
      `Alamat Pengiriman: ${addressDisplay}\n` +
      `Metode Pengiriman: ${deliveryMethodLabel}\n` +
      `Metode Pembayaran: ${paymentMethodLabel}\n`;

    if (order.customerNote && order.customerNote.trim()) {
      text += `Catatan Pembeli: "${order.customerNote.trim()}"\n`;
    }

    text += `\nRincian Pesanan:\n${itemLines}\n`;

    if (order.deliveryFee > 0) {
      text += `Ongkos Kirim: Rp ${order.deliveryFee.toLocaleString('id-ID')}\n`;
    }

    text += `------------------------------------\n` +
      `Total Pembayaran: Rp ${order.totalAmount.toLocaleString('id-ID')}\n\n` +
      `Silakan tentukan status pesanan:`;

    return text;
  }

  /**
   * Dispatches the complete order to the merchant's personal WhatsApp using native interactive buttons.
   * Will REFUSE to dispatch if order data is incomplete, fulfilling the user requirement.
   */
  public async dispatchToMerchant(
    orderId: string,
    apiConfig: DispatchApiConfig
  ): Promise<{ success: boolean; reason?: string }> {
    const order = this.orders.get(orderId);
    if (!order) {
      return { success: false, reason: 'ORDER_NOT_FOUND' };
    }

    if (!this.isOrderComplete(order)) {
      console.warn(`[MarketplaceOrderService] Refusing to dispatch incomplete order ${orderId}. Missing address or delivery/payment specification.`);
      return { success: false, reason: 'INCOMPLETE_DATA' };
    }

    if (!order.merchantPhone) {
      console.warn(`[MarketplaceOrderService] Order ${orderId} has no merchant phone configured.`);
      return { success: false, reason: 'MERCHANT_PHONE_NOT_CONFIGURED' };
    }

    const { accessToken, phoneNumberId, apiVersion = 'v21.0' } = apiConfig;
    if (!accessToken || !phoneNumberId) {
      return { success: false, reason: 'WHATSAPP_CREDENTIALS_MISSING' };
    }

    const cleanMerchantPhone = order.merchantPhone.replace(/[^0-9]/g, '');
    const bodyText = this.formatMerchantAlert(order);

    try {
      const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanMerchantPhone,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: bodyText
            },
            footer: {
              text: 'SERA Marketplace System'
            },
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: {
                    id: `order_accept_${order.orderId}`,
                    title: 'Terima Pesanan'
                  }
                },
                {
                  type: 'reply',
                  reply: {
                    id: `order_reject_${order.orderId}`,
                    title: 'Tolak Pesanan'
                  }
                }
              ]
            }
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[MarketplaceOrderService] Meta interactive button dispatch failed (${response.status}):`, errText);
        // Fallback to conversational plain text
        await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanMerchantPhone,
            type: 'text',
            text: {
              body: `${bodyText}\n\nKetik: "TERIMA ${order.orderId}" atau "TOLAK ${order.orderId}"`
            }
          })
        });
      }

      order.status = 'DISPATCHED_TO_MERCHANT';
      order.dispatchedAt = Date.now();
      order.updatedAt = Date.now();
      this.orders.set(orderId, order);
      this.saveOrders();

      console.log(`[MarketplaceOrderService] Order ${orderId} successfully dispatched to merchant +${cleanMerchantPhone}.`);
      return { success: true };
    } catch (err: any) {
      console.error(`[MarketplaceOrderService] Error dispatching order ${orderId}:`, err.message);
      return { success: false, reason: err.message };
    }
  }

  /**
   * Processes the merchant's decision when tapping "Terima Pesanan" or "Tolak Pesanan",
   * updates order status, confirms to the merchant, and notifies the buyer.
   */
  public async handleMerchantDecision(
    orderId: string,
    decision: 'ACCEPT' | 'REJECT',
    merchantPhone: string,
    apiConfig?: DispatchApiConfig
  ): Promise<{
    success: boolean;
    order?: MarketplaceOrder;
    merchantConfirmation: string;
    buyerNotification: string;
  }> {
    const order = this.orders.get(orderId);
    if (!order) {
      return {
        success: false,
        merchantConfirmation: `Pesanan #${orderId} tidak ditemukan di sistem.`,
        buyerNotification: ''
      };
    }

    const isAccept = decision === 'ACCEPT';
    order.status = isAccept ? 'ACCEPTED' : 'REJECTED';
    order.decidedAt = Date.now();
    order.updatedAt = Date.now();
    this.orders.set(orderId, order);
    this.saveOrders();

    // Prepare clean text responses (no emojis, professional tone)
    const merchantConfirmation = isAccept
      ? `Terima kasih. Pesanan #${order.orderId} telah Anda terima. Pembeli telah dikabari dan pesanan dapat segera dipersiapkan.`
      : `Pesanan #${order.orderId} telah ditolak. Pembeli telah dikabari bahwa pesanan tidak dapat diproses.`;

    const buyerNotification = isAccept
      ? `Kabar baik! Pesanan Anda (#${order.orderId}) telah diterima oleh ${order.storeName} dan sedang dipersiapkan.`
      : `Mohon maaf, pesanan Anda (#${order.orderId}) tidak dapat diproses oleh ${order.storeName} saat ini karena stok habis atau warung sedang berhalangan.`;

    // Asynchronously notify buyer via WhatsApp if apiConfig is provided
    if (apiConfig && apiConfig.accessToken && apiConfig.phoneNumberId && order.buyerPhone) {
      const { accessToken, phoneNumberId, apiVersion = 'v21.0' } = apiConfig;
      const cleanBuyer = order.buyerPhone.replace(/[^0-9]/g, '');
      const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

      fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanBuyer,
          type: 'text',
          text: { body: buyerNotification }
        })
      }).catch((e) => console.warn(`[MarketplaceOrderService] Failed to notify buyer +${cleanBuyer}:`, e.message));
    }

    console.log(`[MarketplaceOrderService] Order ${orderId} decided as ${decision} by merchant +${merchantPhone.replace(/[^0-9]/g, '')}.`);
    return {
      success: true,
      order,
      merchantConfirmation,
      buyerNotification
    };
  }
}
