import { SecretManager } from '../../../core/secrets/SecretManager';
import { AgentManager } from '../../../server/AgentManager';
import { WhatsAppManager } from '../adapters/WhatsAppManager';

export interface WhatsAppPairingOptions {
  agentManager: AgentManager;
  secretManager?: SecretManager;
  whatsAppManager?: WhatsAppManager;
  io?: any;
}

/**
 * Handles WhatsApp phone identity resolution, pairing code verification (/connect <code>),
 * onboarding guidance for unlinked phone numbers, and anti-spam 24-hour cooldown policies.
 */
export class WhatsAppPairingService {
  private readonly ingressFloodMap = new Map<string, number[]>();

  constructor(private readonly options: WhatsAppPairingOptions) {}

  /**
   * Sliding window flood prevention: max 5 messages per 10 seconds per phone number.
   */
  public isFlooding(phone: string): boolean {
    const now = Date.now();
    const windowMs = 10_000;
    const maxAllowed = 5;
    const timestamps = (this.ingressFloodMap.get(phone) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= maxAllowed) {
      return true;
    }
    timestamps.push(now);
    this.ingressFloodMap.set(phone, timestamps);
    return false;
  }

  /**
   * Resolves the linked SERA session ID for a WhatsApp phone number.
   */
  public async resolveSessionId(phone: string): Promise<string | null> {
    if (!this.options.secretManager) return null;
    try {
      const linkedUser = await this.options.secretManager.getSecret(`WA_USER_${phone}`);
      return linkedUser || null;
    } catch {
      return null;
    }
  }

  /**
   * Checks if incoming text is a pairing command (/connect <CODE> or /start <CODE>)
   * and executes pairing if valid.
   */
  public async handlePairingCommand(from: string, textContent: string): Promise<boolean> {
    const connectMatch = textContent.trim().match(/^\/(?:connect|start)\s+([a-zA-Z0-9_-]+)/i);
    if (!connectMatch || !this.options.secretManager) {
      return false;
    }

    const code = connectMatch[1].trim().toUpperCase();
    console.log(`[WhatsApp Webhook] Received pairing attempt with code: ${code} from ${from}`);

    const targetSession = await this.options.secretManager.getSecret(`WA_LINK_${code}`);
    if (targetSession) {
      await this.options.secretManager.setSecret(`WA_USER_${from}`, targetSession);
      await this.options.secretManager.setSecret(`WA_SESSION_${targetSession}`, from);
      await this.options.secretManager.deleteSecret(`WA_LINK_${code}`).catch(() => {});
      await this.options.secretManager.deleteSecret(`WA_UNLINKED_LIMIT_${from}`).catch(() => {});

      console.log(`[WhatsApp Webhook] Successfully linked phone ${from} to session ${targetSession}`);

      if (this.options.io) {
        this.options.io.to(`user:${targetSession}`).emit('whatsapp:status', {
          provider: 'WHATSAPP',
          status: 'CONNECTED',
          phoneNumber: from
        });
        const inst = this.options.agentManager.getInstance(targetSession);
        if (inst?.runtime?.capabilityCatalog) {
          inst.runtime.capabilityCatalog.activateConnector('whatsapp');
          this.options.io.to(`user:${targetSession}`).emit('connector:catalog', inst.runtime.capabilityCatalog.allConnectorSummaries());
          this.options.io.to(`user:${targetSession}`).emit('connector:status_changed', inst.runtime.capabilityCatalog.allConnectorSummaries());
        }
      }

      if (this.options.whatsAppManager) {
        await this.options.whatsAppManager.sendDirectMessage(
          from,
          `✅ Successfully linked your WhatsApp (+${from}) to your SERA OS Identity! You can now manage your portfolio, automations, and operational tasks directly from this chat.`
        );
      }
      return true;
    } else {
      console.warn(`[WhatsApp Webhook] Invalid or expired pairing code: ${code}`);
      if (this.options.whatsAppManager) {
        await this.options.whatsAppManager.sendDirectMessage(
          from,
          `⚠️ The pairing code is invalid or has expired. Please generate a fresh code from the Connections tab in your SERA Web Dashboard.`
        );
      }
      return true;
    }
  }

  /**
   * Enforces onboarding guidance for unlinked phone numbers:
   * Max 3 onboarding prompts, followed by a 24-hour silent cooldown.
   * Returns true if the message was handled/intercepted (should not proceed to dialogue).
   */
  public async handleUnlinkedGate(from: string): Promise<boolean> {
    let attemptCount = 0;
    let cooldownUntil = 0;

    if (this.options.secretManager) {
      try {
        const rawLimit = await this.options.secretManager.getSecret(`WA_UNLINKED_LIMIT_${from}`);
        if (rawLimit) {
          const parsed = JSON.parse(rawLimit);
          attemptCount = parsed.count || 0;
          cooldownUntil = parsed.cooldownUntil || 0;
        }
      } catch {}
    }

    const now = Date.now();

    // If phone number is currently in 24-hour cooldown, silently drop message
    if (cooldownUntil && cooldownUntil > now) {
      console.log(`[WhatsApp Webhook] Message from unlinked number +${from} silently ignored (24h cooldown active).`);
      return true;
    }

    // If cooldown period has elapsed, reset attempt counter
    if (cooldownUntil && cooldownUntil <= now) {
      attemptCount = 0;
    }

    const newCount = attemptCount + 1;

    if (newCount < 3) {
      // Attempts 1 and 2: Standard onboarding guidance
      if (this.options.secretManager) {
        await this.options.secretManager.setSecret(`WA_UNLINKED_LIMIT_${from}`, JSON.stringify({ count: newCount }));
      }
      console.log(`[WhatsApp Webhook] Unlinked prompt sent to +${from} (attempt ${newCount}/3).`);
      if (this.options.whatsAppManager) {
        await this.options.whatsAppManager.sendDirectMessage(
          from,
          `👋 Hello! Your WhatsApp number (+${from}) is not linked to any SERA OS identity yet.\n\nTo interact with SERA, please link your account first:\n1. Open https://app.seraos.xyz\n2. Go to Connections -> WhatsApp\n3. Tap 'Open in WhatsApp' or scan the QR code to connect.`
        ).catch((err) => console.error('[WhatsApp Webhook] Failed to send unlinked prompt:', err.message));
      }
    } else {
      // Attempt 3: Final warning notice + activate 24-hour cooldown
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      const newCooldown = now + twentyFourHoursMs;
      if (this.options.secretManager) {
        await this.options.secretManager.setSecret(`WA_UNLINKED_LIMIT_${from}`, JSON.stringify({
          count: 3,
          cooldownUntil: newCooldown
        }));
      }
      console.log(`[WhatsApp Webhook] Final unlinked prompt sent to +${from}. 24-hour cooldown activated.`);
      if (this.options.whatsAppManager) {
        await this.options.whatsAppManager.sendDirectMessage(
          from,
          `⚠️ Hello! Your WhatsApp number (+${from}) is not linked to any SERA OS identity.\n\nThis is your final reminder. Further messages will be silenced for 24 hours until you link your account at https://app.seraos.xyz.`
        ).catch((err) => console.error('[WhatsApp Webhook] Failed to send unlinked prompt:', err.message));
      }
    }

    return true;
  }
}
