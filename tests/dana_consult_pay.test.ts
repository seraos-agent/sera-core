import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { Server } from 'http';
import { DanaPaymentService } from '../src/capabilities/fintech/dana/DanaPaymentService';
import { DanaClient } from '../src/capabilities/fintech/dana/DanaClient';
import { createDanaRouter } from '../src/server/routes/danaRoutes';

describe('DANA Consult Pay (Payment Methods List) - SNAP BI 2005700', () => {
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

  describe('DanaPaymentService.consultPay', () => {
    it('successfully requests consult pay returning 2005700 and paymentInfos list (In App Partner Action)', async () => {
      const mockSuccessResponse = {
        responseCode: '2005700',
        responseMessage: 'Successful',
        paymentInfos: [
          { payMethod: 'BALANCE' },
          { payMethod: 'NETWORK_PAY', payOption: 'NETWORK_PAY_PG_CARD' },
          { payMethod: 'VIRTUAL_ACCOUNT', payOption: 'VIRTUAL_ACCOUNT_MANDIRI' },
          { payMethod: 'VIRTUAL_ACCOUNT', payOption: 'VIRTUAL_ACCOUNT_BTPN' },
          { payMethod: 'VIRTUAL_ACCOUNT', payOption: 'VIRTUAL_ACCOUNT_CIMB' }
        ]
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: true, status: 200 } as any,
        data: mockSuccessResponse,
        timestamp: '2026-09-23T01:00:00+07:00'
      });

      const result = await service.consultPay({
        amount: 15000,
        currency: 'IDR'
      });

      expect(result.success).toBe(true);
      expect(result.responseCode).toBe('2005700');
      expect(result.responseMessage).toBe('Successful');
      expect(result.paymentInfos).toHaveLength(5);
      expect(result.paymentInfos[0].payMethod).toBe('BALANCE');
      expect(result.paymentInfos.some(p => p.payOption === 'VIRTUAL_ACCOUNT_MANDIRI')).toBe(true);

      // Verify endpoint and payload passed to executeSnapPost
      expect(service.executeSnapPost).toHaveBeenCalledWith(
        '/v1.0/payment-gateway/consult-pay.htm',
        expect.objectContaining({
          merchantId: '216620090013051961943',
          amount: {
            value: '15000.00',
            currency: 'IDR'
          },
          additionalInfo: {
            order: {
              orderTitle: 'Consult Pay'
            }
          }
        }),
        expect.any(String),
        undefined
      );
    });

    it('handles error response from DANA Consult Pay', async () => {
      const mockErrorResponse = {
        responseCode: '5005701',
        responseMessage: 'Internal Server Error'
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 500 } as any,
        data: mockErrorResponse,
        timestamp: '2026-09-23T01:00:00+07:00'
      });

      const result = await service.consultPay({
        amount: 15000
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('5005701');
      expect(result.responseMessage).toBe('Internal Server Error');
      expect(result.paymentInfos).toHaveLength(0);
    });

    it('handles network or execution exceptions gracefully', async () => {
      vi.spyOn(service, 'executeSnapPost').mockRejectedValueOnce(new Error('Network timeout'));

      const result = await service.consultPay({
        amount: 15000
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(result.paymentInfos).toEqual([]);
    });
    it('handles official DANA 4000002 Unauthorized response appropriately', async () => {
      const mockUnauthorized = {
        responseCode: '4000002',
        responseMessage: 'Unauthorized'
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 400 } as any,
        data: mockUnauthorized,
        timestamp: '2026-09-23T01:00:00+07:00'
      });

      const result = await service.consultPay({
        amount: 15000
      });

      expect(result.success).toBe(false);
      expect(result.isUnauthorized).toBe(true);
      expect(result.responseCode).toBe('4000002');
      expect(result.responseMessage).toBe('Unauthorized');
      expect(result.error).toContain('Unauthorized');
      expect(result.paymentInfos).toHaveLength(0);
    });

    it('handles official DANA 4010000 Unauthorized Invalid Signature response appropriately', async () => {
      const mockUnauthorized = {
        responseCode: '4010000',
        responseMessage: 'Unauthorized. Invalid Signature'
      };

      vi.spyOn(service, 'executeSnapPost').mockResolvedValueOnce({
        res: { ok: false, status: 401 } as any,
        data: mockUnauthorized,
        timestamp: '2026-09-23T01:00:00+07:00'
      });

      const result = await service.consultPay({
        amount: 15000
      });

      expect(result.success).toBe(false);
      expect(result.isUnauthorized).toBe(true);
      expect(result.responseCode).toBe('4010000');
      expect(result.responseMessage).toBe('Unauthorized. Invalid Signature');
      expect(result.error).toContain('Unauthorized');
      expect(result.paymentInfos).toHaveLength(0);
    });
  });

  describe('Route POST /api/dana/consult-pay', () => {
    it('returns 200 with available payment methods list for in-app display', async () => {
      vi.spyOn(service, 'consultPay').mockResolvedValueOnce({
        success: true,
        responseCode: '2005700',
        responseMessage: 'Successful',
        paymentInfos: [
          { payMethod: 'BALANCE' },
          { payMethod: 'VIRTUAL_ACCOUNT', payOption: 'VIRTUAL_ACCOUNT_MANDIRI' }
        ]
      });

      const res = await fetch(`${baseUrl}/api/dana/consult-pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 15000 })
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.responseCode).toBe('2005700');
      expect(body.paymentInfos).toHaveLength(2);
    });

    it('returns 401 when consultPay returns unauthorized response', async () => {
      vi.spyOn(service, 'consultPay').mockResolvedValueOnce({
        success: false,
        isUnauthorized: true,
        responseCode: '4000002',
        responseMessage: 'Unauthorized',
        paymentInfos: [],
        error: 'Unauthorized: Unauthorized. Please verify client credentials and SNAP BI signature.'
      });

      const res = await fetch(`${baseUrl}/api/dana/consult-pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 15000 })
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.isUnauthorized).toBe(true);
      expect(body.responseCode).toBe('4000002');
      expect(body.responseMessage).toBe('Unauthorized');
    });

    it('returns 400 Bad Request when amount is missing or invalid', async () => {
      const res = await fetch(`${baseUrl}/api/dana/consult-pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('amount is required');
    });
  });
});

