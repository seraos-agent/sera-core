import { Router, Request, Response } from 'express';
import { EmailOtpService } from '../../core/identity/EmailOtpService';

// Key: client IP -> array of timestamps of requests within window
const ipRateLimits = new Map<string, number[]>();
const IP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_IP_REQUESTS_PER_WINDOW = 10;

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.socket.remoteAddress || req.ip || 'unknown-ip';
}

export function resetIpRateLimits(): void {
  ipRateLimits.clear();
}

/**
 * REST router for passwordless Email OTP authentication.
 * Mounts on /api/auth in src/server/index.ts.
 */
export function createAuthRouter(): Router {
  const router = Router();
  const otpService = EmailOtpService.getInstance();

  /**
   * POST /api/auth/send-otp
   * Body: { email: string }
   */
  router.post('/send-otp', async (req: Request, res: Response): Promise<void> => {
    try {
      const clientIp = getClientIp(req);
      const now = Date.now();
      const timestamps = (ipRateLimits.get(clientIp) || []).filter(t => now - t < IP_RATE_LIMIT_WINDOW_MS);

      if (timestamps.length >= MAX_IP_REQUESTS_PER_WINDOW) {
        res.status(429).json({
          success: false,
          message: 'Too many verification code requests from this IP address. Please try again in 15 minutes.'
        });
        return;
      }

      timestamps.push(now);
      ipRateLimits.set(clientIp, timestamps);

      const email = req.body?.email;
      if (!email || typeof email !== 'string') {
        res.status(400).json({ success: false, message: 'Email address is required.' });
        return;
      }

      const result = await otpService.sendOtp(email);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (err: any) {
      console.error('[AuthRouter] Error sending OTP:', err.message);
      res.status(500).json({ success: false, message: 'Failed to send verification code. Please try again.' });
    }
  });

  /**
   * POST /api/auth/verify-otp
   * Body: { email: string, code: string }
   */
  router.post('/verify-otp', async (req: Request, res: Response): Promise<void> => {
    try {
      const email = req.body?.email;
      const code = req.body?.code;

      if (!email || !code) {
        res.status(400).json({ success: false, message: 'Email and 6-digit verification code are required.' });
        return;
      }

      const result = await otpService.verifyOtp(String(email), String(code));
      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (err: any) {
      console.error('[AuthRouter] Error verifying OTP:', err.message);
      res.status(500).json({ success: false, message: 'Failed to verify verification code. Please try again.' });
    }
  });

  return router;
}
