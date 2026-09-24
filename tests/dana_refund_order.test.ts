import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { Server } from 'http';
import { DanaPaymentService } from '../src/capabilities/fintech/dana/DanaPaymentService';
import { DanaClient } from '../src/capabilities/fintech/dana/DanaClient';
import { OrderSettlementStore } from '../src/capabilities/fintech/dana/OrderSettlementStore';
import { createDanaRouter } from '../src/server/routes/danaRoutes';

describe('DANA Direct Debit Refund Order (Scenario: 2005800 & In App Partner Action)', () => {
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
      privateKey: 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDfNzwfWuCX3JkmF5sFS2MMq5taj63CQXjumYemM8EMkb4D0Y9qprkNOiHVy8BO7buebfs0ssRDyqnb3fX9SkdpW5/IBNJNCby8hw3B2ZH3l4/OLPqnZWlGggpqKt7GGyHuanRvxougy+7OFdNrYGWOvn+gTb1fKw+C3FcdvqQBxcv1H8RD9yPOO+sBjeApjg2QgheXAXqKMwpW1Dpgyx34Q09iHmtf5+ei813yl6ZMayAHrO9kuVpQS0gHeIGYjVHjO7xkhBkxoAGWLac6GiMJWW1AXWghSLY32dAh6jiaKQVMBoaepXTU/3vGR0u0qARf7y1a84ECf3OO/iAu0SfhAgMBAAECgf9DI1nyFGN5SeDGlFMMRKCGLxeLJawdwZOeMI+cbfSi0zNT8rQwX/VJBTMoGyC8nMTR4kKslxhxS4PLnfdfN/hCuExW3RxkD4m1Kun4ZHiDABNA8EZ0EwyXKIX5aOuYqpCKJXrgI9fbhXtOgUIWCeiCBspcbQWImmsP8TZCvBSYc1YIzSEZc8iQmlfJa2vRNDncdz1v+GrHjFROl9BM8a43BhzuRfNqFysl1PPp1xyZNIVFx/S9NmmoFqSN+PUZPDxHo48s2kcg2rflcIlKFVjCuO6aBMVfaVqBBEh96IwzL7aWAgmWqiyx4thNKQ3j+mQH4ytZYGlmQ3Vmk43hc4UCgYEA9hF5CoSOWbpRYdKSrWwG30+AJ+DmPgmPkQ/P7lkJRq8gzPZ4xDxgo11Ggaa8PgwAADi9N5eO1WNG1ZcIpOyMi3H9x3vBu00G68yl+7edqwUbZ/4B87QQ/qGP/Heo9jMqUY15nPmZ3mOSpm/pAo+Xh2z7Cv+qKYOY7CuRPGT4rOMCgYEA6Dmi21MWD9bJmILjO+1R15h5ScyuAX1t6sxDEIo5l5aVyGO2q4B7WsCv2dGINOw/gfXUXE5EnKI1UmEXt907gjx3AtNxEX0X7rhhqRYJUKOYzvyz+2/vfAYYqhQB9ZMZlpRBsnd9agbVbaYklXFspNDIP34K99MY3vJFJMMtl2sCgYEAoXb9sgUhU4eK92GxldKY/9evBHvzGSo05r81dfU+vP8VyujAfiQQVaJTLag3RY+iQIL6xovQ0fz+8hDVP0NpReda25c9nKYCsJ/tGqt17k6/mRF4Pm4d6LgjP0tVt5gDYNgwwOyYJvG3vTcZ8vA+QkMkyCbThcIwimhcOQEYnHkCgYEA45uqHWGAHCIfERYodhISx0cwib7NRbSUSS/PA6UW8ZasU+43mjyhqr91G/6ci5KKZGx3qckkwojRzl5PiuyRaQKuetyW09dR365kOf/ZPWo7WZShK234wgyPnBNkIDf/OnExOySWjZcJFSFkdfznyVrBCkoVofULSWkXkAKk6uUCgYEAiRSFEIL7BXUHPim71jbyHHHSyGPTzToFaVWOqKAU5OZizmJMh3C8mt5yWTgLzCN1D8ZmhcY5qIP3/F+fiInSUOTHrIiN6Y1IdH/SOm0beNMpZNK2+rs6J5XWuJ4UtzlWtLT78ukkPKv6iB7QFHrM0BOAXTOE2rTeeIjI/ZcOxlQ='
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

  describe('DanaPaymentService.refundOrder', () => {
    it('refunds order successfully with 2005800 response (In App Partner Action: Refund mark as successful, User able to see refunded transaction in transaction history)', async () => {
      // 1. Seed existing completed order in settlement store
      settlementStore.recordSettlement({
        orderId: 'ORD-REF-1001',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 15000,
        platformFee: 300,
        netPayout: 14700,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'SUCCESS',
        partnerReferenceNo: 'ORD-REF-1001',
        referenceNo: '20260923111230999500166874300571702',
        settledAt: Date.now()
      });

      const mockSuccessRefund = {
        responseCode: '2005800',
        responseMessage: 'success',
        serviceCode: '58',
        originalPartnerReferenceNo: 'ORD-REF-1001',
        originalReferenceNo: '20260923111230999500166874300571702',
        partnerRefundNo: 'REFUND-1001',
        refundNo: '20260923111230999500166899900571888',
        refundAmount: {
          value: '15000.00',
          currency: 'IDR'
        },
        refundTime: '2026-09-23T10:10:00+07:00'
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: true, status: 200 } as any,
        data: mockSuccessRefund,
        timestamp: '2026-09-23T10:10:00+07:00'
      });

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-REF-1001',
        partnerRefundNo: 'REFUND-1001',
        refundAmount: 15000,
        reason: 'Customer requested refund'
      });

      expect(result.success).toBe(true);
      expect(result.responseCode).toBe('2005800');
      expect(result.responseMessage).toBe('success');
      expect(result.isRefundSuccess).toBe(true);
      expect(result.refundNo).toBe('20260923111230999500166899900571888');

      // Verify In-App Partner Action: Marked as REFUNDED in SettlementStore
      const updated = settlementStore.getSettlement('ORD-REF-1001');
      expect(updated).toBeDefined();
      expect(updated?.status).toBe('REFUNDED');
      expect(updated?.refundDetails).toBeDefined();
      expect(updated?.refundDetails?.refundNo).toBe('20260923111230999500166899900571888');
      expect(updated?.refundDetails?.partnerRefundNo).toBe('REFUND-1001');
      expect(updated?.refundDetails?.refundAmount).toBe(15000);
      expect(updated?.refundDetails?.status).toBe('SUCCESS');
    });

    it('handles 2025800 Request In Progress response (In App Partner Action: Refund mark as pending)', async () => {
      // 1. Seed existing completed order in settlement store
      settlementStore.recordSettlement({
        orderId: 'ORD-REF-PROG-202',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 225800,
        platformFee: 4516,
        netPayout: 221284,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'SUCCESS',
        partnerReferenceNo: 'ORD-REF-PROG-202',
        settledAt: Date.now()
      });

      const mockInProgressRefund = {
        responseCode: '2025800',
        responseMessage: 'Request In Progress',
        serviceCode: '58',
        originalPartnerReferenceNo: 'ORD-REF-PROG-202',
        originalReferenceNo: '20260923111230999500166850300573122',
        partnerRefundNo: 'REFUND-PROG-1002',
        refundAmount: {
          value: '225800.00',
          currency: 'IDR'
        }
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 202 } as any,
        data: mockInProgressRefund,
        timestamp: '2026-09-23T23:00:00+07:00'
      });

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-REF-PROG-202',
        partnerRefundNo: 'REFUND-PROG-1002',
        refundAmount: 225800,
        amountValueOverride: '225800.00',
        reason: 'Testing in progress scenario'
      });

      expect(result.responseCode).toBe('2025800');
      expect(result.responseMessage).toBe('Request In Progress');
      expect(result.isInProgress).toBe(true);

      // In App Partner Action: Refund mark as pending
      const updated = settlementStore.getSettlement('ORD-REF-PROG-202');
      expect(updated).toBeDefined();
      expect(updated?.status).toBe('PENDING');
      expect(updated?.refundDetails).toBeDefined();
      expect(updated?.refundDetails?.status).toBe('PENDING');
      expect(updated?.refundDetails?.refundAmount).toBe(225800);
      expect(updated?.refundDetails?.partnerRefundNo).toBe('REFUND-PROG-1002');
    });

    it('handles 4045801 Transaction Not Found response', async () => {
      const mockNotFound = {
        responseCode: '4045801',
        responseMessage: 'Transaction Not Found',
        originalPartnerReferenceNo: 'ORD-UNKNOWN-999',
        partnerRefundNo: 'REFUND-999',
        refundAmount: { value: '10000.00', currency: 'IDR' }
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 404 } as any,
        data: mockNotFound,
        timestamp: '2026-09-23T10:10:00+07:00'
      });

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-UNKNOWN-999',
        refundAmount: 10000
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4045801');
      expect(result.isNotFound).toBe(true);
      expect(result.error).toContain('Transaction Not Found');
    });

    it('handles 4045800 Invalid Transaction Status response (unpaid transaction)', async () => {
      const mockInvalidStatus = {
        responseCode: '4045800',
        responseMessage: 'Invalid Transaction Status',
        originalPartnerReferenceNo: 'ORD-UNPAID-1002',
        partnerRefundNo: 'REFUND-1002',
        refundAmount: { value: '15000.00', currency: 'IDR' }
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 404 } as any,
        data: mockInvalidStatus,
        timestamp: '2026-09-23T10:10:00+07:00'
      });

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-UNPAID-1002',
        refundAmount: 15000
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4045800');
      expect(result.isInvalidStatus).toBe(true);
      expect(result.error).toContain('Invalid Transaction Status');
    });

    it('handles 4015800 Unauthorized response appropriately', async () => {
      const mockUnauthorized = {
        responseCode: '4015800',
        responseMessage: 'Unauthorized. Invalid Signature',
        originalPartnerReferenceNo: 'ORD-UNAUTH'
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 401 } as any,
        data: mockUnauthorized,
        timestamp: '2026-09-23T10:10:00+07:00'
      });

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-UNAUTH',
        refundAmount: 10000
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4015800');
      expect(result.isUnauthorized).toBe(true);
      expect(result.error).toContain('Unauthorized');
    });

    it('handles 4005802 Missing Mandatory Field response', async () => {
      const mockMissingMandatory = {
        responseCode: '4005802',
        responseMessage: 'Invalid Mandatory Field refundAmount',
        originalPartnerReferenceNo: 'ORD-NO-AMT'
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 400 } as any,
        data: mockMissingMandatory,
        timestamp: '2026-09-23T10:10:00+07:00'
      });

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-NO-AMT',
        refundAmount: 0
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4005802');
      expect(result.isMissingMandatoryField).toBe(true);
      expect(result.error).toContain('Missing Mandatory Field');
    });

    it('handles 4035815 Transaction Not Permitted response (In App Partner Action: Refund mark as failed)', async () => {
      // 1. Seed existing settled order
      settlementStore.recordSettlement({
        orderId: 'ORD-NOT-PERMITTED-403',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 435815,
        platformFee: 8716,
        netPayout: 427099,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'SUCCESS',
        partnerReferenceNo: 'ORD-NOT-PERMITTED-403',
        settledAt: Date.now()
      });

      const mockNotPermitted = {
        responseCode: '4035815',
        responseMessage: 'Transaction Not Permitted',
        originalReferenceNo: '20260923111230999500166850300573122',
        originalPartnerReferenceNo: 'ORD-NOT-PERMITTED-403',
        partnerRefundNo: 'REFUND-NOT-PERM-1',
        refundAmount: {
          value: '435815.00',
          currency: 'IDR'
        }
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 403 } as any,
        data: mockNotPermitted,
        timestamp: '2026-09-23T23:00:00+07:00'
      });

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-NOT-PERMITTED-403',
        partnerRefundNo: 'REFUND-NOT-PERM-1',
        refundAmount: 435815,
        amountValueOverride: '435815.00',
        reason: 'Testing not permitted scenario'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4035815');
      expect(result.responseMessage).toBe('Transaction Not Permitted');
      expect(result.isTransactionNotPermitted).toBe(true);
      expect(result.error).toContain('Transaction Not Permitted');

      // Verify In-App Partner Action: Refund mark as failed in SettlementStore
      const updated = settlementStore.getSettlement('ORD-NOT-PERMITTED-403');
      expect(updated).toBeDefined();
      expect(updated?.status).toBe('SUCCESS'); // Primary payment not reverted
      expect(updated?.refundDetails).toBeDefined();
      expect(updated?.refundDetails?.status).toBe('FAILED');
      expect(updated?.refundDetails?.error).toContain('Transaction Not Permitted');
      expect(updated?.refundDetails?.refundAmount).toBe(435815);
    });

    it('handles 4045818 Inconsistent Request response (In App Partner Action: Refund mark as failed)', async () => {
      // 1. Seed existing settled order
      settlementStore.recordSettlement({
        orderId: 'ORD-INCONSISTENT-404',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 50000,
        platformFee: 1000,
        netPayout: 49000,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'SUCCESS',
        partnerReferenceNo: 'ORD-INCONSISTENT-404',
        settledAt: Date.now()
      });

      const mockInconsistent = {
        responseCode: '4045818',
        responseMessage: 'Inconsistent Request',
        originalReferenceNo: '20260923111230999500166850300573122',
        originalPartnerReferenceNo: 'ORD-INCONSISTENT-404',
        partnerRefundNo: 'ORD-INCONSISTENT-404',
        refundAmount: {
          value: '435815.00',
          currency: 'IDR'
        }
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 404 } as any,
        data: mockInconsistent,
        timestamp: '2026-09-23T23:00:00+07:00'
      });

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-INCONSISTENT-404',
        partnerRefundNo: 'ORD-INCONSISTENT-404',
        refundAmount: 435815,
        amountValueOverride: '435815.00',
        reason: 'Merchant Requests Cancel Order - Inconsistent Request'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4045818');
      expect(result.responseMessage).toBe('Inconsistent Request');
      expect(result.isInconsistentRequest).toBe(true);
      expect(result.error).toContain('Inconsistent Request');

      // Verify In-App Partner Action: Refund mark as failed in SettlementStore
      const updated = settlementStore.getSettlement('ORD-INCONSISTENT-404');
      expect(updated).toBeDefined();
      expect(updated?.status).toBe('SUCCESS'); // Primary payment not reverted
      expect(updated?.refundDetails).toBeDefined();
      expect(updated?.refundDetails?.status).toBe('FAILED');
      expect(updated?.refundDetails?.error).toContain('Inconsistent Request');
      expect(updated?.refundDetails?.refundAmount).toBe(435815);
    });

    it('handles 4035814 Insufficient Funds response (In App Partner Action: Refund mark as failed)', async () => {
      // 1. Seed existing settled order
      settlementStore.recordSettlement({
        orderId: 'ORD-INSUFFICIENT-403',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 435814,
        platformFee: 8716,
        netPayout: 427098,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'SUCCESS',
        partnerReferenceNo: 'ORD-INSUFFICIENT-403',
        settledAt: Date.now()
      });

      const mockInsufficientFunds = {
        responseCode: '4035814',
        responseMessage: 'Insufficient Funds',
        originalReferenceNo: '20260923111230999500166850300573122',
        originalPartnerReferenceNo: 'ORD-INSUFFICIENT-403',
        partnerRefundNo: 'REFUND-INSUFF-1',
        refundAmount: {
          value: '435814.00',
          currency: 'IDR'
        }
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 403 } as any,
        data: mockInsufficientFunds,
        timestamp: '2026-09-23T23:00:00+07:00'
      });

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-INSUFFICIENT-403',
        partnerRefundNo: 'REFUND-INSUFF-1',
        refundAmount: 435814,
        amountValueOverride: '435814.00',
        reason: 'Merchant Requests Cancel Order - Insufficient Funds'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4035814');
      expect(result.responseMessage).toBe('Insufficient Funds');
      expect(result.isInsufficientFunds).toBe(true);
      expect(result.error).toContain('Insufficient Funds');

      // Verify In-App Partner Action: Refund mark as failed in SettlementStore
      const updated = settlementStore.getSettlement('ORD-INSUFFICIENT-403');
      expect(updated).toBeDefined();
      expect(updated?.status).toBe('SUCCESS'); // Primary payment not reverted
      expect(updated?.refundDetails).toBeDefined();
      expect(updated?.refundDetails?.status).toBe('FAILED');
      expect(updated?.refundDetails?.error).toContain('Insufficient Funds');
      expect(updated?.refundDetails?.refundAmount).toBe(435814);
    });

    it('handles 5005801 Internal Server Error response (In App Partner Action: Refund held pending retry)', async () => {
      // 1. Seed existing settled order
      settlementStore.recordSettlement({
        orderId: 'ORD-500-ERROR-1',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 505801,
        platformFee: 10116,
        netPayout: 495685,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'SUCCESS',
        partnerReferenceNo: 'ORD-500-ERROR-1',
        settledAt: Date.now()
      });

      const mockInternalServerError = {
        responseCode: '5005801',
        responseMessage: 'Internal Server Error',
        originalReferenceNo: '20260923111230999500166850300573122',
        originalPartnerReferenceNo: 'ORD-500-ERROR-1',
        partnerRefundNo: 'REFUND-500-1',
        refundAmount: {
          value: '505801.00',
          currency: 'IDR'
        }
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 500 } as any,
        data: mockInternalServerError,
        timestamp: '2026-09-24T00:00:00+07:00'
      });

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-500-ERROR-1',
        partnerRefundNo: 'REFUND-500-1',
        refundAmount: 505801,
        amountValueOverride: '505801.00',
        reason: 'Merchant Requests Cancel Order - Internal Server Error'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('5005801');
      expect(result.responseMessage).toBe('Internal Server Error');
      expect(result.isInternalServerError).toBe(true);
      expect(result.error).toContain('Internal Server Error');

      // Verify In-App Partner Action: Refund recorded with error while underlying order is preserved
      const updated = settlementStore.getSettlement('ORD-500-ERROR-1');
      expect(updated).toBeDefined();
      expect(updated?.status).toBe('SUCCESS'); // Primary payment not reverted
      expect(updated?.refundDetails).toBeDefined();
      expect(updated?.refundDetails?.status).toBe('FAILED');
      expect(updated?.refundDetails?.error).toContain('Internal Server Error');
      expect(updated?.refundDetails?.refundAmount).toBe(505801);
    });

    it('handles 4045808 Merchant Status Abnormal response (In App Partner Action: Refund mark as failed)', async () => {
      // 1. Seed existing settled order
      settlementStore.recordSettlement({
        orderId: 'ORD-ABNORMAL-404',
        storeId: 'STORE-1',
        storeName: 'Test Store',
        grossAmount: 445808,
        platformFee: 8916,
        netPayout: 436892,
        payoutMethod: 'DANA',
        destination: '081298055138',
        status: 'SUCCESS',
        partnerReferenceNo: 'ORD-ABNORMAL-404',
        settledAt: Date.now()
      });

      const mockAbnormalMerchant = {
        responseCode: '4045808',
        responseMessage: 'Merchant Status Abnormal',
        originalReferenceNo: '20260923111230999500166850300573122',
        originalPartnerReferenceNo: 'ORD-ABNORMAL-404',
        partnerRefundNo: 'REFUND-ABN-1',
        refundAmount: {
          value: '445808.00',
          currency: 'IDR'
        }
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 404 } as any,
        data: mockAbnormalMerchant,
        timestamp: '2026-09-24T00:00:00+07:00'
      });

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-ABNORMAL-404',
        partnerRefundNo: 'REFUND-ABN-1',
        refundAmount: 445808,
        amountValueOverride: '445808.00',
        reason: 'Merchant Requests Cancel Order - Merchant Status Abnormal'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4045808');
      expect(result.responseMessage).toBe('Merchant Status Abnormal');
      expect(result.isMerchantStatusAbnormal).toBe(true);
      expect(result.error).toContain('Merchant Status Abnormal');

      // Verify In-App Partner Action: Refund marked as failed in SettlementStore
      const updated = settlementStore.getSettlement('ORD-ABNORMAL-404');
      expect(updated).toBeDefined();
      expect(updated?.status).toBe('SUCCESS'); // Primary payment not reverted
      expect(updated?.refundDetails).toBeDefined();
      expect(updated?.refundDetails?.status).toBe('FAILED');
      expect(updated?.refundDetails?.error).toContain('Merchant Status Abnormal');
      expect(updated?.refundDetails?.refundAmount).toBe(445808);
    });

    it('handles network / connection errors gracefully', async () => {
      vi.spyOn(service, 'executeSnapPost').mockRejectedValueOnce(new Error('ETIMEDOUT'));

      const result = await service.refundOrder({
        originalPartnerReferenceNo: 'ORD-TIMEOUT',
        refundAmount: 10000
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('ETIMEDOUT');
    });
  });

  describe('Route POST /api/dana/debit/refund', () => {
    it('returns 200 with refund payload on successful refund', async () => {
      vi.spyOn(service, 'refundOrder').mockResolvedValueOnce({
        success: true,
        responseCode: '2005800',
        responseMessage: 'success',
        originalPartnerReferenceNo: 'ORD-API-REFUND',
        originalReferenceNo: '20260923111230999500166874300571702',
        partnerRefundNo: 'REF-API-1',
        refundNo: '20260923111230999500166899900571888',
        refundAmount: 15000,
        currency: 'IDR',
        isRefundSuccess: true
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-REFUND',
          refundAmount: 15000,
          reason: 'Customer return'
        })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.responseCode).toBe('2005800');
      expect(body.responseMessage).toBe('success');
      expect(body.isRefundSuccess).toBe(true);
    });

    it('returns 202 when refund is in progress (2025800)', async () => {
      vi.spyOn(service, 'refundOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '2025800',
        responseMessage: 'Request In Progress',
        originalPartnerReferenceNo: 'ORD-API-REFUND-PROG',
        partnerRefundNo: 'REFUND-PROG-202',
        refundAmount: 225800,
        currency: 'IDR',
        isInProgress: true
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-API-REFUND-PROG',
          refundAmount: 225800,
          amountValueOverride: '225800.00',
          reason: 'Customer return in progress'
        })
      });

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.responseCode).toBe('2025800');
      expect(body.responseMessage).toBe('Request In Progress');
      expect(body.isInProgress).toBe(true);
    });

    it('returns 400 when originalPartnerReferenceNo or refundAmount is missing', async () => {
      const res = await fetch(`${baseUrl}/api/dana/debit/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refundAmount: 15000 })
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('required');
    });

    it('returns 404 when transaction is not found upstream', async () => {
      vi.spyOn(service, 'refundOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4045801',
        responseMessage: 'Transaction Not Found',
        originalPartnerReferenceNo: 'ORD-NOT-FOUND',
        isNotFound: true
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-NOT-FOUND',
          refundAmount: 10000
        })
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.responseCode).toBe('4045801');
    });

    it('returns 401 when request is unauthorized', async () => {
      vi.spyOn(service, 'refundOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4015800',
        responseMessage: 'Unauthorized. Invalid Signature',
        originalPartnerReferenceNo: 'ORD-UNAUTH',
        isUnauthorized: true
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-UNAUTH',
          refundAmount: 10000
        })
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.responseCode).toBe('4015800');
    });

    it('returns 403 when transaction is not permitted (4035815)', async () => {
      vi.spyOn(service, 'refundOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4035815',
        responseMessage: 'Transaction Not Permitted',
        originalPartnerReferenceNo: 'ORD-NOT-PERM',
        partnerRefundNo: 'REFUND-NOT-PERM',
        refundAmount: 435815,
        currency: 'IDR',
        isTransactionNotPermitted: true
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-NOT-PERM',
          refundAmount: 435815,
          amountValueOverride: '435815.00'
        })
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.responseCode).toBe('4035815');
      expect(body.responseMessage).toBe('Transaction Not Permitted');
      expect(body.isTransactionNotPermitted).toBe(true);
    });

    it('returns 404 when inconsistent request is detected (4045818)', async () => {
      vi.spyOn(service, 'refundOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4045818',
        responseMessage: 'Inconsistent Request',
        originalPartnerReferenceNo: 'ORD-INCON',
        partnerRefundNo: 'ORD-INCON',
        refundAmount: 435815,
        currency: 'IDR',
        isInconsistentRequest: true
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-INCON',
          partnerRefundNo: 'ORD-INCON',
          refundAmount: 435815,
          amountValueOverride: '435815.00'
        })
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.responseCode).toBe('4045818');
      expect(body.responseMessage).toBe('Inconsistent Request');
      expect(body.isInconsistentRequest).toBe(true);
    });

    it('returns 403 when merchant account has insufficient funds (4035814)', async () => {
      vi.spyOn(service, 'refundOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4035814',
        responseMessage: 'Insufficient Funds',
        originalPartnerReferenceNo: 'ORD-INSUFF-API',
        partnerRefundNo: 'REF-INSUFF-API',
        refundAmount: 435814,
        currency: 'IDR',
        isInsufficientFunds: true
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-INSUFF-API',
          refundAmount: 435814,
          amountValueOverride: '435814.00'
        })
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.responseCode).toBe('4035814');
      expect(body.responseMessage).toBe('Insufficient Funds');
      expect(body.isInsufficientFunds).toBe(true);
    });

    it('returns 500 when upstream returns Internal Server Error (5005801)', async () => {
      vi.spyOn(service, 'refundOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '5005801',
        responseMessage: 'Internal Server Error',
        originalPartnerReferenceNo: 'ORD-500-API',
        partnerRefundNo: 'REF-500-API',
        refundAmount: 505801,
        currency: 'IDR',
        isInternalServerError: true
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-500-API',
          refundAmount: 505801,
          amountValueOverride: '505801.00'
        })
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.responseCode).toBe('5005801');
      expect(body.responseMessage).toBe('Internal Server Error');
      expect(body.isInternalServerError).toBe(true);
    });

    it('returns 404 when merchant status is abnormal (4045808)', async () => {
      vi.spyOn(service, 'refundOrder').mockResolvedValueOnce({
        success: false,
        responseCode: '4045808',
        responseMessage: 'Merchant Status Abnormal',
        originalPartnerReferenceNo: 'ORD-ABN-API',
        partnerRefundNo: 'REF-ABN-API',
        refundAmount: 445808,
        currency: 'IDR',
        isMerchantStatusAbnormal: true
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-ABN-API',
          refundAmount: 445808,
          amountValueOverride: '445808.00'
        })
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.responseCode).toBe('4045808');
      expect(body.responseMessage).toBe('Merchant Status Abnormal');
      expect(body.isMerchantStatusAbnormal).toBe(true);
    });
  });
});
