import { Router, Request, Response } from 'express';
import { AgentManager } from '../AgentManager';
import { SecretManager } from '../../core/secrets/SecretManager';
import { EventTypes } from '../../core/events/types';
import { ResponseContext } from '../../capabilities/communication/types';

import { WhatsAppManager } from '../../capabilities/communication/adapters/WhatsAppManager';
import { DocumentParserService, ParsedDocumentResult } from '../../core/ingestion/DocumentParserService';
import { QwenAudioTranscriber } from '../../capabilities/audio/QwenAudioTranscriber';

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

export function createWhatsAppRouter(options: WhatsAppRouterOptions): Router {
  const router = Router();
  const { agentManager, secretManager, whatsAppManager, io } = options;
  const verifyToken = options.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'sera_wa_verify_secret_2026';
  const phoneNumberId = options.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = options.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = options.apiVersion || process.env.WHATSAPP_API_VERSION || 'v21.0';

  // In-memory sliding window for flood prevention: max 5 messages per 10 seconds per phone number
  const ingressFloodMap = new Map<string, number[]>();

  const isFlooding = (phone: string): boolean => {
    const now = Date.now();
    const windowMs = 10_000;
    const maxAllowed = 5;
    const timestamps = (ingressFloodMap.get(phone) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= maxAllowed) {
      return true;
    }
    timestamps.push(now);
    ingressFloodMap.set(phone, timestamps);
    return false;
  };

  // ── 1. Webhook Verification Handshake (GET) ────────────────────────────────
  // Meta sends GET requests to verify the webhook URL and token
  const handleVerification = (req: Request, res: Response) => {
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
    if (body.object !== 'whatsapp_business_account') {
      return;
    }

    try {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      if (!value) return;

      const messages = value.messages;
      if (!messages || messages.length === 0) {
        // May be delivery receipts / status updates
        return;
      }

      const incomingMsg = messages[0];
      const from = incomingMsg.from; // Phone number e.g. "628..."
      const messageId = incomingMsg.id;
      const contactName = value.contacts?.[0]?.profile?.name || from;

      // Drop flooded messages silently to protect server and Meta API quotas
      if (isFlooding(from)) {
        console.warn(`[WhatsApp Webhook] Ingress flood detected from +${from}. Dropping message.`);
        return;
      }

      console.log(`[WhatsApp Webhook] Ingress message from ${contactName} (${from}): type=${incomingMsg.type}`);

      // Mark message as read asynchronously
      if (phoneNumberId && accessToken && messageId) {
        fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId
          })
        }).catch((e) => console.warn('[WhatsApp Webhook] Failed to mark read:', e.message));
      }

      let textContent = '';
      let isVoiceMessage = false;
      if (incomingMsg.type === 'text') {
        textContent = incomingMsg.text?.body || '';
        // Check if user explicitly asks for text reply
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

      if (!textContent.trim() && incomingMsg.type !== 'image' && incomingMsg.type !== 'document' && incomingMsg.type !== 'audio') return;


      // ── Pairing Flow: Intercept /connect <CODE> or /start <CODE> ─────────────
      const connectMatch = textContent.trim().match(/^\/(?:connect|start)\s+([a-zA-Z0-9_-]+)/i);
      if (connectMatch && secretManager) {
        const code = connectMatch[1].trim().toUpperCase();
        console.log(`[WhatsApp Webhook] Received pairing attempt with code: ${code} from ${from}`);
        const targetSession = await secretManager.getSecret(`WA_LINK_${code}`);
        if (targetSession) {
          await secretManager.setSecret(`WA_USER_${from}`, targetSession);
          await secretManager.setSecret(`WA_SESSION_${targetSession}`, from);
          await secretManager.deleteSecret(`WA_LINK_${code}`).catch(() => {});
          await secretManager.deleteSecret(`WA_UNLINKED_LIMIT_${from}`).catch(() => {});

          console.log(`[WhatsApp Webhook] Successfully linked phone ${from} to session ${targetSession}`);

          if (io) {
            io.to(`user:${targetSession}`).emit('whatsapp:status', {
              provider: 'WHATSAPP',
              status: 'CONNECTED',
              phoneNumber: from
            });
            const inst = agentManager.getInstance(targetSession);
            if (inst?.runtime?.capabilityCatalog) {
              inst.runtime.capabilityCatalog.activateConnector('whatsapp');
              io.to(`user:${targetSession}`).emit('connector:catalog', inst.runtime.capabilityCatalog.allConnectorSummaries());
              io.to(`user:${targetSession}`).emit('connector:status_changed', inst.runtime.capabilityCatalog.allConnectorSummaries());
            }
          }

          if (whatsAppManager) {
            await whatsAppManager.sendDirectMessage(
              from,
              `✅ Successfully linked your WhatsApp (+${from}) to your SERA OS Identity! You can now manage your portfolio, automations, and operational tasks directly from this chat.`
            );
          }
          return;
        } else {
          console.warn(`[WhatsApp Webhook] Invalid or expired pairing code: ${code}`);
          if (whatsAppManager) {
            await whatsAppManager.sendDirectMessage(
              from,
              `⚠️ The pairing code is invalid or has expired. Please generate a fresh code from the Connections tab in your SERA Web Dashboard.`
            );
          }
          return;
        }
      }

      // Identity resolution: Find user session linked to this WhatsApp phone number
      let sessionId: string | null = null;
      if (secretManager) {
        try {
          const linkedUser = await secretManager.getSecret(`WA_USER_${from}`);
          if (linkedUser) {
            sessionId = linkedUser;
          }
        } catch {}
      }

      // Strict Pairing Gate: Unlinked phone numbers are never routed to 'dev' or given agent access
      // Anti-Spam Policy: Max 3 onboarding reminders, followed by a 24-hour silent cooldown
      if (!sessionId) {
        let attemptCount = 0;
        let cooldownUntil = 0;

        if (secretManager) {
          try {
            const rawLimit = await secretManager.getSecret(`WA_UNLINKED_LIMIT_${from}`);
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
          return;
        }

        // If cooldown period has elapsed, reset attempt counter
        if (cooldownUntil && cooldownUntil <= now) {
          attemptCount = 0;
        }

        const newCount = attemptCount + 1;

        if (newCount < 3) {
          // Attempts 1 and 2: Standard onboarding guidance
          if (secretManager) {
            await secretManager.setSecret(`WA_UNLINKED_LIMIT_${from}`, JSON.stringify({ count: newCount }));
          }
          console.log(`[WhatsApp Webhook] Unlinked prompt sent to +${from} (attempt ${newCount}/3).`);
          if (whatsAppManager) {
            await whatsAppManager.sendDirectMessage(
              from,
              `👋 Hello! Your WhatsApp number (+${from}) is not linked to any SERA OS identity yet.\n\nTo interact with SERA, please link your account first:\n1. Open https://app.seraos.xyz\n2. Go to Connections -> WhatsApp\n3. Tap 'Open in WhatsApp' or scan the QR code to connect.`
            ).catch((err) => console.error('[WhatsApp Webhook] Failed to send unlinked prompt:', err.message));
          }
        } else {
          // Attempt 3: Final warning notice + activate 24-hour cooldown
          const twentyFourHoursMs = 24 * 60 * 60 * 1000;
          const newCooldown = now + twentyFourHoursMs;
          if (secretManager) {
            await secretManager.setSecret(`WA_UNLINKED_LIMIT_${from}`, JSON.stringify({
              count: 3,
              cooldownUntil: newCooldown
            }));
          }
          console.log(`[WhatsApp Webhook] Final unlinked prompt sent to +${from}. 24-hour cooldown activated.`);
          if (whatsAppManager) {
            await whatsAppManager.sendDirectMessage(
              from,
              `⚠️ Hello! Your WhatsApp number (+${from}) is not linked to any SERA OS identity.\n\nThis is your final reminder. Further messages will be silenced for 24 hours until you link your account at https://app.seraos.xyz.`
            ).catch((err) => console.error('[WhatsApp Webhook] Failed to send unlinked prompt:', err.message));
          }
        }

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

      let imagesList: string[] | undefined = undefined;
      let documentsList: ParsedDocumentResult[] | undefined = undefined;

      // ── Media Ingestion: Download and process image/document attachments ────
      if (incomingMsg.type === 'image') {
        const imageObj = incomingMsg.image;
        const mediaId = imageObj?.id;
        if (mediaId && whatsAppManager) {
          try {
            const downloaded = await whatsAppManager.downloadMedia(mediaId, {
              maxSizeBytes: 15 * 1024 * 1024, // 15MB limit for images
              timeoutMs: 30_000 // 30s timeout
            });
            if (downloaded) {
              const base64Str = downloaded.buffer.toString('base64');
              imagesList = [`data:${downloaded.mimeType || 'image/jpeg'};base64,${base64Str}`];
              if (!textContent.trim()) {
                textContent = 'Tolong analisa foto/gambar ini secara detail.';
              }
            } else {
              if (!textContent.trim()) {
                textContent = '[Gambar tidak dapat diunduh dari WhatsApp atau melebihi batas 15MB]';
              }
            }
          } catch (err: any) {
            console.error('[WhatsApp Webhook] Failed to download image:', err.message);
            if (!textContent.trim()) {
              textContent = '[Gagal memproses gambar dari WhatsApp]';
            }
          }
        }
      } else if (incomingMsg.type === 'document') {
        const docObj = incomingMsg.document;
        const mediaId = docObj?.id;
        const fileName = docObj?.filename || 'document.csv';
        if (mediaId && whatsAppManager) {
          try {
            const downloaded = await whatsAppManager.downloadMedia(mediaId, {
              maxSizeBytes: 20 * 1024 * 1024, // 20MB limit for documents
              timeoutMs: 30_000 // 30s timeout
            });
            if (downloaded) {
              const parsedDoc = await DocumentParserService.parseDocument(
                downloaded.buffer,
                fileName,
                downloaded.mimeType || docObj?.mime_type || 'application/octet-stream'
              );
              documentsList = [parsedDoc];
              if (!textContent.trim()) {
                textContent = `Saya mengunggah dokumen: ${fileName}. Tolong analisa data dan angka kuncinya.`;
              }
            } else {
              if (!textContent.trim()) {
                textContent = `[Dokumen ${fileName} tidak dapat diunduh dari WhatsApp atau melebihi batas 20MB]`;
              }
            }
          } catch (err: any) {
            console.error('[WhatsApp Webhook] Failed to download/parse document:', err.message);
            if (!textContent.trim()) {
              textContent = `[Gagal memproses dokumen ${fileName}]`;
            }
          }
        }
      } else if (incomingMsg.type === 'audio') {
        const audioObj = incomingMsg.audio;
        const mediaId = audioObj?.id;
        const mimeType = audioObj?.mime_type || 'audio/ogg';
        if (mediaId && whatsAppManager) {
          try {
            const downloaded = await whatsAppManager.downloadMedia(mediaId, {
              maxSizeBytes: 25 * 1024 * 1024, // 25MB limit for audio
              timeoutMs: 30_000
            });
            if (downloaded) {
              const transcribed = await QwenAudioTranscriber.transcribe(
                downloaded.buffer,
                downloaded.mimeType || mimeType
              );
              if (transcribed) {
                textContent = transcribed;
                console.log(`[WhatsApp Webhook] Voice note from +${from} transcribed: "${transcribed.slice(0, 80)}..."`);
                // If user speaks in a VN but explicitly asks to reply in text
                if (
                  /\b(balas|jawab|kirim|tulis)\b.*?\b(teks|tulisan|chat|ketik)\b/i.test(transcribed) ||
                  /\b(jangan\s+vn|jangan\s+suara|jangan\s+pake\s+vn|jangan\s+kirim\s+vn)\b/i.test(transcribed)
                ) {
                  isVoiceMessage = false;
                }
              } else {
                textContent = '[Voice Note tidak dapat ditranskrip dengan jelas. Mohon ulangi kembali atau ketik pesan Anda.]';
              }
            } else {
              textContent = '[File audio tidak dapat diunduh dari WhatsApp]';
            }
          } catch (err: any) {
            console.error('[WhatsApp Webhook] Failed to transcribe audio:', err.message);
            textContent = '[Gagal memproses voice note dari WhatsApp]';
          }
        }
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
