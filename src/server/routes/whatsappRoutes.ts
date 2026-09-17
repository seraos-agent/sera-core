import { Router, Request, Response } from 'express';
import { AgentManager } from '../AgentManager';
import { SecretManager } from '../../core/secrets/SecretManager';
import { WhatsAppManager } from '../../capabilities/communication/adapters/WhatsAppManager';
import { EventTypes } from '../../core/events/types';
import { ResponseContext } from '../../capabilities/communication/types';
import { WhatsAppPairingService } from '../../capabilities/communication/services/WhatsAppPairingService';
import { WhatsAppMediaProcessor } from '../../capabilities/communication/services/WhatsAppMediaProcessor';
import { WhatsAppCatalogService } from '../../capabilities/communication/services/WhatsAppCatalogService';
import { StoreProfileService } from '../../capabilities/communication/services/StoreProfileService';
import { serverConfig } from '../config';

export interface WhatsAppRouterOptions {
  agentManager: AgentManager;
  secretManager?: SecretManager;
  whatsAppManager?: WhatsAppManager;
  io?: any;
  verifyToken?: string;
  phoneNumberId?: string;
  accessToken?: string;
  apiVersion?: string;
  catalogToken?: string;
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
  const catalogToken = options.catalogToken || serverConfig.whatsapp.catalogToken || process.env.TOKEN_KATALOG_META || accessToken;

  const pairingService = new WhatsAppPairingService({
    agentManager,
    secretManager,
    whatsAppManager,
    io
  });
  const mediaProcessor = new WhatsAppMediaProcessor();

  interface PendingBatchItem {
    textContent: string;
    imagesList: string[];
    cdnUrls: string[];
    documentsList: any[];
    isVoiceMessage: boolean;
    location?: { latitude: number; longitude: number; name?: string };
  }

  interface PendingBatch {
    timer: NodeJS.Timeout;
    items: PendingBatchItem[];
    sessionId: string;
    from: string;
    contactName: string;
  }

  const pendingBatches = new Map<string, PendingBatch>();
  const DEBOUNCE_MS = process.env.NODE_ENV === 'test' ? 10 : 2000;

  const dispatchBatch = (from: string) => {
    const batch = pendingBatches.get(from);
    if (!batch) return;
    pendingBatches.delete(from);

    const instance = agentManager.getOrCreateInstance(batch.sessionId);
    const combinedTexts: string[] = [];
    const allImages: string[] = [];
    const allCdnUrls: string[] = [];
    const allDocs: any[] = [];
    let isVoiceMessage = false;
    let lastLocation: { latitude: number; longitude: number; name?: string } | undefined;

    for (const item of batch.items) {
      if (item.textContent && item.textContent.trim()) {
        combinedTexts.push(item.textContent.trim());
      }
      if (item.imagesList && item.imagesList.length > 0) {
        allImages.push(...item.imagesList);
      }
      if (item.cdnUrls && item.cdnUrls.length > 0) {
        allCdnUrls.push(...item.cdnUrls);
      }
      if (item.documentsList && item.documentsList.length > 0) {
        allDocs.push(...item.documentsList);
      }
      if (item.isVoiceMessage) {
        isVoiceMessage = true;
      }
      if (item.location) {
        lastLocation = item.location;
      }
    }

    let finalMessage = combinedTexts.join('\n');
    const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    if (allCdnUrls.length > 0 && !isTest) {
      finalMessage += `\n[CDN_IMAGE_URLS: ${allCdnUrls.join(', ')}]`;
    }

    if (!finalMessage.trim() && allImages.length === 0 && allDocs.length === 0 && !lastLocation) {
      return;
    }

    const responseContext: ResponseContext = {
      platform: 'whatsapp',
      channelId: from,
      senderId: from,
      senderPhone: from,
      isVoiceMessage,
      location: lastLocation
    };

    const event = {
      id: `evt-wa-${Date.now()}`,
      type: EventTypes.DIALOGUE_USER_OBSERVED,
      source: 'WhatsAppAdapter',
      payload: {
        message: finalMessage,
        images: allImages.length > 0 ? allImages : undefined,
        documents: allDocs.length > 0 ? allDocs : undefined,
        cdnImageUrls: allCdnUrls.length > 0 ? allCdnUrls : undefined,
        location: lastLocation,
        isVoiceMessage,
        _responseContext: responseContext,
        responseContext,
        senderName: batch.contactName,
        platform: 'whatsapp'
      },
      timestamp: Date.now()
    };

    console.log(`[WhatsApp Webhook] Dispatching batched turn for +${from} (${batch.items.length} msgs, ${allImages.length} images, ${allCdnUrls.length} CDN URLs)`);
    instance.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);
  };

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
        const replyId = incomingMsg.interactive?.button_reply?.id || incomingMsg.interactive?.list_reply?.id || '';
        const replyTitle = incomingMsg.interactive?.button_reply?.title || incomingMsg.interactive?.list_reply?.title || '';
        if (replyId.startsWith('store_')) {
          const rawStoreSlug = replyId.replace('store_', '');
          textContent = `[MEMILIH TOKO: "${replyTitle}" (ID: ${rawStoreSlug}) - Buka katalog lengkap menu/produk untuk toko ini menggunakan WHATSAPP_SEND_CATALOG]`;
        } else {
          textContent = replyTitle;
        }
      } else if (incomingMsg.type === 'image') {
        textContent = incomingMsg.image?.caption || '';
      } else if (incomingMsg.type === 'document') {
        textContent = incomingMsg.document?.caption || '';
      } else if (incomingMsg.type === 'audio') {
        isVoiceMessage = true;
      } else if (incomingMsg.type === 'location') {
        const loc = incomingMsg.location;
        const lat = loc?.latitude;
        const lng = loc?.longitude;
        const locName = loc?.name || loc?.address || '';
        textContent = `[LOKASI PEMBELI DITERIMA: ${lat}, ${lng}${locName ? ` - ${locName}` : ''}]`;
      } else if (incomingMsg.type === 'order') {
        const storeService = StoreProfileService.getInstance();
        const parsedOrder = WhatsAppCatalogService.parseIncomingOrder(incomingMsg.order);

        // Strict store resolution from product SKU to prevent store data cross-contamination
        const firstSku = parsedOrder.items[0]?.product_retailer_id || '';
        let targetStore: any = undefined;
        const allStores = storeService.listStores();

        for (const store of allStores) {
          const storeSlug = store.storeId.toLowerCase().replace(/[^a-z0-9]/g, '');
          const storeNameClean = store.storeName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const skuClean = firstSku.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (skuClean.includes(storeSlug) || skuClean.includes(storeNameClean)) {
            targetStore = store;
            break;
          }
        }

        // Fallback: If only 1 store registered in system, resolve to that store
        if (!targetStore && allStores.length === 1) {
          targetStore = allStores[0];
        }

        const storeStatus = targetStore ? storeService.isStoreOpenNow(targetStore.storeId) : undefined;
        let orderSummary = parsedOrder.formattedSummary;

        if (targetStore && storeStatus) {
          orderSummary += `\n[STATUS TOKO: ${targetStore.storeName} - ${storeStatus.statusText}]`;
          if (!storeStatus.isOpen) {
            if (targetStore.businessCategory === 'FOOD_INSTANT' || !storeStatus.allowPreOrder) {
              orderSummary += `\n[STATUS OPERASIONAL: Toko kuliner ini saat ini SEDANG TUTUP (${storeStatus.statusText}).\n` +
                `PENTING: DILARANG menawarkan pre-order makanan untuk besok pagi kepada pembeli yang lapar malam hari!\n` +
                `Sampaikan dengan ramah dan empatik bahwa toko sudah tutup dan buka kembali jam ${targetStore.operatingHours.open}.\n` +
                `Tawarkan apakah pembeli ingin dicarikan kuliner/makanan alternatif terdekat yang masih buka sekarang.]`;
            } else if (targetStore.businessCategory === 'SERVICE') {
              orderSummary += `\n[STATUS OPERASIONAL: Layanan di luar jam operasional (${storeStatus.statusText}).\n` +
                `Tawarkan reservasi / booking jadwal panggilan teknisi/layanan untuk esok hari, dan tanyakan jam serta alamat lokasi.]`;
            } else {
              orderSummary += `\n[STATUS OPERASIONAL: Toko retail/sembako saat ini sedang tutup (${storeStatus.statusText}).\n` +
                `Catat pesanan sebagai pre-order yang akan disiapkan dan dikirim pada kloter pertama esok hari jam ${targetStore.operatingHours.open}.]`;
            }
          } else if (targetStore.businessType === 'SERVICE') {
            orderSummary += `\n[TIPE: JASA / BOOKING LAYANAN. Tanyakan jadwal tanggal/jam panggilan dan lokasi/alamat kepada pemesan.]`;
          }

          // Asynchronously dispatch order alert to merchant's personal WhatsApp if configured
          if (targetStore.ownerWhatsApp && targetStore.ownerWhatsApp !== from && phoneNumberId && accessToken) {
            const cleanOwnerPhone = targetStore.ownerWhatsApp.replace(/[^0-9]/g, '');
            const merchantAlertText = `🔔 *PESANAN BARU MASUK!* (#${Date.now().toString(36).toUpperCase()})\n\n` +
              `Toko: *${targetStore.storeName}*\n` +
              `Pembeli: +${from}\n` +
              `Total: Rp ${parsedOrder.totalEstimated.toLocaleString('id-ID')}\n` +
              (parsedOrder.customerNote ? `Catatan Pembeli: "${parsedOrder.customerNote}"\n\n` : '\n') +
              `Item:\n` +
              parsedOrder.items.map((it, i) => `${i + 1}. ${it.product_retailer_id} (${it.quantity}x @ Rp ${it.item_price.toLocaleString('id-ID')})`).join('\n') +
              `\n\nStatus Operasional: ${storeStatus.statusText}`;

            fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: cleanOwnerPhone,
                type: 'text',
                text: { body: merchantAlertText }
              })
            }).then(r => r.json()).then(res => {
              console.log(`[WhatsApp Webhook] Order alert dispatched to merchant (+${cleanOwnerPhone}):`, res?.messages?.[0]?.id || 'OK');
            }).catch(e => console.warn('[WhatsApp Webhook] Failed to notify merchant:', e.message));
          }
        }

        textContent = orderSummary;
      } else {
        textContent = `[Media received: ${incomingMsg.type}]`;
      }

      // Check if message is referred from a catalog product card (e.g. tapping 'View' / 'Message business' on a showcase item)
      const referredSku = incomingMsg.context?.referred_product?.product_retailer_id;
      if (referredSku) {
        if (referredSku.startsWith('showcase_')) {
          const storeSlug = referredSku.replace('showcase_', '');
          const storeService = StoreProfileService.getInstance();
          const target = storeService.getStore(storeSlug);
          const sName = target ? target.storeName : storeSlug;
          const contextPrompt = `[PEMBELI MELIHAT KARTU TOKO: "${sName}" (SKU: ${referredSku}). Buka katalog lengkap menu/produk toko "${sName}" menggunakan WHATSAPP_SEND_CATALOG agar pembeli bisa memilih varian dan memesan.]`;
          textContent = textContent ? `${contextPrompt}\nPesan pembeli: "${textContent}"` : contextPrompt;
        } else {
          textContent = textContent ? `[Terkait Produk SKU: ${referredSku}] ${textContent}` : `[Melihat detail produk SKU: ${referredSku}]`;
        }
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

      // Fast-Path Interceptor: Store Selection -> Instantly Dispatches MPM Menu (<150ms, bypasses LLM turn)
      const interactiveReplyId = incomingMsg.interactive?.button_reply?.id || incomingMsg.interactive?.list_reply?.id || '';
      const interactiveReplyTitle = incomingMsg.interactive?.button_reply?.title || incomingMsg.interactive?.list_reply?.title || '';
      const referredShowcaseSku = incomingMsg.context?.referred_product?.product_retailer_id;
      const cleanReplyId = (interactiveReplyId || '').trim();
      const cleanShowcaseSku = (referredShowcaseSku || '').trim();
      const isStoreSelection = cleanReplyId.toLowerCase().startsWith('store_') || cleanShowcaseSku.toLowerCase().startsWith('showcase_');

      if (isStoreSelection) {
        let cardSent = false;
        try {
          const rawStoreSlug = cleanReplyId.toLowerCase().startsWith('store_')
            ? cleanReplyId.replace(/^store_/i, '').trim()
            : cleanShowcaseSku.replace(/^showcase_/i, '').trim();

          const storeService = StoreProfileService.getInstance();
          let targetStore = storeService.getStore(rawStoreSlug);
          if (!targetStore) {
            const allStores = storeService.listStores();
            targetStore = allStores.find(
              (s) =>
                s.storeId.toLowerCase() === rawStoreSlug.toLowerCase() ||
                (interactiveReplyTitle && s.storeName.toLowerCase() === interactiveReplyTitle.toLowerCase()) ||
                (interactiveReplyTitle && s.storeName.toLowerCase().includes(interactiveReplyTitle.toLowerCase())) ||
                (rawStoreSlug && s.storeId.toLowerCase().includes(rawStoreSlug.toLowerCase()))
            );
          }

          const storeName = targetStore ? targetStore.storeName : (interactiveReplyTitle || rawStoreSlug);
          const effectiveCatalogToken = catalogToken || serverConfig.whatsapp.catalogToken || process.env.TOKEN_KATALOG_META || accessToken;
          const catalogService = new WhatsAppCatalogService({
            accessToken: effectiveCatalogToken
          });

          if (catalogService.isConfigured) {
            const products = await catalogService.getProductsByBrand(storeName);
            if (products.length > 0) {
              const catMap = new Map<string, string[]>();
              for (const p of products) {
                const cat = p.category || 'Menu Utama';
                if (!catMap.has(cat)) catMap.set(cat, []);
                catMap.get(cat)!.push(p.retailer_id);
              }

              const sections: Array<{ title: string; productRetailerIds: string[] }> = [];
              for (const [title, ids] of catMap.entries()) {
                sections.push({
                  title: title.slice(0, 24),
                  productRetailerIds: ids.slice(0, 10)
                });
                if (sections.length >= 3) break;
              }
              if (sections.length === 0) {
                sections.push({
                  title: 'Menu Pilihan',
                  productRetailerIds: products.slice(0, 20).map((p) => p.retailer_id)
                });
              }

              const storeStatus = targetStore ? storeService.isStoreOpenNow(targetStore.storeId) : undefined;
              let bodyText = '🛍️ Silakan pilih menu yang ingin dipesan:';
              if (storeStatus && !storeStatus.isOpen) {
                if (targetStore?.allowPreOrder) {
                  bodyText = `🛍️ Silakan pilih menu yang ingin dipesan (${storeStatus.statusText} • Menerima Pre-order):`;
                } else {
                  bodyText = `🛍️ Silakan pilih menu (${storeStatus.statusText} • Buka kembali jam ${targetStore?.operatingHours.open || '09:00'} WIB):`;
                }
              }

              const mpmPayload = catalogService.buildMultiProductPayload(
                from,
                sections,
                storeName,
                bodyText,
                'SERA Mart'
              );

              if (phoneNumberId && accessToken) {
                const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(mpmPayload)
                });
                if (res.ok) {
                  cardSent = true;
                  console.log(`[WhatsApp Fast-Path] Instantly dispatched MPM menu for "${storeName}" to +${from} (<150ms)`);
                } else {
                  const errTxt = await res.text();
                  console.warn(`[WhatsApp Fast-Path] MPM dispatch rejected (${res.status}): ${errTxt}`);
                }
              }

              // Keep agent chat history synchronized safely so conversational memory reflects the menu delivery
              try {
                if (instance && (instance as any).chatHistoryStore) {
                  const ch = (instance as any).chatHistoryStore;
                  if (typeof ch.appendPlatformTurn === 'function') {
                    ch.appendPlatformTurn('whatsapp', from, 'user', `[Memilih Toko: ${storeName}]`);
                    ch.appendPlatformTurn('whatsapp', from, 'assistant', `Daftar menu untuk "${storeName}" telah disiapkan dan dikirimkan ke WhatsApp pembeli.`);
                  }
                  if (typeof ch.append === 'function') {
                    ch.append({ id: `msg-${Date.now()}-user`, role: 'user', content: `[Memilih Toko: ${storeName}]`, timestamp: Date.now() });
                    ch.append({ id: `msg-${Date.now()}-assistant`, role: 'assistant', content: `Daftar menu untuk "${storeName}" telah disiapkan dan dikirimkan ke WhatsApp pembeli.`, timestamp: Date.now() });
                  }
                }
              } catch (histErr: any) {
                console.warn('[WhatsApp Fast-Path] Failed to sync history:', histErr.message);
              }

              return;
            } else {
              console.warn(`[WhatsApp Fast-Path] No products found in catalog for "${storeName}".`);
              if (phoneNumberId && accessToken) {
                await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: from,
                    type: 'text',
                    text: { body: `Mohon maaf, katalog menu untuk *${storeName}* sedang disiapkan. Silakan pilih warung/toko lain ya! 🙏` }
                  })
                }).catch(() => {});
              }
              return;
            }
          }
        } catch (fastPathErr: any) {
          console.warn('[WhatsApp Fast-Path] Fast-path catalog dispatch failed:', fastPathErr.message);
          if (!cardSent && phoneNumberId && accessToken) {
            await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: from,
                type: 'text',
                text: { body: `Mohon maaf, sistem sedang menyiapkan katalog menu. Silakan coba kembali sesaat lagi ya! 🙏` }
              })
            }).catch(() => {});
          }
          return;
        }

        // Guaranteed terminal return: Store selection MUST NEVER fall through to LLM conversational pipeline!
        return;
      }

      let imagesList: string[] | undefined;
      let cdnUrls: string[] = [];
      let documentsList: any[] | undefined;

      // Media Ingestion: Delegate image, document, and audio processing
      if (incomingMsg.type === 'image') {
        const res = await mediaProcessor.processImage(incomingMsg.image?.id, textContent, whatsAppManager, sessionId);
        imagesList = res.imagesList;
        if (res.publicUrl) {
          cdnUrls.push(res.publicUrl);
        }
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

      if (!textContent.trim() && !imagesList?.length && !documentsList?.length && incomingMsg.type !== 'location') return;

      // Ingress Debouncer: Buffer message into pending batch for this sender
      const item: PendingBatchItem = {
        textContent,
        imagesList: imagesList || [],
        cdnUrls,
        documentsList: documentsList || [],
        isVoiceMessage,
        location: incomingMsg.type === 'location' ? {
          latitude: incomingMsg.location?.latitude,
          longitude: incomingMsg.location?.longitude,
          name: incomingMsg.location?.name || incomingMsg.location?.address
        } : undefined
      };

      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
      const existingBatch = pendingBatches.get(from);

      if (existingBatch) {
        clearTimeout(existingBatch.timer);
        existingBatch.items.push(item);
        if (isTestEnv) {
          dispatchBatch(from);
        } else {
          existingBatch.timer = setTimeout(() => dispatchBatch(from), DEBOUNCE_MS);
        }
      } else if (incomingMsg.type === 'image' && !isTestEnv) {
        // Merchant sending photo: start debounce window for consecutive photos
        const timer = setTimeout(() => dispatchBatch(from), DEBOUNCE_MS);
        pendingBatches.set(from, {
          timer,
          items: [item],
          sessionId,
          from,
          contactName
        });
      } else {
        // Text, audio, document, location, order, or test environment: dispatch immediately
        pendingBatches.set(from, {
          timer: setTimeout(() => {}, 0),
          items: [item],
          sessionId,
          from,
          contactName
        });
        dispatchBatch(from);
      }
    } catch (err: any) {
      console.error('[WhatsApp Webhook] Error processing incoming webhook:', err);
    }
  };

  router.post('/', handleIncoming);
  router.post('/webhook', handleIncoming);
  router.post('/api/webhook/whatsapp', handleIncoming);

  return router;
}
