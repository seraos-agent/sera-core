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
    const resendApiKey = process.env.RESEND_API_KEY || process.env.RESEND_API;
    let emailDeliverySuccess = false;
    let emailDeliveryError: string | null = null;

    if (resendApiKey) {
      try {
        const fromAddress = process.env.RESEND_FROM_EMAIL || 'SERA OS <auth@seraos.xyz>';
        const emailHtml = `
          <!DOCTYPE html>
          <html lang="id">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Kode Verifikasi SERA OS</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 40px 16px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04); overflow: hidden;">
                    <!-- Header with Logo -->
                    <tr>
                      <td align="center" style="padding: 40px 32px 24px 32px; background: #ffffff;">
                        <img src="https://www.seraos.xyz/sera-logo.png" alt="SERA OS" width="56" height="56" style="display: block; width: 56px; height: 56px; margin: 0 auto 16px auto; border-radius: 12px;" />
                        <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">SERA OS</h1>
                        <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b; font-weight: 500;">Intelligent Agent Operating System</p>
                      </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                      <td style="padding: 0 32px 32px 32px; text-align: center;">
                        <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #334155;">
                          Gunakan kode verifikasi sekali pakai (OTP) di bawah ini untuk mengakses akun SERA OS Anda:
                        </p>

                        <!-- OTP Box -->
                        <div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; margin: 0 auto 24px auto; display: inline-block; width: 85%; box-sizing: border-box;">
                          <span style="font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #0f172a; display: block; margin-left: 10px;">
                            ${code}
                          </span>
                        </div>

                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; line-height: 20px;">
                          ⏱️ Kode ini hanya berlaku selama <strong>5 menit</strong>.
                        </p>
                        <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 18px;">
                          Jika Anda tidak merasa meminta kode ini, abaikan email ini. Jangan pernah memberikan kode ini kepada siapa pun demi keamanan aset dan akun Anda.
                        </p>
                      </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                      <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
                        <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; font-weight: 500;">
                          <a href="https://seraos.xyz" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 600;">seraos.xyz</a> &bull; <a href="https://app.seraos.xyz" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 600;">Web Dashboard</a>
                        </p>
                        <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 16px;">
                          &copy; ${new Date().getFullYear()} PT Setara Indonesia Sentosa. All rights reserved.<br />
                          This is an automated system message. Please do not reply to this email.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
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
          emailDeliveryError = `Resend HTTP ${res.status}: ${errTxt}`;
          console.warn(`[EmailOtpService] Resend API responded with ${res.status}: ${errTxt}`);
        } else {
          emailDeliverySuccess = true;
          console.log(`[EmailOtpService] Verification email successfully delivered to ${email} via Resend.`);
        }
      } catch (sendErr: any) {
        emailDeliveryError = sendErr.message;
        console.error('[EmailOtpService] Failed to dispatch email via Resend:', sendErr.message);
      }
    }

    const isDev = !resendApiKey || (process.env.NODE_ENV === 'test' && !emailDeliverySuccess);
    return {
      success: true,
      message: emailDeliveryError 
        ? `OTP code generated, but Resend notice: ${emailDeliveryError}`
        : `A 6-digit verification code has been sent to ${email}.`,
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
