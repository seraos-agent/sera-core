import { SecretManager } from '../../../core/secrets/SecretManager';

export interface WhatsAppManagerConfig {
  phoneNumberId?: string;
  accessToken?: string;
  botPhoneNumber?: string;
  apiVersion?: string;
}

export class WhatsAppManager {
  private phoneNumberId: string;
  private accessToken: string;
  private botPhoneNumber: string;
  private apiVersion: string;

  constructor(
    private secretManager: SecretManager,
    config: WhatsAppManagerConfig = {}
  ) {
    this.phoneNumberId = config.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.accessToken = config.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || '';
    this.botPhoneNumber = config.botPhoneNumber || process.env.WHATSAPP_PHONE_NUMBER || '6285126485464';
    this.apiVersion = config.apiVersion || process.env.WHATSAPP_API_VERSION || 'v21.0';
  }

  public isEnabled(): boolean {
    return Boolean(this.phoneNumberId && this.accessToken);
  }

  public getBotPhoneNumber(): string {
    return this.botPhoneNumber;
  }

  public async getStatus(sessionId: string): Promise<{ provider: 'WHATSAPP'; status: 'CONNECTED' | 'NOT_CONNECTED'; phoneNumber?: string }> {
    if (!this.isEnabled()) return { provider: 'WHATSAPP', status: 'NOT_CONNECTED' };
    const phone = await this.secretManager.getSecret(`WA_SESSION_${sessionId}`);
    return {
      provider: 'WHATSAPP',
      status: phone ? 'CONNECTED' : 'NOT_CONNECTED',
      phoneNumber: phone || undefined
    };
  }

  /**
   * Generates a dynamic 6-character pairing code (e.g. SERA-8F29) with a 5-minute TTL.
   */
  public async generateLinkCode(sessionId: string): Promise<{ code: string; deepLink: string }> {
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `SERA-${suffix}`;
    
    await this.secretManager.setSecret(`WA_LINK_${code}`, sessionId);
    
    // 5-minute ephemeral pairing TTL
    setTimeout(() => {
      this.secretManager.deleteSecret(`WA_LINK_${code}`).catch(() => {});
    }, 5 * 60 * 1000);

    const cleanBotPhone = this.botPhoneNumber.replace(/[^0-9]/g, '');
    const deepLink = `https://wa.me/${cleanBotPhone}?text=%2Fconnect%20${encodeURIComponent(code)}`;

    return { code, deepLink };
  }

  /**
   * Validates pairing code and links the phone number to the target session.
   * Immediately burns the code on use.
   */
  public async linkCode(code: string, phone: string): Promise<{ success: boolean; sessionId?: string }> {
    const cleanCode = code.trim().toUpperCase();
    const sessionId = await this.secretManager.getSecret(`WA_LINK_${cleanCode}`);
    if (!sessionId) {
      return { success: false };
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    await this.secretManager.setSecret(`WA_USER_${cleanPhone}`, sessionId);
    await this.secretManager.setSecret(`WA_SESSION_${sessionId}`, cleanPhone);
    await this.secretManager.deleteSecret(`WA_LINK_${cleanCode}`).catch(() => {});

    return { success: true, sessionId };
  }

  /**
   * Unlinks WhatsApp account from session.
   */
  public async disconnect(sessionId: string): Promise<void> {
    const phone = await this.secretManager.getSecret(`WA_SESSION_${sessionId}`);
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      await this.secretManager.deleteSecret(`WA_USER_${cleanPhone}`).catch(() => {});
      await this.secretManager.deleteSecret(`WA_SESSION_${sessionId}`).catch(() => {});
    }
  }

  /**
   * Sends a direct WhatsApp notification text message via Meta Graph API.
   */
  public async sendDirectMessage(toPhone: string, text: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const cleanRecipient = toPhone.replace(/[^0-9]/g, '');
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanRecipient,
          type: 'text',
          text: {
            preview_url: false,
            body: text
          }
        })
      });

      return response.ok;
    } catch (err: any) {
      console.error('[WhatsAppManager] Failed to send message:', err.message);
      return false;
    }
  }

  /**
   * Downloads inbound media binary buffer and mimeType from Meta Graph API.
   * Enforces 30-second timeout, SSRF domain validation, and file size guard.
   */
  public async downloadMedia(
    mediaId: string,
    options: { maxSizeBytes?: number; timeoutMs?: number } = {}
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    if (!this.isEnabled() || !mediaId) return null;

    const maxSizeBytes = options.maxSizeBytes || 20 * 1024 * 1024; // 20 MB default limit
    const timeoutMs = options.timeoutMs || 30_000; // 30-second timeout

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Step 1: Query media metadata from Meta Graph API
      const metaUrl = `https://graph.facebook.com/${this.apiVersion}/${encodeURIComponent(mediaId)}`;
      const metaRes = await fetch(metaUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        },
        signal: controller.signal
      });

      if (!metaRes.ok) {
        console.error(`[WhatsAppManager] Failed to fetch media metadata for ${mediaId}: ${metaRes.status} ${metaRes.statusText}`);
        return null;
      }

      const metaData: any = await metaRes.json();
      const downloadUrl: string = metaData.url;
      const mimeType: string = metaData.mime_type || 'application/octet-stream';
      const fileSize: number = Number(metaData.file_size || 0);

      if (!downloadUrl) {
        console.error(`[WhatsAppManager] No download URL returned for media ${mediaId}`);
        return null;
      }

      // Guard: Pre-check file size if reported by Meta
      if (fileSize > 0 && fileSize > maxSizeBytes) {
        console.warn(`[WhatsAppManager] Media ${mediaId} exceeds max allowed size: ${fileSize} > ${maxSizeBytes}`);
        return null;
      }

      // Guard: SSRF protection - validate download URL domain
      try {
        const parsedUrl = new URL(downloadUrl);
        const host = parsedUrl.hostname.toLowerCase();
        const isAllowedHost = host.endsWith('.facebook.com') ||
                              host.endsWith('.fbcdn.net') ||
                              host.endsWith('.fbsbx.com');
        if (!isAllowedHost) {
          console.error(`[WhatsAppManager] SSRF blocked: Untrusted media download hostname "${host}" for ${mediaId}`);
          return null;
        }
      } catch (err: any) {
        console.error(`[WhatsAppManager] Invalid media download URL for ${mediaId}:`, err.message);
        return null;
      }

      // Step 2: Download raw binary stream from Meta CDN
      const fileRes = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': 'SERA-Agent/1.0'
        },
        signal: controller.signal
      });

      if (!fileRes.ok) {
        console.error(`[WhatsAppManager] Failed to download binary file for media ${mediaId}: ${fileRes.status} ${fileRes.statusText}`);
        return null;
      }

      const arrayBuf = await fileRes.arrayBuffer();
      if (arrayBuf.byteLength > maxSizeBytes) {
        console.warn(`[WhatsAppManager] Downloaded buffer for media ${mediaId} exceeds max allowed size: ${arrayBuf.byteLength} > ${maxSizeBytes}`);
        return null;
      }

      return {
        buffer: Buffer.from(arrayBuf),
        mimeType
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.error(`[WhatsAppManager] Download timed out after ${timeoutMs}ms for media ${mediaId}`);
      } else {
        console.error(`[WhatsAppManager] Exception downloading media ${mediaId}:`, err.message);
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Uploads outbound media (audio, image, document) to Meta Graph API.
   * Returns the Meta media ID, or null on failure.
   */
  public async uploadMedia(
    buffer: Buffer,
    mimeType: string,
    filename: string = 'media'
  ): Promise<string | null> {
    if (!this.isEnabled() || !buffer || buffer.length === 0) return null;

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/media`;

    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      formData.append('file', blob, filename);
      formData.append('type', mimeType);
      formData.append('messaging_product', 'whatsapp');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: formData
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[WhatsAppManager] Failed to upload media (${response.status}): ${errText}`);
        return null;
      }

      const data = await response.json() as any;
      return data?.id || null;
    } catch (err: any) {
      console.error('[WhatsAppManager] Exception uploading media:', err.message);
      return null;
    }
  }
}


