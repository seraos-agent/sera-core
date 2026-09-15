import { serverConfig } from '../../../server/config';

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
  url?: string;
}

export interface UpdateProductInput {
  name?: string;
  price?: number;
  description?: string;
  availability?: 'in stock' | 'out of stock';
  image_url?: string;
  brand?: string;
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

          return {
            id: item.id,
            retailer_id: item.retailer_id,
            name: item.name,
            description: item.description,
            price: item.price,
            rawPrice,
            currency: item.currency || 'IDR',
            image_url: item.image_url,
            availability: item.availability,
            brand: item.brand,
            category: item.category,
            url: item.url
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
   */
  public async getProductsByBrand(brand: string, forceRefresh = false): Promise<CatalogProduct[]> {
    const products = await this.getProducts(forceRefresh);
    if (!brand || !brand.trim()) return products;
    const cleanBrand = brand.toLowerCase().trim();
    return products.filter((p) => (p.brand || '').toLowerCase().trim() === cleanBrand);
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
      const retailerId = input.retailer_id?.trim() || `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const name = input.name.trim();
      const description = (input.description || `${name} dari ${input.brand || this.defaultStoreName}`).trim();
      const brand = (input.brand || this.defaultStoreName).trim();
      const currency = (input.currency || 'IDR').toUpperCase();
      const priceInCents = Math.round(input.price * 100); // Meta integer offset
      const availability = input.availability || 'in stock';
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
        brand
      };

      return { success: true, product: created };
    } catch (err: any) {
      console.error('[WhatsAppCatalogService] Exception creating product:', err.message);
      return { success: false, error: err.message || 'Unknown error creating product' };
    }
  }

  /**
   * Creates multiple products in batch to Meta Commerce Catalog.
   */
  public async createProductsBatch(inputs: CreateProductInput[]): Promise<{
    successCount: number;
    failedCount: number;
    createdProducts: CatalogProduct[];
    errors: string[];
  }> {
    const createdProducts: CatalogProduct[] = [];
    const errors: string[] = [];

    for (const item of inputs) {
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
   * Updates an existing product's price, availability, or description in Meta Commerce Catalog.
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
      if (updates.availability) payload.availability = updates.availability;
      if (updates.image_url) payload.image_url = updates.image_url;
      if (updates.brand) payload.brand = updates.brand.trim();
      if (updates.price !== undefined && updates.price > 0) {
        payload.price = Math.round(updates.price * 100);
        payload.currency = existing.currency || 'IDR';
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
        availability: updates.availability || existing.availability,
        brand: updates.brand || existing.brand,
        image_url: updates.image_url || existing.image_url,
        rawPrice: updates.price !== undefined ? updates.price : existing.rawPrice,
        price: updates.price !== undefined ? `${existing.currency} ${updates.price.toLocaleString('id-ID')}` : existing.price
      };

      return { success: true, product: updatedProduct };
    } catch (err: any) {
      console.error('[WhatsAppCatalogService] Exception updating product:', err.message);
      return { success: false, error: err.message || 'Unknown error updating product' };
    }
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
    stores: Array<{ store: { storeId: string; storeName: string; category?: string }; distanceKm: number; isOpen: boolean; statusText: string }>,
    headerText = 'Toko & Warung Terdekat',
    bodyText = 'Pilih toko untuk melihat daftar menu dan memesan langsung di WhatsApp:'
  ): Record<string, any> {
    const cleanRecipient = recipient.replace(/[^0-9]/g, '');
    const topStores = stores.slice(0, 10);

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
          button: 'Pilih Toko',
          sections: [
            {
              title: 'Daftar Toko',
              rows: topStores.map((s) => ({
                id: `store_${s.store.storeId}`,
                title: s.store.storeName.slice(0, 24),
                description: `${s.distanceKm} km • ${s.isOpen ? 'Buka' : 'Tutup'}${s.store.category ? ` • ${s.store.category}` : ''}`.slice(0, 72)
              }))
            }
          ]
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
