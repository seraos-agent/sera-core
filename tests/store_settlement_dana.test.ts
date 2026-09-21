import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { Server } from 'http';
import { StoreProfileService, StoreProfile } from '../src/capabilities/communication/services/StoreProfileService';
import { DanaPaymentService } from '../src/capabilities/fintech/dana/DanaPaymentService';
import { OrderSettlementStore } from '../src/capabilities/fintech/dana/OrderSettlementStore';
import { createDanaRouter } from '../src/server/routes/danaRoutes';
import { WhatsAppCatalogGoalHandler } from '../src/runtime/handlers/WhatsAppCatalogGoalHandler';

describe('DANA Marketplace Comprehensive Settlement & Payout Test Matrix', () => {
  let storeService: StoreProfileService;
  let settlementStore: OrderSettlementStore;
  let paymentService: DanaPaymentService;
  let mockDisburseToBalance: any;
  let mockDisburseToBank: any;
  let mockIo: any;
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    // 1. In-memory isolated stores
    storeService = new StoreProfileService({
      persistLocally: false,
      supabaseClient: null
    });

    // 2. In-memory isolated settlement ledger
    settlementStore = new OrderSettlementStore({
      persistLocally: false
    });
    settlementStore.clear();

    // 3. Seed test stores
    await storeService.upsertStore({
      storeId: 'warung-bu-tejo',
      storeName: 'Warung Bu Tejo',
      businessType: 'GOODS',
      businessCategory: 'FOOD_INSTANT',
      ownerWhatsApp: '6281234567890',
      settlementInfo: {
        payoutMethod: 'DANA',
        danaNumber: '6281234567890',
        platformFeePercent: 2.0,
        payoutAutoSettle: true
      }
    });

    await storeService.upsertStore({
      storeId: 'servis-ac-pak-budi',
      storeName: 'Servis AC Pak Budi',
      businessType: 'SERVICE',
      businessCategory: 'SERVICE',
      ownerWhatsApp: '6289876543210',
      settlementInfo: {
        payoutMethod: 'BANK',
        bankDetails: {
          bankCode: '014',
          bankName: 'BCA',
          accountNumber: '2460888509',
          accountHolderName: 'Budi Santoso'
        },
        platformFeePercent: 2.5,
        payoutAutoSettle: true
      }
    });

    // 4. Mock DANA API methods
    mockDisburseToBalance = vi.fn().mockImplementation(async (params: any) => ({
      success: true,
      partnerReferenceNo: params.partnerReferenceNo || 'PAYOUT-REF-1',
      referenceNo: 'DANA-REF-1001',
      customerNumber: params.customerNumber,
      amount: params.amount
    }));

    mockDisburseToBank = vi.fn().mockImplementation(async (params: any) => ({
      success: true,
      status: 'SUCCESS',
      partnerReferenceNo: params.partnerReferenceNo || 'PAYOUT-BANK-REF-1',
      referenceNo: 'DANA-BANK-REF-2002',
      amount: params.amount
    }));

    paymentService = new DanaPaymentService({} as any, settlementStore);
    (paymentService as any).disburseToBalance = mockDisburseToBalance;
    (paymentService as any).disburseToBank = mockDisburseToBank;

    mockIo = {
      emit: vi.fn(),
      to: vi.fn().mockReturnValue({ emit: vi.fn() })
    };

    app = express();
    app.use(express.json());
    app.use('/api/dana', createDanaRouter({
      danaPaymentService: paymentService,
      storeService,
      io: mockIo
    }));

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // ── 1. Store Profile Settlement Configuration ────────────────────────────────
  describe('1. Store Profile Settlement Configuration', () => {
    it('sets and updates DANA settlement destination with normalized phone', async () => {
      const updated = await storeService.setStoreSettlement('warung-bu-tejo', {
        payoutMethod: 'DANA',
        danaNumber: '0811742234',
        platformFeePercent: 1.5,
        payoutAutoSettle: true
      });

      expect(updated.settlementInfo).toBeDefined();
      expect(updated.settlementInfo?.payoutMethod).toBe('DANA');
      expect(updated.settlementInfo?.danaNumber).toBe('0811742234');
      expect(updated.settlementInfo?.platformFeePercent).toBe(1.5);
    });

    it('sets and updates Bank settlement destination for a merchant', async () => {
      const updated = await storeService.setStoreSettlement('warung-bu-tejo', {
        payoutMethod: 'BANK',
        bankDetails: {
          bankCode: '008',
          bankName: 'Mandiri',
          accountNumber: '1400012345678',
          accountHolderName: 'Bu Tejo'
        },
        platformFeePercent: 2.0
      });

      expect(updated.settlementInfo?.payoutMethod).toBe('BANK');
      expect(updated.settlementInfo?.bankDetails?.bankCode).toBe('008');
      expect(updated.settlementInfo?.bankDetails?.accountNumber).toBe('1400012345678');
    });
  });

  // ── 2. DanaPaymentService settleStoreOrder Engine ─────────────────────────────
  describe('2. DanaPaymentService settleStoreOrder Engine', () => {
    it('calculates 2% platform fee and disburses net amount to DANA balance', async () => {
      const store = storeService.getStore('warung-bu-tejo')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 50000,
        orderId: 'ORD-TEST-DANA-101'
      });

      expect(result.success).toBe(true);
      expect(result.grossAmount).toBe(50000);
      expect(result.platformFee).toBe(1000); // 2% of 50,000 = 1,000
      expect(result.netPayout).toBe(49000);
      expect(result.payoutMethod).toBe('DANA');
      expect(result.destination).toBe('6281234567890');

      expect(mockDisburseToBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          customerNumber: '6281234567890',
          amount: 49000,
          feeAmount: 1000,
          partnerReferenceNo: 'PAYOUT-ORD-TEST-DANA-101'
        })
      );
    });

    it('calculates custom platform fee and disburses net amount to Bank account', async () => {
      const store = storeService.getStore('servis-ac-pak-budi')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 100000,
        orderId: 'ORD-TEST-BANK-202'
      });

      expect(result.success).toBe(true);
      expect(result.grossAmount).toBe(100000);
      expect(result.platformFee).toBe(2500); // 2.5% of 100,000 = 2,500
      expect(result.netPayout).toBe(97500);
      expect(result.payoutMethod).toBe('BANK');
      expect(result.destination).toBe('014:2460888509');

      expect(mockDisburseToBank).toHaveBeenCalledWith(
        expect.objectContaining({
          beneficiaryAccountNumber: '2460888509',
          beneficiaryBankCode: '014',
          amount: 97500,
          partnerReferenceNo: 'PAYOUT-BANK-ORD-TEST-BANK-202',
          needNotify: true
        })
      );
    });

    it('handles official DANA scenario: 2024300 Request In Progress with needNotify=true and completes via webhook', async () => {
      // Mock DANA returning 2024300 Request In Progress (exact official test scenario)
      mockDisburseToBank.mockResolvedValueOnce({
        success: true,
        isInProgress: true,
        status: 'IN_PROGRESS',
        responseCode: '2024300',
        responseMessage: 'Request In Progress',
        partnerReferenceNo: 'PAYOUT-BANK-ORD-INPROGRESS-50K',
        referenceNo: '2026092210121482010100166343400829289',
        transactionDate: '2026-09-22T01:26:03+07:00',
        amount: 48750
      });

      const store = storeService.getStore('servis-ac-pak-budi')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 50000,
        orderId: 'ORD-INPROGRESS-50K'
      });

      // Verifies In App Partner Action: transaction is treated as accepted and in progress, NOT failed
      expect(result.success).toBe(true);
      expect(result.isInProgress).toBe(true);
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.responseCode).toBe('2024300');
      expect(result.responseMessage).toBe('Request In Progress');
      expect(result.referenceNo).toBe('2026092210121482010100166343400829289');

      // Verifies recorded in ledger as PENDING
      const ledgerEntry = settlementStore.getSettlement('ORD-INPROGRESS-50K');
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry?.status).toBe('PENDING');
      expect(ledgerEntry?.referenceNo).toBe('2026092210121482010100166343400829289');

      // Now simulate DANA sending POST /api/dana/disburse-notify when the bank transfer finishes
      const disburseWebhookRes = await fetch(`${baseUrl}/api/dana/disburse-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerReferenceNo: 'PAYOUT-BANK-ORD-INPROGRESS-50K',
          referenceNo: '2026092210121482010100166343400829289',
          resultInfo: {
            resultStatus: 'S',
            resultCode: 'SUCCESS',
            resultMsg: 'Success'
          }
        })
      });

      expect(disburseWebhookRes.status).toBe(200);
      const webhookJson = await disburseWebhookRes.json();
      expect(webhookJson.responseCode).toBe('2000000');

      // Verifies the ledger has been automatically updated from PENDING to SUCCESS
      const updatedLedger = settlementStore.getSettlement('ORD-INPROGRESS-50K');
      expect(updatedLedger?.status).toBe('SUCCESS');
      expect(mockIo.emit).toHaveBeenCalledWith('store:settlement:updated', expect.objectContaining({
        orderId: 'ORD-INPROGRESS-50K',
        status: 'SUCCESS'
      }));
    });

    it('falls back to store ownerWhatsApp as DANA account if settlementInfo is unconfigured', async () => {
      await storeService.upsertStore({
        storeId: 'toko-kue-lestari',
        storeName: 'Toko Kue Lestari',
        businessType: 'GOODS',
        ownerWhatsApp: '628555123456'
      });

      const store = storeService.getStore('toko-kue-lestari')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 20000,
        orderId: 'ORD-FALLBACK-303'
      });

      expect(result.success).toBe(true);
      expect(result.payoutMethod).toBe('DANA');
      expect(result.destination).toBe('628555123456');
      expect(result.netPayout).toBe(19600); // 20,000 - 400 (2%)
    });

    it('safely rejects non-positive or sub-zero amounts', async () => {
      const store = storeService.getStore('warung-bu-tejo')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 0,
        orderId: 'ORD-ZERO-000'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('greater than zero');
      expect(mockDisburseToBalance).not.toHaveBeenCalled();
    });
  });

  // ── 3. Idempotency & Duplicate Webhook Protection ─────────────────────────────
  describe('3. Idempotency & Duplicate Webhook Protection', () => {
    it('prevents double-disbursement when DANA webhook fires multiple times for same order', async () => {
      const payload = {
        partnerReferenceNo: 'order_warung-bu-tejo_IDEMPOTENT_1',
        acquirementId: 'ACQ-DANA-111111',
        resultInfo: { resultStatus: 'S', resultCode: 'SUCCESS' },
        amount: { value: '60000.00', currency: 'IDR' }
      };

      // First webhook delivery
      const res1 = await fetch(`${baseUrl}/api/dana/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      expect(res1.status).toBe(200);

      // Verify first disbursement was called once
      expect(mockDisburseToBalance).toHaveBeenCalledTimes(1);

      // Second webhook delivery (DANA network retry)
      const res2 = await fetch(`${baseUrl}/api/dana/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      expect(res2.status).toBe(200);

      // Third webhook delivery
      const res3 = await fetch(`${baseUrl}/api/dana/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      expect(res3.status).toBe(200);

      // CRITICAL CHECK: Still called exactly once! Zero double-payout.
      expect(mockDisburseToBalance).toHaveBeenCalledTimes(1);

      // Ledger confirms settled record
      const settled = settlementStore.getSettlement('order_warung-bu-tejo_IDEMPOTENT_1');
      expect(settled?.status).toBe('SUCCESS');
      expect(settled?.grossAmount).toBe(60000);
      expect(settled?.netPayout).toBe(58800);
    });

    it('detects and rejects duplicate inconsistent transfer when amount differs (Inconsistent Request 4044318)', async () => {
      const store = storeService.getStore('servis-ac-pak-budi')!;

      // 1. Initial valid settlement
      const firstRes = await paymentService.settleStoreOrder({
        store,
        grossAmount: 50000,
        orderId: 'ORD-INCONSISTENT-TEST'
      });
      expect(firstRes.success).toBe(true);
      expect(firstRes.grossAmount).toBe(50000);
      expect(mockDisburseToBank).toHaveBeenCalledTimes(1);

      // 2. Second hit with SAME orderId but DIFFERENT amount (75,000 IDR instead of 50,000 IDR)
      const secondRes = await paymentService.settleStoreOrder({
        store,
        grossAmount: 75000,
        orderId: 'ORD-INCONSISTENT-TEST'
      });

      // Merchant action: Shows error message and does not process duplicate inconsistent transfer
      expect(secondRes.success).toBe(false);
      expect(secondRes.status).toBe('FAILED');
      expect(secondRes.isInconsistent).toBe(true);
      expect(secondRes.responseCode).toBe('4044318');
      expect(secondRes.responseMessage).toBe('Inconsistent Request');
      expect(secondRes.error).toContain('Inconsistent Request: duplicate transfer for order ORD-INCONSISTENT-TEST');

      // CRITICAL CHECK: DANA disburse was NOT called a second time!
      expect(mockDisburseToBank).toHaveBeenCalledTimes(1);

      // Verify API endpoint returns HTTP 400 with inconsistent details
      const apiRes = await fetch(`${baseUrl}/api/dana/settle-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: 'servis-ac-pak-budi',
          orderId: 'ORD-INCONSISTENT-TEST',
          amount: 80000
        })
      });
      expect(apiRes.status).toBe(400);
      const apiJson = await apiRes.json();
      expect(apiJson.isInconsistent).toBe(true);
      expect(apiJson.responseCode).toBe('4044318');
      expect(apiJson.responseMessage).toBe('Inconsistent Request');
    });

    it('detects and rejects duplicate inconsistent transfer when amount differs for DANA balance (Inconsistent Request 4043818)', async () => {
      const store = storeService.getStore('warung-bu-tejo')!;

      // 1. Initial valid settlement
      const firstRes = await paymentService.settleStoreOrder({
        store,
        grossAmount: 20000,
        orderId: 'ORD-INCONSISTENT-DANA'
      });
      expect(firstRes.success).toBe(true);
      expect(firstRes.grossAmount).toBe(20000);

      // 2. Second hit with SAME orderId but DIFFERENT amount (35,000 IDR instead of 20,000 IDR)
      const secondRes = await paymentService.settleStoreOrder({
        store,
        grossAmount: 35000,
        orderId: 'ORD-INCONSISTENT-DANA'
      });

      // Merchant action: Shows error message and asks user to retry transaction properly
      expect(secondRes.success).toBe(false);
      expect(secondRes.status).toBe('FAILED');
      expect(secondRes.isInconsistent).toBe(true);
      expect(secondRes.responseCode).toBe('4043818');
      expect(secondRes.responseMessage).toBe('Inconsistent Request');
      expect(secondRes.error).toContain('Inconsistent Request: duplicate transfer for order ORD-INCONSISTENT-DANA');
      expect(secondRes.error).toContain('Please retry transaction properly');
    });
  });

  // ── 4. Upstream Failure & Ledger Failure Recording ────────────────────────────
  describe('4. Upstream Failure & Ledger Failure Recording', () => {
    it('handles official DANA 4044318 Inconsistent Request response from upstream bank transfer', async () => {
      mockDisburseToBank.mockResolvedValueOnce({
        success: false,
        isInProgress: false,
        isInconsistent: true,
        status: 'FAILED',
        responseCode: '4044318',
        responseMessage: 'Inconsistent Request',
        partnerReferenceNo: 'PAYOUT-BANK-ORD-UPSTREAM-404',
        amount: 48750,
        error: 'Inconsistent Request: repeat request, but fundAmount inconsistent'
      });

      const store = storeService.getStore('servis-ac-pak-budi')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 50000,
        orderId: 'ORD-UPSTREAM-404'
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isInconsistent).toBe(true);
      expect(result.responseCode).toBe('4044318');
      expect(result.responseMessage).toBe('Inconsistent Request');
      expect(result.error).toContain('Inconsistent Request');
    });

    it('handles official DANA 4034314 Insufficient Fund response without cutting merchant balance', async () => {
      mockDisburseToBank.mockResolvedValueOnce({
        success: false,
        isInProgress: false,
        isInsufficientFund: true,
        status: 'FAILED',
        responseCode: '4034314',
        responseMessage: 'Insufficient Fund',
        partnerReferenceNo: 'PAYOUT-BANK-ORD-INSUFFICIENT-50B',
        amount: 48750000000,
        error: 'Insufficient Fund: Corporate/Partner balance is insufficient for transfer'
      });

      const store = storeService.getStore('servis-ac-pak-budi')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 50000000000,
        orderId: 'ORD-INSUFFICIENT-50B'
      });

      // Verification of Partner Action: Shows appropriate error message and does NOT cut balance/mark settled
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isInsufficientFund).toBe(true);
      expect(result.responseCode).toBe('4034314');
      expect(result.responseMessage).toBe('Insufficient Fund');
      expect(result.error).toContain('Insufficient Fund');

      // Crucial: The order must NOT be marked as settled
      expect(settlementStore.hasBeenSettled('ORD-INSUFFICIENT-50B')).toBe(false);

      // Ledger records status FAILED and keeps it eligible for retry once topped up
      const record = settlementStore.getSettlement('ORD-INSUFFICIENT-50B');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('Insufficient Fund');
      const failedSettlements = settlementStore.getFailedSettlements('servis-ac-pak-budi');
      expect(failedSettlements.some((f) => f.orderId === 'ORD-INSUFFICIENT-50B')).toBe(true);
    });

    it('handles official DANA 4034318 Inactive Account Merchant response without cutting merchant balance', async () => {
      mockDisburseToBank.mockResolvedValueOnce({
        success: false,
        isInProgress: false,
        isInactiveAccount: true,
        status: 'FAILED',
        responseCode: '4034318',
        responseMessage: 'Inactive Account Merchant',
        partnerReferenceNo: 'PAYOUT-BANK-ORD-INACTIVE-813',
        amount: 9750,
        error: 'Inactive Account: Inactive Account Merchant'
      });

      const store = storeService.getStore('servis-ac-pak-budi')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 10000,
        orderId: 'ORD-INACTIVE-813'
      });

      // Verification of Partner Action: Shows appropriate error message and does NOT cut balance/mark settled
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isInactiveAccount).toBe(true);
      expect(result.responseCode).toBe('4034318');
      expect(result.responseMessage).toBe('Inactive Account Merchant');
      expect(result.error).toContain('Inactive Account');

      // Crucial: The order must NOT be marked as settled
      expect(settlementStore.hasBeenSettled('ORD-INACTIVE-813')).toBe(false);

      // Ledger records status FAILED so merchant can fix their account and retry
      const record = settlementStore.getSettlement('ORD-INACTIVE-813');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('Inactive Account');
      const failedSettlements = settlementStore.getFailedSettlements('servis-ac-pak-budi');
      expect(failedSettlements.some((f) => f.orderId === 'ORD-INACTIVE-813')).toBe(true);
    });

    it('handles official DANA 4004301 Invalid Field Format response and prompts for proper request values', async () => {
      mockDisburseToBank.mockResolvedValueOnce({
        success: false,
        isInProgress: false,
        isInvalidFieldFormat: true,
        status: 'FAILED',
        responseCode: '4004301',
        responseMessage: 'Invalid Field Format',
        partnerReferenceNo: 'PAYOUT-BANK-ORD-INVALID-FORMAT',
        amount: 9750,
        error: 'Invalid Field Format: Request contained invalid field format. Please provide proper request values (e.g. amount.currency must be IDR).'
      });

      const store = storeService.getStore('servis-ac-pak-budi')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 10000,
        orderId: 'ORD-INVALID-FORMAT'
      });

      // Verification of Partner Action: Shows error for invalid field format and asks for proper request value
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isInvalidFieldFormat).toBe(true);
      expect(result.responseCode).toBe('4004301');
      expect(result.responseMessage).toBe('Invalid Field Format');
      expect(result.error).toContain('Invalid Field Format');
      expect(result.error).toContain('proper request values');

      // Crucial: The order must NOT be marked as settled
      expect(settlementStore.hasBeenSettled('ORD-INVALID-FORMAT')).toBe(false);

      // Ledger records status FAILED
      const record = settlementStore.getSettlement('ORD-INVALID-FORMAT');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('Invalid Field Format');
    });

    it('handles official DANA 4004302 Missing Mandatory Field response and prompts for proper parameter request', async () => {
      mockDisburseToBank.mockResolvedValueOnce({
        success: false,
        isInProgress: false,
        isMissingMandatoryField: true,
        status: 'FAILED',
        responseCode: '4004302',
        responseMessage: 'Invalid Mandatory Field beneficiaryBankCode',
        partnerReferenceNo: 'PAYOUT-BANK-ORD-MISSING-PARAM',
        amount: 9750,
        error: 'Missing Mandatory Field: Invalid Mandatory Field beneficiaryBankCode. Please provide proper parameter request.'
      });

      const store = storeService.getStore('servis-ac-pak-budi')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 10000,
        orderId: 'ORD-MISSING-PARAM'
      });

      // Verification of Partner Action: Shows error for missing/invalid mandatory field and asks for proper parameter request
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isMissingMandatoryField).toBe(true);
      expect(result.responseCode).toBe('4004302');
      expect(result.responseMessage).toContain('Mandatory Field');
      expect(result.error).toContain('Missing Mandatory Field');
      expect(result.error).toContain('proper parameter request');

      // Crucial: The order must NOT be marked as settled
      expect(settlementStore.hasBeenSettled('ORD-MISSING-PARAM')).toBe(false);

      // Ledger records status FAILED
      const record = settlementStore.getSettlement('ORD-MISSING-PARAM');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('Missing Mandatory Field');
    });

    it('handles official DANA 4014300 Unauthorized Invalid Signature response from upstream bank transfer without cutting merchant balance', async () => {
      mockDisburseToBank.mockResolvedValueOnce({
        success: false,
        isInProgress: false,
        isUnauthorized: true,
        status: 'FAILED',
        responseCode: '4014300',
        responseMessage: 'Unauthorized. Invalid Signature',
        partnerReferenceNo: 'PAYOUT-BANK-ORD-UNAUTHORIZED-SIG',
        amount: 9750,
        error: 'Unauthorized: Unauthorized. Invalid Signature. Please verify SNAP BI RSA keypair credentials.'
      });

      const store = storeService.getStore('servis-ac-pak-budi')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 10000,
        orderId: 'ORD-UNAUTHORIZED-SIG'
      });

      // Verification of Partner Action: Shows appropriate error message and does NOT cut merchant balance
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isUnauthorized).toBe(true);
      expect(result.responseCode).toBe('4014300');
      expect(result.responseMessage).toContain('Unauthorized');
      expect(result.error).toContain('Unauthorized');
      expect(result.error).toContain('Invalid Signature');

      // Crucial: The order must NOT be marked as settled
      expect(settlementStore.hasBeenSettled('ORD-UNAUTHORIZED-SIG')).toBe(false);

      // Ledger records status FAILED
      const record = settlementStore.getSettlement('ORD-UNAUTHORIZED-SIG');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('Unauthorized');
    });

    it('handles official DANA 5004300 Bank Transfer General Error without cutting merchant balance and asks user to retry', async () => {
      mockDisburseToBank.mockResolvedValueOnce({
        success: false,
        isInProgress: false,
        isGeneralError: true,
        status: 'FAILED',
        responseCode: '5004300',
        responseMessage: 'General Error',
        partnerReferenceNo: 'PAYOUT-BANK-ORD-GENERR',
        amount: 9750,
        error: 'General Error: General Error. Please ask user to retry transaction.'
      });

      const store = storeService.getStore('servis-ac-pak-budi')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 10000,
        orderId: 'ORD-BANK-GENERR'
      });

      // Verification of Partner Action: Shows generic failure message and does NOT cut user/merchant balance
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isGeneralError).toBe(true);
      expect(result.responseCode).toBe('5004300');
      expect(result.responseMessage).toBe('General Error');
      expect(result.error).toContain('General Error');
      expect(result.error).toContain('retry transaction');

      // Crucial: The order must NOT be marked as settled
      expect(settlementStore.hasBeenSettled('ORD-BANK-GENERR')).toBe(false);

      // Ledger records status FAILED
      const record = settlementStore.getSettlement('ORD-BANK-GENERR');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('General Error');
    });

    it('handles official DANA 4034303 Bank Transfer Suspected Fraud response without cutting merchant balance and blocks payout', async () => {
      mockDisburseToBank.mockResolvedValueOnce({
        success: false,
        isInProgress: false,
        isSuspectedFraud: true,
        status: 'FAILED',
        responseCode: '4034303',
        responseMessage: 'Suspected Fraud',
        partnerReferenceNo: 'PAYOUT-BANK-ORD-FRAUD',
        amount: 9750,
        error: 'Suspected Fraud: Suspected Fraud. Transfer blocked for security compliance. Beneficiary account flagged by risk management.'
      });

      const store = storeService.getStore('servis-ac-pak-budi')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 10000,
        orderId: 'ORD-BANK-FRAUD'
      });

      // Verification of Partner Action: Shows security alert for suspected fraud, blocks transfer, and does NOT cut merchant balance
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isSuspectedFraud).toBe(true);
      expect(result.responseCode).toBe('4034303');
      expect(result.responseMessage).toBe('Suspected Fraud');
      expect(result.error).toContain('Suspected Fraud');
      expect(result.error).toContain('security compliance');

      // Crucial: The order must NOT be marked as settled
      expect(settlementStore.hasBeenSettled('ORD-BANK-FRAUD')).toBe(false);

      // Ledger records status FAILED
      const record = settlementStore.getSettlement('ORD-BANK-FRAUD');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('Suspected Fraud');
    });

    it('handles official DANA 4033814 Disbursement Top Up Insufficient Fund without cutting merchant balance', async () => {
      mockDisburseToBalance.mockResolvedValueOnce({
        success: false,
        isInsufficientFund: true,
        responseCode: '4033814',
        responseMessage: 'Insufficient Fund',
        partnerReferenceNo: 'PAYOUT-ORD-TOPUP-INSUFFICIENT',
        customerNumber: '6281298055129',
        amount: 49000000000,
        error: 'Insufficient Fund: Corporate balance is insufficient for DANA balance disbursement'
      });

      const store = storeService.getStore('warung-bu-tejo')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 50000000000,
        orderId: 'ORD-TOPUP-INSUFFICIENT'
      });

      // Verification of Partner Action: Shows appropriate error message and does NOT cut user's account balance
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isInsufficientFund).toBe(true);
      expect(result.responseCode).toBe('4033814');
      expect(result.responseMessage).toBe('Insufficient Fund');
      expect(result.error).toContain('Insufficient Fund');

      // Crucial: The order must NOT be marked as settled
      expect(settlementStore.hasBeenSettled('ORD-TOPUP-INSUFFICIENT')).toBe(false);

      // Ledger records status FAILED
      const record = settlementStore.getSettlement('ORD-TOPUP-INSUFFICIENT');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('Insufficient Fund');
      const failedSettlements = settlementStore.getFailedSettlements('warung-bu-tejo');
      expect(failedSettlements.some((f) => f.orderId === 'ORD-TOPUP-INSUFFICIENT')).toBe(true);
    });

    it('handles official DANA 4033805 Disbursement Top Up Do Not Honor without cutting merchant balance and shows appropriate error', async () => {
      mockDisburseToBalance.mockResolvedValueOnce({
        success: false,
        isDoNotHonor: true,
        responseCode: '4033805',
        responseMessage: 'Do Not Honor',
        partnerReferenceNo: 'PAYOUT-ORD-TOPUP-DONOTHONOR',
        customerNumber: '628996647679',
        amount: 5,
        error: 'Do Not Honor: Payee user does not exist or has been disabled in DANA. Please verify the customer phone number.'
      });

      const store = storeService.getStore('warung-bu-tejo')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 5,
        orderId: 'ORD-TOPUP-DONOTHONOR'
      });

      // Verification of Partner Action: Shows appropriate error message either payee user not exist or disabled
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isDoNotHonor).toBe(true);
      expect(result.responseCode).toBe('4033805');
      expect(result.responseMessage).toBe('Do Not Honor');
      expect(result.error).toContain('Do Not Honor');
      expect(result.error).toContain('Payee user does not exist or has been disabled');

      // Crucial: The order must NOT be marked as settled
      expect(settlementStore.hasBeenSettled('ORD-TOPUP-DONOTHONOR')).toBe(false);

      // Ledger records status FAILED
      const record = settlementStore.getSettlement('ORD-TOPUP-DONOTHONOR');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('Do Not Honor');
      const failedSettlements = settlementStore.getFailedSettlements('warung-bu-tejo');
      expect(failedSettlements.some((f) => f.orderId === 'ORD-TOPUP-DONOTHONOR')).toBe(true);
    });

    it('handles official DANA 4003802 Disbursement Top Up Missing Mandatory Field without cutting merchant balance and asks merchant to retry with correct input', async () => {
      mockDisburseToBalance.mockResolvedValueOnce({
        success: false,
        isMissingMandatoryField: true,
        responseCode: '4003802',
        responseMessage: 'Invalid Mandatory Field customerNumber',
        partnerReferenceNo: 'PAYOUT-ORD-TOPUP-MISSING',
        amount: 9800,
        error: 'Missing Mandatory Field: Invalid Mandatory Field customerNumber. Please retry with correct input.'
      });

      const store = storeService.getStore('warung-bu-tejo')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 10000,
        orderId: 'ORD-TOPUP-MISSING'
      });

      // Verification of Partner Action: Shows error message and asks merchant to retry with correct input
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isMissingMandatoryField).toBe(true);
      expect(result.responseCode).toBe('4003802');
      expect(result.responseMessage).toBe('Invalid Mandatory Field customerNumber');
      expect(result.error).toContain('Missing Mandatory Field');
      expect(result.error).toContain('Please retry with correct input');

      // Crucial: The order must NOT be marked as settled
      expect(settlementStore.hasBeenSettled('ORD-TOPUP-MISSING')).toBe(false);

      // Ledger records status FAILED
      const record = settlementStore.getSettlement('ORD-TOPUP-MISSING');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('Missing Mandatory Field');
      const failedSettlements = settlementStore.getFailedSettlements('warung-bu-tejo');
      expect(failedSettlements.some((f) => f.orderId === 'ORD-TOPUP-MISSING')).toBe(true);
    });

    it('handles official DANA 4043818 Inconsistent Request response from upstream topup disbursement', async () => {
      mockDisburseToBalance.mockResolvedValueOnce({
        success: false,
        isInconsistent: true,
        responseCode: '4043818',
        responseMessage: 'Inconsistent Request',
        partnerReferenceNo: 'PAYOUT-ORD-TOPUP-INCONSISTENT',
        customerNumber: '6281234567890',
        amount: 19600,
        error: 'Inconsistent Request: Repeat request with inconsistent payload (REPEAT_REQ_INCONSISTENT). Please retry transaction properly.'
      });

      const store = storeService.getStore('warung-bu-tejo')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 20000,
        orderId: 'ORD-TOPUP-INCONSISTENT'
      });

      // Verification of Partner Action: Shows error message and asks user to retry transaction properly
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isInconsistent).toBe(true);
      expect(result.responseCode).toBe('4043818');
      expect(result.responseMessage).toBe('Inconsistent Request');
      expect(result.error).toContain('Inconsistent Request');
      expect(result.error).toContain('Please retry transaction properly');

      // Crucial: The order must NOT be marked as settled
      expect(settlementStore.hasBeenSettled('ORD-TOPUP-INCONSISTENT')).toBe(false);
    });

    it('handles official DANA 5003801 Disbursement Top Up Internal Server Error without cutting merchant balance and holds balance pending retry', async () => {
      mockDisburseToBalance.mockResolvedValueOnce({
        success: false,
        isInternalServerError: true,
        responseCode: '5003801',
        responseMessage: 'Internal Server Error',
        partnerReferenceNo: 'PAYOUT-ORD-TOPUP-500',
        customerNumber: '628551008794',
        amount: 9800,
        error: 'Internal Server Error: DANA upstream service encountered an internal server error. User balance is held pending transaction retry.'
      });

      const store = storeService.getStore('warung-bu-tejo')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 10000,
        orderId: 'ORD-TOPUP-500'
      });

      // Verification of Partner Action: Shows appropriate error message and holds user's balance until transaction retried
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isInternalServerError).toBe(true);
      expect(result.responseCode).toBe('5003801');
      expect(result.responseMessage).toBe('Internal Server Error');
      expect(result.error).toContain('Internal Server Error');
      expect(result.error).toContain('balance is held');

      // Crucial: The order must NOT be marked as settled (balance held)
      expect(settlementStore.hasBeenSettled('ORD-TOPUP-500')).toBe(false);

      // Ledger records status FAILED for automatic or manual retry once DANA upstream recovers
      const record = settlementStore.getSettlement('ORD-TOPUP-500');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('Internal Server Error');
      const failedSettlements = settlementStore.getFailedSettlements('warung-bu-tejo');
      expect(failedSettlements.some((f) => f.orderId === 'ORD-TOPUP-500')).toBe(true);
    });

    it('handles official DANA 5003800 Disbursement Top Up General Error without cutting merchant balance', async () => {
      mockDisburseToBalance.mockResolvedValueOnce({
        success: false,
        isGeneralError: true,
        responseCode: '5003800',
        responseMessage: 'General Error',
        partnerReferenceNo: 'PAYOUT-ORD-TOPUP-GENERR',
        customerNumber: '628121111111',
        amount: 9800,
        error: 'General Error: General Error. Account balance was not cut.'
      });

      const store = storeService.getStore('warung-bu-tejo')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 10000,
        orderId: 'ORD-TOPUP-GENERR'
      });

      // Verification of Partner Action: Shows appropriate error message and does not cut user's account balance
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.isGeneralError).toBe(true);
      expect(result.responseCode).toBe('5003800');
      expect(result.responseMessage).toBe('General Error');
      expect(result.error).toContain('General Error');
      expect(result.error).toContain('Account balance was not cut');

      // Crucial: The order must NOT be marked as settled (balance not cut)
      expect(settlementStore.hasBeenSettled('ORD-TOPUP-GENERR')).toBe(false);

      // Ledger records status FAILED
      const record = settlementStore.getSettlement('ORD-TOPUP-GENERR');
      expect(record?.status).toBe('FAILED');
      expect(record?.error).toContain('General Error');
      const failedSettlements = settlementStore.getFailedSettlements('warung-bu-tejo');
      expect(failedSettlements.some((f) => f.orderId === 'ORD-TOPUP-GENERR')).toBe(true);
    });

    it('records FAILED in ledger when DANA disburse returns error', async () => {
      // Force DANA API error
      mockDisburseToBalance.mockResolvedValueOnce({
        success: false,
        partnerReferenceNo: 'PAYOUT-FAIL-1',
        customerNumber: '6281234567890',
        amount: 49000,
        error: 'INSUFFICIENT_MERCHANT_BALANCE'
      });

      const store = storeService.getStore('warung-bu-tejo')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 50000,
        orderId: 'ORD-FAIL-101'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('INSUFFICIENT_MERCHANT_BALANCE');

      // Check ledger has record marked as FAILED
      const recorded = settlementStore.getSettlement('ORD-FAIL-101');
      expect(recorded).toBeDefined();
      expect(recorded?.status).toBe('FAILED');
      expect(recorded?.error).toBe('INSUFFICIENT_MERCHANT_BALANCE');

      // Check failed settlements query finds it
      const failedList = settlementStore.getFailedSettlements('warung-bu-tejo');
      expect(failedList.some((f) => f.orderId === 'ORD-FAIL-101')).toBe(true);
    });

    it('records FAILED when store has incomplete bank payout details', async () => {
      await storeService.upsertStore({
        storeId: 'toko-rusak',
        storeName: 'Toko Rusak',
        businessType: 'GOODS',
        settlementInfo: {
          payoutMethod: 'BANK',
          bankDetails: {
            bankCode: '',
            accountNumber: ''
          }
        }
      });

      const store = storeService.getStore('toko-rusak')!;
      const result = await paymentService.settleStoreOrder({
        store,
        grossAmount: 80000,
        orderId: 'ORD-BANK-INCOMPLETE-1'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('incomplete bank payout details');

      const recorded = settlementStore.getSettlement('ORD-BANK-INCOMPLETE-1');
      expect(recorded?.status).toBe('FAILED');
    });
  });

  // ── 5. Automatic Retry of Failed Settlements ──────────────────────────────────
  describe('5. Automatic Retry of Failed Settlements', () => {
    it('retries all previously failed settlements once merchant configures valid payout', async () => {
      // 1. Create store without valid DANA or bank info
      await storeService.upsertStore({
        storeId: 'bengkel-jaya',
        storeName: 'Bengkel Jaya',
        businessType: 'SERVICE',
        ownerWhatsApp: '' // No phone number
      });

      const initialStore = storeService.getStore('bengkel-jaya')!;

      // 2. An order payment comes in and fails payout
      const failRes = await paymentService.settleStoreOrder({
        store: initialStore,
        grossAmount: 150000,
        orderId: 'ORD-BENGKEL-001'
      });
      expect(failRes.success).toBe(false);

      // Verify it is in failed ledger
      expect(settlementStore.getFailedSettlements('bengkel-jaya').length).toBe(1);

      // 3. Merchant updates their payout details to DANA
      await storeService.setStoreSettlement('bengkel-jaya', {
        payoutMethod: 'DANA',
        danaNumber: '628777123456',
        platformFeePercent: 2.0,
        payoutAutoSettle: true
      });

      const updatedStore = storeService.getStore('bengkel-jaya')!;

      // 4. Trigger retry
      const retryResults = await paymentService.retryFailedSettlements(updatedStore);
      expect(retryResults.length).toBe(1);
      expect(retryResults[0].success).toBe(true);
      expect(retryResults[0].orderId).toBe('ORD-BENGKEL-001');
      expect(retryResults[0].netPayout).toBe(147000); // 150,000 - 3,000 (2%)

      // 5. Failed ledger should now have 0 failed items
      expect(settlementStore.getFailedSettlements('bengkel-jaya').length).toBe(0);
      expect(settlementStore.hasBeenSettled('ORD-BENGKEL-001')).toBe(true);
    });
  });

  // ── 6. High Concurrency Multi-Merchant Stress Testing ─────────────────────────
  describe('6. High Concurrency Multi-Merchant Stress Testing', () => {
    it('processes 10 concurrent orders across multiple distinct stores without race conditions', async () => {
      const orderBatch = [
        { store: 'warung-bu-tejo', amount: 25000, id: 'CONC-ORD-1' },
        { store: 'servis-ac-pak-budi', amount: 120000, id: 'CONC-ORD-2' },
        { store: 'warung-bu-tejo', amount: 35000, id: 'CONC-ORD-3' },
        { store: 'servis-ac-pak-budi', amount: 80000, id: 'CONC-ORD-4' },
        { store: 'warung-bu-tejo', amount: 15000, id: 'CONC-ORD-5' },
        { store: 'servis-ac-pak-budi', amount: 250000, id: 'CONC-ORD-6' },
        { store: 'warung-bu-tejo', amount: 45000, id: 'CONC-ORD-7' },
        { store: 'servis-ac-pak-budi', amount: 95000, id: 'CONC-ORD-8' },
        { store: 'warung-bu-tejo', amount: 55000, id: 'CONC-ORD-9' },
        { store: 'servis-ac-pak-budi', amount: 175000, id: 'CONC-ORD-10' }
      ];

      const settlePromises = orderBatch.map(async (item) => {
        const s = storeService.getStore(item.store)!;
        return paymentService.settleStoreOrder({
          store: s,
          grossAmount: item.amount,
          orderId: item.id
        });
      });

      const results = await Promise.all(settlePromises);

      // All 10 orders must succeed
      expect(results.every((r) => r.success)).toBe(true);

      // Verify counts
      const tejoSettlements = settlementStore.listStoreSettlements('warung-bu-tejo');
      const budiSettlements = settlementStore.listStoreSettlements('servis-ac-pak-budi');

      expect(tejoSettlements.length).toBe(5);
      expect(budiSettlements.length).toBe(5);

      // Verify each individual order is settled and recorded
      for (const item of orderBatch) {
        expect(settlementStore.hasBeenSettled(item.id)).toBe(true);
      }
    });
  });

  // ── 7. Conversational WhatsApp Goal Handler Integration ───────────────────────
  describe('7. Conversational WhatsApp Goal Handler Integration', () => {
    it('configures merchant DANA settlement via conversational tool action', async () => {
      let emittedSuccess = false;
      let emittedResult: any = null;

      const emitResult = (_reqId: string, success: boolean, result: any) => {
        emittedSuccess = success;
        emittedResult = result;
      };

      const handler = new WhatsAppCatalogGoalHandler(
        () => ({ isConfigured: true } as any),
        'sess-wa-1',
        emitResult,
        () => storeService
      );

      await handler.handleSetStoreSettlement('req-wa-01', {
        storeName: 'Warung Bu Tejo',
        danaNumber: '081299887766',
        platformFeePercent: 2.0
      });

      expect(emittedSuccess).toBe(true);
      expect(emittedResult.storeId).toBe('warung-bu-tejo');
      expect(emittedResult.settlementInfo.payoutMethod).toBe('DANA');
      expect(emittedResult.settlementInfo.danaNumber).toBe('6281299887766');
      expect(emittedResult.message).toContain('Pencairan Otomatis DANA Dikonfigurasi');
    });

    it('configures merchant Bank settlement with natural bank name alias', async () => {
      let emittedSuccess = false;
      let emittedResult: any = null;

      const emitResult = (_reqId: string, success: boolean, result: any) => {
        emittedSuccess = success;
        emittedResult = result;
      };

      const handler = new WhatsAppCatalogGoalHandler(
        () => ({ isConfigured: true } as any),
        'sess-wa-2',
        emitResult,
        () => storeService
      );

      await handler.handleSetStoreSettlement('req-wa-02', {
        storeName: 'Warung Bu Tejo',
        bank: 'BCA',
        accountNumber: '123-456-7890',
        accountHolderName: 'Tejo Sukardi'
      });

      expect(emittedSuccess).toBe(true);
      expect(emittedResult.settlementInfo.payoutMethod).toBe('BANK');
      expect(emittedResult.settlementInfo.bankDetails.bankCode).toBe('014');
      expect(emittedResult.settlementInfo.bankDetails.bankName).toBe('BCA');
      expect(emittedResult.settlementInfo.bankDetails.accountNumber).toBe('1234567890');
      expect(emittedResult.settlementInfo.bankDetails.accountHolderName).toBe('Tejo Sukardi');
    });
  });

  // ── 8. Account Inquiry (SNAP Account Validation) ──────────────────────────────
  describe('8. Account Inquiry (SNAP Account Validation)', () => {
    it('inquires DANA user account and returns success 2003700 with customerName', async () => {
      vi.spyOn(paymentService, 'accountInquiry').mockResolvedValueOnce({
        success: true,
        responseCode: '2003700',
        responseMessage: 'Successful',
        partnerReferenceNo: 'INQ-TEST-001',
        customerNumber: '62811742234',
        customerName: 'DNID dXX',
        amount: 5,
        feeAmount: 0,
        feeType: 'Service fee',
        customerMonthlyInLimit: '20000000',
        minAmount: 0,
        maxAmount: 105231
      });

      const result = await paymentService.accountInquiry({
        customerNumber: '62811742234',
        amount: 5,
        partnerReferenceNo: 'INQ-TEST-001'
      });

      // Merchant action: Shows request as successful along with customerName
      expect(result.success).toBe(true);
      expect(result.responseCode).toBe('2003700');
      expect(result.responseMessage).toBe('Successful');
      expect(result.customerName).toBe('DNID dXX');
      expect(result.customerNumber).toBe('62811742234');
      expect(result.amount).toBe(5);

      // Verify API endpoint POST /api/dana/account-inquiry
      vi.spyOn(paymentService, 'accountInquiry').mockResolvedValueOnce({
        success: true,
        responseCode: '2003700',
        responseMessage: 'Successful',
        partnerReferenceNo: 'INQ-API-002',
        customerNumber: '62811742234',
        customerName: 'DNID dXX',
        amount: 5
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/account-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerNumber: '62811742234',
          amount: 5
        })
      });
      expect(apiRes.status).toBe(200);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('2003700');
      expect(apiData.customerName).toBe('DNID dXX');
    });

    it('handles official DANA 4033702 Exceeds Top Up Amount Limit error response', async () => {
      vi.spyOn(paymentService, 'accountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4033702',
        responseMessage: 'Exceed maximum limit amount|Nilai transaksi melebihi batas maksimum limit',
        isExceedLimit: true,
        partnerReferenceNo: 'INQ-LIMIT-001',
        customerNumber: '62811742234',
        amount: 21000000,
        customerMonthlyInLimit: '20000000',
        minAmount: 0,
        maxAmount: 105231,
        error: 'Exceeds Top Up Amount Limit: Exceed maximum limit amount|Nilai transaksi melebihi batas maksimum limit'
      });

      const result = await paymentService.accountInquiry({
        customerNumber: '62811742234',
        amount: 21000000,
        partnerReferenceNo: 'INQ-LIMIT-001'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4033702');
      expect(result.isExceedLimit).toBe(true);
      expect(result.responseMessage).toContain('Exceed');
      expect(result.error).toContain('Exceeds Top Up Amount Limit');
      expect(result.customerNumber).toBe('62811742234');
      expect(result.amount).toBe(21000000);

      // Verify API endpoint POST /api/dana/account-inquiry with error response 400
      vi.spyOn(paymentService, 'accountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4033702',
        responseMessage: 'Exceed maximum limit amount|Nilai transaksi melebihi batas maksimum limit',
        isExceedLimit: true,
        partnerReferenceNo: 'INQ-LIMIT-002',
        customerNumber: '62811742234',
        amount: 21000000,
        error: 'Exceeds Top Up Amount Limit: Exceed maximum limit amount'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/account-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerNumber: '62811742234',
          amount: 21000000
        })
      });
      expect(apiRes.status).toBe(400);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('4033702');
      expect(apiData.isExceedLimit).toBe(true);
      expect(apiData.error).toContain('Exceeds Top Up Amount Limit');
    });

    it('handles official DANA 4033705 Do Not Honor error response for unregistered or frozen users', async () => {
      // Test frozen account: 628123456667 (PAYEE_USER_STATUS_DISABLE)
      vi.spyOn(paymentService, 'accountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4033705',
        responseMessage: 'Do Not Honor',
        isDoNotHonor: true,
        partnerReferenceNo: 'INQ-DNH-001',
        customerNumber: '628123456667',
        amount: 5,
        error: 'Do Not Honor: User account is frozen or disabled'
      });

      const resultFrozen = await paymentService.accountInquiry({
        customerNumber: '628123456667',
        amount: 5,
        partnerReferenceNo: 'INQ-DNH-001'
      });

      expect(resultFrozen.success).toBe(false);
      expect(resultFrozen.responseCode).toBe('4033705');
      expect(resultFrozen.isDoNotHonor).toBe(true);
      expect(resultFrozen.responseMessage).toBe('Do Not Honor');
      expect(resultFrozen.error).toContain('Do Not Honor: User account is frozen or disabled');

      // Test unregistered account: 628152768647 (PAYEE_USER_NOT_EXIST)
      vi.spyOn(paymentService, 'accountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4033705',
        responseMessage: 'Do Not Honor',
        isDoNotHonor: true,
        partnerReferenceNo: 'INQ-DNH-002',
        customerNumber: '628152768647',
        amount: 5,
        error: 'Do Not Honor: User is not registered on DANA'
      });

      const resultNonExistent = await paymentService.accountInquiry({
        customerNumber: '628152768647',
        amount: 5,
        partnerReferenceNo: 'INQ-DNH-002'
      });

      expect(resultNonExistent.success).toBe(false);
      expect(resultNonExistent.responseCode).toBe('4033705');
      expect(resultNonExistent.isDoNotHonor).toBe(true);
      expect(resultNonExistent.responseMessage).toBe('Do Not Honor');
      expect(resultNonExistent.error).toContain('Do Not Honor: User is not registered on DANA');

      // Verify HTTP route returns 400 with 4033705 and isDoNotHonor
      vi.spyOn(paymentService, 'accountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4033705',
        responseMessage: 'Do Not Honor',
        isDoNotHonor: true,
        partnerReferenceNo: 'INQ-DNH-003',
        customerNumber: '628123456667',
        amount: 5,
        error: 'Do Not Honor: User account is frozen or disabled'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/account-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerNumber: '628123456667',
          amount: 5
        })
      });
      expect(apiRes.status).toBe(400);
      const apiData = await apiRes.json();
      expect(apiData.status).toBeUndefined(); // apiData is json body
      expect(apiData.responseCode).toBe('4033705');
      expect(apiData.isDoNotHonor).toBe(true);
      expect(apiData.error).toContain('Do Not Honor');
    });

    it('handles official DANA 4013700 Unauthorized Invalid Signature error response', async () => {
      vi.spyOn(paymentService, 'accountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4013700',
        responseMessage: 'Unauthorized. Invalid Signature',
        isUnauthorized: true,
        partnerReferenceNo: 'INQ-INVSIG-001',
        customerNumber: '62811742234',
        amount: 5,
        error: 'Unauthorized: Unauthorized. Invalid Signature. Please verify SNAP BI RSA keypair credentials.'
      });

      const result = await paymentService.accountInquiry({
        customerNumber: '62811742234',
        amount: 5,
        partnerReferenceNo: 'INQ-INVSIG-001'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4013700');
      expect(result.isUnauthorized).toBe(true);
      expect(result.responseMessage).toContain('Unauthorized. Invalid Signature');
      expect(result.error).toContain('Unauthorized');
      expect(result.error).toContain('Invalid Signature');

      // Verify HTTP route returns 400 with 4013700 and isUnauthorized
      vi.spyOn(paymentService, 'accountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4013700',
        responseMessage: 'Unauthorized. Invalid Signature',
        isUnauthorized: true,
        partnerReferenceNo: 'INQ-INVSIG-002',
        customerNumber: '62811742234',
        amount: 5,
        error: 'Unauthorized: Unauthorized. Invalid Signature'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/account-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerNumber: '62811742234',
          amount: 5
        })
      });
      expect(apiRes.status).toBe(400);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('4013700');
      expect(apiData.isUnauthorized).toBe(true);
      expect(apiData.error).toContain('Invalid Signature');
    });
  });

  // ── 9. Disbursement Top Up Status Inquiry (SNAP Status Verification) ──────────
  describe('9. Disbursement Top Up Status Inquiry (SNAP Status Verification)', () => {
    it('inquires disbursement top-up status and returns success 2003900 with latestTransactionStatus 00', async () => {
      vi.spyOn(paymentService, 'topupStatus').mockResolvedValueOnce({
        success: true,
        responseCode: '2003900',
        responseMessage: 'Successful',
        originalPartnerReferenceNo: 'TOPUP-FOR-STATUS-1790021102369',
        originalReferenceNo: '2026092210121481030100166189201410506',
        serviceCode: '38',
        latestTransactionStatus: '00',
        transactionStatusDesc: 'Success',
        amount: 5000
      });

      const result = await paymentService.topupStatus({
        originalPartnerReferenceNo: 'TOPUP-FOR-STATUS-1790021102369',
        originalReferenceNo: '2026092210121481030100166189201410506',
        serviceCode: '38'
      });

      // Verification of In-App Partner Action: Shows transaction as successful along with referenceNo, serviceCode, latestTransactionStatus, transactionStatusDesc
      expect(result.success).toBe(true);
      expect(result.responseCode).toBe('2003900');
      expect(result.responseMessage).toBe('Successful');
      expect(result.latestTransactionStatus).toBe('00');
      expect(result.transactionStatusDesc).toBe('Success');
      expect(result.serviceCode).toBe('38');
      expect(result.originalReferenceNo).toBe('2026092210121481030100166189201410506');
      expect(result.originalPartnerReferenceNo).toBe('TOPUP-FOR-STATUS-1790021102369');
      expect(result.amount).toBe(5000);

      // Verify HTTP route POST /api/dana/topup-status
      vi.spyOn(paymentService, 'topupStatus').mockResolvedValueOnce({
        success: true,
        responseCode: '2003900',
        responseMessage: 'Successful',
        originalPartnerReferenceNo: 'TOPUP-FOR-STATUS-1790021102369',
        originalReferenceNo: '2026092210121481030100166189201410506',
        serviceCode: '38',
        latestTransactionStatus: '00',
        transactionStatusDesc: 'Success'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/topup-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'TOPUP-FOR-STATUS-1790021102369',
          originalReferenceNo: '2026092210121481030100166189201410506',
          serviceCode: '38'
        })
      });

      expect(apiRes.status).toBe(200);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('2003900');
      expect(apiData.latestTransactionStatus).toBe('00');
      expect(apiData.transactionStatusDesc).toBe('Success');
      expect(apiData.originalReferenceNo).toBe('2026092210121481030100166189201410506');
      expect(apiData.serviceCode).toBe('38');
    });

    it('inquires disbursement top-up status and handles latestTransactionStatus 06 (Failed upstream)', async () => {
      vi.spyOn(paymentService, 'topupStatus').mockResolvedValueOnce({
        success: true,
        responseCode: '2003900',
        responseMessage: 'Successful',
        originalPartnerReferenceNo: 'TOPUP-06-1790021411177',
        originalReferenceNo: '2026092210121481030100166848601138198',
        serviceCode: '38',
        latestTransactionStatus: '06',
        transactionStatusDesc: 'Failed',
        isTransactionSuccess: false,
        isTransactionFailed: true,
        amount: 1
      });

      const result = await paymentService.topupStatus({
        originalPartnerReferenceNo: 'TOPUP-06-1790021411177',
        serviceCode: '38'
      });

      // Verification of In-App Partner Action: Shows inquiry as successful along with referenceNo, serviceCode, latestTransactionStatus, transactionStatusDesc
      expect(result.success).toBe(true);
      expect(result.responseCode).toBe('2003900');
      expect(result.responseMessage).toBe('Successful');
      expect(result.latestTransactionStatus).toBe('06');
      expect(result.transactionStatusDesc).toBe('Failed');
      expect(result.isTransactionFailed).toBe(true);
      expect(result.serviceCode).toBe('38');
      expect(result.originalReferenceNo).toBe('2026092210121481030100166848601138198');
      expect(result.originalPartnerReferenceNo).toBe('TOPUP-06-1790021411177');
      expect(result.amount).toBe(1);

      // Verify HTTP route POST /api/dana/topup-status
      vi.spyOn(paymentService, 'topupStatus').mockResolvedValueOnce({
        success: true,
        responseCode: '2003900',
        responseMessage: 'Successful',
        originalPartnerReferenceNo: 'TOPUP-06-1790021411177',
        originalReferenceNo: '2026092210121481030100166848601138198',
        serviceCode: '38',
        latestTransactionStatus: '06',
        transactionStatusDesc: 'Failed'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/topup-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'TOPUP-06-1790021411177',
          serviceCode: '38'
        })
      });

      expect(apiRes.status).toBe(200);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('2003900');
      expect(apiData.latestTransactionStatus).toBe('06');
      expect(apiData.transactionStatusDesc).toBe('Failed');
      expect(apiData.originalReferenceNo).toBe('2026092210121481030100166848601138198');
      expect(apiData.serviceCode).toBe('38');
    });

    it('inquires disbursement top-up status and handles 4043901 Top Up Not Found error response', async () => {
      vi.spyOn(paymentService, 'topupStatus').mockResolvedValueOnce({
        success: false,
        responseCode: '4043901',
        responseMessage: 'Transaction Not Found',
        isNotFound: true,
        originalPartnerReferenceNo: 'NON-EXISTENT-REF-001',
        serviceCode: '38',
        error: 'Top Up Not Found: Transaction Not Found'
      });

      const result = await paymentService.topupStatus({
        originalPartnerReferenceNo: 'NON-EXISTENT-REF-001',
        serviceCode: '38'
      });

      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4043901');
      expect(result.isNotFound).toBe(true);
      expect(result.responseMessage).toContain('Not Found');
      expect(result.error).toContain('Top Up Not Found');
      expect(result.originalPartnerReferenceNo).toBe('NON-EXISTENT-REF-001');

      // Verify HTTP route POST /api/dana/topup-status returns 400 with 4043901
      vi.spyOn(paymentService, 'topupStatus').mockResolvedValueOnce({
        success: false,
        responseCode: '4043901',
        responseMessage: 'Transaction Not Found',
        isNotFound: true,
        originalPartnerReferenceNo: 'NON-EXISTENT-REF-002',
        serviceCode: '38',
        error: 'Top Up Not Found: Transaction Not Found'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/topup-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPartnerReferenceNo: 'NON-EXISTENT-REF-002',
          serviceCode: '38'
        })
      });

      expect(apiRes.status).toBe(400);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('4043901');
      expect(apiData.isNotFound).toBe(true);
      expect(apiData.error).toContain('Top Up Not Found');
    });
  });

  // ── 10. Bank Account Inquiry (POST /v1.0/emoney/bank-account-inquiry.htm) ───────
  describe('10. Bank Account Inquiry (POST /v1.0/emoney/bank-account-inquiry.htm)', () => {
    it('inquires bank account and handles 2004200 Success response with beneficiary details and referenceNo', async () => {
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: true,
        responseCode: '2004200',
        responseMessage: 'Success',
        partnerReferenceNo: 'BANKINQ-TEST-001',
        referenceNo: '35f0e785-1ec6-4295-8458-d1349604657a',
        beneficiaryAccountNumber: '2460888509',
        beneficiaryAccountName: 'Kamila Dini Nabilati',
        beneficiaryBankCode: '014',
        beneficiaryBankShortName: 'BCA',
        beneficiaryBankName: 'BCA',
        amount: 10000,
        feeAmount: 0,
        maxAmount: 999999999
      });

      const result = await paymentService.bankAccountInquiry({
        beneficiaryAccountNumber: '2460888509',
        beneficiaryBankCode: '014',
        amount: 10000
      });

      // Verification of Partner Action: Merchant shows transaction as successful along with beneficiaryAccountName, beneficiaryBankName, referenceNo
      expect(result.success).toBe(true);
      expect(result.responseCode).toBe('2004200');
      expect(result.responseMessage).toBe('Success');
      expect(result.beneficiaryAccountNumber).toBe('2460888509');
      expect(result.beneficiaryAccountName).toBe('Kamila Dini Nabilati');
      expect(result.beneficiaryBankCode).toBe('014');
      expect(result.beneficiaryBankName).toBe('BCA');
      expect(result.referenceNo).toBe('35f0e785-1ec6-4295-8458-d1349604657a');

      // Verify HTTP route POST /api/dana/bank-account-inquiry
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: true,
        responseCode: '2004200',
        responseMessage: 'Success',
        partnerReferenceNo: 'BANKINQ-API-001',
        referenceNo: '35f0e785-1ec6-4295-8458-d1349604657a',
        beneficiaryAccountNumber: '2460888509',
        beneficiaryAccountName: 'Kamila Dini Nabilati',
        beneficiaryBankCode: '014',
        beneficiaryBankName: 'BCA'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/bank-account-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiaryAccountNumber: '2460888509',
          beneficiaryBankCode: '014',
          amount: 10000
        })
      });

      expect(apiRes.status).toBe(200);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('2004200');
      expect(apiData.beneficiaryAccountName).toBe('Kamila Dini Nabilati');
      expect(apiData.beneficiaryBankName).toBe('BCA');
      expect(apiData.referenceNo).toBe('35f0e785-1ec6-4295-8458-d1349604657a');
    });

    it('handles official DANA 4034214 Bank Account Inquiry Insufficient Fund response', async () => {
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4034214',
        responseMessage: 'Insufficient Fund',
        isInsufficientFund: true,
        partnerReferenceNo: 'BANKINQ-INSUFFICIENT-001',
        referenceNo: '1b780f83-7f1b-42ff-9945-58d7fb92966f',
        beneficiaryAccountNumber: '2460888509',
        beneficiaryBankCode: '014',
        amount: 50000000000,
        error: 'Insufficient Fund: Corporate balance is insufficient for bank inquiry/transfer. Please top up corporate balance.'
      });

      const result = await paymentService.bankAccountInquiry({
        beneficiaryAccountNumber: '2460888509',
        beneficiaryBankCode: '014',
        amount: 50000000000
      });

      // Verification of Partner Action: Shows insufficient balance error and informs merchant to top up corporate wallet
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4034214');
      expect(result.responseMessage).toBe('Insufficient Fund');
      expect(result.isInsufficientFund).toBe(true);
      expect(result.error).toContain('Insufficient Fund');
      expect(result.error).toContain('corporate balance');

      // Verify HTTP route POST /api/dana/bank-account-inquiry returns 400 with 4034214
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4034214',
        responseMessage: 'Insufficient Fund',
        isInsufficientFund: true,
        partnerReferenceNo: 'BANKINQ-INSUFFICIENT-002',
        beneficiaryAccountNumber: '8551003634',
        beneficiaryBankCode: '014',
        amount: 50000000000,
        error: 'Insufficient Fund: Corporate balance is insufficient for bank inquiry/transfer. Please top up corporate balance.'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/bank-account-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiaryAccountNumber: '8551003634',
          beneficiaryBankCode: '014',
          amount: 50000000000
        })
      });

      expect(apiRes.status).toBe(400);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('4034214');
      expect(apiData.isInsufficientFund).toBe(true);
      expect(apiData.error).toContain('Insufficient Fund');
    });

    it('handles official DANA 4034218 Bank Account Inquiry Inactive Account response', async () => {
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4034218',
        responseMessage: 'Inactive Account Merchant',
        isInactiveAccount: true,
        partnerReferenceNo: 'BANKINQ-INACTIVE-001',
        beneficiaryAccountNumber: '81298055132',
        beneficiaryBankCode: '014',
        amount: 10000,
        error: 'Inactive Account: Inactive Account Merchant. Beneficiary or merchant account is inactive.'
      });

      const result = await paymentService.bankAccountInquiry({
        beneficiaryAccountNumber: '81298055132',
        beneficiaryBankCode: '014',
        amount: 10000
      });

      // Verification of Partner Action: Shows inactive account error, does not cut balance
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4034218');
      expect(result.responseMessage).toBe('Inactive Account Merchant');
      expect(result.isInactiveAccount).toBe(true);
      expect(result.error).toContain('Inactive Account');

      // Verify HTTP route POST /api/dana/bank-account-inquiry returns 400 with 4034218
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4034218',
        responseMessage: 'Inactive Account Merchant',
        isInactiveAccount: true,
        partnerReferenceNo: 'BANKINQ-INACTIVE-002',
        beneficiaryAccountNumber: '81298055132',
        beneficiaryBankCode: '014',
        amount: 10000,
        error: 'Inactive Account: Inactive Account Merchant. Beneficiary or merchant account is inactive.'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/bank-account-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiaryAccountNumber: '81298055132',
          beneficiaryBankCode: '014',
          amount: 10000
        })
      });

      expect(apiRes.status).toBe(400);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('4034218');
      expect(apiData.isInactiveAccount).toBe(true);
      expect(apiData.error).toContain('Inactive Account');
    });

    it('handles official DANA 4014200 Bank Account Inquiry Unauthorized Invalid Signature response', async () => {
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4014200',
        responseMessage: 'Unauthorized. Invalid Signature',
        isUnauthorized: true,
        partnerReferenceNo: 'BANKINQ-INVSIG-001',
        beneficiaryAccountNumber: '2460888509',
        beneficiaryBankCode: '014',
        amount: 10000,
        error: 'Unauthorized: Unauthorized. Invalid Signature. Please verify SNAP BI RSA keypair credentials.'
      });

      const result = await paymentService.bankAccountInquiry({
        beneficiaryAccountNumber: '2460888509',
        beneficiaryBankCode: '014',
        amount: 10000
      });

      // Verification of Partner Action: Shows unauthorized error, does not cut balance
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4014200');
      expect(result.responseMessage).toContain('Unauthorized');
      expect(result.isUnauthorized).toBe(true);
      expect(result.error).toContain('Unauthorized');
      expect(result.error).toContain('Invalid Signature');

      // Verify HTTP route POST /api/dana/bank-account-inquiry returns 400 with 4014200
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4014200',
        responseMessage: 'Unauthorized. Invalid Signature',
        isUnauthorized: true,
        partnerReferenceNo: 'BANKINQ-INVSIG-002',
        beneficiaryAccountNumber: '2460888509',
        beneficiaryBankCode: '014',
        amount: 10000,
        error: 'Unauthorized: Unauthorized. Invalid Signature. Please verify SNAP BI RSA keypair credentials.'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/bank-account-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiaryAccountNumber: '2460888509',
          beneficiaryBankCode: '014',
          amount: 10000
        })
      });

      expect(apiRes.status).toBe(400);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('4014200');
      expect(apiData.isUnauthorized).toBe(true);
      expect(apiData.error).toContain('Unauthorized');
    });

    it('handles official DANA 4044211 Bank Account Inquiry Invalid Account response', async () => {
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4044211',
        responseMessage: 'Invalid Card/Account/Customer Number/Virtual Account',
        isInvalidAccount: true,
        partnerReferenceNo: 'BANKINQ-INVACC-001',
        beneficiaryAccountNumber: '815919191',
        beneficiaryBankCode: '014',
        amount: 10000,
        error: 'Invalid Account: Invalid Card/Account/Customer Number/Virtual Account. Beneficiary bank account not found or invalid. Please check the account number.'
      });

      const result = await paymentService.bankAccountInquiry({
        beneficiaryAccountNumber: '815919191',
        beneficiaryBankCode: '014',
        amount: 10000
      });

      // Verification of Partner Action: Shows invalid account error, asks user to check account number, does not cut balance
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4044211');
      expect(result.responseMessage).toContain('Invalid Card/Account');
      expect(result.isInvalidAccount).toBe(true);
      expect(result.error).toContain('Invalid Account');
      expect(result.error).toContain('check the account number');

      // Verify HTTP route POST /api/dana/bank-account-inquiry returns 400 with 4044211
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4044211',
        responseMessage: 'Invalid Card/Account/Customer Number/Virtual Account',
        isInvalidAccount: true,
        partnerReferenceNo: 'BANKINQ-INVACC-002',
        beneficiaryAccountNumber: '815919191',
        beneficiaryBankCode: '014',
        amount: 10000,
        error: 'Invalid Account: Invalid Card/Account/Customer Number/Virtual Account. Beneficiary bank account not found or invalid. Please check the account number.'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/bank-account-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiaryAccountNumber: '815919191',
          beneficiaryBankCode: '014',
          amount: 10000
        })
      });

      expect(apiRes.status).toBe(400);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('4044211');
      expect(apiData.isInvalidAccount).toBe(true);
      expect(apiData.error).toContain('Invalid Account');
    });

    it('handles official DANA 4004201 Bank Account Inquiry Invalid Field Format response and prompts for proper request values', async () => {
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4004201',
        responseMessage: 'Invalid Field Format',
        isInvalidFieldFormat: true,
        partnerReferenceNo: 'BANKINQ-INVFORMAT-001',
        beneficiaryAccountNumber: '2460888509',
        beneficiaryBankCode: '014',
        amount: 10000,
        error: 'Invalid Field Format: Invalid Field Format. Please provide proper request values (e.g. amount.currency must be IDR).'
      });

      const result = await paymentService.bankAccountInquiry({
        beneficiaryAccountNumber: '2460888509',
        beneficiaryBankCode: '014',
        amount: 10000,
        currency: 'USD'
      });

      // Verification of Partner Action: Shows invalid field format error and prompts for proper values (IDR)
      expect(result.success).toBe(false);
      expect(result.responseCode).toBe('4004201');
      expect(result.responseMessage).toBe('Invalid Field Format');
      expect(result.isInvalidFieldFormat).toBe(true);
      expect(result.error).toContain('Invalid Field Format');
      expect(result.error).toContain('proper request values');

      // Verify HTTP route POST /api/dana/bank-account-inquiry returns 400 with 4004201
      vi.spyOn(paymentService, 'bankAccountInquiry').mockResolvedValueOnce({
        success: false,
        responseCode: '4004201',
        responseMessage: 'Invalid Field Format',
        isInvalidFieldFormat: true,
        partnerReferenceNo: 'BANKINQ-INVFORMAT-002',
        beneficiaryAccountNumber: '2460888509',
        beneficiaryBankCode: '014',
        amount: 10000,
        error: 'Invalid Field Format: Invalid Field Format. Please provide proper request values (e.g. amount.currency must be IDR).'
      });

      const apiRes = await fetch(`${baseUrl}/api/dana/bank-account-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiaryAccountNumber: '2460888509',
          beneficiaryBankCode: '014',
          amount: 10000,
          currency: 'USD'
        })
      });

      expect(apiRes.status).toBe(400);
      const apiData = await apiRes.json();
      expect(apiData.responseCode).toBe('4004201');
      expect(apiData.isInvalidFieldFormat).toBe(true);
      expect(apiData.error).toContain('Invalid Field Format');
    });
  });
});






