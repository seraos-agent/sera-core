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
  // Key: clean phone -> timestamps of requests in last 60 minutes
  private readonly phoneRateLimits = new Map<string, number[]>();

  private readonly OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  private readonly MAX_REQUESTS_PER_WINDOW = 5;
  private readonly MAX_VERIFY_ATTEMPTS = 5;

  private readonly PHONE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 60 minutes (1 hour)
  private readonly MAX_PHONE_REQUESTS_PER_WINDOW = 3;

  private static readonly DISPOSABLE_DOMAINS: Set<string> = new Set([
    'temp-mail.org', 'tempmail.com', 'temp-mail.io', 'guerrillamail.com', 'guerrillamail.net',
    'guerrillamail.org', 'mailinator.com', '10minutemail.com', '10minutemail.net',
    'throwawaymail.com', 'yopmail.com', 'yopmail.fr', 'trashmail.com', 'trashmail.net',
    'sharklasers.com', 'grr.la', 'guerrillamailblock.com', 'pokemail.net', 'spam4.me',
    'dispostable.com', 'getairmail.com', 'fakemailgenerator.com', 'mohmal.com', 'crazymailing.com',
    'generator.email', 'tempail.com', 'emailondeck.com', 'dropmail.me', 'inboxkitten.com'
  ]);

  private constructor() {}

  public static getInstance(): EmailOtpService {
    if (!EmailOtpService.instance) {
      EmailOtpService.instance = new EmailOtpService();
    }
    return EmailOtpService.instance;
  }

  public static normalizeEmail(email: string): string {
    const raw = (email || '').trim().toLowerCase();
    const atIndex = raw.indexOf('@');
    if (atIndex === -1) return raw;
    let user = raw.slice(0, atIndex);
    const domain = raw.slice(atIndex + 1);

    // Canonicalize Gmail / Googlemail (ignore dots and plus-address tags)
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      const plusIndex = user.indexOf('+');
      if (plusIndex !== -1) {
        user = user.slice(0, plusIndex);
      }
      user = user.replace(/\./g, '');
    }

    return `${user}@${domain}`;
  }

  public static isValidEmail(email: string): boolean {
    const clean = EmailOtpService.normalizeEmail(email);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  }

  public static isDisposableEmail(email: string): boolean {
    const clean = EmailOtpService.normalizeEmail(email);
    const parts = clean.split('@');
    if (parts.length < 2) return false;
    const domain = parts[1];
    return EmailOtpService.DISPOSABLE_DOMAINS.has(domain);
  }

  /**
   * Generates and dispatches a 6-digit OTP code to the given email address.
   */
  public async sendOtp(emailInput: string, options?: { requesterPhone?: string }): Promise<SendOtpResult> {
    const email = EmailOtpService.normalizeEmail(emailInput);
    if (!EmailOtpService.isValidEmail(email)) {
      return {
        success: false,
        message: 'Invalid email address format.'
      };
    }

    if (EmailOtpService.isDisposableEmail(email)) {
      return {
        success: false,
        message: 'Disposable or temporary email addresses are not permitted. Please use a permanent email address.'
      };
    }

    const now = Date.now();

    // Phone-level Rate Limiting Check (if request originated from a phone number)
    if (options?.requesterPhone) {
      const cleanPhone = options.requesterPhone.replace(/\D/g, '');
      if (cleanPhone) {
        const phoneRequests = (this.phoneRateLimits.get(cleanPhone) || []).filter(
          (t) => now - t < this.PHONE_RATE_LIMIT_WINDOW_MS
        );

        if (phoneRequests.length >= this.MAX_PHONE_REQUESTS_PER_WINDOW) {
          return {
            success: false,
            message: 'Too many verification requests from this phone number. Please try again in an hour.'
          };
        }

        phoneRequests.push(now);
        this.phoneRateLimits.set(cleanPhone, phoneRequests);
      }
    }

    // Rate Limiting Check
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
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 40px 24px; background: #ffffff; color: #1a1a1a; border-radius: 12px; border: 1px solid #eaeaea;">
            <div style="margin-bottom: 28px; text-align: center;">
              <img src="https://seraos.xyz/sera-logo.png" alt="SERA OS" width="52" height="52" style="width: 52px; height: 52px; margin-bottom: 12px; object-fit: contain;" />
              <h2 style="font-size: 24px; font-weight: 700; margin: 0; color: #111827; letter-spacing: -0.02em;">SERA OS</h2>
              <p style="font-size: 14px; color: #6b7280; margin-top: 4px;">Intelligent Agent Operating System</p>
            </div>
            <p style="font-size: 16px; line-height: 26px; color: #374151; margin-bottom: 24px;">
              Use the verification code below to sign in to your SERA OS account:
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <div style="display: inline-block; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #111827; background: #f3f4f6; padding: 18px 36px; border-radius: 10px; border: 1px dashed #d1d5db; font-family: monospace;">
                ${code}
              </div>
            </div>
            <p style="font-size: 14px; color: #6b7280; line-height: 22px; margin-bottom: 28px;">
              This code is valid for <strong>5 minutes</strong>. For your security, do not share this code with anyone.
            </p>
            <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 32px 0;" />
            <p style="font-size: 13px; color: #9ca3af; text-align: center; margin: 0; line-height: 20px;">
              &copy; ${new Date().getFullYear()} SERA OS. All rights reserved.<br />
              <a href="https://seraos.xyz" style="color: #2563eb; text-decoration: none;">seraos.xyz</a> &bull; <a href="https://app.seraos.xyz" style="color: #2563eb; text-decoration: none;">Web App</a>
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

    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    const isDev = !resendApiKey || (isTest && !emailDeliverySuccess);

    if (resendApiKey && !emailDeliverySuccess) {
      return {
        success: false,
        message: emailDeliveryError || 'Failed to dispatch verification email via Resend.',
        isDevelopment: false
      };
    }

    if (!resendApiKey && !isTest) {
      console.warn(`[EmailOtpService] RESEND_API_KEY is not configured! Verification email not sent to ${email}`);
      return {
        success: false,
        message: 'Email delivery service is currently unavailable. Please contact support.',
        isDevelopment: true,
        otpCodeDev: code
      };
    }

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
