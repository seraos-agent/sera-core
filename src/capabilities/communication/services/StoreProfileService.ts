import * as fs from 'fs';
import * as path from 'path';
import { SupabaseRestClient } from '../../../core/persistence/SupabaseRestClient';

export type BusinessType = 'GOODS' | 'SERVICE';
export type BusinessCategory = 'FOOD_INSTANT' | 'SERVICE' | 'RETAIL_GOODS';

export interface StoreOperatingHours {
  open: string; // e.g. "10:00" in 24h format
  close: string; // e.g. "21:00" in 24h format
  days: number[]; // 1=Monday, 2=Tuesday, ..., 7=Sunday. Default [1,2,3,4,5,6,7]
}

export interface StoreProfile {
  storeId: string; // URL-safe slug e.g. "dapur-geprek-mas-joko"
  storeName: string; // Display name & Meta Catalog brand e.g. "Dapur Geprek Mas Joko"
  businessType: BusinessType; // 'GOODS' (physical items/food) or 'SERVICE' (cleaning/mechanic/booking)
  businessCategory: BusinessCategory; // 'FOOD_INSTANT' (ready-to-eat), 'SERVICE' (booking), 'RETAIL_GOODS' (general goods)
  category?: string; // e.g. "Kuliner", "Kebersihan", "Otomotif", "Hampers"
  ownerWhatsApp: string; // International phone number without plus e.g. "628123456789"
  address?: string; // Physical address or workshop base
  coverageArea?: string; // e.g. "Radius 10 km", "Jakarta Selatan & Sekitarnya", "Seluruh Indonesia"
  description?: string; // Store marketing bio or tagline
  logoUrl?: string; // Optional logo image URL
  timezone: string; // e.g. "Asia/Jakarta" (WIB)
  operatingHours: StoreOperatingHours;
  isOpenManualOverride?: boolean | null; // true=forced open, false=forced closed/vacation, null=follow schedule
  allowPreOrder: boolean; // whether buyers can place orders when store is closed (default: false for FOOD_INSTANT, true for SERVICE/RETAIL)
  notice?: string; // e.g. "Libur Idul Fitri hingga hari Senin"
  userId?: string; // Optional linked user account or wallet address
  latitude?: number; // Store location coordinates
  longitude?: number;
  createdAt: number;
  updatedAt: number;
}

export function inferBusinessCategory(category?: string, businessType?: BusinessType, storeName?: string): BusinessCategory {
  if (businessType === 'SERVICE') return 'SERVICE';
  const combined = `${category || ''} ${storeName || ''}`.toLowerCase();
  if (/kuliner|makanan|minuman|geprek|bakso|kopi|cafe|warung|resto|kitchen|dapur|snack|martabak|sate|mie/i.test(combined)) {
    return 'FOOD_INSTANT';
  }
  if (/jasa|service|servis|cuci|mekanik|laundry|cleaning|salon|pijat|barber|teknisi|tukang/i.test(combined)) {
    return 'SERVICE';
  }
  return 'RETAIL_GOODS';
}

export const MARKETPLACE_CATEGORIES = [
  { id: 'cat_kuliner', name: 'Kuliner & Makanan', key: 'KULINER', icon: '🍲', description: 'Warung makan, ayam geprek, bakso, katering, minuman' },
  { id: 'cat_sembako', name: 'Sembako & Kebutuhan Harian', key: 'SEMBAKO', icon: '🛒', description: 'Beras, minyak, mie instan, kebutuhan dapur & rumah' },
  { id: 'cat_listrik', name: 'Alat Listrik & Bangunan', key: 'ELEKTRONIK_LISTRIK', icon: '⚡', description: 'Kabel, saklar, lampu, perkakas, alat pertukangan' },
  { id: 'cat_mainan', name: 'Mainan & Hobi', key: 'MAINAN_HOBI', icon: '🧸', description: 'Mainan anak, action figure, edukasi, perlengkapan hobi' },
  { id: 'cat_jasa', name: 'Jasa & Layanan Panggilan', key: 'JASA', icon: '🛠️', description: 'Servis AC, montir panggilan, laundry, kebersihan' },
  { id: 'cat_fashion', name: 'Fashion & Pakaian', key: 'FASHION', icon: '👕', description: 'Pakaian pria/wanita, hijab, aksesoris, sepatu' }
] as const;

export interface NearbyStoreResult {
  store: StoreProfile;
  distanceKm: number;
  hasExactDistance?: boolean;
  isOpen: boolean;
  statusText: string;
}

export function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export interface StoreStatusResult {
  isOpen: boolean;
  statusText: string;
  reason?: string;
  allowPreOrder: boolean;
  store: StoreProfile;
}

export interface StoreProfileServiceOptions {
  persistLocally?: boolean;
  storageFilePath?: string;
  supabaseClient?: SupabaseRestClient | null;
}

/**
 * StoreProfileService — Coordinates multi-merchant store registration,
 * operational schedules, open/closed evaluation, and merchant contact lookup.
 *
 * Architecture Role: Capability Sub-Service (src/capabilities/communication/services/)
 * Strictly conforms to Rule 7 (Universal Codebase Language: English Standard).
 */
export class StoreProfileService {
  private static instance: StoreProfileService | null = null;
  private readonly stores = new Map<string, StoreProfile>();
  private readonly filePath: string;
  private readonly persistLocally: boolean;
  private readonly supabaseClient?: SupabaseRestClient | null;

  constructor(options: StoreProfileServiceOptions = {}) {
    this.persistLocally = options.persistLocally ?? true;
    this.filePath = options.storageFilePath || path.resolve(process.cwd(), '.data', 'stores.json');
    this.supabaseClient = options.supabaseClient !== undefined
      ? options.supabaseClient
      : SupabaseRestClient.fromEnvironment();

    this.loadInitialStores();
  }

  public static getInstance(options?: StoreProfileServiceOptions): StoreProfileService {
    if (!StoreProfileService.instance) {
      StoreProfileService.instance = new StoreProfileService(options);
    }
    return StoreProfileService.instance;
  }

  /**
   * Generates a clean URL-safe slug from store name.
   */
  public static slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `store-${Date.now()}`;
  }

  private loadInitialStores(): void {
    if (this.persistLocally && fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const s of parsed) {
            if (s && s.storeId) {
              const bType: BusinessType = s.businessType || 'GOODS';
              const bCat: BusinessCategory = s.businessCategory || inferBusinessCategory(s.category, bType, s.storeName);
              this.stores.set(s.storeId, {
                ...s,
                businessType: bType,
                businessCategory: bCat,
                allowPreOrder: s.allowPreOrder !== undefined ? s.allowPreOrder : (bCat !== 'FOOD_INSTANT')
              });
            }
          }
        }
      } catch (err: any) {
        console.warn('[StoreProfileService] Failed to parse local stores file:', err.message);
      }
    }

    // Hydrate stores from Supabase cloud database if available
    if (this.supabaseClient) {
      this.supabaseClient.select<any>('merchant_stores', 'select=*')
        .then((rows) => {
          if (Array.isArray(rows)) {
            for (const r of rows) {
              if (r && r.store_id) {
                const bType: BusinessType = r.business_type || 'GOODS';
                const bCat: BusinessCategory = r.business_category || inferBusinessCategory(r.category, bType, r.store_name);
                const s: StoreProfile = {
                  storeId: r.store_id,
                  storeName: r.store_name,
                  businessType: bType,
                  businessCategory: bCat,
                  category: r.category,
                  ownerWhatsApp: (r.owner_whatsapp || '').replace(/[^0-9]/g, ''),
                  address: r.address,
                  coverageArea: r.coverage_area,
                  description: r.description,
                  logoUrl: r.logo_url,
                  timezone: r.timezone || 'Asia/Jakarta',
                  operatingHours: r.operating_hours || { open: '09:00', close: '21:00', days: [1, 2, 3, 4, 5, 6, 7] },
                  isOpenManualOverride: r.is_open_override ?? null,
                  allowPreOrder: r.allow_pre_order !== undefined ? r.allow_pre_order : (bCat !== 'FOOD_INSTANT'),
                  notice: r.notice,
                  userId: r.user_id,
                  latitude: r.latitude !== undefined && r.latitude !== null ? Number(r.latitude) : undefined,
                  longitude: r.longitude !== undefined && r.longitude !== null ? Number(r.longitude) : undefined,
                  createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
                  updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
                };
                this.stores.set(s.storeId, s);
              }
            }
          }
        })
        .catch((err) => {
          // Supabase table may not exist yet in test environment; log cleanly
          console.warn('[StoreProfileService] Supabase initial load skipped:', err.message);
        });
    }

    // Ensure default system store (SERA Mart) exists
    if (!this.stores.has('sera-mart')) {
      const defaultStore: StoreProfile = {
        storeId: 'sera-mart',
        storeName: 'SERA Mart',
        businessType: 'GOODS',
        businessCategory: 'RETAIL_GOODS',
        category: 'Sembako & Kebutuhan Pokok',
        ownerWhatsApp: process.env.OWNER_WHATSAPP || '',
        address: 'Jl. Merdeka No. 10, Jakarta',
        coverageArea: 'Seluruh Indonesia',
        description: 'Toko sembako dan kebutuhan harian resmi SERA Mart.',
        timezone: 'Asia/Jakarta',
        operatingHours: {
          open: '08:00',
          close: '22:00',
          days: [1, 2, 3, 4, 5, 6, 7]
        },
        isOpenManualOverride: null,
        allowPreOrder: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.stores.set(defaultStore.storeId, defaultStore);
      this.saveStores();
    }
  }

  private saveStores(): void {
    if (!this.persistLocally) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.stores.values());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('[StoreProfileService] Failed to persist stores locally:', err.message);
    }
  }

  /**
   * Creates or updates a store profile.
   */
  public async upsertStore(input: Partial<StoreProfile> & { storeName: string }): Promise<StoreProfile> {
    const rawName = input.storeName.trim();
    const storeId = input.storeId || StoreProfileService.slugify(rawName);

    const existing = this.stores.get(storeId) || this.findStoreByName(rawName);
    const now = Date.now();

    const businessType: BusinessType = input.businessType || existing?.businessType || 'GOODS';
    const category = input.category !== undefined ? input.category : existing?.category;
    const businessCategory: BusinessCategory = input.businessCategory ||
      existing?.businessCategory ||
      inferBusinessCategory(category, businessType, rawName);

    // For instant food, default allowPreOrder is false (hungry at night -> no pre-order for next morning!)
    // For service and retail, default allowPreOrder is true
    const defaultAllowPreOrder = businessCategory === 'FOOD_INSTANT' ? false : true;
    const allowPreOrder = input.allowPreOrder !== undefined
      ? input.allowPreOrder
      : (existing?.allowPreOrder !== undefined ? existing.allowPreOrder : defaultAllowPreOrder);

    const merged: StoreProfile = {
      storeId: existing ? existing.storeId : storeId,
      storeName: rawName,
      businessType,
      businessCategory,
      category,
      ownerWhatsApp: (input.ownerWhatsApp || existing?.ownerWhatsApp || '').replace(/[^0-9]/g, ''),
      address: input.address !== undefined ? input.address : existing?.address,
      coverageArea: input.coverageArea !== undefined ? input.coverageArea : existing?.coverageArea,
      description: input.description !== undefined ? input.description : existing?.description,
      logoUrl: input.logoUrl !== undefined ? input.logoUrl : existing?.logoUrl,
      timezone: input.timezone || existing?.timezone || 'Asia/Jakarta',
      operatingHours: input.operatingHours || existing?.operatingHours || {
        open: '09:00',
        close: '21:00',
        days: [1, 2, 3, 4, 5, 6, 7]
      },
      isOpenManualOverride: input.isOpenManualOverride !== undefined ? input.isOpenManualOverride : (existing?.isOpenManualOverride ?? null),
      allowPreOrder,
      notice: input.notice !== undefined ? input.notice : existing?.notice,
      userId: input.userId !== undefined ? input.userId : existing?.userId,
      latitude: input.latitude !== undefined ? input.latitude : existing?.latitude,
      longitude: input.longitude !== undefined ? input.longitude : existing?.longitude,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    this.stores.set(merged.storeId, merged);
    this.saveStores();

    // Cloud snapshot to Supabase if configured
    if (this.supabaseClient) {
      try {
        await this.supabaseClient.upsert('merchant_stores', {
          store_id: merged.storeId,
          store_name: merged.storeName,
          business_type: merged.businessType,
          category: merged.category,
          owner_whatsapp: merged.ownerWhatsApp,
          address: merged.address,
          coverage_area: merged.coverageArea,
          description: merged.description,
          timezone: merged.timezone,
          operating_hours: merged.operatingHours,
          is_open_override: merged.isOpenManualOverride,
          allow_pre_order: merged.allowPreOrder,
          notice: merged.notice,
          user_id: merged.userId,
          latitude: merged.latitude,
          longitude: merged.longitude,
          updated_at: new Date(now).toISOString()
        }, 'store_id');
      } catch (err: any) {
        console.warn('[StoreProfileService] Supabase sync skipped:', err.message);
      }
    }

    return merged;
  }

  /**
   * Finds stores near given coordinates within radius km, optionally filtered by category.
   * Open stores are sorted first, followed by shortest distance.
   */
  public findNearbyStores(
    lat?: number,
    lng?: number,
    category?: string,
    maxDistanceKm = 15
  ): NearbyStoreResult[] {
    const results: NearbyStoreResult[] = [];
    const cleanCat = category ? category.trim().toLowerCase() : '';
    const hasUserCoordinates = typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);

    for (const store of this.stores.values()) {
      if (cleanCat && store.category && !store.category.toLowerCase().includes(cleanCat)) {
        continue;
      }

      let distanceKm = 0;
      let hasExactDistance = false;

      if (hasUserCoordinates && store.latitude !== undefined && store.longitude !== undefined) {
        distanceKm = calculateHaversineDistanceKm(lat, lng, store.latitude, store.longitude);
        if (distanceKm > maxDistanceKm) continue;
        hasExactDistance = true;
      }

      const status = this.isStoreOpenNow(store.storeId);
      results.push({
        store,
        distanceKm,
        hasExactDistance,
        isOpen: status.isOpen,
        statusText: status.statusText
      });
    }

    return results.sort((a, b) => {
      if (a.isOpen && !b.isOpen) return -1;
      if (!a.isOpen && b.isOpen) return 1;
      if (a.hasExactDistance && b.hasExactDistance) {
        return a.distanceKm - b.distanceKm;
      }
      return 0;
    });
  }

  /**
   * Retrieves a store by storeId or storeName.
   */
  public getStore(storeNameOrId: string): StoreProfile | undefined {
    if (!storeNameOrId) return undefined;
    const clean = storeNameOrId.trim();
    if (this.stores.has(clean)) {
      return this.stores.get(clean);
    }
    return this.findStoreByName(clean);
  }

  /**
   * Retrieves store by owner's WhatsApp number.
   */
  public getStoreByOwner(phone: string): StoreProfile | undefined {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    for (const store of this.stores.values()) {
      if (store.ownerWhatsApp === cleanPhone) {
        return store;
      }
    }
    return undefined;
  }

  /**
   * Lists all registered stores.
   */
  public listStores(): StoreProfile[] {
    return Array.from(this.stores.values());
  }

  /**
   * Deletes a store by storeId.
   */
  public deleteStore(storeId: string): boolean {
    const deleted = this.stores.delete(storeId);
    if (deleted) {
      this.saveStores();
    }
    return deleted;
  }

  /**
   * Evaluates if a store is currently open based on timezone, hours, and override status.
   */
  public isStoreOpenNow(storeNameOrId: string, referenceDate: Date = new Date()): StoreStatusResult {
    const store = this.getStore(storeNameOrId) || this.stores.get('sera-mart')!;

    // 1. Manual Override check
    if (store.isOpenManualOverride === false) {
      return {
        isOpen: false,
        statusText: store.notice ? `Tutup Sementara (${store.notice})` : 'Tutup Sementara',
        reason: store.notice || 'Toko ditutup sementara oleh pemilik.',
        allowPreOrder: store.allowPreOrder,
        store
      };
    }
    if (store.isOpenManualOverride === true) {
      return {
        isOpen: true,
        statusText: 'Buka (Manual Override)',
        allowPreOrder: store.allowPreOrder,
        store
      };
    }

    // 2. Schedule Evaluation in Store's Timezone
    try {
      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: store.timezone || 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'short'
      });

      const parts = timeFormatter.formatToParts(referenceDate);
      const hourPart = parts.find((p) => p.type === 'hour')?.value || '00';
      const minutePart = parts.find((p) => p.type === 'minute')?.value || '00';
      const weekdayPart = parts.find((p) => p.type === 'weekday')?.value || 'Mon';

      const currentMinutes = parseInt(hourPart, 10) * 60 + parseInt(minutePart, 10);

      // Convert weekday to 1..7 (Mon=1, Sun=7)
      const dayMap: Record<string, number> = {
        Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7
      };
      const currentDayNumber = dayMap[weekdayPart] || 1;

      const scheduleDays = store.operatingHours.days || [1, 2, 3, 4, 5, 6, 7];
      if (!scheduleDays.includes(currentDayNumber)) {
        return {
          isOpen: false,
          statusText: `Tutup (Libur Hari Ini)`,
          reason: `Toko libur pada hari ini. Buka kembali sesuai jadwal: ${store.operatingHours.open} - ${store.operatingHours.close} WIB.`,
          allowPreOrder: store.allowPreOrder,
          store
        };
      }

      const [openHour, openMin] = (store.operatingHours.open || '09:00').split(':').map((v) => parseInt(v, 10));
      const [closeHour, closeMin] = (store.operatingHours.close || '21:00').split(':').map((v) => parseInt(v, 10));

      const openMinutes = openHour * 60 + (openMin || 0);
      const closeMinutes = closeHour * 60 + (closeMin || 0);

      const isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;

      if (isOpen) {
        return {
          isOpen: true,
          statusText: `Buka (Tutup pukul ${store.operatingHours.close} WIB)`,
          allowPreOrder: store.allowPreOrder,
          store
        };
      } else {
        const nextTime = currentMinutes < openMinutes
          ? `pukul ${store.operatingHours.open} WIB hari ini`
          : `besok pagi pukul ${store.operatingHours.open} WIB`;
        return {
          isOpen: false,
          statusText: `Tutup (Buka ${nextTime})`,
          reason: `Toko sedang di luar jam operasional. Buka kembali ${nextTime}.`,
          allowPreOrder: store.allowPreOrder,
          store
        };
      }
    } catch (err: any) {
      // Fallback: safe open
      return {
        isOpen: true,
        statusText: 'Buka',
        allowPreOrder: store.allowPreOrder,
        store
      };
    }
  }

  /**
   * Calculates the lowest product price available in a store's catalog.
   * Strictly excludes showcase placeholder products and guarantees multi-merchant isolation.
   */
  public calculateStoreMinPrice(
    storeNameOrId: string,
    products: Array<{ retailer_id?: string; rawPrice?: number; price?: string | number; brand?: string; name?: string }>
  ): number {
    const store = this.getStore(storeNameOrId);
    const targetName = (store ? store.storeName : storeNameOrId).toLowerCase().trim();
    const cleanTarget = targetName.replace(/[^a-z0-9]/g, '');
    const targetSlug = store ? store.storeId.toLowerCase() : cleanTarget;

    const otherMerchantStores = Array.from(this.stores.values()).filter((s) => {
      if (s.storeId === 'sera-mart') return false;
      if (store && s.storeId === store.storeId) return false;
      return true;
    });

    const matchingPrices = products
      .filter((p) => {
        // Exclude showcase cover items from price calculation
        if (p.retailer_id && String(p.retailer_id).startsWith('showcase_')) return false;

        const pBrand = String(p.brand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const pSku = String(p.retailer_id || '').toLowerCase();

        // 1. Strict exclusion of other registered merchant stores
        const belongsToOther = otherMerchantStores.some((other) => {
          const otherAlnum = other.storeName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const otherSlug = other.storeId.toLowerCase();
          return (pBrand && pBrand === otherAlnum) || pSku.includes(otherSlug);
        });
        if (belongsToOther) return false;

        // 2. Exact or normalized brand match
        if (pBrand && (pBrand === cleanTarget || (cleanTarget.length >= 5 && (pBrand.includes(cleanTarget) || cleanTarget.includes(pBrand))))) {
          return true;
        }

        // 3. Retailer ID slug match
        if (pSku.includes(targetSlug) || (store && pSku.includes(store.storeId))) {
          return true;
        }

        return false;
      })
      .map((p) => {
        if (typeof p.rawPrice === 'number' && p.rawPrice > 0) return p.rawPrice;
        if (p.price) {
          const num = Number(String(p.price).replace(/[^0-9]/g, ''));
          if (num > 0) return num;
        }
        return 0;
      })
      .filter((p) => p > 0);

    if (matchingPrices.length === 0) return 10000;
    return Math.min(...matchingPrices);
  }

  private findStoreByName(name: string): StoreProfile | undefined {
    const lower = name.toLowerCase().trim();
    for (const store of this.stores.values()) {
      if (store.storeName.toLowerCase().trim() === lower || store.storeId === lower) {
        return store;
      }
    }
    // Partial search
    for (const store of this.stores.values()) {
      if (store.storeName.toLowerCase().includes(lower) || lower.includes(store.storeName.toLowerCase())) {
        return store;
      }
    }
    return undefined;
  }
}
