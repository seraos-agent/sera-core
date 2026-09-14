import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { StoreProfileService } from '../src/capabilities/communication/services/StoreProfileService.js';

describe('StoreProfileService', () => {
  const testDataDir = path.resolve(process.cwd(), '.data', 'test-stores');
  const testFilePath = path.resolve(testDataDir, 'test_stores.json');

  beforeEach(() => {
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    if (fs.existsSync(testDataDir)) {
      fs.rmdirSync(testDataDir);
    }
  });

  it('initializes with default SERA Mart store', () => {
    const service = new StoreProfileService({
      persistLocally: true,
      storageFilePath: testFilePath
    });

    const store = service.getStore('SERA Mart');
    expect(store).toBeDefined();
    expect(store?.storeId).toBe('sera-mart');
    expect(store?.businessType).toBe('GOODS');
  });

  it('slugifies store names cleanly', () => {
    expect(StoreProfileService.slugify('Dapur Geprek Mas Joko!')).toBe('dapur-geprek-mas-joko');
    expect(StoreProfileService.slugify('Bening Home Cleaning & Laundry')).toBe('bening-home-cleaning-laundry');
  });

  it('upserts a new merchant store with services business type', async () => {
    const service = new StoreProfileService({
      persistLocally: true,
      storageFilePath: testFilePath
    });

    const store = await service.upsertStore({
      storeName: 'Bening Home Care',
      businessType: 'SERVICE',
      category: 'Kebersihan',
      ownerWhatsApp: '+62 812-3456-7890',
      address: 'Jl. Surya No. 12, Surabaya',
      coverageArea: 'Surabaya & Sidoarjo',
      description: 'Layanan jasa cuci kasur, sofa, dan sedot tungau profesional.',
      operatingHours: {
        open: '08:00',
        close: '17:00',
        days: [1, 2, 3, 4, 5, 6] // Mon-Sat
      }
    });

    expect(store.storeId).toBe('bening-home-care');
    expect(store.businessType).toBe('SERVICE');
    expect(store.ownerWhatsApp).toBe('6281234567890');

    // Retrieve by owner phone
    const foundByOwner = service.getStoreByOwner('6281234567890');
    expect(foundByOwner?.storeName).toBe('Bening Home Care');

    // Retrieve by name (case-insensitive)
    const foundByName = service.getStore('bening home care');
    expect(foundByName?.storeId).toBe('bening-home-care');
  });

  it('correctly evaluates operating hours (Open vs Closed vs Vacation)', async () => {
    const service = new StoreProfileService({
      persistLocally: true,
      storageFilePath: testFilePath
    });

    await service.upsertStore({
      storeName: 'Ayam Geprek Mas Joko',
      businessType: 'GOODS',
      operatingHours: {
        open: '10:00',
        close: '21:00',
        days: [1, 2, 3, 4, 5] // Mon-Fri
      },
      allowPreOrder: true
    });

    // Test Monday at 12:00 WIB (05:00 UTC) -> should be OPEN
    const openDate = new Date('2026-09-14T05:00:00Z'); // 12:00 WIB
    const openStatus = service.isStoreOpenNow('Ayam Geprek Mas Joko', openDate);
    expect(openStatus.isOpen).toBe(true);
    expect(openStatus.statusText).toContain('Buka');

    // Test Monday at 22:00 WIB (15:00 UTC) -> should be CLOSED
    const closedNightDate = new Date('2026-09-14T15:00:00Z'); // 22:00 WIB
    const closedStatus = service.isStoreOpenNow('Ayam Geprek Mas Joko', closedNightDate);
    expect(closedStatus.isOpen).toBe(false);
    expect(closedStatus.statusText).toContain('Tutup');
    expect(closedStatus.allowPreOrder).toBe(true);

    // Test Sunday (Day 7, excluded) -> should be CLOSED (Libur)
    const sundayDate = new Date('2026-09-20T05:00:00Z'); // Sunday 12:00 WIB
    const sundayStatus = service.isStoreOpenNow('Ayam Geprek Mas Joko', sundayDate);
    expect(sundayStatus.isOpen).toBe(false);
    expect(sundayStatus.statusText).toContain('Libur');

    // Test manual override (vacation / closed)
    await service.upsertStore({
      storeName: 'Ayam Geprek Mas Joko',
      isOpenManualOverride: false,
      notice: 'Tutup karena renovasi dapur'
    });
    const overrideStatus = service.isStoreOpenNow('Ayam Geprek Mas Joko', openDate);
    expect(overrideStatus.isOpen).toBe(false);
    expect(overrideStatus.statusText).toContain('renovasi dapur');
  });
});
