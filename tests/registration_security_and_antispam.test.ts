import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailOtpService } from '../src/core/identity/EmailOtpService';
import { createAuthRouter, resetIpRateLimits } from '../src/server/routes/authRoutes';
import { WhatsAppPairingService } from '../src/capabilities/communication/services/WhatsAppPairingService';

describe('Registration Security & Anti-Spam Hardening', () => {
  let otpService: EmailOtpService;

  beforeEach(() => {
    otpService = EmailOtpService.getInstance();
    // Clear internal rate limits & state for clean unit tests
    (otpService as any).rateLimits.clear();
    (otpService as any).phoneRateLimits.clear();
    (otpService as any).pendingOtps.clear();
    resetIpRateLimits();
  });

  describe('Disposable / Burner Email Filtering', () => {
    it('rejects known temporary/disposable email domains', async () => {
      const burnerEmails = [
        'attacker@temp-mail.org',
        'bot@guerrillamail.com',
        'sybil@mailinator.com',
        'fake@10minutemail.com',
        'spam@yopmail.com',
        'temp@sharklasers.com',
        'burner@trashmail.com'
      ];

      for (const email of burnerEmails) {
        const result = await otpService.sendOtp(email);
        expect(result.success).toBe(false);
        expect(result.message).toContain('Disposable or temporary email');
      }
    });

    it('allows legitimate permanent email domains', async () => {
      const legitimateEmails = [
        'budi.santoso@gmail.com',
        'user@yahoo.co.id',
        'employee@company.com',
        'dev@seraos.xyz'
      ];

      for (const email of legitimateEmails) {
        const result = await otpService.sendOtp(email);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Phone-Level OTP Rate Limiting', () => {
    it('blocks excessive OTP requests originating from the same phone number (max 3 per hour)', async () => {
      const phone = '6281299998888';

      // First 3 requests with different emails from the same phone should succeed
      const res1 = await otpService.sendOtp('test1@gmail.com', { requesterPhone: phone });
      expect(res1.success).toBe(true);

      const res2 = await otpService.sendOtp('test2@gmail.com', { requesterPhone: phone });
      expect(res2.success).toBe(true);

      const res3 = await otpService.sendOtp('test3@gmail.com', { requesterPhone: phone });
      expect(res3.success).toBe(true);

      // 4th request from the same phone must be throttled
      const res4 = await otpService.sendOtp('test4@gmail.com', { requesterPhone: phone });
      expect(res4.success).toBe(false);
      expect(res4.message).toContain('Too many verification requests from this phone number');
    });
  });

  describe('Web API IP Rate Limiting (POST /api/auth/send-otp)', () => {
    it('enforces maximum 10 requests per IP per 15 minutes with HTTP 429 response', async () => {
      const router = createAuthRouter();
      const clientIp = '203.0.113.42';

      // Find route handler for /send-otp
      const routeLayer: any = router.stack.find((layer: any) => layer.route && layer.route.path === '/send-otp');
      expect(routeLayer).toBeDefined();
      const sendOtpHandler = routeLayer.route.stack[0].handle;

      // Simulate 10 successful requests
      for (let i = 1; i <= 10; i++) {
        const mockReq: any = {
          headers: { 'x-forwarded-for': clientIp },
          body: { email: `user${i}@example.com` },
          socket: { remoteAddress: clientIp }
        };
        const mockRes: any = {
          statusCode: 200,
          status(code: number) { this.statusCode = code; return this; },
          json: vi.fn()
        };

        await sendOtpHandler(mockReq, mockRes, vi.fn());
        expect(mockRes.statusCode).toBe(200);
      }

      // 11th request from same IP must receive HTTP 429
      const mockReq11: any = {
        headers: { 'x-forwarded-for': clientIp },
        body: { email: 'user11@example.com' },
        socket: { remoteAddress: clientIp }
      };
      const mockRes11: any = {
        statusCode: 200,
        status(code: number) { this.statusCode = code; return this; },
        json: vi.fn()
      };

      await sendOtpHandler(mockReq11, mockRes11, vi.fn());
      expect(mockRes11.statusCode).toBe(429);
      expect(mockRes11.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining('Too many verification code requests from this IP address')
      }));
    });
  });

  describe('WhatsApp Pairing Service Bilingual (+62 vs International)', () => {
    let pairingService: WhatsAppPairingService;
    let mockWhatsAppManager: any;
    let mockSecretManager: any;

    beforeEach(() => {
      mockWhatsAppManager = {
        sendDirectMessage: vi.fn().mockResolvedValue(true)
      };
      mockSecretManager = {
        getSecret: vi.fn().mockResolvedValue(null),
        setSecret: vi.fn().mockResolvedValue(undefined),
        deleteSecret: vi.fn().mockResolvedValue(undefined)
      };

      pairingService = new WhatsAppPairingService({
        agentManager: {} as any,
        secretManager: mockSecretManager,
        whatsAppManager: mockWhatsAppManager
      });
    });

    it('delivers warm Indonesian onboarding and OTP messages for Indonesian phone numbers (+62)', async () => {
      const idPhone = '6281234567890';

      // 1. Initial greeting
      await pairingService.handleUnlinkedGate(idPhone, 'Halo');
      expect(mockWhatsAppManager.sendDirectMessage).toHaveBeenCalledTimes(1);
      const greetingCall = mockWhatsAppManager.sendDirectMessage.mock.calls[0];
      expect(greetingCall[0]).toBe(idPhone);
      expect(greetingCall[1]).toContain('Selamat Datang di SERA OS');
      expect(greetingCall[1]).toContain('alamat email');

      // 2. User replies with email -> receives Indonesian OTP sent prompt
      mockWhatsAppManager.sendDirectMessage.mockClear();
      await pairingService.handleUnlinkedGate(idPhone, 'budi@gmail.com');
      expect(mockWhatsAppManager.sendDirectMessage).toHaveBeenCalledTimes(1);
      const otpCall = mockWhatsAppManager.sendDirectMessage.mock.calls[0];
      expect(otpCall[1]).toContain('Kode Verifikasi Terkirim');
      expect(otpCall[1]).toContain('budi@gmail.com');
      expect(otpCall[1]).toContain('Berlaku selama 5 menit');
    });

    it('delivers English onboarding and OTP messages for international phone numbers (e.g. +1)', async () => {
      const usPhone = '14155552671';

      // 1. Initial greeting
      await pairingService.handleUnlinkedGate(usPhone, 'Hello');
      expect(mockWhatsAppManager.sendDirectMessage).toHaveBeenCalledTimes(1);
      const greetingCall = mockWhatsAppManager.sendDirectMessage.mock.calls[0];
      expect(greetingCall[0]).toBe(usPhone);
      expect(greetingCall[1]).toContain('Welcome to SERA OS');
      expect(greetingCall[1]).toContain('email address');

      // 2. User replies with email -> receives English OTP sent prompt
      mockWhatsAppManager.sendDirectMessage.mockClear();
      await pairingService.handleUnlinkedGate(usPhone, 'alex@gmail.com');
      expect(mockWhatsAppManager.sendDirectMessage).toHaveBeenCalledTimes(1);
      const otpCall = mockWhatsAppManager.sendDirectMessage.mock.calls[0];
      expect(otpCall[1]).toContain('Verification Code Sent');
      expect(otpCall[1]).toContain('alex@gmail.com');
      expect(otpCall[1]).toContain('Valid for 5 minutes');
    });
  });
});
