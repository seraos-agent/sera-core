import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { Server } from 'http';
import { DanaPaymentService } from '../src/capabilities/fintech/dana/DanaPaymentService';
import { DanaClient } from '../src/capabilities/fintech/dana/DanaClient';
import { OrderSettlementStore } from '../src/capabilities/fintech/dana/OrderSettlementStore';
import { createDanaRouter } from '../src/server/routes/danaRoutes';

describe('DANA Direct Debit Cancel Order (Scenario: 2005700 & In App Partner Action)', () => {
  let client: DanaClient;
  let service: DanaPaymentService;
  let settlementStore: OrderSettlementStore;
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.restoreAllMocks();

    client = new DanaClient({
      env: 'sandbox',
      baseUrl: 'https://api.sandbox.dana.id',
      merchantId: '216620090013051961943',
      clientId: '2026092122251807112556',
      clientSecret: 'a99138a4b7b2197396a5bf28c36bb6be70c4d19701887002ec576de4f0f26f1e',
      publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3zc8H1rgl9yZJhebBUtjDKubWo+twkF47pmHpjPBDJG+A9GPaqa5DToh1cvATu27nm37NLLEQ8qp2931/UpHaVufyATSTQm8vIcNwdmR95ePziz6p2VpRoIKairexhsh7mp0b8aLoMvuzhXTa2Bljr5/oE29XysPgtxXHb6kAcXL9R/EQ/cjzjvrAY3gKY4NkIIXlwF6ijMKVtQ6YMsd+ENPYh5rX+fnovNd8pemTGsgB6zvZLlaUEtIB3iBmI1R4zu8ZIQZMaABli2nOhojCVltQF1oIUi2N9nQIeo4mikFTAaGnqV01P97xkdLtKgEX+8tWvOBAn9zjv4gLtEn4QIDAQAB',
      privateKey: 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDfNzwfWuCX3JkmF5sFS2MMq5taj63CQXjumYemM8EMkb4D0Y9qprkNOiHVy8BO7buebfs0ssRDyqnb3fX9SkdpW5/IBNJNCby8hw3B2ZH3l4/OLPqnZWlGggpqKt7GGyHuanRvxougy+7OFdNrYGWOvn+gTb1fKw+C3FcdvqQBxcv1H8RD9yPOO+sBjeApjg2QgheXAXqKMwpW1Dpgyx34Q09iHmtf5+ei813yl6ZMayAHrO9kuVQS0gHeIGYjVHjO7xkhBkxoAGWLac6GiMJWW1AXWghSLY32dAh6jiaKQVMBoaepXTU/3vGR0u0qARf7y1a84ECf3OO/iAu0SfhAgMBAAECgf9DI1nyFGN5SeDGlFMMRKCGLxeLJawdwZOeMI+cbfSi0zNT8rQwX/VJBTMoGyC8nMTR4kKslxhxS4PLnfdfN/hCuExW3RxkD4m1Kun4ZHiDABNA8EZ0EwyXKIX5aOuYqpCKJXrgI9fbhXtOgUIWCeiCBspcbQWImmsP8TZCvBSYc1YIzSEZc8iQmlfJa2vRNDncdz1v+GrHjFROl9BM8a43BhzuRfNqFysl1PPp1xyZNIVFx/S9NmmoFqSN+PUZPDxHo48s2kcg2rflcIlKFVjCuO6aBMVfaVqBBEh96IwzL7aWAgmWqiyx4thNKQ3j+mQH4ytZYGlmQ3Vmk43hc4UCgYEA9hF5CoSOWbpRYdKSrWwG30+AJ+DmPgmPkQ/P7lkJRq8gzPZ4xDxgo11Ggaa8PgwAADi9N5eO1WNG1ZcIpOyMi3H9x3vBu00G68yl+7edqwUbZ/4B87QQ/qGP/Heo9jMqUY15nPmZ3mOSpm/pAo+Xh2z7Cv+qKYOY7CuRPGT4rOMCgYEA6Dmi21MWD9bJmILjO+1R15h5ScyuAX1t6sxDEIo5l5aVyGO2q4B7WsCv2dGINOw/gfXUXE5EnKI1UmEXt907gjx3AtNxEX0X7rhhqRYJUKOYzvyz+2/vfAYYqhQB9ZMZlpRBsnd9agbVbaYklXFspNDIP34K99MY3vJFJMMtl2sCgYEAoXb9sgUhU4eK92GxldKY/9evBHvzGSo05r81dfU+vP8VyujAfiQQVaJTLag3RY+iQIL6xovQ0fz+8hDVP0NpReda25c9nKYCsJ/tGqt17k6/mRF4Pm4d6LgjP0tVt5gDYNgwwOyYJvG3vTcZ8vA+QkMkyCbThcIwimhcOQEYnHkCgYEA45uqHWGAHCIfERYodhISx0cwib7NRbSUSS/PA6UW8ZasU+43mjyhqr91G/6ci5KKZGx3qckkwojRzl5PiuyRaQKuetyW09dR365kOf/ZPWo7WZShK234wgyPnBNkIDf/OnExOySWjZcJFSFkdfznyVrBCkoVofULSWkXkAKk6uUCgYEAiRSFEIL7BXUHPim71jbyHHHSyGPTzToFaVWOqKAU5OZizmJMh3C8mt5yWTgLzCN1D8ZmhcY5qIP3/F+fiInSUOTHrIiN6Y1IdH/SOm0beNMpZNK2+rs6J5XWuJ4UtzlWtLT78ukkPKv6iB7QFHrM0BOAXTOE2rTeeIjI/ZcOxlQ='
    });

    settlementStore = new OrderSettlementStore({ persistLocally: false });
    service = new DanaPaymentService(client, settlementStore);

    app = express();
    app.use(express.json());
    app.use('/api/dana', createDanaRouter({
      danaPaymentService: service,
      defaultSimulateError: false
    }));

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('DanaPaymentService.cancelOrder', () => {
    it('cancels order successfully with 2005700 response (In App Partner Action: Cancel mark as successful)', async () => {
      // 1. Seed existing order in settlement store
      settlementStore.recordSettlement({
        orderId: 'ORD-CANCEL-1001',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 10000,
        platformFee: 200,
        netPayout: 9800,
        payoutMethod: 'DANA',
        destination: '6281234567890',
        status: 'PENDING',
        partnerReferenceNo: 'ORD-CANCEL-1001',
        settledAt: Date.now()
      });

      // 2. Mock DANA cancel endpoint response
      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: true, status: 200 } as any,
        data: {
          responseCode: '2005700',
          responseMessage: 'Success',
          originalPartnerReferenceNo: 'ORD-CANCEL-1001',
          originalReferenceNo: '20260924111230999500166510800550768',
          cancelTime: '2026-09-24T00:46:31+07:00'
        },
        timestamp: '2026-09-24T00:46:31+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-CANCEL-1001',
        originalReferenceNo: '20260924111230999500166510800550768',
        amount: 10000,
        reason: 'Network timeout'
      });

      // Verification of Expected Response
      expect(result.success).toBe(true);
      expect(result.responseCode).toBe('2005700');
      expect(result.responseMessage).toBe('Success');
      expect(result.isCancelSuccess).toBe(true);
      expect(result.cancelTime).toBe('2026-09-24T00:46:31+07:00');

      // Verification of In App Partner Action: Cancel mark as successful
      const record = settlementStore.findSettlementByReference('ORD-CANCEL-1001');
      expect(record?.status).toBe('CANCELLED');
      expect(record?.cancelDetails?.status).toBe('SUCCESS');
      expect(record?.cancelDetails?.reason).toBe('Network timeout');
      expect(record?.cancelDetails?.cancelTime).toBe('2026-09-24T00:46:31+07:00');
    });

    it('handles 2025700 Request In Progress response (In App Partner Action: Cancel mark as pending)', async () => {
      // 1. Seed existing order in settlement store
      settlementStore.recordSettlement({
        orderId: 'ORD-CANCEL-PROG',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 10000,
        platformFee: 200,
        netPayout: 9800,
        payoutMethod: 'DANA',
        destination: '6281234567890',
        status: 'PENDING',
        partnerReferenceNo: 'ORD-CANCEL-PROG',
        settledAt: Date.now()
      });

      // 2. Mock 2025700 response from DANA
      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 202 } as any,
        data: {
          responseCode: '2025700',
          responseMessage: 'Request In Progress',
          originalPartnerReferenceNo: 'ORD-CANCEL-PROG'
        },
        timestamp: '2026-09-24T00:59:15+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-CANCEL-PROG',
        amount: 2025700,
        reason: 'Network timeout'
      });

      // Verification of Expected Response
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('2025700');
      expect(result.responseMessage).toBe('Request In Progress');
      expect(result.isInProgress).toBe(true);

      // Verification of In App Partner Action: Cancel mark as pending
      const record = settlementStore.findSettlementByReference('ORD-CANCEL-PROG');
      expect(record?.status).toBe('PENDING');
      expect(record?.cancelDetails?.status).toBe('PENDING');
      expect(record?.cancelDetails?.reason).toBe('Network timeout');
    });

    it('handles 4045700 Invalid Transaction Status response', async () => {
      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 404 } as any,
        data: {
          responseCode: '4045700',
          responseMessage: 'Invalid Transaction Status',
          originalPartnerReferenceNo: 'ORD-CANCEL-INVALID'
        },
        timestamp: '2026-09-24T00:46:31+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-CANCEL-INVALID',
        amount: 10000,
        reason: 'Network timeout'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4045700');
      expect(result.responseMessage).toBe('Invalid Transaction Status');
      expect(result.isInvalidStatus).toBe(true);
      expect(result.error).toContain('Invalid Transaction Status');
    });

    it('handles 4045701 Transaction Not Found response', async () => {
      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 404 } as any,
        data: {
          responseCode: '4045701',
          responseMessage: 'Transaction Not Found',
          originalPartnerReferenceNo: 'ORD-NOT-FOUND'
        },
        timestamp: '2026-09-24T00:46:31+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-NOT-FOUND',
        amount: 10000
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4045701');
      expect(result.isNotFound).toBe(true);
      expect(result.error).toContain('Transaction Not Found');
    });

    it('handles 4015700 Unauthorized. Invalid Signature response (In App Partner Action: Cancel mark as failed)', async () => {
      // 1. Seed existing pending order
      settlementStore.recordSettlement({
        orderId: 'ORD-CANCEL-UNAUTH',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 10000,
        platformFee: 200,
        netPayout: 9800,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'PENDING',
        partnerReferenceNo: 'ORD-CANCEL-UNAUTH',
        settledAt: Date.now()
      });

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 401 } as any,
        data: {
          responseCode: '4015700',
          responseMessage: 'Unauthorized. Invalid Signature',
          originalPartnerReferenceNo: 'ORD-CANCEL-UNAUTH'
        },
        timestamp: '2026-09-24T00:46:31+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-CANCEL-UNAUTH',
        amount: 10000,
        headers: { 'X-SIGNATURE': 'invalid_signature' }
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4015700');
      expect(result.responseMessage).toBe('Unauthorized. Invalid Signature');
      expect(result.isUnauthorized).toBe(true);
      expect(result.isCancelFailed).toBe(true);
      expect(result.error).toContain('Unauthorized');

      // In App Partner Action: Cancel mark as failed
      const record = settlementStore.getSettlement('ORD-CANCEL-UNAUTH');
      expect(record).toBeDefined();
      expect(record?.cancelDetails).toBeDefined();
      expect(record?.cancelDetails?.status).toBe('FAILED');
      expect(record?.cancelDetails?.error).toContain('Unauthorized');
    });

    it('handles 4005702 Missing Mandatory Field response', async () => {
      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 400 } as any,
        data: {
          responseCode: '4005702',
          responseMessage: 'Invalid Mandatory Field',
          originalPartnerReferenceNo: 'ORD-NO-PARAM'
        },
        timestamp: '2026-09-24T00:46:31+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-NO-PARAM',
        amount: 0
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4005702');
      expect(result.isMissingMandatoryField).toBe(true);
      expect(result.error).toContain('Missing Mandatory Field');
    });

    it('handles 4035705 Do Not Honor response (In App Partner Action: Cancel mark as failed)', async () => {
      // 1. Seed existing pending order
      settlementStore.recordSettlement({
        orderId: 'ORD-CANCEL-403',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 4035705,
        platformFee: 80714,
        netPayout: 3954991,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'PENDING',
        partnerReferenceNo: 'ORD-CANCEL-403',
        settledAt: Date.now()
      });

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 403 } as any,
        data: {
          responseCode: '4035705',
          responseMessage: 'Do Not Honor',
          originalPartnerReferenceNo: 'ORD-CANCEL-403'
        },
        timestamp: '2026-09-24T00:46:31+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-CANCEL-403',
        amount: 4035705,
        partnerReferenceNo: '4035705',
        reason: 'Network timeout'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4035705');
      expect(result.responseMessage).toBe('Do Not Honor');
      expect(result.isDoNotHonor).toBe(true);
      expect(result.isCancelFailed).toBe(true);
      expect(result.error).toContain('Do Not Honor');

      // In App Partner Action: Cancel mark as failed
      const record = settlementStore.getSettlement('ORD-CANCEL-403');
      expect(record).toBeDefined();
      expect(record?.cancelDetails).toBeDefined();
      expect(record?.cancelDetails?.status).toBe('FAILED');
      expect(record?.cancelDetails?.error).toContain('Do Not Honor');
    });

    it('handles 4045708 Invalid Merchant response (In App Partner Action: Cancel mark as failed)', async () => {
      // 1. Seed existing pending order
      settlementStore.recordSettlement({
        orderId: 'ORD-CANCEL-INV-MERCH',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 4045708,
        platformFee: 80914,
        netPayout: 3964794,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'PENDING',
        partnerReferenceNo: 'ORD-CANCEL-INV-MERCH',
        settledAt: Date.now()
      });

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 404 } as any,
        data: {
          responseCode: '4045708',
          responseMessage: 'Invalid Merchant',
          originalPartnerReferenceNo: 'ORD-CANCEL-INV-MERCH'
        },
        timestamp: '2026-09-24T00:46:31+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-CANCEL-INV-MERCH',
        amount: 4045708,
        partnerReferenceNo: '4045708',
        reason: 'Network timeout'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4045708');
      expect(result.responseMessage).toBe('Invalid Merchant');
      expect(result.isInvalidMerchant).toBe(true);
      expect(result.isCancelFailed).toBe(true);
      expect(result.error).toContain('Invalid Merchant');

      // In App Partner Action: Cancel mark as failed
      const record = settlementStore.getSettlement('ORD-CANCEL-INV-MERCH');
      expect(record).toBeDefined();
      expect(record?.cancelDetails).toBeDefined();
      expect(record?.cancelDetails?.status).toBe('FAILED');
      expect(record?.cancelDetails?.error).toContain('Invalid Merchant');
    });

    it('handles 4035700 Transaction Expired response (In App Partner Action: Cancel mark as failed)', async () => {
      // 1. Seed existing pending order
      settlementStore.recordSettlement({
        orderId: 'ORD-CANCEL-EXPIRED',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 4035700,
        platformFee: 80714,
        netPayout: 3954986,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'PENDING',
        partnerReferenceNo: 'ORD-CANCEL-EXPIRED',
        settledAt: Date.now()
      });

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 403 } as any,
        data: {
          responseCode: '4035700',
          responseMessage: 'Transaction Expired',
          originalPartnerReferenceNo: 'ORD-CANCEL-EXPIRED'
        },
        timestamp: '2026-09-24T00:46:31+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-CANCEL-EXPIRED',
        amount: 4035700,
        partnerReferenceNo: '4035700',
        reason: 'Network timeout'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4035700');
      expect(result.responseMessage).toBe('Transaction Expired');
      expect(result.isTransactionExpired).toBe(true);
      expect(result.isCancelFailed).toBe(true);
      expect(result.error).toContain('Transaction Expired');

      // In App Partner Action: Cancel mark as failed
      const record = settlementStore.getSettlement('ORD-CANCEL-EXPIRED');
      expect(record).toBeDefined();
      expect(record?.cancelDetails).toBeDefined();
      expect(record?.cancelDetails?.status).toBe('FAILED');
      expect(record?.cancelDetails?.error).toContain('Transaction Expired');
    });

    it('handles 4035715 Transaction Not Permitted response (In App Partner Action: Cancel mark as failed)', async () => {
      // 1. Seed existing pending order
      settlementStore.recordSettlement({
        orderId: 'ORD-CANCEL-NOT-PERMITTED',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 4035715,
        platformFee: 80714,
        netPayout: 3955001,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'PENDING',
        partnerReferenceNo: 'ORD-CANCEL-NOT-PERMITTED',
        settledAt: Date.now()
      });

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 403 } as any,
        data: {
          responseCode: '4035715',
          responseMessage: 'Transaction Not Permitted',
          originalPartnerReferenceNo: 'ORD-CANCEL-NOT-PERMITTED'
        },
        timestamp: '2026-09-24T00:46:31+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-CANCEL-NOT-PERMITTED',
        amount: 4035715,
        partnerReferenceNo: '4035715',
        reason: 'Network timeout'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4035715');
      expect(result.responseMessage).toBe('Transaction Not Permitted');
      expect(result.isTransactionNotPermitted).toBe(true);
      expect(result.isCancelFailed).toBe(true);
      expect(result.error).toContain('Transaction Not Permitted');

      // In App Partner Action: Cancel mark as failed
      const record = settlementStore.getSettlement('ORD-CANCEL-NOT-PERMITTED');
      expect(record).toBeDefined();
      expect(record?.cancelDetails).toBeDefined();
      expect(record?.cancelDetails?.status).toBe('FAILED');
      expect(record?.cancelDetails?.error).toContain('Transaction Not Permitted');
    });

    it('handles 4035714 Insufficient Funds response (In App Partner Action: Cancel mark as failed)', async () => {
      // 1. Seed existing pending order
      settlementStore.recordSettlement({
        orderId: 'ORD-CANCEL-INSUFFICIENT',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 4035714,
        platformFee: 80714,
        netPayout: 3955000,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'PENDING',
        partnerReferenceNo: 'ORD-CANCEL-INSUFFICIENT',
        settledAt: Date.now()
      });

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 403 } as any,
        data: {
          responseCode: '4035714',
          responseMessage: 'Insufficient Funds',
          originalPartnerReferenceNo: 'ORD-CANCEL-INSUFFICIENT'
        },
        timestamp: '2026-09-24T00:46:31+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-CANCEL-INSUFFICIENT',
        amount: 4035714,
        partnerReferenceNo: '4035714',
        reason: 'Network timeout'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4035714');
      expect(result.responseMessage).toBe('Insufficient Funds');
      expect(result.isInsufficientFunds).toBe(true);
      expect(result.isCancelFailed).toBe(true);
      expect(result.error).toContain('Insufficient Funds');

      // In App Partner Action: Cancel mark as failed
      const record = settlementStore.getSettlement('ORD-CANCEL-INSUFFICIENT');
      expect(record).toBeDefined();
      expect(record?.cancelDetails).toBeDefined();
      expect(record?.cancelDetails?.status).toBe('FAILED');
      expect(record?.cancelDetails?.error).toContain('Insufficient Funds');
    });

    it('handles 5005701 Internal Server Error response (In App Partner Action: Cancel mark as failed)', async () => {
      // 1. Seed existing pending order
      settlementStore.recordSettlement({
        orderId: 'ORD-CANCEL-500',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 5005701,
        platformFee: 100114,
        netPayout: 4905587,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'PENDING',
        partnerReferenceNo: 'ORD-CANCEL-500',
        settledAt: Date.now()
      });

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 500 } as any,
        data: {
          responseCode: '5005701',
          responseMessage: 'Internal Server Error',
          originalPartnerReferenceNo: 'ORD-CANCEL-500'
        },
        timestamp: '2026-09-24T00:46:31+07:00'
      });

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-CANCEL-500',
        amount: 5005701,
        partnerReferenceNo: '5005701',
        reason: 'Network timeout'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('5005701');
      expect(result.responseMessage).toBe('Internal Server Error');
      expect(result.isInternalServerError).toBe(true);
      expect(result.isCancelFailed).toBe(true);
      expect(result.error).toContain('Internal Server Error');

      // In App Partner Action: Cancel mark as failed
      const record = settlementStore.getSettlement('ORD-CANCEL-500');
      expect(record).toBeDefined();
      expect(record?.cancelDetails).toBeDefined();
      expect(record?.cancelDetails?.status).toBe('FAILED');
      expect(record?.cancelDetails?.error).toContain('Internal Server Error');
    });

    it('handles network / connection errors gracefully', async () => {
      vi.spyOn(service, 'executeSnapPost').mockRejectedValueOnce(new Error('Connection reset'));

      const result = await service.cancelOrder({
        originalPartnerReferenceNo: 'ORD-ERR',
        amount: 10000
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection reset');
    });
  });

  describe('Route POST /api/dana/debit/cancel', () => {
    it('returns 200 on successful cancel', async () => {
      vi.spyOn(service, 'cancelOrder').mockResolvedValueOnce({
        success: true,
        responseCode: '2005700',
        responseMessage: 'Success',
        originalPartnerReferenceNo: 'ORD-API-CANCEL',
        cancelTime: '2026-09-24T00:46:31+07:00',
        isCancelSuccess: true
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-CANCEL',
          amount: 10000,
          reason: 'Network timeout'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.responseCode).toBe('2005700');
      expect(data.responseMessage).toBe('Success');
    });

    it('returns 202 when cancel is in progress (2025700)', async () => {
      vi.spyOn(service, 'cancelOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '2025700',
        responseMessage: 'Request In Progress',
        originalPartnerReferenceNo: 'ORD-API-PROG',
        isInProgress: true
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-PROG',
          amount: 2025700,
          reason: 'Network timeout'
        })
      });

      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.responseCode).toBe('2025700');
      expect(data.responseMessage).toBe('Request In Progress');
      expect(data.isInProgress).toBe(true);
    });

    it('returns 401 on Unauthorized. Invalid Signature (4015700)', async () => {
      vi.spyOn(service, 'cancelOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4015700',
        responseMessage: 'Unauthorized. Invalid Signature',
        isUnauthorized: true,
        isCancelFailed: true,
        error: 'Unauthorized: Unauthorized. Invalid Signature. Signature verification failed.'
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-UNAUTH',
          amount: 10000,
          headers: { 'X-SIGNATURE': 'invalid_signature' }
        })
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.responseCode).toBe('4015700');
      expect(data.responseMessage).toBe('Unauthorized. Invalid Signature');
      expect(data.isUnauthorized).toBe(true);
      expect(data.isCancelFailed).toBe(true);
    });

    it('returns 403 on Do Not Honor (4035705)', async () => {
      vi.spyOn(service, 'cancelOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4035705',
        responseMessage: 'Do Not Honor',
        isDoNotHonor: true,
        error: 'Do Not Honor: Do Not Honor. Cancellation rejected by upstream issuer.'
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-DONOTHONOR',
          amount: 4035705
        })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.responseCode).toBe('4035705');
      expect(data.isDoNotHonor).toBe(true);
    });

    it('returns 403 on Transaction Expired (4035700)', async () => {
      vi.spyOn(service, 'cancelOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4035700',
        responseMessage: 'Transaction Expired',
        isTransactionExpired: true,
        error: 'Transaction Expired: Transaction Expired. Order has expired and cannot be cancelled.'
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-EXPIRED',
          amount: 4035700
        })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.responseCode).toBe('4035700');
      expect(data.isTransactionExpired).toBe(true);
    });

    it('returns 403 on Transaction Not Permitted (4035715)', async () => {
      vi.spyOn(service, 'cancelOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4035715',
        responseMessage: 'Transaction Not Permitted',
        isTransactionNotPermitted: true,
        error: 'Transaction Not Permitted: Transaction Not Permitted. Cancellation is not permitted for this transaction.'
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-NOT-PERM',
          amount: 4035715
        })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.responseCode).toBe('4035715');
      expect(data.isTransactionNotPermitted).toBe(true);
    });

    it('returns 403 on Insufficient Funds (4035714)', async () => {
      vi.spyOn(service, 'cancelOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4035714',
        responseMessage: 'Insufficient Funds',
        isInsufficientFunds: true,
        error: 'Insufficient Funds: Insufficient Funds. Partner or merchant balance is insufficient for cancellation.'
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-INSUFFICIENT',
          amount: 4035714
        })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.responseCode).toBe('4035714');
      expect(data.isInsufficientFunds).toBe(true);
    });

    it('returns 404 on Invalid Merchant (4045708)', async () => {
      vi.spyOn(service, 'cancelOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4045708',
        responseMessage: 'Invalid Merchant',
        isInvalidMerchant: true,
        error: 'Invalid Merchant: Invalid Merchant. Merchant ID is invalid or not registered for cancel service.'
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-INVMERCH',
          amount: 4045708
        })
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.responseCode).toBe('4045708');
      expect(data.isInvalidMerchant).toBe(true);
    });

    it('returns 404 on invalid transaction status', async () => {
      vi.spyOn(service, 'cancelOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4045700',
        responseMessage: 'Invalid Transaction Status',
        isInvalidStatus: true,
        error: 'Invalid Transaction Status'
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-INVALID',
          amount: 10000
        })
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.responseCode).toBe('4045700');
    });

    it('returns 500 on Internal Server Error (5005701)', async () => {
      vi.spyOn(service, 'cancelOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '5005701',
        responseMessage: 'Internal Server Error',
        isInternalServerError: true,
        isCancelFailed: true,
        error: 'Internal Server Error: Internal Server Error. Upstream timeout or system error during cancellation.'
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-500',
          amount: 5005701
        })
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.responseCode).toBe('5005701');
      expect(data.isInternalServerError).toBe(true);
      expect(data.isCancelFailed).toBe(true);
    });

    it('returns 400 when originalPartnerReferenceNo or amount is missing', async () => {
      const res = await fetch(`${baseUrl}/api/dana/debit/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('required');
    });
  });
});
