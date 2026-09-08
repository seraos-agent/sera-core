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
}
