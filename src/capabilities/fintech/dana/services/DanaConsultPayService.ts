import { ISnapDispatcher } from '../DanaSnapDispatcher';
import { ConsultPayParams, ConsultPayResult } from '../types';

/**
 * Service dedicated to DANA SNAP BI Consult Pay operations.
 * Queries available payment options (DANA Balance, Direct Debit, QRIS, Cards) for a specified amount.
 */
export class DanaConsultPayService {
  private dispatcher: ISnapDispatcher;

  constructor(dispatcher: ISnapDispatcher) {
    this.dispatcher = dispatcher;
  }

  /**
   * Requests Consult Pay to retrieve available payment methods for a given amount.
   * Endpoint: POST /v1.0/payment-gateway/consult-pay.htm
   * Returns responseCode 2005700 and paymentInfos array.
   */
  public async consultPay(params: ConsultPayParams): Promise<ConsultPayResult> {
    const config = this.dispatcher.getConfig();
    const merchantId = params.merchantId || config.merchantId;
    const partnerReferenceNo = params.partnerReferenceNo || `REF-CONSULT-${Date.now()}`;
    const externalId = `EXT-${Date.now()}`;

    const bodyObj: any = {
      partnerReferenceNo,
      merchantId,
      amount: {
        value: `${params.amount.toFixed(2)}`,
        currency: params.currency || 'IDR'
      },
      additionalInfo: {
        order: {
          orderTitle: params.title || 'Consult Pay'
        }
      }
    };

    try {
      console.log(`[DanaConsultPayService] Requesting Consult Pay for Rp ${params.amount} (Merchant: ${merchantId})...`);
      const { res, data } = await this.dispatcher.executeSnapPost(
        '/v1.0/payment-gateway/consult-pay.htm',
        bodyObj,
        externalId,
        params.headers
      );

      const responseCode = String(data?.responseCode || '');
      const isSuccess = res.ok && (responseCode === '2005700' || responseCode.startsWith('200'));
      const isUnauthorized = res.status === 401 ||
        responseCode === '4000002' ||
        responseCode === '4010000' ||
        responseCode.startsWith('401') ||
        data?.responseMessage?.toLowerCase().includes('unauthorized');

      let errorMsg = isSuccess ? undefined : (data?.responseMessage || 'Failed to consult pay methods');
      if (isUnauthorized) {
        errorMsg = `Unauthorized: ${data?.responseMessage || 'Unauthorized request'}. Please verify client credentials and SNAP BI signature.`;
      }

      return {
        success: isSuccess,
        responseCode: responseCode || (res.ok ? '2005700' : `${res.status}5700`),
        responseMessage: data?.responseMessage || (res.ok ? 'Successful' : 'Failed'),
        paymentInfos: data?.paymentInfos || [],
        isUnauthorized,
        rawResponse: data,
        error: errorMsg
      };
    } catch (err: any) {
      console.error('[DanaConsultPayService] consultPay error:', err.message);
      return {
        success: false,
        paymentInfos: [],
        error: err.message
      };
    }
  }
}
