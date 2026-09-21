import { Router, Request, Response } from 'express';
import { DanaPaymentService } from '../../capabilities/fintech/dana/DanaPaymentService';
import { StoreProfileService } from '../../capabilities/communication/services/StoreProfileService';

export interface DanaRouterDependencies {
  agentManager?: any;
  secretManager?: any;
  io?: any;
  subscriptionService?: any;
  danaPaymentService?: DanaPaymentService;
  storeService?: StoreProfileService;
}

/**
 * Express router handling DANA Sandbox & Production Endpoints:
 * 1. POST /api/dana/notify           - Finish Payment Webhook (Pay-in confirmation)
 * 2. POST /api/dana/disburse-notify  - Disburse to Bank / Account Webhook (Payout confirmation)
 * 3. GET  /api/dana/callback         - Finish Redirect URL (Account Binding & Checkout browser return)
 * 4. GET  /api/dana/health           - Endpoint accessibility verification
 * 5. POST /api/dana/settle-order     - Agentic & Automated Merchant Order Settlement
 */
export function createDanaRouter(deps: DanaRouterDependencies = {}): Router {
  const router = Router();
  const danaPaymentService = deps.danaPaymentService || new DanaPaymentService();
  const storeService = deps.storeService || StoreProfileService.getInstance();

  // Middleware to log incoming DANA traffic
  router.use((req, _res, next) => {
    if (req.path.startsWith('/notify') || req.path.startsWith('/disburse-notify') || req.path.startsWith('/callback')) {
      console.log(`[DANA Webhook] Incoming ${req.method} ${req.originalUrl || req.path}`);
    }
    next();
  });

  // ── 1. Finish Payment Notification (Pay-in Webhook) ───────────────────────────
  const handlePaymentNotify = async (req: Request, res: Response) => {
    try {
      const payload = req.body || {};
      console.log('[DANA Payment Notify] Received payload:', JSON.stringify(payload, null, 2));

      // Extract transaction identifiers across DANA V2 & SNAP BI formats
      const orderId = payload.merchantTransId ||
                      payload.partnerReferenceNo ||
                      payload.originalPartnerReferenceNo ||
                      payload.orderId;

      const acquirementId = payload.acquirementId ||
                            payload.referenceNo ||
                            payload.originalReferenceNo;

      const resultStatus = payload.resultInfo?.resultStatus ||
                           payload.latestTransactionStatus ||
                           (payload.responseCode === '2005400' ? 'S' : undefined);

      const isSuccess = resultStatus === 'S' ||
                        resultStatus === '00' ||
                        resultStatus === 'SUCCESS' ||
                        payload.responseCode === '2005400';

      const amount = Number(
        payload.amount?.value ||
        payload.orderAmount?.value ||
        payload.amount ||
        0
      );

      console.log(`[DANA Payment Notify] Order: ${orderId}, AcqId: ${acquirementId}, Success: ${isSuccess}, Amount: ${amount}`);

      if (isSuccess && orderId && deps.subscriptionService) {
        // If the order belongs to a user session for token top-up
        try {
          // Check if orderId encodes session (e.g. "topup_sessionId_timestamp")
          const parts = String(orderId).split('_');
          if (parts[0] === 'topup' && parts[1]) {
            const sessionId = parts[1];
            // Convert IDR to token credits (approx: Rp 15,000 = $1 USDC = 200,000 tokens)
            // Base rate: 1 IDR ≈ 13.33 tokens
            const tokensGranted = Math.round(amount * 13.33);
            if (tokensGranted > 0 && typeof deps.subscriptionService.addCreditsDirectly === 'function') {
              deps.subscriptionService.addCreditsDirectly(sessionId, tokensGranted);
              console.log(`[DANA Payment Notify] Successfully credited ${tokensGranted} tokens to session: ${sessionId}`);
            }

            if (deps.io) {
              deps.io.to(`user:${sessionId}`).emit('billing:updated', {
                amountIdr: amount,
                tokensGranted,
                provider: 'DANA'
              });
            }
          }
        } catch (creditErr: any) {
          console.warn('[DANA Payment Notify] Error updating credits:', creditErr.message);
        }
      }

      // Check if order belongs to a multi-merchant store order
      if (isSuccess && orderId && amount > 0) {
        try {
          let targetStoreId = payload.additionalInfo?.storeId || payload.storeId;
          if (!targetStoreId) {
            const parts = String(orderId).split('_');
            if (parts[0] === 'order' && parts[1]) {
              targetStoreId = parts[1];
            } else {
              // Try matching any registered storeId from orderId
              const allStores = storeService.listStores();
              for (const s of allStores) {
                if (String(orderId).toLowerCase().includes(s.storeId.toLowerCase())) {
                  targetStoreId = s.storeId;
                  break;
                }
              }
            }
          }

          if (targetStoreId) {
            const store = storeService.getStore(targetStoreId);
            if (store) {
              console.log(`[DANA Payment Notify] Initiating automated settlement for store: "${store.storeName}" (${store.storeId}), amount: Rp ${amount}`);
              const settlementRes = await danaPaymentService.settleStoreOrder({
                store,
                grossAmount: amount,
                orderId: String(orderId)
              });

              console.log(`[DANA Payment Notify] Settlement result for "${store.storeName}":`, settlementRes);

              // Notify store owner via WhatsApp if phone is configured
              const ownerPhone = store.ownerWhatsApp?.replace(/[^0-9]/g, '');
              const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.TOKEN_KATALOG_META;
              const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

              if (ownerPhone && whatsappToken && phoneNumberId) {
                const destText = settlementRes.payoutMethod === 'DANA'
                  ? `Saldo DANA (+${settlementRes.destination})`
                  : `Rekening Bank (${settlementRes.destination})`;

                const alertMsg = settlementRes.success
                  ? `🎉 *PEMBAYARAN DITERIMA & DICAIRKAN!* (#${orderId})\n\n` +
                    `Toko: *${store.storeName}*\n` +
                    `Total Belanja: Rp ${amount.toLocaleString('id-ID')}\n` +
                    `Biaya Layanan SERA (${store.settlementInfo?.platformFeePercent ?? 2}%): Rp ${settlementRes.platformFee.toLocaleString('id-ID')}\n` +
                    `*Pencairan Bersih:* Rp ${settlementRes.netPayout.toLocaleString('id-ID')}\n` +
                    `Tujuan Pencairan: ${destText}\n` +
                    `No. Referensi: ${settlementRes.referenceNo || settlementRes.partnerReferenceNo}\n\n` +
                    `Dana telah dikirim langsung ke rekening/akun Anda. Terima kasih telah berjualan dengan SERA!`
                  : `⚠️ *PEMBAYARAN DITERIMA - PENCAIRAN TERTUNDA* (#${orderId})\n\n` +
                    `Toko: *${store.storeName}*\n` +
                    `Total Belanja: Rp ${amount.toLocaleString('id-ID')}\n` +
                    `Status Pencairan: Tertunda (${settlementRes.error || 'Perlu verifikasi rekening/DANA'})\n\n` +
                    `Silakan periksa nomor DANA atau rekening bank toko Anda di SERA.`;

                fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${whatsappToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: ownerPhone,
                    type: 'text',
                    text: { body: alertMsg }
                  })
                }).catch((e) => console.warn('[DANA Payment Notify] WhatsApp payout notification failed:', e.message));
              }

              if (deps.io) {
                deps.io.emit('store:settled', settlementRes);
              }
            }
          }
        } catch (storeSettleErr: any) {
          console.warn('[DANA Payment Notify] Error executing store settlement:', storeSettleErr.message);
        }
      }

      // Return dual-compatible JSON acknowledging notification to DANA Sandbox & Prod
      return res.status(200).json({
        responseCode: '2005400',
        responseMessage: 'Successful',
        response: {
          head: {
            version: '2.0',
            function: 'dana.acquiring.order.finishNotify',
            respTime: new Date().toISOString()
          },
          body: {
            resultInfo: {
              resultStatus: 'S',
              resultCode: 'SUCCESS',
              resultMsg: 'Success'
            }
          }
        }
      });
    } catch (err: any) {
      console.error('[DANA Payment Notify] Handler error:', err);
      // Still return 200 to prevent DANA notification flood during integration testing
      return res.status(200).json({
        responseCode: '2005400',
        responseMessage: 'Acknowledged with error'
      });
    }
  };

  router.post('/notify', handlePaymentNotify);
  router.get('/notify', handlePaymentNotify); // Allow GET verification probe from DANA tester

  // ── 2. Disburse to Bank Notification (Payout Webhook) ─────────────────────────
  const handleDisburseNotify = async (req: Request, res: Response) => {
    try {
      const payload = req.body || {};
      console.log('[DANA Disburse Notify] Received payload:', JSON.stringify(payload, null, 2));

      const partnerReferenceNo = payload.partnerReferenceNo ||
                                 payload.originalPartnerReferenceNo ||
                                 payload.merchantTransId;
      const referenceNo = payload.referenceNo || payload.originalReferenceNo;
      const resultStatus = payload.resultInfo?.resultStatus ||
                           (payload.responseCode === '2000000' ? 'S' : undefined);

      const isSuccess = resultStatus === 'S' || resultStatus === '00' || resultStatus === 'SUCCESS';

      if (partnerReferenceNo) {
        const settlementStore = danaPaymentService.getSettlementStore();
        const updated = settlementStore.updateSettlementStatus(
          partnerReferenceNo,
          isSuccess ? 'SUCCESS' : 'FAILED',
          { referenceNo, error: isSuccess ? undefined : (payload.resultInfo?.resultMsg || 'Disbursement rejected by bank') }
        );

        if (updated) {
          console.log(`[DANA Disburse Notify] Updated settlement status for order ${updated.orderId}: ${updated.status}`);
          if (deps.io) {
            deps.io.emit('store:settlement:updated', updated);
          }

          // If bank transfer now confirmed successful, notify merchant via WhatsApp
          if (isSuccess) {
            const store = storeService.getStore(updated.storeId);
            const ownerPhone = store?.ownerWhatsApp?.replace(/[^0-9]/g, '');
            const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.TOKEN_KATALOG_META;
            const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

            if (ownerPhone && whatsappToken && phoneNumberId) {
              const confirmMsg = `✅ *TRANSFER BANK BERHASIL DICAIRKAN!* (#${updated.orderId})\n\n` +
                `Toko: *${updated.storeName}*\n` +
                `Nominal Bersih: Rp ${updated.netPayout.toLocaleString('id-ID')}\n` +
                `Tujuan: Rekening Bank (${updated.destination})\n` +
                `No. Referensi Bank: ${referenceNo || updated.referenceNo || partnerReferenceNo}\n\n` +
                `Dana telah sukses masuk ke rekening bank Anda.`;

              fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${whatsappToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  recipient_type: 'individual',
                  to: ownerPhone,
                  type: 'text',
                  text: { body: confirmMsg }
                })
              }).catch((e) => console.warn('[DANA Disburse Notify] WhatsApp notification error:', e.message));
            }
          }
        }
      }

      return res.status(200).json({
        responseCode: '2000000',
        responseMessage: 'Successful',
        response: {
          head: {
            version: '2.0',
            function: 'dana.disbursement.transfer.notify',
            respTime: new Date().toISOString()
          },
          body: {
            resultInfo: {
              resultStatus: 'S',
              resultCode: 'SUCCESS',
              resultMsg: 'Success'
            }
          }
        }
      });
    } catch (err: any) {
      console.error('[DANA Disburse Notify] Handler error:', err);
      return res.status(200).json({
        responseCode: '2000000',
        responseMessage: 'Acknowledged'
      });
    }
  };

  router.post('/disburse-notify', handleDisburseNotify);
  router.get('/disburse-notify', handleDisburseNotify);

  // ── 3. Finish Redirect URL (Account Binding / Browser Return) ──────────────────
  router.get('/callback', (req: Request, res: Response) => {
    const { authCode, state, acquirementId, status } = req.query;
    console.log('[DANA Callback] Browser redirect received:', { authCode, state, acquirementId, status });

    // Render a high-end SERA-branded confirmation page for mobile & desktop
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SERA × DANA | Otorisasi Berhasil</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090B10;
      --card-bg: rgba(18, 22, 34, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --dana-blue: #118EEA;
      --sera-cyan: #00F0FF;
      --text-main: #FFFFFF;
      --text-muted: #8E9BAE;
      --success: #10B981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      overflow-x: hidden;
      position: relative;
    }
    .glow {
      position: absolute;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(17, 142, 234, 0.25) 0%, transparent 70%);
      filter: blur(80px);
      z-index: 0;
      top: 20%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    .card {
      position: relative;
      z-index: 1;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(24px);
      border-radius: 28px;
      padding: 40px 32px;
      max-width: 460px;
      width: 100%;
      text-align: center;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04);
      animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .icon-wrap {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      border-radius: 24px;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(17, 142, 234, 0.15) 100%);
      border: 1px solid rgba(16, 185, 129, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 38px;
    }
    h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 12px;
      background: linear-gradient(135deg, #FFFFFF 30%, #94A3B8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    p {
      color: var(--text-muted);
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(17, 142, 234, 0.12);
      border: 1px solid rgba(17, 142, 234, 0.3);
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      color: #60A5FA;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 20px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      background: linear-gradient(135deg, var(--dana-blue) 0%, #0070BA 100%);
      color: #FFFFFF;
      font-weight: 700;
      font-size: 16px;
      padding: 16px 24px;
      border-radius: 16px;
      text-decoration: none;
      transition: all 0.2s ease;
      box-shadow: 0 12px 28px rgba(17, 142, 234, 0.35);
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 16px 36px rgba(17, 142, 234, 0.5);
    }
    .footer-note {
      margin-top: 24px;
      font-size: 12px;
      color: #64748B;
    }
  </style>
</head>
<body>
  <div class="glow"></div>
  <div class="card">
    <div class="badge">SERA Autonomous AI × DANA</div>
    <div class="icon-wrap">✨</div>
    <h1>Otorisasi DANA Sukses</h1>
    <p>Akun DANA Anda telah berhasil diverifikasi dan terhubung ke SERA. Anda kini dapat melakukan transaksi otonom dan top-up token secara instan.</p>
    <a class="btn" href="https://wa.me" id="btn-return">
      Kembali ke WhatsApp
    </a>
    <div class="footer-note">
      ID Transaksi: <code>${acquirementId || authCode || 'DANA-SANDBOX-AUTH'}</code>
    </div>
  </div>
  <script>
    // Auto-detect return URL if available
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('return_url');
    if (returnUrl) {
      document.getElementById('btn-return').href = returnUrl;
    }
  </script>
</body>
</html>`;

    return res.status(200).send(html);
  });

  // ── 4. Diagnostic Health Endpoint ─────────────────────────────────────────────
  router.get('/health', (_req: Request, res: Response) => {
    return res.status(200).json({
      status: 'ok',
      service: 'sera-dana-connector',
      timestamp: Date.now(),
      endpoints: [
        '/api/dana/notify',
        '/api/dana/disburse-notify',
        '/api/dana/callback',
        '/api/dana/settle-order',
        '/api/dana/account-inquiry',
        '/api/dana/topup-status'
      ]
    });
  });

  // ── 5. Agentic & Automated Order Settlement Endpoint ──────────────────────────
  router.post('/settle-order', async (req: Request, res: Response) => {
    try {
      const { storeId, orderId, amount, customFeePercent, note } = req.body || {};
      if (!storeId || !orderId || amount === undefined) {
        return res.status(400).json({
          error: 'Missing required parameters: storeId, orderId, and amount are required.'
        });
      }

      const store = storeService.getStore(storeId);
      if (!store) {
        return res.status(404).json({ error: `Store with ID "${storeId}" not found.` });
      }

      const result = await danaPaymentService.settleStoreOrder({
        store,
        grossAmount: Number(amount),
        orderId: String(orderId),
        customFeePercent: customFeePercent !== undefined ? Number(customFeePercent) : undefined,
        note
      });

      return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      console.error('[DANA Settle Order] API error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── 6. Account Inquiry Endpoint ───────────────────────────────────────────────
  router.post('/account-inquiry', async (req: Request, res: Response) => {
    try {
      const { customerNumber, amount, partnerReferenceNo } = req.body || {};
      if (!customerNumber) {
        return res.status(400).json({ error: 'customerNumber is required' });
      }

      const result = await danaPaymentService.accountInquiry({
        customerNumber: String(customerNumber),
        amount: amount !== undefined ? Number(amount) : undefined,
        partnerReferenceNo: partnerReferenceNo ? String(partnerReferenceNo) : undefined
      });

      return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      console.error('[DANA Account Inquiry] API error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── 7. Top-Up Status Inquiry Endpoint ─────────────────────────────────────────
  router.post('/topup-status', async (req: Request, res: Response) => {
    try {
      const { originalPartnerReferenceNo, originalReferenceNo, serviceCode } = req.body || {};
      if (!originalPartnerReferenceNo) {
        return res.status(400).json({ error: 'originalPartnerReferenceNo is required' });
      }

      const result = await danaPaymentService.topupStatus({
        originalPartnerReferenceNo: String(originalPartnerReferenceNo),
        originalReferenceNo: originalReferenceNo ? String(originalReferenceNo) : undefined,
        serviceCode: serviceCode ? String(serviceCode) : undefined
      });

      return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      console.error('[DANA Topup Status] API error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── 8. Bank Account Inquiry Endpoint ─────────────────────────────────────────
  router.post('/bank-account-inquiry', async (req: Request, res: Response) => {
    try {
      const { beneficiaryAccountNumber, beneficiaryBankCode, amount, currency, partnerReferenceNo } = req.body || {};
      if (!beneficiaryAccountNumber || !beneficiaryBankCode) {
        return res.status(400).json({ error: 'beneficiaryAccountNumber and beneficiaryBankCode are required' });
      }

      const result = await danaPaymentService.bankAccountInquiry({
        beneficiaryAccountNumber: String(beneficiaryAccountNumber),
        beneficiaryBankCode: String(beneficiaryBankCode),
        amount: amount !== undefined ? Number(amount) : undefined,
        currency: currency ? String(currency) : undefined,
        partnerReferenceNo: partnerReferenceNo ? String(partnerReferenceNo) : undefined
      });

      return res.status(result.success ? 200 : 400).json(result);
    } catch (err: any) {
      console.error('[DANA Bank Account Inquiry] API error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}
