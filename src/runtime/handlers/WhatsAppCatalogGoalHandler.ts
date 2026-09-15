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
   * Strictly enforces single-store isolation — products from different merchants never mix.
   */
  public async handleSendCatalog(requestId: string, payload: any): Promise<void> {
    try {
      const storeService = StoreProfileService.getInstance();
      const allStores = storeService.listStores();

      let targetStore = String(payload?.storeName || payload?.store || payload?.brand || '').trim();

      // If targetStore not explicitly provided, try to extract from headerText or bodyText
      if (!targetStore) {
        const searchText = `${payload?.headerText || ''} ${payload?.bodyText || ''}`.toLowerCase();
        for (const s of allStores) {
          if (searchText.includes(s.storeName.toLowerCase()) || searchText.includes(s.storeId.toLowerCase())) {
            targetStore = s.storeName;
            break;
          }
        }
        // Also check if text matches common store nicknames like "cak jiban" or "geprek"
        if (!targetStore) {
          if (searchText.includes('geprek') || searchText.includes('jiban')) {
            targetStore = 'Geprek Cak Jiban';
          } else if (searchText.includes('sera mart') || searchText.includes('sembako')) {
            targetStore = 'SERA Mart';
          }
        }
      }

      let allProducts: CatalogProduct[] = [];

      if (targetStore) {
        allProducts = await this.catalogService.getProductsByBrand(targetStore);
        if (allProducts.length === 0) {
          throw new Error(`Belum ada produk yang terdaftar untuk toko "${targetStore}".`);
        }
      } else {
        // If no store specified, do NOT mix multiple stores into one MPM!
        // If there's only 1 registered store, default to it
        if (allStores.length === 1) {
          targetStore = allStores[0].storeName;
          allProducts = await this.catalogService.getProductsByBrand(targetStore);
        } else {
          // Guide user to select a store first (Level 2 Store Discovery)
          return this.handleDiscoverNearbyStores(requestId, payload);
        }
      }

      if (allProducts.length === 0) {
        throw new Error('Belum ada produk yang tersedia di katalog toko.');
      }

      const displayStoreName = targetStore || 'SERA Marketplace';
      const headerText = payload?.headerText || `${displayStoreName}`;
      const bodyText = payload?.bodyText || `Berikut daftar produk siap pesan dari ${displayStoreName}:`;

      // Group products dynamically by category
      const catMap = new Map<string, string[]>();
      for (const p of allProducts) {
        const cat = p.category || 'Menu Utama';
        if (!catMap.has(cat)) catMap.set(cat, []);
        catMap.get(cat)!.push(p.retailer_id);
      }

      const sections: Array<{ title: string; productRetailerIds: string[] }> = [];
      for (const [title, ids] of catMap.entries()) {
        sections.push({
          title: title.slice(0, 24),
          productRetailerIds: ids.slice(0, 10)
        });
        if (sections.length >= 3) break; // Max 3 sections in MPM
      }

      // Fallback if empty sections
      if (sections.length === 0) {
        sections.push({
          title: 'Produk Tersedia',
          productRetailerIds: allProducts.slice(0, 20).map((p) => p.retailer_id)
        });
      }

      this.emitResult(requestId, true, {
        storeName: displayStoreName,
        totalProducts: allProducts.length,
        message: `Katalog interaktif untuk "${displayStoreName}" telah disiapkan.`,
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
        stockQuantity: payload?.stockQuantity !== undefined ? Number(payload.stockQuantity) : undefined,
        retailer_id: payload?.retailerId || payload?.sku
      });

      if (!res.success || !res.product) {
        throw new Error(res.error || 'Failed to create product in Meta Catalog');
      }

      const stockMsg = res.product.stockQuantity !== undefined ? ` • Stok: ${res.product.stockQuantity}` : '';
      this.emitResult(requestId, true, {
        product: res.product,
        message: `Produk "${res.product.name}" berhasil ditambahkan ke toko "${storeName}" dengan harga Rp ${rawPrice.toLocaleString('id-ID')}. Status: ${availability === 'in stock' ? 'Ready Stock' : 'Habis'}${stockMsg}.`
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to create product:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to create catalog product');
    }
  }

  /**
   * Fast Store & Bulk Product Creation: Adds a store profile and multiple products simultaneously.
   */
  public async handleBulkCreateProducts(requestId: string, payload: any): Promise<void> {
    try {
      const callerPhone = this.resolveCallerPhone(payload);
      let storeName = String(payload?.storeName || payload?.name || payload?.brand || '').trim();
      if (!storeName && callerPhone) {
        const ownedStore = this.storeService.getStoreByOwner(callerPhone);
        if (ownedStore) storeName = ownedStore.storeName;
      }
      if (!storeName) {
        storeName = 'Toko ' + (callerPhone ? callerPhone.slice(-4) : 'Baru');
      }

      const category = payload?.category || payload?.kategori || 'Kuliner';
      const businessType = payload?.businessType || (/jasa|service|servis|cuci|mekanik|laundry/i.test(category) ? 'SERVICE' : 'GOODS');
      const address = payload?.address || payload?.alamat;
      const lat = payload?.latitude ? Number(payload.latitude) : undefined;
      const lng = payload?.longitude ? Number(payload.longitude) : undefined;

      // Upsert store profile
      const store = await this.storeService.upsertStore({
        storeName,
        category,
        businessType,
        address,
        latitude: lat,
        longitude: lng,
        ownerWhatsApp: callerPhone || undefined
      });

      const rawProducts = Array.isArray(payload?.products) ? payload.products : [];
      if (rawProducts.length === 0) {
        throw new Error('Must provide at least one product in products array for CATALOG_BULK_CREATE_PRODUCTS.');
      }

      const inputs: CreateProductInput[] = rawProducts.map((p: any, idx: number) => {
        const pName = String(p.name || p.title || `Item ${idx + 1}`).trim();
        const pPrice = Number(p.price || p.rawPrice || 0);
        return {
          name: pName,
          price: pPrice > 0 ? pPrice : 10000,
          brand: store.storeName,
          category: p.category || category,
          description: p.description || p.desc || undefined,
          image_url: p.imageUrl || p.image_url || p.image || undefined,
          availability: p.availability === 'out of stock' ? 'out of stock' : 'in stock',
          stockQuantity: p.stockQuantity !== undefined ? Number(p.stockQuantity) : undefined,
          variants: Array.isArray(p.variants) ? p.variants : undefined
        };
      });

      const batchRes = await this.catalogService.createProductsBatch(inputs);

      this.emitResult(requestId, true, {
        store,
        successCount: batchRes.successCount,
        failedCount: batchRes.failedCount,
        products: batchRes.createdProducts,
        message: `Toko "${store.storeName}" (${store.address || 'Alamat fisik menyusul'}) dan ${batchRes.successCount} produk berhasil didaftarkan ke katalog WhatsApp!`
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed bulk create products:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to bulk create products');
    }
  }

  /**
   * Discovers stores within a given radius using Haversine distance, with operational status and category filter.
   */
  public async handleDiscoverNearbyStores(requestId: string, payload: any): Promise<void> {
    try {
      const lat = payload?.latitude !== undefined ? Number(payload.latitude) : undefined;
      const lng = payload?.longitude !== undefined ? Number(payload.longitude) : undefined;
      const category = payload?.category || payload?.kategori;
      const maxDistanceKm = Number(payload?.maxDistanceKm || payload?.radiusKm || 15);

      // Center coordinates fallback
      const targetLat = lat !== undefined ? lat : -6.2088;
      const targetLng = lng !== undefined ? lng : 106.8456;

      const nearby = this.storeService.findNearbyStores(targetLat, targetLng, category, maxDistanceKm);
      const topStores = nearby.slice(0, 10);

      const storeListFormatted = topStores.map((s) => ({
        storeId: s.store.storeId,
        storeName: s.store.storeName,
        category: s.store.category,
        address: s.store.address || 'Alamat belum diatur',
        distanceKm: s.distanceKm,
        isOpen: s.isOpen,
        statusText: s.statusText,
        operatingHours: `${s.store.operatingHours.open} - ${s.store.operatingHours.close}`
      }));

      const summaryText = topStores.length > 0
        ? `Menemukan ${topStores.length} toko/layanan terdaftar${category ? ` (${category})` : ''}:\n\n` +
          topStores.map((s, i) => `${i + 1}. *${s.store.storeName}* (${s.store.category || 'Toko'})\n   📍 ${s.store.address || 'Alamat belum diatur'}\n   ${s.isOpen ? '🟢' : '🔴'} ${s.statusText} • ${s.distanceKm} km`).join('\n\n')
        : `Belum ada toko yang terdaftar di sekitar lokasi Anda.`;

      this.emitResult(requestId, true, {
        count: topStores.length,
        category,
        stores: storeListFormatted,
        summary: summaryText,
        richContent: {
          storeList: {
            title: `Toko Terdekat${category ? ` (${category})` : ''}`,
            stores: topStores.map((s) => ({
              id: `store_${s.store.storeId}`,
              title: s.store.storeName,
              description: `${s.distanceKm > 0 ? `${s.distanceKm} km • ` : ''}${s.statusText}${s.store.address ? ` • 📍 ${s.store.address}` : ''}`
            }))
          },
          buttons: topStores.length > 0 && topStores.length <= 3
            ? topStores.map((s) => ({
                id: `store_${s.store.storeId}`,
                title: s.store.storeName.slice(0, 20)
              }))
            : undefined
        },
        message: summaryText
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to discover nearby stores:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to discover nearby stores');
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
      if (payload?.stockQuantity !== undefined) {
        const sq = Number(payload.stockQuantity);
        if (!isNaN(sq) && sq >= 0) updates.stockQuantity = sq;
      }

      const res = await this.catalogService.updateProduct(targetRetailerId, updates);
      if (!res.success || !res.product) {
        throw new Error(res.error || 'Failed to update product in Meta Catalog');
      }

      const stockMsg = res.product.stockQuantity !== undefined ? ` • Stok: ${res.product.stockQuantity}` : '';
      this.emitResult(requestId, true, {
        product: res.product,
        message: `Produk "${res.product.name}" (${res.product.retailer_id}) berhasil diperbarui. Harga: Rp ${(res.product.rawPrice || 0).toLocaleString('id-ID')}, Status: ${res.product.availability}${stockMsg}.`
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to update product:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to update catalog product');
    }
  }

  /**
   * Sets or updates the numerical stock quantity for a product or menu item.
   */
  public async handleSetStock(requestId: string, payload: any): Promise<void> {
    try {
      const query = String(payload?.query || payload?.retailerId || payload?.sku || payload?.name || '').trim();
      const stockQuantity = Number(payload?.stockQuantity !== undefined ? payload.stockQuantity : (payload?.stock !== undefined ? payload.stock : payload?.quantity));

      if (!query) {
        throw new Error('Must provide product name or SKU to set stock.');
      }
      if (isNaN(stockQuantity) || stockQuantity < 0) {
        throw new Error('Stock quantity must be a non-negative number.');
      }

      const res = await this.catalogService.setProductStock(query, stockQuantity);
      if (!res.success) {
        throw new Error('Failed to set product stock.');
      }

      const prodName = res.product?.name || query;
      const statusText = stockQuantity === 0 ? 'Habis (Out of Stock)' : `Tersedia (${res.stock} unit/porsi)`;

      this.emitResult(requestId, true, {
        product: res.product,
        stock: res.stock,
        triggeredOutOfStock: res.triggeredOutOfStock,
        message: `Stok untuk "${prodName}" berhasil diatur menjadi ${res.stock}. Status katalog WhatsApp: ${statusText}.`
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to set stock:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to set product stock');
    }
  }

  /**
   * Adjusts (deducts or restores) stock quantity upon order confirmation or cancellation/refund.
   */
  public async handleAdjustStock(requestId: string, payload: any): Promise<void> {
    try {
      const query = String(payload?.query || payload?.retailerId || payload?.sku || payload?.name || '').trim();
      const change = Number(payload?.change !== undefined ? payload.change : payload?.amount);
      const reason = String(payload?.reason || 'manual_adjustment');

      if (!query) {
        throw new Error('Must provide product name or SKU to adjust stock.');
      }
      if (isNaN(change) || change === 0) {
        throw new Error('Adjustment change must be a non-zero number.');
      }

      let res: any;
      if (change < 0) {
        res = await this.catalogService.deductProductStock(query, Math.abs(change));
      } else {
        res = await this.catalogService.restoreProductStock(query, change);
      }

      const remainingText = res.remaining !== undefined ? `Sisa stok sekarang: ${res.remaining}` : 'Stok produk ini tidak dilacak angka.';
      this.emitResult(requestId, true, {
        remaining: res.remaining,
        triggeredOutOfStock: res.triggeredOutOfStock,
        triggeredInStock: res.triggeredInStock,
        message: `Stok "${query}" disesuaikan (${change > 0 ? `+${change}` : change}, alasan: ${reason}). ${remainingText}`
      });
    } catch (err: any) {
      console.error('[WhatsAppCatalogGoalHandler] Failed to adjust stock:', err.message);
      this.emitResult(requestId, false, {}, err.message || 'Failed to adjust product stock');
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

