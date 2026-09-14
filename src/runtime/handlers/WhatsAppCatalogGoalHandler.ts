import { WhatsAppCatalogService, CatalogProduct, CreateProductInput, UpdateProductInput } from '../../capabilities/communication/services/WhatsAppCatalogService';
import { StoreProfileService, StoreProfile, BusinessType } from '../../capabilities/communication/services/StoreProfileService';
import { EmitResultFn } from './types';

/**
 * WhatsAppCatalogGoalHandler — Handles catalog search, Single-Product Messages (SPM),
 * Multi-Product Messages (MPM), product CRUD mutations, and store profile/operating hours
 * within the GoalBridge execution layer.
 *
 * Architecture Role: Runtime Bridge Handler (src/runtime/handlers/)
 * Strictly conforms to Rule 7 (Universal Codebase Language: English Standard).
 */
export class WhatsAppCatalogGoalHandler {
  constructor(
    private readonly getCatalogService: () => WhatsAppCatalogService,
    private readonly sessionId: string,
    private readonly emitResult: EmitResultFn,
    private readonly getStoreService: () => StoreProfileService = () => StoreProfileService.getInstance()
  ) {}

  private get catalogService(): WhatsAppCatalogService {
    return this.getCatalogService();
  }

  private get storeService(): StoreProfileService {
    return this.getStoreService();
  }

  /**
   * Searches store catalog for products, prices, and availability.
   */
  public async handleSearchProducts(requestId: string, payload: any): Promise<void> {
    try {
      const query = String(payload?.query || payload?.searchTerm || payload?.q || '').trim();
      const products = await this.catalogService.searchProducts(query);

      const formattedProducts = products.map((p) => ({
        retailerId: p.retailer_id,
        name: p.name,
        price: p.price,
        rawPrice: p.rawPrice,
        currency: p.currency,
        availability: p.availability || 'in stock',
        brand: p.brand
      }));

      this.emitResult(requestId, true, {
        query,
        count: formattedProducts.length,
        products: formattedProducts,
        summary: `Found ${formattedProducts.length} product(s) matching "${query}".`
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to search products:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to search catalog products');
    }
  }

  /**
   * Prepares and dispatches a native interactive WhatsApp Single Product Message (SPM).
   */
  public async handleSendProduct(requestId: string, payload: any): Promise<void> {
    try {
      const retailerId = String(payload?.retailerId || payload?.productRetailerId || payload?.sku || '').trim();
      if (!retailerId) {
        throw new Error('Must provide retailerId / SKU for WHATSAPP_SEND_PRODUCT.');
      }

      const product = await this.catalogService.getProductByRetailerId(retailerId);
      if (!product) {
        throw new Error(`Product with SKU "${retailerId}" not found in store catalog.`);
      }

      const bodyText = payload?.bodyText || `${product.name} — Rp ${(product.rawPrice || 0).toLocaleString('id-ID')}`;

      this.emitResult(requestId, true, {
        product: {
          retailerId: product.retailer_id,
          name: product.name,
          price: product.price,
          currency: product.currency
        },
        message: `Interactive product card for "${product.name}" (${product.retailer_id}) has been prepared.`,
        richContent: {
          product: {
            retailerId: product.retailer_id,
            bodyText
          }
        }
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to prepare product card:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to send WhatsApp product card');
    }
  }

  /**
   * Prepares and dispatches a native interactive WhatsApp Multi-Product List (MPM) or Catalog link.
   */
  public async handleSendCatalog(requestId: string, payload: any): Promise<void> {
    try {
      const allProducts = await this.catalogService.getProducts();
      if (allProducts.length === 0) {
        throw new Error('No products available in the store catalog.');
      }

      const headerText = payload?.headerText || 'Katalog Sembako Pilihan';
      const bodyText = payload?.bodyText || 'Berikut daftar produk sembako siap pesan langsung dari WhatsApp:';

      // Group into logical sections (max 30 items total across all sections in WhatsApp MPM)
      const bahanPokok = allProducts.filter((p) =>
        /beras|minyak|gula|margarin|mentega|telur/i.test(p.name) || /SKU-(BERAS|MINYAK|GULA|MARGARIN|TELUR)/i.test(p.retailer_id)
      );
      const kebutuhanDapur = allProducts.filter((p) => !bahanPokok.includes(p));

      const sections: Array<{ title: string; productRetailerIds: string[] }> = [];

      if (bahanPokok.length > 0) {
        sections.push({
          title: 'Bahan Pokok Utama',
          productRetailerIds: bahanPokok.slice(0, 10).map((p) => p.retailer_id)
        });
      }

      if (kebutuhanDapur.length > 0) {
        sections.push({
          title: 'Kebutuhan Dapur & Minuman',
          productRetailerIds: kebutuhanDapur.slice(0, 10).map((p) => p.retailer_id)
        });
      }

      // Fallback if filtering yielded single flat list
      if (sections.length === 0) {
        sections.push({
          title: 'Produk Tersedia',
          productRetailerIds: allProducts.slice(0, 20).map((p) => p.retailer_id)
        });
      }

      this.emitResult(requestId, true, {
        totalProducts: allProducts.length,
        message: 'Interactive product catalog list has been prepared.',
        richContent: {
          productList: {
            headerText,
            bodyText,
            sections
          }
        }
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to prepare catalog list:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to send WhatsApp catalog');
    }
  }

  private resolveCallerPhone(payload: any): string {
    const raw = (
      payload?.ownerWhatsApp ||
      payload?.phone ||
      payload?._responseContext?.senderPhone ||
      payload?._responseContext?.channelId ||
      payload?._responseContext?.senderId ||
      (this.sessionId && /^[0-9+]{8,16}$/.test(this.sessionId) ? this.sessionId : undefined) ||
      process.env.OWNER_WHATSAPP ||
      ''
    );
    return String(raw).replace(/[^0-9]/g, '');
  }

  /**
   * Adds a new product or service to the Meta Commerce Catalog under the merchant's store brand.
   */
  public async handleCreateProduct(requestId: string, payload: any): Promise<void> {
    try {
      const name = String(payload?.name || payload?.productName || payload?.title || '').trim();
      const rawPrice = Number(payload?.price || payload?.rawPrice || 0);
      const callerPhone = this.resolveCallerPhone(payload);
      let storeName = String(payload?.storeName || payload?.brand || payload?.toko || '').trim();

      // If storeName was not provided, check if this merchant owns a store
      if (!storeName && callerPhone) {
        const ownedStore = this.storeService.getStoreByOwner(callerPhone);
        if (ownedStore) {
          storeName = ownedStore.storeName;
        }
      }
      if (!storeName) {
        storeName = 'SERA Mart';
      }

      const description = payload?.description || payload?.desc || undefined;
      const imageUrl = payload?.imageUrl || payload?.image_url || payload?.image || undefined;
      const category = payload?.category || payload?.kategori || undefined;
      const availability = payload?.availability === 'out of stock' ? 'out of stock' : 'in stock';

      if (!name || isNaN(rawPrice) || rawPrice <= 0) {
        throw new Error('Must provide valid product name and positive price for CATALOG_CREATE_PRODUCT.');
      }

      // Automatically register or update store brand in StoreProfileService if custom
      if (storeName && storeName.toLowerCase() !== 'sera mart') {
        await this.storeService.upsertStore({
          storeName,
          category,
          ownerWhatsApp: callerPhone || undefined,
          businessType: payload?.businessType || (/jasa|service|servis|cuci|mekanik|cleaning|laundry|potong/i.test(name) ? 'SERVICE' : 'GOODS')
        });
      }

      const res = await this.catalogService.createProduct({
        name,
        price: rawPrice,
        brand: storeName,
        description,
        image_url: imageUrl,
        category,
        availability,
        retailer_id: payload?.retailerId || payload?.sku
      });

      if (!res.success || !res.product) {
        throw new Error(res.error || 'Failed to create product in Meta Catalog');
      }

      this.emitResult(requestId, true, {
        product: res.product,
        message: `Produk "${res.product.name}" berhasil ditambahkan ke toko "${storeName}" dengan harga Rp ${rawPrice.toLocaleString('id-ID')}. Status: ${availability === 'in stock' ? 'Ready Stock' : 'Habis'}.`
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to create product:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to create catalog product');
    }
  }

  /**
   * Updates an existing product's price, description, or availability.
   */
  public async handleUpdateProduct(requestId: string, payload: any): Promise<void> {
    try {
      const targetQuery = String(payload?.retailerId || payload?.sku || payload?.query || payload?.name || '').trim();
      if (!targetQuery) {
        throw new Error('Must specify target product name or SKU/retailerId to update.');
      }

      let targetRetailerId = targetQuery;
      let existing = await this.catalogService.getProductByRetailerId(targetQuery);
      if (!existing) {
        const matches = await this.catalogService.searchProducts(targetQuery);
        if (matches.length > 0) {
          existing = matches[0];
          targetRetailerId = existing.retailer_id;
        } else {
          throw new Error(`Product matching "${targetQuery}" not found in catalog.`);
        }
      }

      const updates: UpdateProductInput = {};
      if (payload?.name) updates.name = String(payload.name).trim();
      if (payload?.description) updates.description = String(payload.description).trim();
      if (payload?.brand || payload?.storeName) updates.brand = String(payload.brand || payload.storeName).trim();
      if (payload?.imageUrl) updates.image_url = String(payload.imageUrl).trim();
      if (payload?.price !== undefined) {
        const num = Number(payload.price);
        if (!isNaN(num) && num > 0) updates.price = num;
      }
      if (payload?.availability) {
        updates.availability = payload.availability === 'out of stock' || payload.availability === 'habis' ? 'out of stock' : 'in stock';
      }

      const res = await this.catalogService.updateProduct(targetRetailerId, updates);
      if (!res.success || !res.product) {
        throw new Error(res.error || 'Failed to update product in Meta Catalog');
      }

      this.emitResult(requestId, true, {
        product: res.product,
        message: `Produk "${res.product.name}" (${res.product.retailer_id}) berhasil diperbarui. Harga: Rp ${(res.product.rawPrice || 0).toLocaleString('id-ID')}, Status: ${res.product.availability}.`
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to update product:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to update catalog product');
    }
  }

  /**
   * Deletes a product from the store catalog.
   */
  public async handleDeleteProduct(requestId: string, payload: any): Promise<void> {
    try {
      const targetQuery = String(payload?.retailerId || payload?.sku || payload?.query || payload?.name || '').trim();
      if (!targetQuery) {
        throw new Error('Must specify product name or SKU/retailerId to delete.');
      }

      let targetRetailerId = targetQuery;
      let existing = await this.catalogService.getProductByRetailerId(targetQuery);
      if (!existing) {
        const matches = await this.catalogService.searchProducts(targetQuery);
        if (matches.length > 0) {
          existing = matches[0];
          targetRetailerId = existing.retailer_id;
        } else {
          throw new Error(`Product matching "${targetQuery}" not found in catalog.`);
        }
      }

      const res = await this.catalogService.deleteProduct(targetRetailerId);
      if (!res.success) {
        throw new Error(res.error || 'Failed to delete product from Meta Catalog');
      }

      this.emitResult(requestId, true, {
        retailerId: targetRetailerId,
        productName: existing.name,
        message: `Produk "${existing.name}" (${targetRetailerId}) berhasil dihapus dari katalog.`
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to delete product:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to delete catalog product');
    }
  }

  /**
   * Configures store profile, operational schedule, business type, and owner contact.
   */
  public async handleConfigureStore(requestId: string, payload: any): Promise<void> {
    try {
      const callerPhone = this.resolveCallerPhone(payload);
      let storeName = String(payload?.storeName || payload?.name || '').trim();

      // If storeName was not provided, check if this merchant owns a store
      if (!storeName && callerPhone) {
        const ownedStore = this.storeService.getStoreByOwner(callerPhone);
        if (ownedStore) {
          storeName = ownedStore.storeName;
        }
      }

      if (!storeName) {
        throw new Error('Must provide storeName for STORE_CONFIG_PROFILE.');
      }

      const businessType: BusinessType = payload?.businessType === 'SERVICE' || payload?.type === 'SERVICE' ? 'SERVICE' : 'GOODS';
      const open = payload?.openTime || payload?.open;
      const close = payload?.closeTime || payload?.close;
      const days = Array.isArray(payload?.days) ? payload.days : undefined;

      const store = await this.storeService.upsertStore({
        storeName,
        businessType,
        category: payload?.category || payload?.kategori,
        ownerWhatsApp: callerPhone || undefined,
        address: payload?.address || payload?.alamat,
        coverageArea: payload?.coverageArea || payload?.area,
        description: payload?.description || payload?.deskripsi,
        timezone: payload?.timezone,
        operatingHours: open && close ? { open, close, days: days || [1, 2, 3, 4, 5, 6, 7] } : undefined,
        isOpenManualOverride: payload?.isOpenManual !== undefined ? payload.isOpenManual : undefined,
        allowPreOrder: payload?.allowPreOrder !== undefined ? payload.allowPreOrder : undefined,
        notice: payload?.notice
      });

      const status = this.storeService.isStoreOpenNow(store.storeId);

      this.emitResult(requestId, true, {
        store,
        status,
        message: `Profil toko "${store.storeName}" berhasil diperbarui. Tipe: ${store.businessType}. Jam Operasional: ${store.operatingHours.open} - ${store.operatingHours.close} WIB. Status Saat Ini: ${status.statusText}.`
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to configure store:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to configure store profile');
    }
  }

  /**
   * Checks current operating status (open/closed, next opening time, pre-order eligibility) of a store.
   */
  public async handleCheckStoreStatus(requestId: string, payload: any): Promise<void> {
    try {
      const storeName = String(payload?.storeName || payload?.store || payload?.toko || 'SERA Mart').trim();
      const status = this.storeService.isStoreOpenNow(storeName);

      this.emitResult(requestId, true, {
        storeName: status.store.storeName,
        businessType: status.store.businessType,
        isOpen: status.isOpen,
        statusText: status.statusText,
        reason: status.reason,
        allowPreOrder: status.allowPreOrder,
        operatingHours: status.store.operatingHours,
        ownerWhatsApp: status.store.ownerWhatsApp,
        message: `Toko "${status.store.storeName}" saat ini: ${status.statusText}. Jadwal: ${status.store.operatingHours.open} - ${status.store.operatingHours.close} WIB (${status.allowPreOrder ? 'Menerima Pre-order' : 'Tidak menerima pesanan di luar jam buka'}).`
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to check store status:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to check store status');
    }
  }
}

