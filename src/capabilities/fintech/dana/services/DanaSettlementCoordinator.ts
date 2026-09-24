import { StoreProfile } from '../../../communication/services/StoreProfileService';
import { OrderSettlementStore } from '../OrderSettlementStore';
import {
  StoreSettlementParams,
  StoreSettlementResult,
  DisburseToBalanceParams,
  DisburseToBalanceResult,
  DisburseToBankParams,
  DisburseToBankResult
} from '../types';

export interface IDanaDisbursementProvider {
  disburseToBalance(params: DisburseToBalanceParams): Promise<DisburseToBalanceResult>;
  disburseToBank(params: DisburseToBankParams): Promise<DisburseToBankResult>;
}

/**
 * Coordinates automated store settlements and payout distribution.
 * Calculates platform fees, verifies idempotency, routes payouts to DANA or Bank,
 * and maintains audit records in OrderSettlementStore.
 */
export class DanaSettlementCoordinator {
  private disbursementProvider: IDanaDisbursementProvider;
  private settlementStore: OrderSettlementStore;

  constructor(
    disbursementProvider: IDanaDisbursementProvider,
    settlementStore?: OrderSettlementStore
  ) {
    this.disbursementProvider = disbursementProvider;
    this.settlementStore = settlementStore || OrderSettlementStore.getInstance();
  }

  /**
   * Automatically calculates and settles merchant payout for a completed order.
   * Deducts SERA platform fee (default 2%) and immediately disburses the net amount
   * to the seller's personal DANA account or Bank account.
   */
  public async settleStoreOrder(params: StoreSettlementParams): Promise<StoreSettlementResult> {
    const { store, grossAmount, orderId } = params;
    const settlement = store.settlementInfo;

    // 1. Idempotency & Consistency check: prevent double-payout and reject inconsistent requests
    const existing = this.settlementStore.getSettlement(orderId);
    if (existing) {
      // Inconsistent Request check: duplicate attempt for orderId with mismatched grossAmount
      if (existing.grossAmount !== grossAmount) {
        const isBank = (settlement?.payoutMethod || existing.payoutMethod) === 'BANK';
        const inconsistentCode = isBank ? '4044318' : '4043818';
        const errorMsg = `Inconsistent Request: duplicate transfer for order ${orderId} with mismatched gross amount (recorded: Rp ${existing.grossAmount}, attempted: Rp ${grossAmount}). Duplicate transfer rejected. Please retry transaction properly.`;
        console.warn(`[DanaSettlementCoordinator] ${errorMsg}`);
        return {
          success: false,
          status: 'FAILED',
          isInconsistent: true,
          responseCode: inconsistentCode,
          responseMessage: 'Inconsistent Request',
          orderId,
          storeId: store.storeId,
          storeName: store.storeName,
          grossAmount,
          platformFee: Math.round(grossAmount * ((settlement?.platformFeePercent ?? 2.0) / 100)),
          netPayout: Math.max(0, grossAmount - Math.round(grossAmount * ((settlement?.platformFeePercent ?? 2.0) / 100))),
          payoutMethod: settlement?.payoutMethod || 'UNCONFIGURED',
          destination: existing.destination,
          partnerReferenceNo: existing.partnerReferenceNo,
          error: errorMsg
        };
      }

      if (existing.status === 'SUCCESS') {
        console.log(`[DanaSettlementCoordinator] Order ${orderId} has already been settled. Skipping duplicate payout.`);
        return {
          success: true,
          status: 'SUCCESS',
          orderId,
          storeId: existing.storeId,
          storeName: existing.storeName,
          grossAmount: existing.grossAmount,
          platformFee: existing.platformFee,
          netPayout: existing.netPayout,
          payoutMethod: existing.payoutMethod,
          destination: existing.destination,
          partnerReferenceNo: existing.partnerReferenceNo,
          referenceNo: existing.referenceNo,
          isDuplicate: true
        };
      }
    }

    // Platform fee calculation (default 2%)
    const feeRate = (params.customFeePercent !== undefined
      ? params.customFeePercent
      : (settlement?.platformFeePercent ?? 2.0)) / 100;
    const platformFee = Math.round(grossAmount * feeRate);
    const netPayout = Math.max(0, grossAmount - platformFee);

    if (netPayout <= 0) {
      const errRes: StoreSettlementResult = {
        success: false,
        orderId,
        storeId: store.storeId,
        storeName: store.storeName,
        grossAmount,
        platformFee,
        netPayout,
        payoutMethod: settlement?.payoutMethod || 'UNCONFIGURED',
        destination: 'N/A',
        error: 'Net payout amount must be greater than zero.'
      };
      this.settlementStore.recordSettlement({
        ...errRes,
        status: 'FAILED',
        settledAt: Date.now()
      });
      return errRes;
    }

    // Determine payout destination: explicit settlementInfo or fallback to owner WhatsApp as DANA
    const payoutMethod: 'DANA' | 'BANK' | 'UNCONFIGURED' =
      settlement?.payoutMethod || (store.ownerWhatsApp ? 'DANA' : 'UNCONFIGURED');
    const danaNumber = settlement?.danaNumber || (store.ownerWhatsApp ? store.ownerWhatsApp.replace(/[^0-9]/g, '') : '');

    if (payoutMethod === 'DANA') {
      if (!danaNumber) {
        const errRes: StoreSettlementResult = {
          success: false,
          orderId,
          storeId: store.storeId,
          storeName: store.storeName,
          grossAmount,
          platformFee,
          netPayout,
          payoutMethod: 'DANA',
          destination: 'None',
          error: `Store "${store.storeName}" has no DANA phone number configured for payout.`
        };
        this.settlementStore.recordSettlement({
          ...errRes,
          status: 'FAILED',
          settledAt: Date.now()
        });
        return errRes;
      }

      console.log(`[DanaSettlementCoordinator] Auto-settling order ${orderId} for "${store.storeName}": Gross Rp ${grossAmount}, Fee Rp ${platformFee}, Net Rp ${netPayout} -> DANA ${danaNumber}`);

      const disburseRes = await this.disbursementProvider.disburseToBalance({
        customerNumber: danaNumber,
        amount: netPayout,
        feeAmount: platformFee,
        partnerReferenceNo: `PAYOUT-${orderId}`,
        fundType: 'AGENT_TOPUP_FOR_USER_SETTLE'
      });

      const isBalanceInsufficientFund = Boolean(disburseRes.isInsufficientFund || disburseRes.responseCode === '4033814');
      const isBalanceDoNotHonor = Boolean(disburseRes.isDoNotHonor || disburseRes.responseCode === '4033805');
      const isBalanceMissingMandatoryField = Boolean(disburseRes.isMissingMandatoryField || disburseRes.responseCode === '4003802');
      const isBalanceInconsistent = Boolean(disburseRes.isInconsistent || disburseRes.responseCode === '4043818');
      const isBalanceInternalServerError = Boolean(disburseRes.isInternalServerError || disburseRes.responseCode === '5003801');
      const isBalanceGeneralError = Boolean(disburseRes.isGeneralError || disburseRes.responseCode === '5003800');

      const result: StoreSettlementResult = {
        success: disburseRes.success,
        status: disburseRes.success ? 'SUCCESS' : 'FAILED',
        isInsufficientFund: isBalanceInsufficientFund,
        isDoNotHonor: isBalanceDoNotHonor,
        isMissingMandatoryField: isBalanceMissingMandatoryField,
        isInconsistent: isBalanceInconsistent,
        isInternalServerError: isBalanceInternalServerError,
        isGeneralError: isBalanceGeneralError,
        responseCode: disburseRes.responseCode,
        responseMessage: disburseRes.responseMessage,
        orderId,
        storeId: store.storeId,
        storeName: store.storeName,
        grossAmount,
        platformFee,
        netPayout,
        payoutMethod: 'DANA',
        destination: danaNumber,
        partnerReferenceNo: disburseRes.partnerReferenceNo,
        referenceNo: disburseRes.referenceNo,
        error: disburseRes.error
      };

      if (!this.settlementStore.hasBeenSettled(orderId)) {
        this.settlementStore.recordSettlement({
          ...result,
          status: disburseRes.success ? 'SUCCESS' : 'FAILED',
          settledAt: Date.now()
        });
      }

      return result;
    }

    if (payoutMethod === 'BANK') {
      const bank = settlement?.bankDetails;
      if (!bank?.accountNumber || !bank?.bankCode) {
        const errRes: StoreSettlementResult = {
          success: false,
          orderId,
          storeId: store.storeId,
          storeName: store.storeName,
          grossAmount,
          platformFee,
          netPayout,
          payoutMethod: 'BANK',
          destination: 'None',
          error: `Store "${store.storeName}" has incomplete bank payout details.`
        };
        this.settlementStore.recordSettlement({
          ...errRes,
          status: 'FAILED',
          settledAt: Date.now()
        });
        return errRes;
      }

      console.log(`[DanaSettlementCoordinator] Auto-settling order ${orderId} for "${store.storeName}": Gross Rp ${grossAmount}, Fee Rp ${platformFee}, Net Rp ${netPayout} -> Bank ${bank.bankCode}:${bank.accountNumber}`);

      const bankRes = await this.disbursementProvider.disburseToBank({
        beneficiaryAccountNumber: bank.accountNumber,
        beneficiaryBankCode: bank.bankCode,
        amount: netPayout,
        partnerReferenceNo: `PAYOUT-BANK-${orderId}`,
        fundType: 'MERCHANT_WITHDRAW_FOR_CORPORATE',
        needNotify: true
      });

      const isBankSuccess = bankRes.status === 'SUCCESS' || (bankRes.success && !bankRes.isInProgress && bankRes.status !== 'FAILED');
      const isBankInProgress = Boolean(bankRes.isInProgress || bankRes.status === 'IN_PROGRESS');
      const isBankInconsistent = Boolean(bankRes.isInconsistent || bankRes.responseCode === '4044318');
      const isBankInsufficientFund = Boolean(bankRes.isInsufficientFund || bankRes.responseCode === '4034314');
      const isBankInactiveAccount = Boolean(bankRes.isInactiveAccount || bankRes.responseCode === '4034318');
      const isBankInvalidFieldFormat = Boolean(bankRes.isInvalidFieldFormat || bankRes.responseCode === '4004301');
      const isBankMissingMandatoryField = Boolean(bankRes.isMissingMandatoryField || bankRes.responseCode === '4004302');
      const isBankUnauthorized = Boolean(bankRes.isUnauthorized || bankRes.responseCode === '4014300');
      const isBankGeneralError = Boolean(bankRes.isGeneralError || bankRes.responseCode === '5004300');
      const isBankSuspectedFraud = Boolean(bankRes.isSuspectedFraud || bankRes.responseCode === '4034303');

      const result: StoreSettlementResult = {
        success: isBankSuccess || isBankInProgress,
        status: isBankSuccess ? 'SUCCESS' : (isBankInProgress ? 'IN_PROGRESS' : 'FAILED'),
        isInProgress: isBankInProgress,
        isInconsistent: isBankInconsistent,
        isInsufficientFund: isBankInsufficientFund,
        isInactiveAccount: isBankInactiveAccount,
        isInvalidFieldFormat: isBankInvalidFieldFormat,
        isMissingMandatoryField: isBankMissingMandatoryField,
        isUnauthorized: isBankUnauthorized,
        isGeneralError: isBankGeneralError,
        isSuspectedFraud: isBankSuspectedFraud,
        responseCode: bankRes.responseCode,
        responseMessage: bankRes.responseMessage,
        orderId,
        storeId: store.storeId,
        storeName: store.storeName,
        grossAmount,
        platformFee,
        netPayout,
        payoutMethod: 'BANK',
        destination: `${bank.bankCode}:${bank.accountNumber}`,
        partnerReferenceNo: bankRes.partnerReferenceNo,
        referenceNo: bankRes.referenceNo,
        error: bankRes.error
      };

      if (!this.settlementStore.hasBeenSettled(orderId)) {
        this.settlementStore.recordSettlement({
          ...result,
          status: isBankInProgress ? 'PENDING' : (isBankSuccess ? 'SUCCESS' : 'FAILED'),
          settledAt: Date.now()
        });
      }

      return result;
    }

    const unconfiguredRes: StoreSettlementResult = {
      success: false,
      orderId,
      storeId: store.storeId,
      storeName: store.storeName,
      grossAmount,
      platformFee,
      netPayout,
      payoutMethod: 'UNCONFIGURED',
      destination: 'None',
      error: `Store "${store.storeName}" has no payout method configured.`
    };

    this.settlementStore.recordSettlement({
      ...unconfiguredRes,
      status: 'FAILED',
      settledAt: Date.now()
    });

    return unconfiguredRes;
  }

  /**
   * Retries all previously failed settlements for a store.
   * Useful when a merchant corrects their invalid DANA phone number or bank details.
   */
  public async retryFailedSettlements(store: StoreProfile): Promise<StoreSettlementResult[]> {
    const failed = this.settlementStore.getFailedSettlements(store.storeId);
    if (failed.length === 0) return [];

    console.log(`[DanaSettlementCoordinator] Retrying ${failed.length} failed settlement(s) for store "${store.storeName}"...`);
    const results: StoreSettlementResult[] = [];
    for (const f of failed) {
      const res = await this.settleStoreOrder({
        store,
        grossAmount: f.grossAmount,
        orderId: f.orderId
      });
      results.push(res);
    }
    return results;
  }
}
