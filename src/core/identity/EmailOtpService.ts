import { generateSessionToken } from '../../server/socket/socketAuth';

export interface PendingOtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

export interface SendOtpResult {
  success: boolean;
  message: string;
  isDevelopment?: boolean;
  otpCodeDev?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  message?: string;
  userId?: string;
  token?: string;
  email?: string;
}

/**
 * EmailOtpService — Manages secure, rate-limited passwordless Email OTP generation,
 * transactional delivery (via Resend REST API or console fallback), and verification.
 * Adheres strictly to Rule 7 (Universal Codebase Language: English Standard).
 */
export class EmailOtpService {
  private static instance: EmailOtpService | null = null;

  // Key: clean email -> PendingOtpRecord
  private readonly pendingOtps = new Map<string, PendingOtpRecord>();
  // Key: clean email -> timestamps of requests in last 10 minutes
  private readonly rateLimits = new Map<string, number[]>();

  private readonly OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  private readonly MAX_REQUESTS_PER_WINDOW = 5;
  private readonly MAX_VERIFY_ATTEMPTS = 5;

  private constructor() {}

  public static getInstance(): EmailOtpService {
    if (!EmailOtpService.instance) {
      EmailOtpService.instance = new EmailOtpService();
    }
    return EmailOtpService.instance;
  }

  public static normalizeEmail(email: string): string {
    return (email || '').trim().toLowerCase();
  }

  public static isValidEmail(email: string): boolean {
    const clean = EmailOtpService.normalizeEmail(email);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  }

  /**
   * Generates and dispatches a 6-digit OTP code to the given email address.
   */
  public async sendOtp(emailInput: string): Promise<SendOtpResult> {
    const email = EmailOtpService.normalizeEmail(emailInput);
    if (!EmailOtpService.isValidEmail(email)) {
      return {
        success: false,
        message: 'Invalid email address format.'
      };
    }

    // Rate Limiting Check
    const now = Date.now();
    const requestTimes = (this.rateLimits.get(email) || []).filter(
      (t) => now - t < this.RATE_LIMIT_WINDOW_MS
    );

    if (requestTimes.length >= this.MAX_REQUESTS_PER_WINDOW) {
      return {
        success: false,
        message: 'Too many OTP requests. Please wait a few minutes before trying again.'
      };
    }

    requestTimes.push(now);
    this.rateLimits.set(email, requestTimes);

    // Generate random 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = now + this.OTP_TTL_MS;

    this.pendingOtps.set(email, {
      code,
      expiresAt,
      attempts: 0,
      createdAt: now
    });

    console.log(`[EmailOtpService] Generated 6-digit OTP for ${email}: ${code} (Expires in 5m)`);

    // Attempt delivery via Resend API if key is present
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        const fromAddress = process.env.RESEND_FROM_EMAIL || 'SERA OS <onboarding@resend.dev>';
        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #ffffff; color: #1a1a1a; border-radius: 12px; border: 1px solid #eaeaea;">
            <div style="margin-bottom: 24px; text-align: center;">
              <h2 style="font-size: 24px; font-weight: 700; margin: 0; color: #111827;">SERA OS</h2>
              <p style="font-size: 14px; color: #6b7280; margin-top: 4px;">Intelligent Agent Operating System</p>
            </div>
            <p style="font-size: 15px; line-height: 24px; color: #374151;">
              Halo! Gunakan kode verifikasi di bawah ini untuk masuk ke akun SERA OS Anda:
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <div style="display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #111827; background: #f3f4f6; padding: 16px 32px; border-radius: 10px; border: 1px dashed #d1d5db;">
                ${code}
              </div>
            </div>
            <p style="font-size: 13px; color: #6b7280; line-height: 20px;">
              Kode ini hanya berlaku selama <strong>5 menit</strong>. Jangan bagikan kode ini kepada siapapun demi keamanan akun Anda.
            </p>
            <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 32px 0;" />
            <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
              &copy; ${new Date().getFullYear()} PT Setara Indonesia Sentosa. All rights reserved.
            </p>
          </div>
        `;

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [email],
            subject: `Kode Verifikasi SERA: ${code}`,
            html: emailHtml
          })
        });

        if (!res.ok) {
          const errTxt = await res.text();
          console.warn(`[EmailOtpService] Resend API responded with ${res.status}: ${errTxt}`);
        } else {
          console.log(`[EmailOtpService] Verification email successfully delivered to ${email} via Resend.`);
        }
      } catch (sendErr: any) {
        console.error('[EmailOtpService] Failed to dispatch email via Resend:', sendErr.message);
      }
    }

    const isDev = !resendApiKey || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
    return {
      success: true,
      message: `A 6-digit verification code has been sent to ${email}.`,
      isDevelopment: isDev,
      otpCodeDev: isDev ? code : undefined
    };
  }

  /**
   * Verifies an OTP code for an email address and returns a signed session token.
   */
  public async verifyOtp(emailInput: string, codeInput: string): Promise<VerifyOtpResult> {
    const email = EmailOtpService.normalizeEmail(emailInput);
    const code = (codeInput || '').trim().replace(/\D/g, '');

    if (!EmailOtpService.isValidEmail(email)) {
      return { success: false, message: 'Invalid email address format.' };
    }

    if (!code || code.length !== 6) {
      return { success: false, message: 'OTP code must be 6 digits.' };
    }

    const record = this.pendingOtps.get(email);
    if (!record) {
      return {
        success: false,
        message: 'OTP code not found or has expired. Please request a new code.'
      };
    }

    if (Date.now() > record.expiresAt) {
      this.pendingOtps.delete(email);
      return {
        success: false,
        message: 'OTP code has expired. Please request a new code.'
      };
    }

    record.attempts += 1;
    if (record.code !== code) {
      if (record.attempts >= this.MAX_VERIFY_ATTEMPTS) {
        this.pendingOtps.delete(email);
        return {
          success: false,
          message: 'Too many failed attempts. Please request a new code.'
        };
      }
      return {
        success: false,
        message: `Incorrect OTP code. Remaining attempts: ${this.MAX_VERIFY_ATTEMPTS - record.attempts}.`
      };
    }

    // OTP Verified Successfully!
    this.pendingOtps.delete(email);

    const userId = `email:${email}`;
    const token = generateSessionToken({
      userId,
      email
    });

    return {
      success: true,
      userId,
      token,
      email,
      message: 'Verification successful. Welcome to SERA OS!'
    };
  }

  // Testing & Inspection Helpers
  public getPendingOtpForTest(email: string): string | undefined {
    return this.pendingOtps.get(EmailOtpService.normalizeEmail(email))?.code;
  }

  public clearForTest(): void {
    this.pendingOtps.clear();
    this.rateLimits.clear();
  }
}
