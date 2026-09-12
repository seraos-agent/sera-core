import { Router, Request, Response } from 'express';
import { AgentManager } from '../AgentManager';
import { SecretManager } from '../../core/secrets/SecretManager';
import { WhatsAppManager } from '../../capabilities/communication/adapters/WhatsAppManager';
import { EventTypes } from '../../core/events/types';
import { ResponseContext } from '../../capabilities/communication/types';
import { WhatsAppPairingService } from '../../capabilities/communication/services/WhatsAppPairingService';
import { WhatsAppMediaProcessor } from '../../capabilities/communication/services/WhatsAppMediaProcessor';

export interface WhatsAppRouterOptions {
  agentManager: AgentManager;
  secretManager?: SecretManager;
  whatsAppManager?: WhatsAppManager;
  io?: any;
  verifyToken?: string;
  phoneNumberId?: string;
  accessToken?: string;
  apiVersion?: string;
}

/**
 * Lightweight Express router for Meta WhatsApp Business Cloud API webhooks.
 * Handles handshake verification and incoming message ingress, delegating pairing,
 * security gating, and multimodal processing to dedicated domain services.
 */
export function createWhatsAppRouter(options: WhatsAppRouterOptions): Router {
  const router = Router();
  const { agentManager, secretManager, whatsAppManager, io } = options;
  const verifyToken = options.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'sera_wa_verify_secret_2026';
  const phoneNumberId = options.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = options.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = options.apiVersion || process.env.WHATSAPP_API_VERSION || 'v21.0';

  const pairingService = new WhatsAppPairingService({
    agentManager,
    secretManager,
    whatsAppManager,
    io
  });
  const mediaProcessor = new WhatsAppMediaProcessor();

  // ── 1. Webhook Verification Handshake (GET) ────────────────────────────────
  const handleVerification = (req: Request, res: Response): void => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log(`[WhatsApp Webhook] Handshake verification request: mode=${mode}`);

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WhatsApp Webhook] Verification successful. Responding with challenge.');
      res.status(200).send(challenge);
      return;
    }

    console.warn('[WhatsApp Webhook] Verification token mismatch or invalid mode.');
    res.status(403).json({ error: 'Verification failed' });
  };

  router.get('/', handleVerification);
  router.get('/webhook', handleVerification);
  router.get('/api/webhook/whatsapp', handleVerification);

  // ── 2. Incoming Messages & Status Updates (POST) ───────────────────────────
  const handleIncoming = async (req: Request, res: Response): Promise<void> => {
    // Meta requires an immediate 200 OK acknowledgment
    res.status(200).send('EVENT_RECEIVED');

    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    try {
      const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
      if (!messages || messages.length === 0) return;

      const incomingMsg = messages[0];
      const from = incomingMsg.from; // Phone number e.g. "628..."
      const messageId = incomingMsg.id;
      const contactName = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || from;

      // Drop flooded messages silently to protect server and Meta API quotas
      if (pairingService.isFlooding(from)) {
        console.warn(`[WhatsApp Webhook] Ingress flood detected from +${from}. Dropping message.`);
        return;
      }

      console.log(`[WhatsApp Webhook] Ingress message from ${contactName} (${from}): type=${incomingMsg.type}`);

      // Mark message as read asynchronously
      if (phoneNumberId && accessToken && messageId) {
        fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId })
        }).catch((e) => console.warn('[WhatsApp Webhook] Failed to mark read:', e.message));
      }

      let textContent = '';
      let isVoiceMessage = false;

      if (incomingMsg.type === 'text') {
        textContent = incomingMsg.text?.body || '';
        const isNegativeVoice = /\b(jangan|ga\s*usah|tidak\s*usah|gak\s*usah)\s+(pake|pakai|kirim|balas)?\s*(vn|suara|voice)/i.test(textContent) ||
                                /\b(balas|jawab|kirim|tulis)\s+(pake\s+|pakai\s+|dengan\s+|lewat\s+)?(teks|tulisan|chat|ketik)\b/i.test(textContent);
        if (!isNegativeVoice && (
          /\b(vn|voice\s*note|voice\s*msg|voice\s*message|pesan\s*suara|rekaman\s*suara)\b/i.test(textContent) ||
          /(balas|jawab|ngomong|bicara|kirim|pake|pakai|dengan|lewat|coba)\s+(pake\s+|pakai\s+|dengan\s+|lewat\s+)?(suara|vn|audio)/i.test(textContent) ||
          /\b(bisa\s+pake\s+voice\s*not|balas\s+pake\s+vn)\b/i.test(textContent)
        )) {
          isVoiceMessage = true;
        }
      } else if (incomingMsg.type === 'interactive') {
        textContent = incomingMsg.interactive?.button_reply?.title || incomingMsg.interactive?.list_reply?.title || '';
      } else if (incomingMsg.type === 'image') {
        textContent = incomingMsg.image?.caption || '';
      } else if (incomingMsg.type === 'document') {
        textContent = incomingMsg.document?.caption || '';
      } else if (incomingMsg.type === 'audio') {
        isVoiceMessage = true;
      } else {
        textContent = `[Media received: ${incomingMsg.type}]`;
      }

      if (!textContent.trim() && incomingMsg.type !== 'image' && incomingMsg.type !== 'document' && incomingMsg.type !== 'audio') {
        return;
      }

      // Pairing Flow: Intercept /connect <CODE> or /start <CODE>
      const wasPairingCommand = await pairingService.handlePairingCommand(from, textContent);
      if (wasPairingCommand) return;

      // Identity resolution: Find user session linked to this WhatsApp phone number
      const sessionId = await pairingService.resolveSessionId(from);
      if (!sessionId) {
        await pairingService.handleUnlinkedGate(from);
        return;
      }

      const instance = agentManager.getOrCreateInstance(sessionId);

      // Direct Interactive Proposal Button Resolution (Strict Button Approval)
      if (incomingMsg.type === 'interactive' && incomingMsg.interactive?.type === 'button_reply') {
        const buttonId = incomingMsg.interactive?.button_reply?.id || '';
        if (buttonId.startsWith('approve_prop_')) {
          const proposalId = buttonId.replace('approve_prop_', '');
          console.log(`[WhatsApp Webhook] Proposal approval button tapped: ${proposalId} from +${from}`);
          instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_APPROVED, {
            id: `evt-appr-${Date.now()}`,
            type: EventTypes.DIALOGUE_PROPOSAL_APPROVED,
            source: 'WhatsAppAdapter',
            payload: { proposalId }
          });
          return;
        }

        if (buttonId.startsWith('reject_prop_')) {
          const proposalId = buttonId.replace('reject_prop_', '');
          console.log(`[WhatsApp Webhook] Proposal rejection button tapped: ${proposalId} from +${from}`);
          instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_REJECTED, {
            id: `evt-rej-${Date.now()}`,
            type: EventTypes.DIALOGUE_PROPOSAL_REJECTED,
            source: 'WhatsAppAdapter',
            payload: { proposalId }
          });
          return;
        }
      }

      let imagesList: string[] | undefined;
      let documentsList: any[] | undefined;

      // Media Ingestion: Delegate image, document, and audio processing
      if (incomingMsg.type === 'image') {
        const res = await mediaProcessor.processImage(incomingMsg.image?.id, textContent, whatsAppManager);
        imagesList = res.imagesList;
        textContent = res.textContent;
      } else if (incomingMsg.type === 'document') {
        const res = await mediaProcessor.processDocument(
          incomingMsg.document?.id,
          incomingMsg.document?.filename,
          textContent,
          incomingMsg.document?.mime_type,
          whatsAppManager
        );
        documentsList = res.documentsList;
        textContent = res.textContent;
      } else if (incomingMsg.type === 'audio') {
        const res = await mediaProcessor.processAudio(incomingMsg.audio?.id, incomingMsg.audio?.mime_type, from, whatsAppManager);
        textContent = res.textContent;
        isVoiceMessage = res.isVoiceMessage;
      }

      if (!textContent.trim() && !imagesList?.length && !documentsList?.length) return;

      const responseContext: ResponseContext = {
        platform: 'whatsapp',
        channelId: from,
        senderId: from,
        senderPhone: from,
        isVoiceMessage
      };

      const event = {
        id: `evt-wa-${Date.now()}`,
        type: EventTypes.DIALOGUE_USER_OBSERVED,
        source: 'WhatsAppAdapter',
        payload: {
          message: textContent,
          images: imagesList,
          documents: documentsList,
          isVoiceMessage,
          _responseContext: responseContext,
          responseContext,
          senderName: contactName,
          platform: 'whatsapp'
        },
        timestamp: Date.now()
      };

      instance.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);
    } catch (err: any) {
      console.error('[WhatsApp Webhook] Error processing incoming webhook:', err);
    }
  };

  router.post('/', handleIncoming);
  router.post('/webhook', handleIncoming);
  router.post('/api/webhook/whatsapp', handleIncoming);

  return router;
}
