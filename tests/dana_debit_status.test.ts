import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { Server } from 'http';
import { DanaPaymentService } from '../src/capabilities/fintech/dana/DanaPaymentService';
import { DanaClient } from '../src/capabilities/fintech/dana/DanaClient';
import { OrderSettlementStore } from '../src/capabilities/fintech/dana/OrderSettlementStore';
import { createDanaRouter } from '../src/server/routes/danaRoutes';

describe('DANA Direct Debit Payment Status Inquiry (Scenario 38: 2005500 & latestTransactionStatus 00)', () => {
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

  describe('DanaPaymentService.queryDebitPaymentStatus', () => {
    it('queries payment status and gets Successful response with Final status 00 (In App Partner Action: Order has been paid)', async () => {
      const mockSuccessResponse = {
        responseCode: '2005500',
        responseMessage: 'Successful',
        originalPartnerReferenceNo: 'ORD-SUCCESS-1001',
        originalReferenceNo: '20260923111230999500166874300571702',
        serviceCode: '54',
        latestTransactionStatus: '00',
        transactionStatusDesc: 'SUCCESS',
        amount: {
          value: '15000.00',
          currency: 'IDR'
        },
        additionalInfo: {
          statusDetail: {
            acquirementStatus: 'SUCCESS'
          }
        }
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: true, status: 200 } as any,
        data: mockSuccessResponse,
        timestamp: '2026-09-23T08:00:00+07:00'
      });

      const result = await service.queryDebitPaymentStatus({
        originalPartnerReferenceNo: 'ORD-SUCCESS-1001',
        originalReferenceNo: '20260923111230999500166874300571702',
        serviceCode: '54'
      });

      expect(result.success).toBe(true);
      expect(result.responseCode).toBe('2005500');
      expect(result.responseMessage).toBe('Successful');
      expect(result.latestTransactionStatus).toBe('00');
      expect(result.transactionStatusDesc).toBe('SUCCESS');
      expect(result.isPaid).toBe(true);
      expect(result.isPending).toBe(false);
      expect(result.amount).toBe(15000);

      // Verify endpoint and SNAP BI payload structure
      expect(service.executeSnapPost).toHaveBeenCalledWith(
        '/payment-gateway/v1.0/debit/status.htm',
        expect.objectContaining({
          merchantId: '216620090013051961943',
          originalPartnerReferenceNo: 'ORD-SUCCESS-1001',
          originalReferenceNo: '20260923111230999500166874300571702',
          serviceCode: '54'
        }),
        expect.any(String),
        undefined
      );

      // Verify In-App Action: Order marked as paid (SUCCESS) in Settlement Store
      const settlement = settlementStore.getSettlement('ORD-SUCCESS-1001');
      expect(settlement).toBeDefined();
      expect(settlement?.status).toBe('SUCCESS');
      expect(settlement?.referenceNo).toBe('20260923111230999500166874300571702');
    });

    it('handles pending status 01 (INIT) without marking order as paid', async () => {
      const mockInitResponse = {
        responseCode: '2005500',
        responseMessage: 'Successful',
        originalPartnerReferenceNo: 'ORD-INIT-1002',
        originalReferenceNo: '20260923111230999500166874300571703',
        serviceCode: '54',
        latestTransactionStatus: '01',
        transactionStatusDesc: 'INIT',
        amount: {
          value: '15000.00',
          currency: 'IDR'
        }
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: true, status: 200 } as any,
        data: mockInitResponse,
        timestamp: '2026-09-23T08:00:00+07:00'
      });

      const result = await service.queryDebitPaymentStatus({
        originalPartnerReferenceNo: 'ORD-INIT-1002'
      });

      expect(result.success).toBe(true);
      expect(result.latestTransactionStatus).toBe('01');
      expect(result.isPaid).toBe(false);
      expect(result.isPending).toBe(true);
      expect(settlementStore.getSettlement('ORD-INIT-1002')).toBeUndefined();
    });

    it('handles expired / closed status 05 (CLOSED)', async () => {
      const mockClosedResponse = {
        responseCode: '2005500',
        responseMessage: 'Successful',
        originalPartnerReferenceNo: 'ORD-CLOSED-1003',
        serviceCode: '54',
        latestTransactionStatus: '05',
        transactionStatusDesc: 'CLOSED'
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: true, status: 200 } as any,
        data: mockClosedResponse,
        timestamp: '2026-09-23T08:00:00+07:00'
      });

      const result = await service.queryDebitPaymentStatus({
        originalPartnerReferenceNo: 'ORD-CLOSED-1003'
      });

      expect(result.success).toBe(true);
      expect(result.latestTransactionStatus).toBe('05');
      expect(result.isPaid).toBe(false);
      expect(result.isClosed).toBe(true);
    });

    it('handles 4045501 Transaction Not Found response', async () => {
      const mockNotFoundResponse = {
        responseCode: '4045501',
        responseMessage: 'Transaction Not Found',
        originalPartnerReferenceNo: 'ORD-NON-EXISTENT',
        serviceCode: '54'
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 404 } as any,
        data: mockNotFoundResponse,
        timestamp: '2026-09-23T08:00:00+07:00'
      });

      const result = await service.queryDebitPaymentStatus({
        originalPartnerReferenceNo: 'ORD-NON-EXISTENT'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4045501');
      expect(result.responseMessage).toBe('Transaction Not Found');
      expect(result.isPaid).toBe(false);
    });

    it('handles 4005502 Missing Mandatory Field X-TIMESTAMP response appropriately', async () => {
      const mockMissingTimestampResponse = {
        responseCode: '4005502',
        responseMessage: 'Invalid Mandatory Field X-TIMESTAMP',
        serviceCode: '54',
        originalPartnerReferenceNo: 'ORD-NO-TS'
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 400 } as any,
        data: mockMissingTimestampResponse,
        timestamp: '2026-09-23T08:00:00+07:00'
      });

      const result = await service.queryDebitPaymentStatus({
        originalPartnerReferenceNo: 'ORD-NO-TS'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4005502');
      expect(result.responseMessage).toBe('Invalid Mandatory Field X-TIMESTAMP');
      expect(result.isMissingMandatoryField).toBe(true);
      expect(result.isPaid).toBe(false);
      expect(result.error).toContain('Missing Mandatory Field');
      expect(result.error).toContain('X-TIMESTAMP');
    });

    it('handles 4005502 Missing Mandatory Field CHANNEL-ID response appropriately', async () => {
      const mockMissingChannelResponse = {
        responseCode: '4005502',
        responseMessage: 'Invalid Mandatory Field CHANNEL-ID',
        serviceCode: '54',
        originalPartnerReferenceNo: 'ORD-NO-CHANNEL'
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 400 } as any,
        data: mockMissingChannelResponse,
        timestamp: '2026-09-23T08:00:00+07:00'
      });

      const result = await service.queryDebitPaymentStatus({
        originalPartnerReferenceNo: 'ORD-NO-CHANNEL'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4005502');
      expect(result.responseMessage).toBe('Invalid Mandatory Field CHANNEL-ID');
      expect(result.isMissingMandatoryField).toBe(true);
      expect(result.error).toContain('CHANNEL-ID');
    });

    it('handles 4015500 Unauthorized Invalid Signature response appropriately (Scenario 40)', async () => {
      const mockUnauthorizedResponse = {
        responseCode: '4015500',
        responseMessage: 'Unauthorized. Invalid Signature',
        serviceCode: '54',
        originalPartnerReferenceNo: 'ORD-INVALID-SIG'
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 401 } as any,
        data: mockUnauthorizedResponse,
        timestamp: '2026-09-23T08:00:00+07:00'
      });

      const result = await service.queryDebitPaymentStatus({
        originalPartnerReferenceNo: 'ORD-INVALID-SIG',
        headers: {
          'X-SIGNATURE': 'invalid_signature'
        }
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4015500');
      expect(result.responseMessage).toBe('Unauthorized. Invalid Signature');
      expect(result.isUnauthorized).toBe(true);
      expect(result.isPaid).toBe(false);
      expect(result.error).toContain('Unauthorized');
      expect(result.error).toContain('RSA signature');
    });

    it('handles network / connection errors gracefully', async () => {
      vi.spyOn(service, 'executeSnapPost').mockRejectedValueOnce(new Error('Connection reset by peer'));

      const result = await service.queryDebitPaymentStatus({
        originalPartnerReferenceNo: 'ORD-ERR-1004'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection reset by peer');
    });
  });

  describe('Route POST /api/dana/debit/status', () => {
    it('returns 200 with status payload for successful payment query', async () => {
      vi.spyOn(service, 'queryDebitPaymentStatus').mockResolvedValueOnce({
        success: true,
        responseCode: '2005500',
        responseMessage: 'Successful',
        originalPartnerReferenceNo: 'ORD-API-2001',
        originalReferenceNo: '20260923111230999500166874300571702',
        serviceCode: '54',
        latestTransactionStatus: '00',
        transactionStatusDesc: 'SUCCESS',
        isPaid: true,
        amount: 15000,
        currency: 'IDR'
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalPartnerReferenceNo: 'ORD-API-2001' })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.responseCode).toBe('2005500');
      expect(body.latestTransactionStatus).toBe('00');
      expect(body.isPaid).toBe(true);
    });

    it('returns 404 when transaction is not found upstream', async () => {
      vi.spyOn(service, 'queryDebitPaymentStatus').mockResolvedValueOnce({
        success: false,
        responseCode: '4045501',
        responseMessage: 'Transaction Not Found',
        originalPartnerReferenceNo: 'ORD-NOT-FOUND'
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalPartnerReferenceNo: 'ORD-NOT-FOUND' })
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.responseCode).toBe('4045501');
    });

    it('returns 401 when request is unauthorized (Scenario 40)', async () => {
      vi.spyOn(service, 'queryDebitPaymentStatus').mockResolvedValueOnce({
        success: false,
        responseCode: '4015500',
        responseMessage: 'Unauthorized. Invalid Signature',
        originalPartnerReferenceNo: 'ORD-INVALID-SIG',
        isUnauthorized: true,
        error: 'Unauthorized: Unauthorized. Invalid Signature. Please verify SNAP BI client credentials and RSA signature.'
      });

      const res = await fetch(`${baseUrl}/api/dana/debit/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'ORD-INVALID-SIG',
          headers: {
            'X-SIGNATURE': 'invalid_signature'
          }
        })
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.responseCode).toBe('4015500');
      expect(body.responseMessage).toBe('Unauthorized. Invalid Signature');
      expect(body.isUnauthorized).toBe(true);
    });
  });
});
