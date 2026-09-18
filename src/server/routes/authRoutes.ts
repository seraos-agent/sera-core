import { Router, Request, Response } from 'express';
import { EmailOtpService } from '../../core/identity/EmailOtpService';

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
