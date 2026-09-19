import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailOtpService } from '../src/core/identity/EmailOtpService';
import { verifySessionToken } from '../src/server/socket/socketAuth';
import { WhatsAppPairingService } from '../src/capabilities/communication/services/WhatsAppPairingService';

describe('EmailOtpService & In-Chat WhatsApp Onboarding', () => {
  let otpService: EmailOtpService;

  beforeEach(() => {
    otpService = EmailOtpService.getInstance();
    otpService.clearForTest();
  });

  describe('EmailOtpService', () => {
    it('rejects invalid email formats', async () => {
      const res = await otpService.sendOtp('invalid-email-address');
      expect(res.success).toBe(false);
      expect(res.message).toContain('Invalid email');
    });

    it('generates 6-digit OTP code and dispatches successfully', async () => {
      const email = 'budi.santoso@example.com';
      const res = await otpService.sendOtp(email);
      expect(res.success).toBe(true);
      expect(res.otpCodeDev).toBeDefined();
      expect(res.otpCodeDev?.length).toBe(6);

      const pending = otpService.getPendingOtpForTest(email);
      expect(pending).toBe(res.otpCodeDev);
    });

    it('rejects incorrect OTP codes with remaining attempts warning', async () => {
      const email = 'siti@example.com';
      await otpService.sendOtp(email);

      const verifyRes = await otpService.verifyOtp(email, '000000');
      expect(verifyRes.success).toBe(false);
      expect(verifyRes.message).toContain('Incorrect OTP code');
    });

    it('verifies correct OTP code and returns valid HMAC session token', async () => {
      const email = 'alex@example.com';
      const sendRes = await otpService.sendOtp(email);
      const code = sendRes.otpCodeDev!;

      const verifyRes = await otpService.verifyOtp(email, code);
      expect(verifyRes.success).toBe(true);
      expect(verifyRes.userId).toBe(`email:${email}`);
      expect(verifyRes.token).toBeDefined();

      // Verify the returned token is valid against server secret
      const principal = verifySessionToken(verifyRes.token!);
      expect(principal).toBeDefined();
      expect(principal?.userId).toBe(`email:${email}`);
      expect(principal?.email).toBe(email);
    });
  });

  describe('WhatsApp In-Chat Email Onboarding Flow', () => {
    it('seamlessly guides an unlinked user through email submission, OTP verification, and identity linking', async () => {
      const secrets = new Map<string, string>();
      const mockSecretManager: any = {
        getSecret: vi.fn(async (key: string) => secrets.get(key) || null),
        setSecret: vi.fn(async (key: string, val: string) => { secrets.set(key, val); }),
        deleteSecret: vi.fn(async (key: string) => { secrets.delete(key); })
      };

      const directMessagesSent: string[] = [];
      const mockWhatsAppManager: any = {
        sendDirectMessage: vi.fn(async (_to: string, msg: string) => {
          directMessagesSent.push(msg);
          return true;
        })
      };

      const mockAgentManager: any = {
        getInstance: vi.fn(() => null),
        getOrCreateInstance: vi.fn(() => ({ runtime: {} }))
      };

      const pairingService = new WhatsAppPairingService({
        agentManager: mockAgentManager,
        secretManager: mockSecretManager,
        whatsAppManager: mockWhatsAppManager
      });

      const userPhone = '628991234567';

      // 1. Unlinked user sends greeting
      await pairingService.handleUnlinkedGate(userPhone, 'Hello SERA');
      expect(directMessagesSent.length).toBe(1);
      expect(directMessagesSent[0]).toMatch(/alamat email|email address/i);

      // 2. User replies with their email
      const userEmail = 'user.test@example.com';
      await pairingService.handleUnlinkedGate(userPhone, userEmail);
      expect(directMessagesSent.length).toBe(2);
      expect(directMessagesSent[1]).toMatch(/kode verifikasi|verification code/i);

      // Retrieve the generated OTP from otpService
      const generatedOtp = otpService.getPendingOtpForTest(userEmail);
      expect(generatedOtp).toBeDefined();
      expect(generatedOtp?.length).toBe(6);

      // 3. User replies with incorrect OTP first
      await pairingService.handleUnlinkedGate(userPhone, '111111');
      expect(directMessagesSent.length).toBe(3);
      expect(directMessagesSent[2]).toMatch(/salah atau sudah kedaluwarsa|invalid or expired/i);

      // 4. User replies with correct 6-digit OTP
      await pairingService.handleUnlinkedGate(userPhone, generatedOtp!);
      expect(directMessagesSent.length).toBe(4);
      expect(directMessagesSent[3]).toMatch(/selamat datang|welcome/i);
      expect(directMessagesSent[3]).toContain(userEmail);

      // Verify phone number is now linked in secret manager
      const linkedUser = await pairingService.resolveSessionId(userPhone);
      expect(linkedUser).toBe(`email:${userEmail}`);
    });
  });
});
