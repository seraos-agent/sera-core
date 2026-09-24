import { ISnapDispatcher } from '../DanaSnapDispatcher';
import { OrderSettlementStore } from '../OrderSettlementStore';
import { RefundOrderParams, RefundOrderResult } from '../types';
import { SnapResponseClassifier } from '../SnapResponseClassifier';

/**
 * Service dedicated to DANA SNAP BI Debit Refund operations.
 * Handles refund request dispatching, response classification, and in-app order settlement updates.
 */
export class DanaRefundService {
  private dispatcher: ISnapDispatcher;
  private settlementStore: OrderSettlementStore;

  constructor(dispatcher: ISnapDispatcher, settlementStore?: OrderSettlementStore) {
    this.dispatcher = dispatcher;
    this.settlementStore = settlementStore || OrderSettlementStore.getInstance();
  }

  /**
   * Requests a refund for a previously paid transaction via SNAP BI Debit Refund.
   * Endpoint: POST /payment-gateway/v1.0/debit/refund.htm
   * Returns responseCode 2005800 and responseMessage 'success' (or 'Successful').
   * In-App Partner Action: Marks refund as successful, pending, or failed and updates SettlementStore.
   */
  public async refundOrder(params: RefundOrderParams): Promise<RefundOrderResult> {
    const config = this.dispatcher.getConfig();
    const merchantId = params.merchantId || config.merchantId;
    const partnerRefundNo = params.partnerRefundNo || `REFUND-${Date.now()}`;
    const externalId = `EXT-REF-${Date.now()}`;

    const bodyObj: any = {
      merchantId,
      originalPartnerReferenceNo: params.originalPartnerReferenceNo,
      partnerRefundNo,
      refundAmount: {
        value: params.amountValueOverride !== undefined ? params.amountValueOverride : `${params.refundAmount.toFixed(2)}`,
        currency: params.currency || 'IDR'
      },
      reason: params.reason || 'Customer request refund'
    };

    if (params.originalReferenceNo) {
      bodyObj.originalReferenceNo = params.originalReferenceNo;
    }

    try {
      console.log(`[DanaRefundService] Requesting refund for order ${params.originalPartnerReferenceNo}, amount: Rp ${params.refundAmount}...`);
      console.log(`[DanaRefundService] Body payload:`, JSON.stringify(bodyObj, null, 2));
      const { res, data } = await this.dispatcher.executeSnapPost(
        '/payment-gateway/v1.0/debit/refund.htm',
        bodyObj,
        externalId,
        params.headers
      );
      console.log(`[DanaRefundService] Response status: ${res.status}, data:`, JSON.stringify(data, null, 2));

      const responseCode = String(data?.responseCode || '');
      const responseMessage = String(data?.responseMessage || '');

      const isRefundSuccess = (res.ok || res.status === 200) && (
        responseCode === '2005800' ||
        responseCode.startsWith('200') ||
        responseMessage.toLowerCase() === 'success' ||
        responseMessage.toLowerCase() === 'successful'
      );

      const isInProgress = (
        res.status === 202 ||
        responseCode === '2025800' ||
        responseCode.startsWith('202') ||
        responseMessage.toLowerCase().includes('in progress')
      );

      const isNotFound = responseCode === '4045801' || responseMessage.toLowerCase().includes('not found');
      const isInvalidStatus = responseCode === '4045800' || responseMessage.toLowerCase().includes('invalid transaction status');
      const isUnauthorized = res.status === 401 || responseCode === '4015800' || responseCode.startsWith('401') || responseMessage.toLowerCase().includes('unauthorized');
      const isMissingMandatoryField = responseCode === '4005802' || responseMessage.toLowerCase().includes('mandatory field');
      const isTransactionNotPermitted = responseCode === '4035815' || (res.status === 403 && responseMessage.toLowerCase().includes('transaction not permitted'));
      const isInconsistentRequest = responseCode === '4045818' || (res.status === 404 && responseMessage.toLowerCase().includes('inconsistent request'));
      const isInsufficientFunds = responseCode === '4035814' || (res.status === 403 && responseMessage.toLowerCase().includes('insufficient funds'));
      const isInternalServerError = responseCode === '5005801' || (res.status === 500 && responseMessage.toLowerCase().includes('internal server error'));
      const isMerchantStatusAbnormal = responseCode === '4045808' ||
        responseMessage.toLowerCase().includes('merchant status abnormal') ||
        responseMessage.toLowerCase().includes('invalid merchant');

      const refundAmountVal = data?.refundAmount?.value ? parseFloat(data.refundAmount.value) : params.refundAmount;

      // In-App Partner Action:
      // 1. Success -> Refund mark as successful, user able to see refunded transaction in transaction history
      // 2. In Progress (2025800) -> Refund mark as pending
      // 3. Terminal Failures -> Refund mark as failed
      if (isRefundSuccess) {
        try {
          const updated = this.settlementStore.recordRefund(params.originalPartnerReferenceNo, {
            refundNo: data?.refundNo || data?.originalReferenceNo,
            partnerRefundNo,
            refundAmount: refundAmountVal,
            reason: params.reason,
            status: 'SUCCESS'
          }, false);
          if (!updated && params.originalReferenceNo) {
            this.settlementStore.recordRefund(params.originalReferenceNo, {
              refundNo: data?.refundNo || data?.originalReferenceNo,
              partnerRefundNo,
              refundAmount: refundAmountVal,
              reason: params.reason,
              status: 'SUCCESS'
            }, false);
          }
          console.log(`[DanaRefundService] In-App Action: Order ${params.originalPartnerReferenceNo} marked as REFUNDED in SettlementStore.`);
        } catch (storeErr: any) {
          console.warn('[DanaRefundService] Error updating settlement store with refund:', storeErr.message);
        }
      } else if (isInProgress) {
        try {
          const updated = this.settlementStore.recordRefund(params.originalPartnerReferenceNo, {
            refundNo: data?.refundNo || data?.originalReferenceNo,
            partnerRefundNo,
            refundAmount: refundAmountVal,
            reason: params.reason,
            status: 'PENDING'
          }, true);
          if (!updated && params.originalReferenceNo) {
            this.settlementStore.recordRefund(params.originalReferenceNo, {
              refundNo: data?.refundNo || data?.originalReferenceNo,
              partnerRefundNo,
              refundAmount: refundAmountVal,
              reason: params.reason,
              status: 'PENDING'
            }, true);
          }
          console.log(`[DanaRefundService] In-App Action: Order ${params.originalPartnerReferenceNo} marked as PENDING refund in SettlementStore.`);
        } catch (storeErr: any) {
          console.warn('[DanaRefundService] Error updating settlement store with pending refund:', storeErr.message);
        }
      } else if (isTransactionNotPermitted || isInconsistentRequest || isInsufficientFunds || isInternalServerError || isMerchantStatusAbnormal) {
        try {
          const failureReason = isMerchantStatusAbnormal
            ? (responseMessage || 'Merchant Status Abnormal')
            : (isInternalServerError
              ? (responseMessage || 'Internal Server Error')
              : (isInsufficientFunds
                ? (responseMessage || 'Insufficient Funds')
                : (isInconsistentRequest
                  ? (responseMessage || 'Inconsistent Request')
                  : (responseMessage || 'Transaction Not Permitted'))));
          const updated = this.settlementStore.recordRefund(params.originalPartnerReferenceNo, {
            refundNo: data?.refundNo || data?.originalReferenceNo,
            partnerRefundNo,
            refundAmount: refundAmountVal,
            reason: params.reason,
            status: 'FAILED',
            error: failureReason
          }, 'FAILED');
          if (!updated && params.originalReferenceNo) {
            this.settlementStore.recordRefund(params.originalReferenceNo, {
              refundNo: data?.refundNo || data?.originalReferenceNo,
              partnerRefundNo,
              refundAmount: refundAmountVal,
              reason: params.reason,
              status: 'FAILED',
              error: failureReason
            }, 'FAILED');
          }
          console.log(`[DanaRefundService] In-App Action: Order ${params.originalPartnerReferenceNo} marked as FAILED refund in SettlementStore (${failureReason}).`);
        } catch (storeErr: any) {
          console.warn('[DanaRefundService] Error updating settlement store with failed refund:', storeErr.message);
        }
      }

      let errorMsg = (isRefundSuccess || isInProgress) ? undefined : (responseMessage || 'Failed to refund order');
      if (isNotFound) {
        errorMsg = `Transaction Not Found: ${responseMessage}. The specified original order was not found.`;
      } else if (isInvalidStatus) {
        errorMsg = `Invalid Transaction Status: ${responseMessage}. Order cannot be refunded in its current state (must be SUCCESS/PAID).`;
      } else if (isUnauthorized) {
        errorMsg = `Unauthorized: ${responseMessage}. Please verify SNAP BI client credentials and RSA signature.`;
      } else if (isMissingMandatoryField) {
        errorMsg = `Missing Mandatory Field: ${responseMessage}. Please ensure all required parameters are provided.`;
      } else if (isTransactionNotPermitted) {
        errorMsg = `Transaction Not Permitted: ${responseMessage}. Merchant cannot refund or cancel this transaction.`;
      } else if (isInconsistentRequest) {
        errorMsg = `Inconsistent Request: ${responseMessage}. Repeat refund request with inconsistent parameters.`;
      } else if (isInsufficientFunds) {
        errorMsg = `Insufficient Funds: ${responseMessage}. Merchant account has insufficient balance to process refund.`;
      } else if (isInternalServerError) {
        errorMsg = `Internal Server Error: ${responseMessage}. Upstream DANA service encountered an internal error. Refund is held pending transaction retry.`;
      } else if (isMerchantStatusAbnormal) {
        errorMsg = `Merchant Status Abnormal: ${responseMessage}. Merchant status is abnormal or invalid.`;
      }

      return {
        success: isRefundSuccess,
        responseCode: responseCode || (res.ok ? '2005800' : (res.status === 202 ? '2025800' : `${res.status}5800`)),
        responseMessage: responseMessage || (res.ok ? 'success' : (res.status === 202 ? 'Request In Progress' : 'Failed')),
        originalPartnerReferenceNo: data?.originalPartnerReferenceNo || params.originalPartnerReferenceNo,
        originalReferenceNo: data?.originalReferenceNo || params.originalReferenceNo,
        partnerRefundNo: data?.partnerRefundNo || partnerRefundNo,
        refundNo: data?.refundNo,
        refundAmount: refundAmountVal,
        currency: data?.refundAmount?.currency || params.currency || 'IDR',
        refundTime: data?.refundTime,
        serviceCode: data?.serviceCode || '58',
        isRefundSuccess,
        isInProgress,
        isNotFound,
        isInvalidStatus,
        isUnauthorized,
        isMissingMandatoryField,
        isTransactionNotPermitted,
        isInconsistentRequest,
        isInsufficientFunds,
        isInternalServerError,
        isMerchantStatusAbnormal,
        rawResponse: data,
        error: errorMsg
      };
    } catch (err: any) {
      console.error('[DanaRefundService] refundOrder error:', err.message);
      return {
        success: false,
        originalPartnerReferenceNo: params.originalPartnerReferenceNo,
        partnerRefundNo,
        error: err.message
      };
    }
  }
}
