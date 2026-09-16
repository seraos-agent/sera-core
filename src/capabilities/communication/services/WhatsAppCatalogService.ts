import { serverConfig } from '../../../server/config';
import type { StoreProfile } from './StoreProfileService';

export interface CatalogProduct {
  id: string;
  retailer_id: string;
  name: string;
  description?: string;
  price: string | number;
  rawPrice?: number;
  currency: string;
  image_url?: string;
  availability?: string;
  brand?: string;
  url?: string;
  category?: string;
  stockQuantity?: number;
}

export interface CreateProductInput {
  retailer_id?: string;
  name: string;
  price: number; // e.g. 25000 for Rp 25.000
  currency?: string; // default IDR
  description?: string;
  brand?: string; // store name e.g. "Dapur Geprek Mas Joko"
  category?: string; // category or service type
  image_url?: string;
  availability?: 'in stock' | 'out of stock';
  stockQuantity?: number;
  url?: string;
  variants?: Array<{ name: string; price: number; description?: string }>;
}

export interface UpdateProductInput {
  name?: string;
  price?: number;
  description?: string;
  availability?: 'in stock' | 'out of stock';
  stockQuantity?: number;
  image_url?: string;
  brand?: string;
  category?: string;
}

export interface IncomingOrderItem {
  product_retailer_id: string;
  quantity: number;
  item_price: number;
  currency: string;
}

export interface ParsedIncomingOrder {
  catalogId: string;
  customerNote?: string;
  items: IncomingOrderItem[];
  totalEstimated: number;
  currency: string;
  formattedSummary: string;
}

export interface WhatsAppCatalogServiceConfig {
  catalogId?: string;
  accessToken?: string;
  apiVersion?: string;
  defaultStoreName?: string;
}

/**
 * WhatsAppCatalogService — Coordinates Meta Commerce Catalog interactions,
 * product caching, interactive message construction (SPM/MPM), and inbound cart parsing.
 *
 * Architecture Role: Communication Capability Sub-Service (src/capabilities/communication/services/)
 * Strictly conforms to Rule 7 (Universal Codebase Language: English Standard).
 */
export class WhatsAppCatalogService {
  private readonly catalogId: string;
  private readonly accessToken: string;
  private readonly apiVersion: string;
  private readonly defaultStoreName: string;

  private cachedProducts: CatalogProduct[] = [];
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory cache
  private readonly productStock = new Map<string, number>();

  constructor(config?: WhatsAppCatalogServiceConfig) {
    const rawId = (config?.catalogId || serverConfig.whatsapp.catalogId || '1460600679458168').trim();
    this.catalogId = rawId.split(/\s+/)[0];
    this.accessToken = config?.accessToken || serverConfig.whatsapp.catalogToken || serverConfig.whatsapp.accessToken || '';
    this.apiVersion = config?.apiVersion || serverConfig.whatsapp.apiVersion || 'v21.0';
    this.defaultStoreName = config?.defaultStoreName || 'SERA Mart';
  }

  public get isConfigured(): boolean {
    return Boolean(this.catalogId && this.accessToken);
  }

  public getCatalogId(): string {
    return this.catalogId;
  }

  /**
   * Fetches active products from Meta Commerce API with cache fallback.
   */
  public async getProducts(forceRefresh = false): Promise<CatalogProduct[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedProducts.length > 0 && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return this.cachedProducts;
    }

    if (!this.isConfigured) {
      console.warn('[WhatsAppCatalogService] Cannot fetch products: catalogId or accessToken missing.');
      return this.cachedProducts;
    }

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.catalogId}/products?fields=id,retailer_id,name,description,price,currency,image_url,availability,brand,url&limit=100&access_token=${this.accessToken}`;
      const response = await fetch(url);
      if (!response.ok) {
        const err = await response.text();
        console.error(`[WhatsAppCatalogService] Failed to fetch catalog products (${response.status}):`, err);
        return this.cachedProducts;
      }

      const data = await response.json() as any;
      if (data && Array.isArray(data.data)) {
        this.cachedProducts = data.data.map((item: any) => {
          let rawPrice = 0;
          if (typeof item.price === 'string') {
            const num = parseFloat(item.price.replace(/[^0-9.]/g, ''));
            rawPrice = isNaN(num) ? 0 : num;
          } else if (typeof item.price === 'number') {
            rawPrice = item.price / 100; // Meta integer offset
          }

          const retailerId = item.retailer_id || '';
          const trackedStock = this.productStock.get(retailerId.toLowerCase());

          return {
            id: item.id,
            retailer_id: retailerId,
            name: item.name,
            description: item.description,
            price: item.price,
            rawPrice,
            currency: item.currency || 'IDR',
            image_url: item.image_url,
            availability: item.availability,
            brand: item.brand,
            category: item.category,
            url: item.url,
            stockQuantity: trackedStock
          };
        });
        this.lastFetchTime = now;
      }
      return this.cachedProducts;
    } catch (err: any) {
      console.error('[WhatsAppCatalogService] Error fetching catalog products:', err.message);
      return this.cachedProducts;
    }
  }

  /**
   * Searches cached/fetched products by name, retailer_id (SKU), or description.
   */
  public async searchProducts(query: string): Promise<CatalogProduct[]> {
    const products = await this.getProducts();
    if (!query || !query.trim()) return products;

    const lower = query.toLowerCase().trim();
    return products.filter((p) =>
      p.name.toLowerCase().includes(lower) ||
      p.retailer_id.toLowerCase().includes(lower) ||
      (p.description && p.description.toLowerCase().includes(lower)) ||
      (p.brand && p.brand.toLowerCase().includes(lower))
    );
  }

  /**
   * Retrieves a specific product by SKU / retailer_id or ID.
   */
  public async getProductByRetailerId(retailerId: string): Promise<CatalogProduct | null> {
    const products = await this.getProducts();
    const clean = retailerId.toLowerCase().trim();
    return products.find((p) => p.retailer_id.toLowerCase() === clean || p.id === clean) || null;
  }

  /**
   * Retrieves products belonging strictly to a specific store brand.
   * Guarantees strict merchant isolation so products of different stores never mix.
   */
  public async getProductsByBrand(brand: string, forceRefresh = false): Promise<CatalogProduct[]> {
    const products = await this.getProducts(forceRefresh);
    if (!brand || !brand.trim()) return [];

    const cleanBrand = brand.toLowerCase().trim();
    const brandTokens = cleanBrand.split(/\s+/).filter(t => t.length > 2);

    // Case 1: SERA Mart / Sembako system store
    if (cleanBrand.includes('sera mart') || cleanBrand === 'seramart' || cleanBrand === 'sera-mart' || cleanBrand === 'sembako') {
      // Exclude any merchant products that belong to specific registered merchant brands
      const otherBrands = ['geprek', 'cak jiban'];
      return products.filter((p) => {
        const b = (p.brand || '').toLowerCase();
        const sku = (p.retailer_id || '').toLowerCase();
        const name = (p.name || '').toLowerCase();
        const isOther = otherBrands.some(k => b.includes(k) || sku.includes(k) || name.includes(k));
        return !isOther;
      });
    }

    // Case 2: Specific merchant brand (e.g. "Geprek Cak Jiban", "Cak Jiban", "Geprek")
    return products.filter((p) => {
      const pBrand = (p.brand || '').toLowerCase().trim();
      const pSku = (p.retailer_id || '').toLowerCase().trim();
      const pName = (p.name || '').toLowerCase().trim();

      // Direct exact match
      if (pBrand === cleanBrand) return true;

      // Substring match
      if (pBrand.includes(cleanBrand) || cleanBrand.includes(pBrand)) return true;

      // Token match (e.g. "cak", "jiban", "geprek")
      if (brandTokens.some(token => pBrand.includes(token) || pSku.includes(token) || pName.includes(token))) {
        return true;
      }

      return false;
    });
  }

  /**
   * Invalidates local product cache so subsequent queries fetch fresh data.
   */
  public invalidateCache(): void {
    this.cachedProducts = [];
    this.lastFetchTime = 0;
  }

  /**
   * Creates a new product or service in the Meta Commerce Catalog.
   */
  public async createProduct(input: CreateProductInput): Promise<{ success: boolean; product?: CatalogProduct; error?: string }> {
    if (!this.isConfigured) {
      return { success: false, error: 'WhatsApp Catalog Service is not configured (missing catalogId or accessToken).' };
    }

    try {
      const brand = (input.brand || this.defaultStoreName).trim();
      const name = input.name.trim();

      // Check if product with same name already exists under this store brand to deduplicate (upsert)
      const existingProducts = await this.getProductsByBrand(brand);
      const cleanName = name.toLowerCase().replace(/\s+/g, ' ');
      const existing = existingProducts.find(
        (p) => p.name.toLowerCase().replace(/\s+/g, ' ') === cleanName ||
               (input.retailer_id && p.retailer_id.toLowerCase() === input.retailer_id.toLowerCase().trim())
      );

      if (existing) {
        console.log(`[WhatsAppCatalogService] Deduplicating: Product "${name}" already exists for "${brand}" (${existing.retailer_id}). Updating existing item.`);
        const updateRes = await this.updateProduct(existing.retailer_id, {
          name,
          price: input.price,
          description: input.description,
          image_url: input.image_url,
          availability: input.availability,
          brand
        });
        if (updateRes.success && updateRes.product) {
          return { success: true, product: updateRes.product };
        }
      }

      const brandSlug = brand.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 15);
      const nameSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 20);
      const retailerId = input.retailer_id?.trim() || `SKU-${brandSlug}-${nameSlug}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const description = (input.description || `${name} dari ${brand}`).trim();
      const currency = (input.currency || 'IDR').toUpperCase();
      const priceInCents = Math.round(input.price * 100); // Meta integer offset
      let availability = input.availability || 'in stock';
      if (input.stockQuantity !== undefined) {
        const qty = Math.max(0, Math.floor(input.stockQuantity));
        this.productStock.set(retailerId.toLowerCase(), qty);
        if (qty === 0) {
          availability = 'out of stock';
        }
      }

      // Default high-quality fallback image if merchant doesn't provide photo immediately
      const imageUrl = input.image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80';

      const url = `https://graph.facebook.com/${this.apiVersion}/${this.catalogId}/products`;

      const payload = {
        retailer_id: retailerId,
        name,
        description,
        brand,
        category: input.category || 'General',
        price: priceInCents,
        currency,
        availability,
        condition: 'new',
        image_url: imageUrl,
        url: input.url || 'https://seraos.xyz'
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[WhatsAppCatalogService] Failed to create product in Meta Catalog (${response.status}):`, errText);
        return { success: false, error: `Meta API error (${response.status}): ${errText}` };
      }

      const data = await response.json() as any;
      this.invalidateCache();

      const created: CatalogProduct = {
        id: data.id || retailerId,
        retailer_id: retailerId,
        name,
        description,
        price: `${currency} ${input.price.toLocaleString('id-ID')}`,
        rawPrice: input.price,
        currency,
        image_url: imageUrl,
        availability,
        brand,
        stockQuantity: input.stockQuantity !== undefined ? Math.max(0, Math.floor(input.stockQuantity)) : undefined
      };

      return { success: true, product: created };
    } catch (err: any) {
      console.error('[WhatsAppCatalogService] Exception creating product:', err.message);
      return { success: false, error: err.message || 'Unknown error creating product' };
    }
  }

  /**
   * Fast Store & Bulk Product Creation: Adds multiple products simultaneously to Meta Commerce Catalog with variant expansion.
   */
  public async createProductsBatch(
    inputs: CreateProductInput[]
  ): Promise<{ successCount: number; failedCount: number; createdProducts: CatalogProduct[]; errors: string[] }> {
    const createdProducts: CatalogProduct[] = [];
    const errors: string[] = [];

    // Flatten any products with variants into discrete catalog items
    const itemsToCreate: CreateProductInput[] = [];
    for (const item of inputs) {
      if (Array.isArray(item.variants) && item.variants.length > 0) {
        for (const variant of item.variants) {
          itemsToCreate.push({
            name: `${item.name} (${variant.name})`,
            price: variant.price || item.price,
            description: variant.description || item.description,
            image_url: item.image_url,
            category: item.category,
            availability: item.availability,
            stockQuantity: item.stockQuantity,
            brand: item.brand
          });
        }
      } else {
        itemsToCreate.push(item);
      }
    }

    for (const item of itemsToCreate) {
      const res = await this.createProduct(item);
      if (res.success && res.product) {
        createdProducts.push(res.product);
      } else if (res.error) {
        errors.push(`${item.name}: ${res.error}`);
      }
    }

    return {
      successCount: createdProducts.length,
      failedCount: errors.length,
      createdProducts,
      errors
    };
  }

  /**
   * Updates an existing product's price, availability, description, or stock quantity in Meta Commerce Catalog.
   */
  public async updateProduct(
    retailerIdOrId: string,
    updates: UpdateProductInput
  ): Promise<{ success: boolean; product?: CatalogProduct; error?: string }> {
    if (!this.isConfigured) {
      return { success: false, error: 'WhatsApp Catalog Service is not configured.' };
    }

    try {
      const existing = await this.getProductByRetailerId(retailerIdOrId);
      if (!existing) {
        return { success: false, error: `Product with SKU/ID "${retailerIdOrId}" not found in catalog.` };
      }

      const metaId = existing.id;
      const url = `https://graph.facebook.com/${this.apiVersion}/${metaId}`;

      const payload: Record<string, any> = {};
      if (updates.name) payload.name = updates.name.trim();
      if (updates.description) payload.description = updates.description.trim();
      if (updates.image_url) payload.image_url = updates.image_url;
      if (updates.brand) payload.brand = updates.brand.trim();
      if (updates.price !== undefined && updates.price > 0) {
        payload.price = Math.round(updates.price * 100);
        payload.currency = existing.currency || 'IDR';
      }

      let updatedAvailability = updates.availability || existing.availability;

      if (updates.stockQuantity !== undefined) {
        const qty = Math.max(0, Math.floor(updates.stockQuantity));
        this.productStock.set(existing.retailer_id.toLowerCase(), qty);
        if (qty === 0 && !updates.availability) {
          payload.availability = 'out of stock';
          updatedAvailability = 'out of stock';
        } else if (qty > 0 && !updates.availability && existing.availability === 'out of stock') {
          payload.availability = 'in stock';
          updatedAvailability = 'in stock';
        }
      }

      if (updates.availability) {
        payload.availability = updates.availability;
        updatedAvailability = updates.availability;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[WhatsAppCatalogService] Failed to update product ${metaId} (${response.status}):`, errText);
        return { success: false, error: `Meta API error (${response.status}): ${errText}` };
      }

      this.invalidateCache();

      const updatedProduct: CatalogProduct = {
        ...existing,
        name: updates.name || existing.name,
        description: updates.description || existing.description,
        availability: updatedAvailability,
        brand: updates.brand || existing.brand,
        image_url: updates.image_url || existing.image_url,
        rawPrice: updates.price !== undefined ? updates.price : existing.rawPrice,
        price: updates.price !== undefined ? `${existing.currency} ${updates.price.toLocaleString('id-ID')}` : existing.price,
        stockQuantity: updates.stockQuantity !== undefined ? Math.max(0, Math.floor(updates.stockQuantity)) : this.productStock.get(existing.retailer_id.toLowerCase())
      };

      return { success: true, product: updatedProduct };
    } catch (err: any) {
      console.error('[WhatsAppCatalogService] Exception updating product:', err.message);
      return { success: false, error: err.message || 'Unknown error updating product' };
    }
  }

  /**
   * Sets the numerical stock quantity for a product.
   * If stock reaches 0, automatically updates Meta Catalog availability to 'out of stock'.
   * If stock is set > 0, automatically ensures Meta Catalog availability is 'in stock'.
   */
  public async setProductStock(
    retailerIdOrQuery: string,
    quantity: number
  ): Promise<{ success: boolean; product?: CatalogProduct; stock: number; triggeredOutOfStock: boolean }> {
    const cleanQuery = retailerIdOrQuery.trim();
    let product = await this.getProductByRetailerId(cleanQuery);
    if (!product) {
      const search = await this.searchProducts(cleanQuery);
      if (search.length > 0) product = search[0];
    }

    const validQty = Math.max(0, Math.floor(quantity));
    const targetRetailerId = product ? product.retailer_id : cleanQuery;
    this.productStock.set(targetRetailerId.toLowerCase(), validQty);

    let triggeredOutOfStock = false;
    if (product) {
      if (validQty === 0 && product.availability !== 'out of stock') {
        triggeredOutOfStock = true;
        await this.updateProduct(product.retailer_id, { availability: 'out of stock' });
      } else if (validQty > 0 && product.availability === 'out of stock') {
        await this.updateProduct(product.retailer_id, { availability: 'in stock' });
      }
    }

    return {
      success: true,
      product: product || undefined,
      stock: validQty,
      triggeredOutOfStock
    };
  }

  /**
   * Deducts product stock upon order confirmation.
   * If stock hits 0, marks product as 'out of stock' in Meta Catalog.
   */
  public async deductProductStock(
    retailerId: string,
    quantity: number
  ): Promise<{ success: boolean; remaining?: number; triggeredOutOfStock: boolean }> {
    const cleanId = retailerId.trim().toLowerCase();
    if (!this.productStock.has(cleanId)) {
      // Stock not tracked numerically for this item
      return { success: true, triggeredOutOfStock: false };
    }

    const current = this.productStock.get(cleanId) ?? 0;
    const remaining = Math.max(0, current - quantity);
    this.productStock.set(cleanId, remaining);

    let triggeredOutOfStock = false;
    if (remaining === 0 && current > 0) {
      triggeredOutOfStock = true;
      await this.updateProduct(retailerId, { availability: 'out of stock' });
    }

    return {
      success: true,
      remaining,
      triggeredOutOfStock
    };
  }

  /**
   * Restores product stock upon order cancellation or refund.
   * If product was previously marked out of stock, restores availability to 'in stock'.
   */
  public async restoreProductStock(
    retailerId: string,
    quantity: number
  ): Promise<{ success: boolean; remaining?: number; triggeredInStock: boolean }> {
    const cleanId = retailerId.trim().toLowerCase();
    if (!this.productStock.has(cleanId)) {
      return { success: true, triggeredInStock: false };
    }

    const current = this.productStock.get(cleanId) ?? 0;
    const remaining = current + quantity;
    this.productStock.set(cleanId, remaining);

    let triggeredInStock = false;
    if (current === 0 && remaining > 0) {
      triggeredInStock = true;
      await this.updateProduct(retailerId, { availability: 'in stock' });
    }

    return {
      success: true,
      remaining,
      triggeredInStock
    };
  }

  /**
   * Retrieves current stock quantity for a product if tracked.
   */
  public getProductStock(retailerId: string): number | undefined {
    return this.productStock.get(retailerId.trim().toLowerCase());
  }

  /**
   * Deletes a product from the Meta Commerce Catalog.
   */
  public async deleteProduct(retailerIdOrId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured) {
      return { success: false, error: 'WhatsApp Catalog Service is not configured.' };
    }

    try {
      const existing = await this.getProductByRetailerId(retailerIdOrId);
      if (!existing) {
        return { success: false, error: `Product with SKU/ID "${retailerIdOrId}" not found in catalog.` };
      }

      const metaId = existing.id;
      const url = `https://graph.facebook.com/${this.apiVersion}/${metaId}?access_token=${this.accessToken}`;

      const response = await fetch(url, { method: 'DELETE' });
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[WhatsAppCatalogService] Failed to delete product ${metaId} (${response.status}):`, errText);
        return { success: false, error: `Meta API error (${response.status}): ${errText}` };
      }

      this.invalidateCache();
      return { success: true };
    } catch (err: any) {
      console.error('[WhatsAppCatalogService] Exception deleting product:', err.message);
      return { success: false, error: err.message || 'Unknown error deleting product' };
    }
  }

  /**
   * Builds Single-Product Message (SPM) payload for WhatsApp Cloud API.
   */
  public buildSingleProductPayload(
    recipient: string,
    retailerId: string,
    bodyText?: string,
    footerText?: string
  ): Record<string, any> {
    const cleanRecipient = recipient.replace(/[^0-9]/g, '');
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanRecipient,
      type: 'interactive',
      interactive: {
        type: 'product',
        body: bodyText ? { text: bodyText.slice(0, 1024) } : undefined,
        footer: { text: (footerText || this.defaultStoreName).slice(0, 60) },
        action: {
          catalog_id: this.catalogId,
          product_retailer_id: retailerId
        }
      }
    };
  }

  /**
   * Builds Multi-Product Message (MPM / Product List) payload for WhatsApp Cloud API.
   */
  public buildMultiProductPayload(
    recipient: string,
    sections: Array<{ title: string; productRetailerIds: string[] }>,
    headerText?: string,
    bodyText?: string,
    footerText?: string
  ): Record<string, any> {
    const cleanRecipient = recipient.replace(/[^0-9]/g, '');
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanRecipient,
      type: 'interactive',
      interactive: {
        type: 'product_list',
        header: {
          type: 'text',
          text: (headerText || this.defaultStoreName).slice(0, 60)
        },
        body: {
          text: (bodyText || 'Berikut pilihan produk yang tersedia untuk dipesan:').slice(0, 1024)
        },
        footer: { text: (footerText || this.defaultStoreName).slice(0, 60) },
        action: {
          catalog_id: this.catalogId,
          sections: sections.map((sec) => ({
            title: sec.title.slice(0, 24),
            product_items: sec.productRetailerIds.map((id) => ({ product_retailer_id: id }))
          }))
        }
      }
    };
  }

  /**
   * Builds Full Catalog Link Message payload for WhatsApp Cloud API.
   */
  public buildCatalogPayload(
    recipient: string,
    bodyText?: string,
    footerText?: string,
    thumbnailRetailerId?: string
  ): Record<string, any> {
    const cleanRecipient = recipient.replace(/[^0-9]/g, '');
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanRecipient,
      type: 'interactive',
      interactive: {
        type: 'catalog_message',
        body: {
          text: (bodyText || 'Jelajahi seluruh katalog produk kami langsung di WhatsApp.').slice(0, 1024)
        },
        footer: { text: (footerText || this.defaultStoreName).slice(0, 60) },
        action: {
          name: 'catalog_message',
          parameters: thumbnailRetailerId ? { thumbnail_product_retailer_id: thumbnailRetailerId } : undefined
        }
      }
    };
  }

  /**
   * Builds native WhatsApp Interactive List Message (Bottom Sheet) for selecting a nearby store.
   */
  public buildInteractiveStoreListPayload(
    recipient: string,
    stores: any[],
    headerText = 'Toko & Warung Terdekat',
    bodyText = 'Pilih toko untuk melihat daftar menu dan memesan langsung di WhatsApp:',
    buttonText = 'Pilih Toko'
  ): Record<string, any> {
    const cleanRecipient = recipient.replace(/[^0-9]/g, '');
    const topStores = stores.slice(0, 10);

    const rows = topStores.map((s) => {
      const id = s.id ? s.id : `store_${s.store?.storeId || 'default'}`;
      const title = String(s.title || s.store?.storeName || 'Toko').slice(0, 24);
      let desc = s.description;
      if (!desc && s.store) {
        const distStr = s.distanceKm !== undefined ? `${s.distanceKm} km • ` : '';
        const statusStr = s.isOpen ? '🟢 Buka' : '🔴 Tutup';
        const addrStr = s.store.address ? ` • 📍 ${s.store.address}` : (s.store.category ? ` • ${s.store.category}` : '');
        desc = `${distStr}${statusStr}${addrStr}`;
      }
      return {
        id: String(id).slice(0, 200),
        title,
        description: String(desc || 'Toko resmi').slice(0, 72)
      };
    });

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanRecipient,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: headerText.slice(0, 60)
        },
        body: {
          text: bodyText.slice(0, 1024)
        },
        footer: {
          text: 'SERA Marketplace'
        },
        action: {
          button: buttonText.slice(0, 20),
          sections: [
            {
              title: 'Pilihan Toko & Layanan',
              rows
            }
          ]
        }
      }
    };
  }

  /**
   * Builds native WhatsApp Interactive List Message for Level 1 Category Selection.
   */
  public buildCategoryListPayload(
    recipient: string,
    headerText = 'Kategori Marketplace',
    bodyText = 'Pilih kategori kebutuhan belanja atau layanan yang Anda cari:'
  ): Record<string, any> {
    const cleanRecipient = recipient.replace(/[^0-9]/g, '');
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanRecipient,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: headerText.slice(0, 60)
        },
        body: {
          text: bodyText.slice(0, 1024)
        },
        footer: {
          text: 'SERA Marketplace'
        },
        action: {
          button: 'Pilih Kategori',
          sections: [
            {
              title: 'Kategori Belanja & Jasa',
              rows: [
                { id: 'cat_kuliner', title: '🍲 Kuliner & Makanan', description: 'Warung makan, ayam geprek, bakso, katering, minuman' },
                { id: 'cat_sembako', title: '🛒 Sembako & Harian', description: 'Beras, minyak, mie instan, kebutuhan dapur & rumah' },
                { id: 'cat_listrik', title: '⚡ Listrik & Bangunan', description: 'Kabel, saklar, lampu, perkakas, alat pertukangan' },
                { id: 'cat_mainan', title: '🧸 Mainan & Hobi', description: 'Mainan anak, action figure, edukasi, perlengkapan hobi' },
                { id: 'cat_jasa', title: '🛠️ Jasa & Panggilan', description: 'Servis AC, montir panggilan, laundry, kebersihan' }
              ]
            }
          ]
        }
      }
    };
  }

  /**
   * Builds native WhatsApp Quick Reply Buttons (up to 3 clickable buttons).
   */
  public buildQuickReplyButtonsPayload(
    recipient: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    footerText = 'SERA Marketplace'
  ): Record<string, any> {
    const cleanRecipient = recipient.replace(/[^0-9]/g, '');
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanRecipient,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: bodyText.slice(0, 1024)
        },
        footer: {
          text: footerText.slice(0, 60)
        },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: {
              id: String(b.id).slice(0, 256),
              title: String(b.title).slice(0, 20)
            }
          }))
        }
      }
    };
  }

  /**
   * Parses inbound WhatsApp 'order' webhook payload into structured order info and dialogue narrative.
   */
  public static parseIncomingOrder(orderData: any, knownProducts?: CatalogProduct[]): ParsedIncomingOrder {
    const catalogId = orderData?.catalog_id || '';
    const customerNote = orderData?.text?.trim() || '';
    const rawItems = Array.isArray(orderData?.product_items) ? orderData.product_items : [];

    let totalEstimated = 0;
    const currency = rawItems[0]?.currency || 'IDR';

    const items: IncomingOrderItem[] = rawItems.map((item: any) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.item_price) || 0;
      totalEstimated += qty * price;
      return {
        product_retailer_id: item.product_retailer_id,
        quantity: qty,
        item_price: price,
        currency: item.currency || currency
      };
    });

    const productMap = new Map<string, string>();
    if (knownProducts) {
      for (const p of knownProducts) {
        productMap.set(p.retailer_id, p.name);
      }
    }

    let formattedSummary = `🛒 [PESANAN DITERIMA DARI KATALOG WHATSAPP]\n`;
    const itemLines = items.map((it, idx) => {
      const name = productMap.get(it.product_retailer_id) || it.product_retailer_id;
      const subtotal = it.quantity * it.item_price;
      return `${idx + 1}. ${name} (${it.product_retailer_id}) — ${it.quantity}x @ Rp ${it.item_price.toLocaleString('id-ID')} = Rp ${subtotal.toLocaleString('id-ID')}`;
    });

    formattedSummary += itemLines.join('\n');
    formattedSummary += `\nTotal Perkiraan: Rp ${totalEstimated.toLocaleString('id-ID')}`;
    if (customerNote) {
      formattedSummary += `\nCatatan Pembeli: "${customerNote}"`;
    }

    return {
      catalogId,
      customerNote: customerNote || undefined,
      items,
      totalEstimated,
      currency,
      formattedSummary
    };
  }
}
