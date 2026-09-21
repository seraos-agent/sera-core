import crypto from 'crypto';

export interface DanaConfig {
  env: 'sandbox' | 'production';
  baseUrl: string;
  merchantId: string;
  clientId: string;
  clientSecret: string;
  publicKey: string;
  privateKey: string;
}

export class DanaClient {
  private config: DanaConfig;

  constructor(config?: Partial<DanaConfig>) {
    this.config = {
      env: (process.env.DANA_ENV as 'sandbox' | 'production') || config?.env || 'sandbox',
      baseUrl: process.env.DANA_BASE_URL || config?.baseUrl || 'https://api.sandbox.dana.id',
      merchantId: process.env.DANA_MERCHANT_ID || config?.merchantId || '',
      clientId: process.env.DANA_CLIENT_ID || config?.clientId || '',
      clientSecret: process.env.DANA_CLIENT_SECRET || config?.clientSecret || '',
      publicKey: process.env.DANA_PUBLIC_KEY || config?.publicKey || '',
      privateKey: process.env.DANA_PRIVATE_KEY || config?.privateKey || '',
    };
  }

  public getConfig(): DanaConfig {
    return { ...this.config };
  }

  /**
   * Formats a raw base64 RSA key into standard PEM format if headers are missing.
   */
  public static formatKeyToPem(keyStr: string, type: 'PUBLIC' | 'PRIVATE' | 'RSA PRIVATE'): string {
    if (!keyStr) return '';
    const cleanKey = keyStr.replace(/-----BEGIN[A-Z\s]+-----/g, '')
                           .replace(/-----END[A-Z\s]+-----/g, '')
                           .replace(/\s+/g, '');

    const chunks = cleanKey.match(/.{1,64}/g) || [];
    const formattedBody = chunks.join('\n');

    if (type === 'PUBLIC') {
      return `-----BEGIN PUBLIC KEY-----\n${formattedBody}\n-----END PUBLIC KEY-----`;
    } else if (type === 'RSA PRIVATE') {
      return `-----BEGIN RSA PRIVATE KEY-----\n${formattedBody}\n-----END RSA PRIVATE KEY-----`;
    } else {
      return `-----BEGIN PRIVATE KEY-----\n${formattedBody}\n-----END PRIVATE KEY-----`;
    }
  }

  /**
   * Generates SNAP BI Asymmetric Signature using RSA-SHA256.
   * String to sign: `${clientId}|${timestamp}`
   */
  public generateAsymmetricSignature(timestamp: string): string {
    if (!this.config.privateKey || this.config.privateKey.includes('PASTE_YOUR')) {
      throw new Error('[DanaClient] Private key is not configured in environment.');
    }

    const pemKey = DanaClient.formatKeyToPem(this.config.privateKey, 'RSA PRIVATE');
    const stringToSign = `${this.config.clientId}|${timestamp}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(stringToSign, 'utf8');
    signer.end();

    try {
      return signer.sign(pemKey, 'base64');
    } catch {
      // Fallback to PKCS8 PEM if RSA PRIVATE format fails
      const pkcs8Key = DanaClient.formatKeyToPem(this.config.privateKey, 'PRIVATE');
      const fallbackSigner = crypto.createSign('RSA-SHA256');
      fallbackSigner.update(stringToSign, 'utf8');
      fallbackSigner.end();
      return fallbackSigner.sign(pkcs8Key, 'base64');
    }
  }

  /**
   * Verifies incoming signature from DANA using DANA's Public Key.
   */
  public verifySignature(stringToSign: string, signatureBase64: string): boolean {
    if (!this.config.publicKey) return false;
    try {
      const pemKey = DanaClient.formatKeyToPem(this.config.publicKey, 'PUBLIC');
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(stringToSign, 'utf8');
      verifier.end();
      return verifier.verify(pemKey, signatureBase64, 'base64');
    } catch (e: any) {
      console.warn('[DanaClient] Signature verification failed:', e.message);
      return false;
    }
  }

  /**
   * Returns current standard SNAP BI ISO-8601 timestamp (YYYY-MM-DDTHH:mm:ss+07:00).
   * DANA SNAP BI strictly requires WIB (+07:00) timezone without milliseconds.
   */
  public getTimestamp(): string {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const wib = new Date(utc + (3600000 * 7));

    const pad = (n: number) => String(n).padStart(2, '0');
    const year = wib.getFullYear();
    const month = pad(wib.getMonth() + 1);
    const date = pad(wib.getDate());
    const hours = pad(wib.getHours());
    const minutes = pad(wib.getMinutes());
    const seconds = pad(wib.getSeconds());

    return `${year}-${month}-${date}T${hours}:${minutes}:${seconds}+07:00`;
  }

  /**
   * Checks whether essential API credentials are fully configured.
   */
  public isReady(): boolean {
    return Boolean(
      this.config.clientId &&
      this.config.clientSecret &&
      !this.config.clientSecret.includes('PASTE_YOUR') &&
      this.config.privateKey &&
      !this.config.privateKey.includes('PASTE_YOUR')
    );
  }
}
