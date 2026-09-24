import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { Server } from 'http';
import { DanaPaymentService } from '../src/capabilities/fintech/dana/DanaPaymentService';
import { DanaClient } from '../src/capabilities/fintech/dana/DanaClient';
import { createDanaRouter } from '../src/server/routes/danaRoutes';

describe('DANA Gapura Hosted Checkout (Create Order) - SNAP BI 2005400', () => {
  let client: DanaClient;
  let service: DanaPaymentService;
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

    service = new DanaPaymentService(client);

    app = express();
    app.use(express.json());
    app.use('/api/dana', createDanaRouter({ danaPaymentService: service }));

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

  it('successfully creates an order returning 2005400 and webRedirectUrl for user checkout', async () => {
    const mockSuccessResponse = {
      referenceNo: '20260922111230999500166938500558607',
      partnerReferenceNo: 'ORD-1790096364251',
      webRedirectUrl: 'https://m.sandbox.dana.id/n/pg/checkout?bizNo=ORD-1790096364251',
      responseCode: '2005400',
      responseMessage: 'Successful'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockSuccessResponse
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-1790096364251',
      amount: 15000,
      title: 'Payment Gateway Order'
    });

    expect(result.success).toBe(true);
    expect(result.responseCode).toBe('2005400');
    expect(result.responseMessage).toBe('Successful');
    expect(result.referenceNo).toBe('20260922111230999500166938500558607');
    expect(result.partnerReferenceNo).toBe('ORD-1790096364251');
    expect(result.webRedirectUrl).toContain('https://m.sandbox.dana.id/n/pg/checkout');
    expect(result.checkoutUrl).toBe(result.webRedirectUrl);
  });

  it('handles 4015400 Unauthorized Invalid Signature response appropriately', async () => {
    const mockUnauthorized = {
      responseCode: '4015400',
      responseMessage: 'Unauthorized. Invalid Signature',
      partnerReferenceNo: 'ORD-INVALID-SIG'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => mockUnauthorized
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-INVALID-SIG',
      amount: 15000
    });

    expect(result.success).toBe(false);
    expect(result.isUnauthorized).toBe(true);
    expect(result.responseCode).toBe('4015400');
    expect(result.responseMessage).toBe('Unauthorized. Invalid Signature');

    // In App Partner Action: Transaction marked as FAILED, user can't see any transaction in history page
    const settlement = service.getSettlementStore().getSettlement('ORD-INVALID-SIG');
    expect(settlement).toBeDefined();
    expect(settlement?.status).toBe('FAILED');
    expect(settlement?.error).toContain('Unauthorized. Invalid Signature');

    // Verify user can't see any transaction in history page
    const userHistory = service.getSettlementStore().getUserTransactionHistory();
    const foundInHistory = userHistory.find((item) => item.partnerReferenceNo === 'ORD-INVALID-SIG');
    expect(foundInHistory).toBeUndefined();
  });

  it('exposes POST /api/dana/create-order and returns webRedirectUrl to client applications', async () => {
    vi.spyOn(service, 'createOrder').mockResolvedValueOnce({
      success: true,
      responseCode: '2005400',
      responseMessage: 'Successful',
      orderId: 'ORD-TEST-ROUTE-1',
      partnerReferenceNo: 'ORD-TEST-ROUTE-1',
      referenceNo: '20260922111230999500166938500558607',
      webRedirectUrl: 'https://m.sandbox.dana.id/n/pg/checkout?bizNo=ORD-TEST-ROUTE-1',
      checkoutUrl: 'https://m.sandbox.dana.id/n/pg/checkout?bizNo=ORD-TEST-ROUTE-1'
    });

    const res = await fetch(`${baseUrl}/api/dana/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerReferenceNo: 'ORD-TEST-ROUTE-1',
        amount: 25000,
        title: 'Kopi Susu 2 Cup'
      })
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.responseCode).toBe('2005400');
    expect(data.webRedirectUrl).toBe('https://m.sandbox.dana.id/n/pg/checkout?bizNo=ORD-TEST-ROUTE-1');
  });

  it('handles 4005402 Invalid Mandatory Field X-TIMESTAMP response appropriately', async () => {
    const mockMissingTimestamp = {
      responseCode: '4005402',
      responseMessage: 'Invalid Mandatory Field X-TIMESTAMP',
      partnerReferenceNo: 'ORD-NO-TS-1790097855216'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => mockMissingTimestamp
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-NO-TS-1790097855216',
      amount: 15000,
      headers: {
        'X-TIMESTAMP': null
      }
    });

    expect(result.success).toBe(false);
    expect(result.isMissingMandatoryField).toBe(true);
    expect(result.responseCode).toBe('4005402');
    expect(result.responseMessage).toBe('Invalid Mandatory Field X-TIMESTAMP');
    expect(result.error).toContain('Missing Mandatory Field: Invalid Mandatory Field X-TIMESTAMP');
  });

  it('handles 4005402 Invalid Mandatory Field CHANNEL-ID response appropriately', async () => {
    const mockMissingChannel = {
      responseCode: '4005402',
      responseMessage: 'Invalid Mandatory Field CHANNEL-ID',
      partnerReferenceNo: 'ORD-NO-CH-1790097876561'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => mockMissingChannel
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-NO-CH-1790097876561',
      amount: 15000,
      headers: {
        'CHANNEL-ID': null
      }
    });

    expect(result.success).toBe(false);
    expect(result.isMissingMandatoryField).toBe(true);
    expect(result.responseCode).toBe('4005402');
    expect(result.responseMessage).toBe('Invalid Mandatory Field CHANNEL-ID');
  });

  it('propagates 4005402 Invalid Mandatory Field via POST /api/dana/create-order route', async () => {
    vi.spyOn(service, 'createOrder').mockResolvedValueOnce({
      success: false,
      isMissingMandatoryField: true,
      responseCode: '4005402',
      responseMessage: 'Invalid Mandatory Field X-TIMESTAMP',
      orderId: 'ORD-ROUTE-ERR',
      partnerReferenceNo: 'ORD-ROUTE-ERR',
      error: 'Missing Mandatory Field: Invalid Mandatory Field X-TIMESTAMP'
    });

    const res = await fetch(`${baseUrl}/api/dana/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerReferenceNo: 'ORD-ROUTE-ERR',
        amount: 15000,
        headers: { 'X-TIMESTAMP': null }
      })
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.isMissingMandatoryField).toBe(true);
    expect(data.responseCode).toBe('4005402');
  });

  it('handles 4005401 Invalid Field Format amount response appropriately', async () => {
    const mockInvalidAmount = {
      responseCode: '4005401',
      responseMessage: 'Invalid Field Format amount',
      partnerReferenceNo: 'ORD-INV-AMT-1790098172316'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => mockInvalidAmount
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-INV-AMT-1790098172316',
      amount: 0,
      amountValueOverride: 'abc'
    });

    expect(result.success).toBe(false);
    expect(result.isInvalidFieldFormat).toBe(true);
    expect(result.responseCode).toBe('4005401');
    expect(result.responseMessage).toBe('Invalid Field Format amount');
    expect(result.error).toContain('Invalid Field Format: Invalid Field Format amount');
  });

  it('handles 4005401 Invalid Field Format X-TIMESTAMP response appropriately', async () => {
    const mockInvalidTimestamp = {
      responseCode: '4005401',
      responseMessage: 'Invalid Field Format X-TIMESTAMP',
      partnerReferenceNo: 'ORD-INV-TS-1790098172811'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => mockInvalidTimestamp
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-INV-TS-1790098172811',
      amount: 15000,
      headers: {
        'X-TIMESTAMP': '2026-09-23 00:00:00'
      }
    });

    expect(result.success).toBe(false);
    expect(result.isInvalidFieldFormat).toBe(true);
    expect(result.responseCode).toBe('4005401');
    expect(result.responseMessage).toBe('Invalid Field Format X-TIMESTAMP');
  });

  it('propagates 4005401 Invalid Field Format via POST /api/dana/create-order route', async () => {
    vi.spyOn(service, 'createOrder').mockResolvedValueOnce({
      success: false,
      isInvalidFieldFormat: true,
      responseCode: '4005401',
      responseMessage: 'Invalid Field Format amount',
      orderId: 'ORD-ROUTE-INV-AMT',
      partnerReferenceNo: 'ORD-ROUTE-INV-AMT',
      error: 'Invalid Field Format: Invalid Field Format amount'
    });

    const res = await fetch(`${baseUrl}/api/dana/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerReferenceNo: 'ORD-ROUTE-INV-AMT',
        amountValueOverride: 'invalid_number'
      })
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.isInvalidFieldFormat).toBe(true);
    expect(data.responseCode).toBe('4005401');
  });

  it('handles 4045418 Inconsistent Request response appropriately when amount is mismatched', async () => {
    const mockInconsistent = {
      partnerReferenceNo: 'ORD-INCONSISTENT-1790098461724',
      responseCode: '4045418',
      responseMessage: 'Inconsistent Request'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => mockInconsistent
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-INCONSISTENT-1790098461724',
      amount: 200000
    });

    expect(result.success).toBe(false);
    expect(result.isInconsistent).toBe(true);
    expect(result.responseCode).toBe('4045418');
    expect(result.responseMessage).toBe('Inconsistent Request');
    expect(result.error).toContain('Inconsistent Request: Inconsistent Request');

    // In-App Partner Action: Marked as FAILED in SettlementStore
    const settlement = service.getSettlementStore().getSettlement('ORD-INCONSISTENT-1790098461724');
    expect(settlement).toBeDefined();
    expect(settlement?.status).toBe('FAILED');
    expect(settlement?.error).toContain('Inconsistent Request');

    // In-App Partner Action: User cannot see failed order in history page
    const userHistory = service.getSettlementStore().getUserTransactionHistory();
    const foundInHistory = userHistory.find((item) => item.partnerReferenceNo === 'ORD-INCONSISTENT-1790098461724');
    expect(foundInHistory).toBeUndefined();
  });

  it('propagates 4045418 Inconsistent Request via POST /api/dana/create-order returning HTTP 404', async () => {
    vi.spyOn(service, 'createOrder').mockResolvedValueOnce({
      success: false,
      isInconsistent: true,
      responseCode: '4045418',
      responseMessage: 'Inconsistent Request',
      orderId: 'ORD-INCONSISTENT-DUP',
      partnerReferenceNo: 'ORD-INCONSISTENT-DUP',
      error: 'Inconsistent Request: Inconsistent Request'
    });

    const res = await fetch(`${baseUrl}/api/dana/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerReferenceNo: 'ORD-INCONSISTENT-DUP',
        amount: 200000
      })
    });

    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.isInconsistent).toBe(true);
    expect(data.responseCode).toBe('4045418');
  });

  it('In-App Partner Action: marks transaction as SUCCESS in SettlementStore and makes it visible in history', async () => {
    const mockSuccessResponse = {
      referenceNo: '20260924111230999500166104700692880',
      partnerReferenceNo: 'ORD-INAPP-SUCCESS-01',
      webRedirectUrl: 'https://m.sandbox.dana.id/n/pg/checkout?bizNo=ORD-INAPP-SUCCESS-01',
      responseCode: '2005400',
      responseMessage: 'Successful'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockSuccessResponse
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-INAPP-SUCCESS-01',
      amount: 15000,
      title: 'Coffee Beans 250g',
      storeId: 'STORE-SERA-01',
      storeName: 'Sera Coffee Roasters'
    });

    expect(result.success).toBe(true);
    expect(result.responseCode).toBe('2005400');
    expect(result.responseMessage).toBe('Successful');

    // Verify In-App Partner Action: transaction is recorded and marked as SUCCESS
    const store = service.getSettlementStore();
    const settlement = store.getSettlement('ORD-INAPP-SUCCESS-01');
    expect(settlement).toBeDefined();
    expect(settlement?.status).toBe('SUCCESS');
    expect(settlement?.partnerReferenceNo).toBe('ORD-INAPP-SUCCESS-01');
    expect(settlement?.referenceNo).toBe('20260924111230999500166104700692880');
    expect(settlement?.grossAmount).toBe(15000);
    expect(settlement?.storeId).toBe('STORE-SERA-01');

    // Verify user can see transaction in history page (listStoreSettlements)
    const storeHistory = store.listStoreSettlements('STORE-SERA-01');
    expect(storeHistory.length).toBeGreaterThanOrEqual(1);
    const foundInHistory = storeHistory.find((item) => item.partnerReferenceNo === 'ORD-INAPP-SUCCESS-01');
    expect(foundInHistory).toBeDefined();
    expect(foundInHistory?.status).toBe('SUCCESS');
  });

  it('supports SNAP BI endpoint alias POST /api/dana/rest/redirection/v1.0/debit/payment-host-to-host with nested amount object', async () => {
    vi.spyOn(service, 'createOrder').mockResolvedValueOnce({
      success: true,
      responseCode: '2005400',
      responseMessage: 'Successful',
      orderId: 'ORD-SNAP-ALIAS-01',
      partnerReferenceNo: 'ORD-SNAP-ALIAS-01',
      referenceNo: '20260924111230999500166104700692880',
      webRedirectUrl: 'https://m.sandbox.dana.id/n/pg/checkout?bizNo=ORD-SNAP-ALIAS-01',
      checkoutUrl: 'https://m.sandbox.dana.id/n/pg/checkout?bizNo=ORD-SNAP-ALIAS-01'
    });

    const res = await fetch(`${baseUrl}/api/dana/rest/redirection/v1.0/debit/payment-host-to-host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerReferenceNo: 'ORD-SNAP-ALIAS-01',
        amount: {
          value: '15000.00',
          currency: 'IDR'
        },
        additionalInfo: {
          order: { orderTitle: 'Payment Gateway Order' }
        }
      })
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.responseCode).toBe('2005400');
    expect(data.responseMessage).toBe('Successful');
    expect(data.partnerReferenceNo).toBe('ORD-SNAP-ALIAS-01');
  });

  it('supports SNAP BI endpoint alias POST /api/dana/payment-gateway/v1.0/debit/payment-host-to-host.htm', async () => {
    vi.spyOn(service, 'createOrder').mockResolvedValueOnce({
      success: true,
      responseCode: '2005400',
      responseMessage: 'Successful',
      orderId: 'ORD-SNAP-HTM-01',
      partnerReferenceNo: 'ORD-SNAP-HTM-01',
      referenceNo: '20260924111230999500166104700692880',
      webRedirectUrl: 'https://m.sandbox.dana.id/n/pg/checkout?bizNo=ORD-SNAP-HTM-01',
      checkoutUrl: 'https://m.sandbox.dana.id/n/pg/checkout?bizNo=ORD-SNAP-HTM-01'
    });

    const res = await fetch(`${baseUrl}/api/dana/payment-gateway/v1.0/debit/payment-host-to-host.htm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerReferenceNo: 'ORD-SNAP-HTM-01',
        amount: {
          value: '15000.00',
          currency: 'IDR'
        }
      })
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.responseCode).toBe('2005400');
  });

  it('In-App Partner Action: 4015400 marks transaction as FAILED and user cannot see it in history page or GET /api/dana/history', async () => {
    // 1. Verify service layer marks settlement as FAILED in SettlementStore
    const mockUnauthorized = {
      responseCode: '4015400',
      responseMessage: 'Unauthorized. Invalid Signature',
      partnerReferenceNo: 'ORD-UNAUTH-STORE-01'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => mockUnauthorized
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-UNAUTH-STORE-01',
      amount: 15000,
      headers: { 'X-SIGNATURE': 'invalid_sig' }
    });

    expect(result.success).toBe(false);
    expect(result.isUnauthorized).toBe(true);
    expect(result.responseCode).toBe('4015400');

    // In-App Partner Action: Transaction marked as FAILED in SettlementStore
    const store = service.getSettlementStore();
    const settlement = store.getSettlement('ORD-UNAUTH-STORE-01');
    expect(settlement).toBeDefined();
    expect(settlement?.status).toBe('FAILED');
    expect(settlement?.error).toContain('Unauthorized. Invalid Signature');

    // In-App Partner Action: User can't see any transaction in history page (via getUserTransactionHistory)
    const userHistory = store.getUserTransactionHistory();
    const visibleInHistory = userHistory.find((item) => item.partnerReferenceNo === 'ORD-UNAUTH-STORE-01');
    expect(visibleInHistory).toBeUndefined();

    // 2. Verify HTTP Route POST /api/dana/rest/redirection/v1.0/debit/payment-host-to-host returns HTTP 401
    vi.spyOn(service, 'createOrder').mockResolvedValueOnce({
      success: false,
      isUnauthorized: true,
      responseCode: '4015400',
      responseMessage: 'Unauthorized. Invalid Signature',
      orderId: 'ORD-UNAUTH-ROUTE-01',
      partnerReferenceNo: 'ORD-UNAUTH-ROUTE-01',
      error: 'Unauthorized. Invalid Signature'
    });

    const res = await fetch(`${baseUrl}/api/dana/rest/redirection/v1.0/debit/payment-host-to-host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerReferenceNo: 'ORD-UNAUTH-ROUTE-01',
        amount: {
          value: '15000.00',
          currency: 'IDR'
        }
      })
    });

    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.isUnauthorized).toBe(true);
    expect(data.responseCode).toBe('4015400');
    expect(data.responseMessage).toBe('Unauthorized. Invalid Signature');

    // 3. In-App Partner Action: Querying GET /api/dana/history also excludes the FAILED order
    const historyRes = await fetch(`${baseUrl}/api/dana/history`);
    const historyData = await historyRes.json();
    expect(historyRes.status).toBe(200);
    expect(historyData.success).toBe(true);
    const inEndpointHistory = historyData.transactions.find((item: any) => item.partnerReferenceNo === 'ORD-UNAUTH-STORE-01');
    expect(inEndpointHistory).toBeUndefined();
  });

  it('handles 4035402 Exceeds Transaction Amount Limit response appropriately', async () => {
    const mockExceedLimit = {
      responseCode: '4035402',
      responseMessage: 'Exceeds Transaction Amount Limit',
      partnerReferenceNo: 'ORD-EXCEED-TEST-01'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => mockExceedLimit
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-EXCEED-TEST-01',
      amount: 50000000000
    });

    expect(result.success).toBe(false);
    expect(result.isExceedLimit).toBe(true);
    expect(result.responseCode).toBe('4035402');
    expect(result.responseMessage).toBe('Exceeds Transaction Amount Limit');
    expect(result.error).toContain('Exceeds Transaction Amount Limit');

    // In-App Partner Action: Transaction marked as FAILED in SettlementStore
    const settlement = service.getSettlementStore().getSettlement('ORD-EXCEED-TEST-01');
    expect(settlement).toBeDefined();
    expect(settlement?.status).toBe('FAILED');
    expect(settlement?.error).toContain('Exceeds Transaction Amount Limit');

    // In-App Partner Action: User cannot see failed order in history page
    const userHistory = service.getSettlementStore().getUserTransactionHistory();
    const foundInHistory = userHistory.find((item) => item.partnerReferenceNo === 'ORD-EXCEED-TEST-01');
    expect(foundInHistory).toBeUndefined();
  });

  it('propagates 4035402 Exceeds Transaction Amount Limit via POST /api/dana/create-order returning HTTP 403', async () => {
    vi.spyOn(service, 'createOrder').mockResolvedValueOnce({
      success: false,
      isExceedLimit: true,
      responseCode: '4035402',
      responseMessage: 'Exceeds Transaction Amount Limit',
      orderId: 'ORD-EXCEED-ROUTE-01',
      partnerReferenceNo: 'ORD-EXCEED-ROUTE-01',
      error: 'Exceeds Transaction Amount Limit: Exceeds Transaction Amount Limit'
    });

    const res = await fetch(`${baseUrl}/api/dana/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerReferenceNo: 'ORD-EXCEED-ROUTE-01',
        amount: 50000000000
      })
    });

    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.isExceedLimit).toBe(true);
    expect(data.responseCode).toBe('4035402');
    expect(data.responseMessage).toBe('Exceeds Transaction Amount Limit');
  });

  it('handles 5005400 General Error response appropriately and marks transaction as FAILED', async () => {
    const mockGeneralError = {
      responseCode: '5005400',
      responseMessage: 'General Error',
      partnerReferenceNo: 'ORD-GENERR-TEST-01'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => mockGeneralError
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-GENERR-TEST-01',
      amount: 505400,
      title: 'General Error Scenario'
    });

    expect(result.success).toBe(false);
    expect(result.isGeneralError).toBe(true);
    expect(result.responseCode).toBe('5005400');
    expect(result.responseMessage).toBe('General Error');
    expect(result.error).toContain('General Error');

    // In-App Partner Action: Marked as FAILED in SettlementStore
    const settlement = service.getSettlementStore().getSettlement('ORD-GENERR-TEST-01');
    expect(settlement).toBeDefined();
    expect(settlement?.status).toBe('FAILED');
    expect(settlement?.error).toContain('General Error');

    // In-App Partner Action: User cannot see failed order in history page
    const userHistory = service.getSettlementStore().getUserTransactionHistory();
    const foundInHistory = userHistory.find((item) => item.partnerReferenceNo === 'ORD-GENERR-TEST-01');
    expect(foundInHistory).toBeUndefined();
  });

  it('propagates 5005400 General Error via POST /api/dana/create-order returning HTTP 500', async () => {
    vi.spyOn(service, 'createOrder').mockResolvedValueOnce({
      success: false,
      isGeneralError: true,
      responseCode: '5005400',
      responseMessage: 'General Error',
      orderId: 'ORD-GENERR-ROUTE-01',
      partnerReferenceNo: 'ORD-GENERR-ROUTE-01',
      error: 'General Error: General Error'
    });

    const res = await fetch(`${baseUrl}/api/dana/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerReferenceNo: 'ORD-GENERR-ROUTE-01',
        amount: 505400
      })
    });

    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.isGeneralError).toBe(true);
    expect(data.responseCode).toBe('5005400');
    expect(data.responseMessage).toBe('General Error');
  });

  it('handles 4035415 Transaction Not Permitted response appropriately and marks transaction as FAILED', async () => {
    const mockNotPermitted = {
      responseCode: '4035415',
      responseMessage: 'Transaction Not Permitted',
      partnerReferenceNo: 'ORD-NOTPERM-TEST-01'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => mockNotPermitted
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-NOTPERM-TEST-01',
      amount: 435415,
      title: 'Transaction Not Permitted Scenario'
    });

    expect(result.success).toBe(false);
    expect(result.isTransactionNotPermitted).toBe(true);
    expect(result.responseCode).toBe('4035415');
    expect(result.responseMessage).toBe('Transaction Not Permitted');
    expect(result.error).toContain('Transaction Not Permitted');

    // In-App Partner Action: Marked as FAILED in SettlementStore
    const settlement = service.getSettlementStore().getSettlement('ORD-NOTPERM-TEST-01');
    expect(settlement).toBeDefined();
    expect(settlement?.status).toBe('FAILED');
    expect(settlement?.error).toContain('Transaction Not Permitted');

    // In-App Partner Action: User cannot see failed order in history page
    const userHistory = service.getSettlementStore().getUserTransactionHistory();
    const foundInHistory = userHistory.find((item) => item.partnerReferenceNo === 'ORD-NOTPERM-TEST-01');
    expect(foundInHistory).toBeUndefined();
  });

  it('propagates 4035415 Transaction Not Permitted via POST /api/dana/create-order returning HTTP 403', async () => {
    vi.spyOn(service, 'createOrder').mockResolvedValueOnce({
      success: false,
      isTransactionNotPermitted: true,
      responseCode: '4035415',
      responseMessage: 'Transaction Not Permitted',
      orderId: 'ORD-NOTPERM-ROUTE-01',
      partnerReferenceNo: 'ORD-NOTPERM-ROUTE-01',
      error: 'Transaction Not Permitted: Transaction Not Permitted'
    });

    const res = await fetch(`${baseUrl}/api/dana/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerReferenceNo: 'ORD-NOTPERM-ROUTE-01',
        amount: 435415
      })
    });

    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.isTransactionNotPermitted).toBe(true);
    expect(data.responseCode).toBe('4035415');
    expect(data.responseMessage).toBe('Transaction Not Permitted');
  });

  it('handles 4045408 Invalid Merchant response appropriately and marks transaction as FAILED with verification advice', async () => {
    const mockInvalidMerchant = {
      responseCode: '4045408',
      responseMessage: 'Invalid Merchant',
      partnerReferenceNo: 'ORD-INVMERCH-TEST-01'
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => mockInvalidMerchant
    } as any);

    const result = await service.createOrder({
      partnerReferenceNo: 'ORD-INVMERCH-TEST-01',
      amount: 445408,
      title: 'Invalid Merchant Scenario'
    });

    expect(result.success).toBe(false);
    expect(result.isInvalidMerchant).toBe(true);
    expect(result.responseCode).toBe('4045408');
    expect(result.responseMessage).toBe('Invalid Merchant');
    expect(result.error).toContain('Invalid Merchant');
    expect(result.error).toContain('verify identifiers');

    // In-App Partner Action: Marked as FAILED in SettlementStore
    const settlement = service.getSettlementStore().getSettlement('ORD-INVMERCH-TEST-01');
    expect(settlement).toBeDefined();
    expect(settlement?.status).toBe('FAILED');
    expect(settlement?.error).toContain('Invalid Merchant');

    // In-App Partner Action: User cannot see failed order in history page
    const userHistory = service.getSettlementStore().getUserTransactionHistory();
    const foundInHistory = userHistory.find((item) => item.partnerReferenceNo === 'ORD-INVMERCH-TEST-01');
    expect(foundInHistory).toBeUndefined();
  });

  it('propagates 4045408 Invalid Merchant via POST /api/dana/create-order returning HTTP 404', async () => {
    vi.spyOn(service, 'createOrder').mockResolvedValueOnce({
      success: false,
      isInvalidMerchant: true,
      responseCode: '4045408',
      responseMessage: 'Invalid Merchant',
      orderId: 'ORD-INVMERCH-ROUTE-01',
      partnerReferenceNo: 'ORD-INVMERCH-ROUTE-01',
      error: 'Invalid Merchant: Invalid Merchant. Merchant/subMerchant/externalStoreId invalid or abnormal; client may contact DANA to verify identifiers.'
    });

    const res = await fetch(`${baseUrl}/api/dana/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerReferenceNo: 'ORD-INVMERCH-ROUTE-01',
        amount: 445408
      })
    });

    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.isInvalidMerchant).toBe(true);
    expect(data.responseCode).toBe('4045408');
    expect(data.responseMessage).toBe('Invalid Merchant');
  });

  it('rejects second order with same partnerReferenceNo but different amount with 4045418 Inconsistent Request', async () => {
    const sharedRef = `ORD-2ORDERS-INCONSISTENT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Order 1: Success with 15000
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        responseCode: '2005400',
        responseMessage: 'Successful',
        partnerReferenceNo: sharedRef,
        referenceNo: 'REF-001',
        webRedirectUrl: 'https://m.sandbox.dana.id/checkout'
      })
    } as any);

    const order1 = await service.createOrder({
      partnerReferenceNo: sharedRef,
      amount: 15000,
      title: 'Order 1'
    });
    expect(order1.success).toBe(true);
    expect(order1.responseCode).toBe('2005400');

    // Order 2: Duplicate with different amount (20000)
    const order2 = await service.createOrder({
      partnerReferenceNo: sharedRef,
      amount: 20000,
      title: 'Order 2 Mismatched'
    });
    expect(order2.success).toBe(false);
    expect(order2.isInconsistent).toBe(true);
    expect(order2.responseCode).toBe('4045418');
    expect(order2.responseMessage).toBe('Inconsistent Request');

    // In-App Partner Action: Marked as FAILED in SettlementStore
    const settlement = service.getSettlementStore().getSettlement(sharedRef);
    expect(settlement).toBeDefined();
    expect(settlement?.status).toBe('FAILED');
    expect(settlement?.error).toContain('Inconsistent Request');
  });
});


