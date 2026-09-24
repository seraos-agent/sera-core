import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { Server } from 'http';
import { createDanaRouter } from '../src/server/routes/danaRoutes';

describe('DANA Fintech Router Integration Tests', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;
  let mockSubscriptionService: any;
  let mockIo: any;

  beforeEach(async () => {
    mockSubscriptionService = {
      addCreditsDirectly: vi.fn(),
      hasActiveEntitlement: vi.fn().mockReturnValue(true)
    };

    mockIo = {
      to: vi.fn().mockReturnValue({
        emit: vi.fn()
      })
    };

    app = express();
    app.use(express.json());
    const danaRouter = createDanaRouter({
      subscriptionService: mockSubscriptionService,
      io: mockIo,
      defaultSimulateError: false
    });
    app.use('/api/dana', danaRouter);
    app.use('/v1.0/debit', danaRouter);

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

  it('verifies /api/dana/health status and returns list of endpoints', async () => {
    const res = await fetch(`${baseUrl}/api/dana/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('sera-dana-connector');
    expect(body.endpoints).toContain('/api/dana/notify');
    expect(body.endpoints).toContain('/api/dana/disburse-notify');
    expect(body.endpoints).toContain('/api/dana/callback');
    expect(body.endpoints).toContain('/api/dana/account-inquiry');
    expect(body.endpoints).toContain('/api/dana/topup-status');
  });

  describe('Finish Payment URL (POST /api/dana/notify & POST /v1.0/debit/notify)', () => {
    it('handles DANA payment notification and returns dual-compatible 200 response with 2005600', async () => {
      const payload = {
        merchantTransId: 'topup_user123_1789957000',
        acquirementId: 'ACQ-DANA-991283',
        resultInfo: {
          resultStatus: 'S',
          resultCode: 'SUCCESS',
          resultMsg: 'Success'
        },
        amount: {
          value: '50000.00',
          currency: 'IDR'
        }
      };

      const res = await fetch(`${baseUrl}/api/dana/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.responseCode).toBe('2005600');
      expect(body.responseMessage).toBe('Successful');

      // Verifies credits are granted (50,000 * 13.33 ≈ 666,500 tokens)
      expect(mockSubscriptionService.addCreditsDirectly).toHaveBeenCalledWith(
        'user123',
        expect.any(Number)
      );
    });

    it('handles official SNAP BI Finish Notify (POST /v1.0/debit/notify) with latestTransactionStatus=00', async () => {
      const payload = {
        originalPartnerReferenceNo: '2020102900000000000001',
        originalReferenceNo: '2020102977770000000009',
        latestTransactionStatus: '00',
        transactionStatusDesc: 'Success',
        amount: {
          value: '15000.00',
          currency: 'IDR'
        }
      };

      const res = await fetch(`${baseUrl}/v1.0/debit/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.responseCode).toBe('2005600');
      expect(body.responseMessage).toBe('Successful');
    });

    it('responds with 200 on GET probe verification from DANA sandbox tester', async () => {
      const res = await fetch(`${baseUrl}/api/dana/notify`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.responseCode).toBe('2005600');
    });

    it('simulates 5005601 Internal Server Error (Scenario 35) when simulate mode is enabled', async () => {
      // 1. Enable simulation mode
      const toggleRes = await fetch(`${baseUrl}/api/dana/simulate-mode?enable=true`);
      const toggleBody = await toggleRes.json();
      expect(toggleBody.simulateErrorMode).toBe(true);
      expect(toggleBody.activeResponseCode).toBe('5005601');

      // 2. Send webhook notification
      const payload = {
        originalPartnerReferenceNo: '2020102900000000000002',
        originalReferenceNo: '2020102977770000000010',
        latestTransactionStatus: '00',
        transactionStatusDesc: 'Success',
        amount: {
          value: '15000.00',
          currency: 'IDR'
        }
      };

      const res = await fetch(`${baseUrl}/v1.0/debit/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.responseCode).toBe('5005601');
      expect(body.responseMessage).toBe('Internal Server Error');

      // 3. Verify logs recorded the call
      const logsRes = await fetch(`${baseUrl}/api/dana/webhook-logs`);
      const logsBody = await logsRes.json();
      expect(logsBody.count).toBeGreaterThan(0);
      expect(logsBody.logs[0].responseSent.status).toBe(500);

      // 4. Reset simulation mode to false
      await fetch(`${baseUrl}/api/dana/simulate-mode?enable=false`);
    });
  });

  describe('Disburse to Bank Notify URL (POST /api/dana/disburse-notify)', () => {
    it('handles disburse notification and returns success acknowledgment', async () => {
      const payload = {
        partnerReferenceNo: 'disb-test-001',
        referenceNo: 'DANA-DISB-7721',
        resultInfo: {
          resultStatus: 'S',
          resultCode: 'SUCCESS'
        }
      };

      const res = await fetch(`${baseUrl}/api/dana/disburse-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.responseCode).toBe('2000000');
      expect(body.responseMessage).toBe('Successful');
    });
  });

  describe('Finish Redirect URL (GET /api/dana/callback)', () => {
    it('renders a high-end HTML authorization confirmation page for mobile users', async () => {
      const res = await fetch(`${baseUrl}/api/dana/callback?authCode=AUTH-SAMPLE-CODE-123&state=state-sess-99`);

      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type') || '';
      expect(contentType).toContain('text/html');
      const text = await res.text();
      expect(text).toContain('SERA Autonomous AI × DANA');
      expect(text).toContain('Otorisasi DANA Sukses');
      expect(text).toContain('Kembali ke WhatsApp');
    });
  });
});
