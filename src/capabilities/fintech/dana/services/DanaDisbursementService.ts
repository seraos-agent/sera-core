import { ISnapDispatcher } from '../DanaSnapDispatcher';
import {
  DisburseToBalanceParams,
  DisburseToBalanceResult,
  AccountInquiryParams,
  AccountInquiryResult,
  TopupStatusParams,
  TopupStatusResult,
  BankAccountInquiryParams,
  BankAccountInquiryResult,
  DisburseToBankParams,
  DisburseToBankResult
} from '../types';

/**
 * Service dedicated to DANA SNAP BI Disbursements and Account Inquiries.
 * Supports DANA balance top-up (e-money), bank transfers, and account validation inquiries.
 */
export class DanaDisbursementService {
  private dispatcher: ISnapDispatcher;

  constructor(dispatcher: ISnapDispatcher) {
    this.dispatcher = dispatcher;
  }

  /**
   * Disburses funds to a DANA user account (Customer Top-Up / Send Balance).
   * Uses asymmetric RSA-SHA256 signature over the request body hash.
   */
  public async disburseToBalance(params: DisburseToBalanceParams): Promise<DisburseToBalanceResult> {
    const partnerReferenceNo = params.partnerReferenceNo || `DISB-${Date.now()}`;
    const externalId = `EXT-${Date.now()}`;

    const bodyObj: any = {
      partnerReferenceNo,
      amount: {
        value: `${params.amount.toFixed(2)}`,
        currency: 'IDR'
      },
      feeAmount: {
        value: `${(params.feeAmount || 0).toFixed(2)}`,
        currency: 'IDR'
      },
      additionalInfo: {
        fundType: params.fundType || 'AGENT_TOPUP_FOR_USER_SETTLE'
      }
    };
    if (params.customerNumber) {
      bodyObj.customerNumber = params.customerNumber;
    }

    try {
      console.log(`[DanaDisbursementService] Disbursing Rp ${params.amount} to DANA customer ${params.customerNumber || 'N/A'}...`);
      const { res, data } = await this.dispatcher.executeSnapPost(
        '/rest/v1.0/emoney/topup',
        bodyObj,
        externalId
      );

      const responseCode = String(data.responseCode || '');
      const isSuccess = res.ok && (responseCode === '2003800' || responseCode.startsWith('200'));
      const isInsufficientFund = responseCode === '4033814' || data.responseMessage === 'Insufficient Fund';
      const isDoNotHonor = responseCode === '4033805' || data.responseMessage === 'Do Not Honor';
      const isMissingMandatoryField = responseCode === '4003802' || data.responseMessage?.includes('Mandatory Field');
      const isInconsistent = responseCode === '4043818' || data.responseMessage === 'Inconsistent Request';
      const isInternalServerError = responseCode === '5003801' || (responseCode.startsWith('500') && data.responseMessage?.includes('Internal Server Error'));
      const isGeneralError = responseCode === '5003800' || data.responseMessage === 'General Error';

      let errorMsg = isSuccess ? undefined : (data.responseMessage || JSON.stringify(data));
      if (isInsufficientFund) {
        errorMsg = `Insufficient Fund: ${data.responseMessage || 'Corporate balance is insufficient for DANA balance disbursement'}`;
      } else if (isDoNotHonor) {
        errorMsg = `Do Not Honor: Payee user does not exist or has been disabled in DANA. Please verify the customer phone number.`;
      } else if (isMissingMandatoryField) {
        errorMsg = `Missing Mandatory Field: ${data.responseMessage || 'Invalid Mandatory Field customerNumber'}. Please retry with correct input.`;
      } else if (isInconsistent) {
        const detail = data.additionalInfo?.resultMsg ? ` (${data.additionalInfo.resultMsg})` : '';
        errorMsg = `Inconsistent Request: ${data.responseMessage || 'Repeat request with inconsistent payload'}${detail}. Please retry transaction properly.`;
      } else if (isInternalServerError) {
        errorMsg = `Internal Server Error: ${data.responseMessage || 'DANA upstream service encountered an internal server error'}. User balance is held pending transaction retry.`;
      } else if (isGeneralError) {
        errorMsg = `General Error: ${data.responseMessage || 'General Error'}. Account balance was not cut.`;
      }

      return {
        success: isSuccess,
        isInsufficientFund,
        isDoNotHonor,
        isMissingMandatoryField,
        isInconsistent,
        isInternalServerError,
        isGeneralError,
        responseCode,
        responseMessage: data.responseMessage,
        partnerReferenceNo,
        referenceNo: data.referenceNo,
        customerNumber: params.customerNumber,
        amount: params.amount,
        rawResponse: data,
        error: errorMsg
      };
    } catch (err: any) {
      console.error('[DanaDisbursementService] disburseToBalance error:', err.message);
      return {
        success: false,
        partnerReferenceNo,
        customerNumber: params.customerNumber,
        amount: params.amount,
        error: err.message
      };
    }
  }

  /**
   * Inquires a DANA user account before disbursement / top-up.
   * SNAP BI Asymmetric Signature over endpoint /rest/v1.0/emoney/account-inquiry.
   */
  public async accountInquiry(params: AccountInquiryParams): Promise<AccountInquiryResult> {
    const partnerReferenceNo = params.partnerReferenceNo || `INQ-${Date.now()}`;
    const externalId = `EXT-INQ-${Date.now()}`;
    const amountVal = params.amount !== undefined ? params.amount : 5;

    const bodyObj: any = {
      partnerReferenceNo,
      customerNumber: params.customerNumber,
      amount: {
        value: `${amountVal.toFixed(2)}`,
        currency: 'IDR'
      },
      additionalInfo: {
        fundType: params.fundType || 'AGENT_TOPUP_FOR_USER_SETTLE'
      }
    };

    try {
      console.log(`[DanaDisbursementService] Inquiring account for DANA customer ${params.customerNumber}...`);
      const { res, data } = await this.dispatcher.executeSnapPost(
        '/rest/v1.0/emoney/account-inquiry',
        bodyObj,
        externalId
      );

      const responseCode = String(data.responseCode || '');
      const isSuccess = res.ok && (responseCode === '2003700' || responseCode.startsWith('200'));
      const isExceedLimit = responseCode === '4033702' || data.responseMessage?.includes('Exceed') || data.additionalInfo?.resultMsg === 'EXCEED_BALANCE_LIMIT';
      const isDoNotHonor = responseCode === '4033705' || data.responseMessage === 'Do Not Honor' || data.additionalInfo?.resultMsg?.startsWith('PAYEE_USER');
      const isUnauthorized = responseCode === '4013700' || res.status === 401 || data.responseMessage?.includes('Unauthorized') || data.responseMessage?.includes('Invalid Signature');

      let errorMsg = isSuccess ? undefined : (data.responseMessage || JSON.stringify(data));
      if (isExceedLimit) {
        errorMsg = `Exceeds Top Up Amount Limit: ${data.responseMessage || 'Amount exceeds maximum top up limit'}`;
      } else if (isDoNotHonor) {
        const reason = data.additionalInfo?.resultMsg === 'PAYEE_USER_STATUS_DISABLE'
          ? 'User account is frozen or disabled'
          : (data.additionalInfo?.resultMsg === 'PAYEE_USER_NOT_EXIST' ? 'User is not registered on DANA' : data.responseMessage);
        errorMsg = `Do Not Honor: ${reason || 'User not registered or account frozen'}`;
      } else if (isUnauthorized) {
        errorMsg = `Unauthorized: ${data.responseMessage || 'Invalid Signature. Please verify SNAP BI RSA keypair credentials.'}`;
      }

      return {
        success: isSuccess,
        responseCode,
        responseMessage: data.responseMessage,
        isExceedLimit,
        isDoNotHonor,
        isUnauthorized,
        partnerReferenceNo,
        customerNumber: params.customerNumber,
        customerName: data.customerName,
        amount: data.amount ? parseFloat(data.amount.value) : amountVal,
        feeAmount: data.feeAmount ? parseFloat(data.feeAmount.value) : undefined,
        feeType: data.feeType,
        customerMonthlyInLimit: data.customerMonthlyInLimit,
        minAmount: data.minAmount ? parseFloat(data.minAmount.value) : undefined,
        maxAmount: data.maxAmount ? parseFloat(data.maxAmount.value) : undefined,
        rawResponse: data,
        error: errorMsg
      };
    } catch (err: any) {
      console.error('[DanaDisbursementService] accountInquiry error:', err.message);
      return {
        success: false,
        partnerReferenceNo,
        customerNumber: params.customerNumber,
        error: err.message
      };
    }
  }

  /**
   * Inquires the status of a previous Disbursement Top-Up transaction.
   * SNAP BI Asymmetric Signature over endpoint /rest/v1.0/emoney/topup-status.
   */
  public async topupStatus(params: TopupStatusParams): Promise<TopupStatusResult> {
    const externalId = `EXT-STAT-${Date.now()}`;

    const bodyObj: any = {
      originalPartnerReferenceNo: params.originalPartnerReferenceNo,
      serviceCode: params.serviceCode || '38',
      additionalInfo: params.additionalInfo || {}
    };

    if (params.originalReferenceNo) {
      bodyObj.originalReferenceNo = params.originalReferenceNo;
    }

    try {
      console.log(`[DanaDisbursementService] Inquiring topup status for ${params.originalPartnerReferenceNo}...`);
      const { res, data } = await this.dispatcher.executeSnapPost(
        '/rest/v1.0/emoney/topup-status',
        bodyObj,
        externalId
      );

      const responseCode = String(data.responseCode || '');
      const isSuccess = res.ok && (responseCode === '2003900' || responseCode.startsWith('200'));
      const isNotFound = responseCode === '4043901' || res.status === 404 || data.responseMessage?.includes('Not Found');
      const isTransactionSuccess = data.latestTransactionStatus === '00' || data.transactionStatusDesc === 'Success';
      const isTransactionFailed = data.latestTransactionStatus === '06' || data.transactionStatusDesc === 'Failed';

      let errorMsg = isSuccess ? undefined : (data.responseMessage || JSON.stringify(data));
      if (isNotFound) {
        errorMsg = `Top Up Not Found: ${data.responseMessage || 'Original transaction reference not found in upstream ledger'}`;
      }

      return {
        success: isSuccess,
        responseCode,
        responseMessage: data.responseMessage,
        isNotFound,
        originalPartnerReferenceNo: params.originalPartnerReferenceNo,
        originalReferenceNo: data.originalReferenceNo || params.originalReferenceNo,
        serviceCode: data.serviceCode || bodyObj.serviceCode,
        latestTransactionStatus: data.latestTransactionStatus,
        transactionStatusDesc: data.transactionStatusDesc,
        isTransactionSuccess,
        isTransactionFailed,
        amount: data.amount ? parseFloat(data.amount.value) : undefined,
        rawResponse: data,
        error: errorMsg
      };
    } catch (err: any) {
      console.error('[DanaDisbursementService] topupStatus error:', err.message);
      return {
        success: false,
        originalPartnerReferenceNo: params.originalPartnerReferenceNo,
        error: err.message
      };
    }
  }

  /**
   * Inquires a bank account before performing a bank transfer disbursement.
   * SNAP BI Asymmetric Signature over endpoint /v1.0/emoney/bank-account-inquiry.htm.
   */
  public async bankAccountInquiry(params: BankAccountInquiryParams): Promise<BankAccountInquiryResult> {
    const partnerReferenceNo = params.partnerReferenceNo || `BANKINQ-${Date.now()}`;
    const externalId = `EXT-BANKINQ-${Date.now()}`;
    const amountVal = params.amount !== undefined ? params.amount : 10000;

    const bodyObj: any = {
      partnerReferenceNo,
      beneficiaryBankCode: params.beneficiaryBankCode,
      beneficiaryAccountNumber: params.beneficiaryAccountNumber,
      amount: {
        value: `${amountVal.toFixed(2)}`,
        currency: params.currency || 'IDR'
      },
      additionalInfo: {
        fundType: params.fundType || 'MERCHANT_WITHDRAW_FOR_CORPORATE',
        beneficiaryBankCode: params.beneficiaryBankCode
      }
    };

    try {
      console.log(`[DanaDisbursementService] Inquiring bank account ${params.beneficiaryBankCode}:${params.beneficiaryAccountNumber}...`);
      const { res, data } = await this.dispatcher.executeSnapPost(
        '/v1.0/emoney/bank-account-inquiry.htm',
        bodyObj,
        externalId
      );

      const responseCode = String(data.responseCode || '');
      const isSuccess = res.ok && (responseCode === '2004200' || responseCode.startsWith('200'));
      const isInsufficientFund = responseCode === '4034214' || data.responseMessage === 'Insufficient Fund';
      const isInactiveAccount = responseCode === '4034218' || data.responseMessage?.includes('Inactive Account');
      const isUnauthorized = responseCode === '4014200' || res.status === 401 || data.responseMessage?.includes('Unauthorized') || data.responseMessage?.includes('Invalid Signature');
      const isInvalidAccount = responseCode === '4044211' || data.responseMessage?.includes('Invalid Card/Account');
      const isInvalidFieldFormat = responseCode === '4004201' || data.responseMessage?.includes('Invalid Field Format');

      let errorMsg = isSuccess ? undefined : (data.responseMessage || JSON.stringify(data));
      if (isInsufficientFund) {
        errorMsg = `Insufficient Fund: ${data.responseMessage || 'Corporate balance is insufficient for bank inquiry/transfer'}. Please top up corporate balance.`;
      } else if (isInactiveAccount) {
        errorMsg = `Inactive Account: ${data.responseMessage || 'Inactive Account Merchant'}. Beneficiary or merchant account is inactive.`;
      } else if (isUnauthorized) {
        errorMsg = `Unauthorized: ${data.responseMessage || 'Unauthorized Invalid Signature'}. Please verify SNAP BI RSA keypair credentials.`;
      } else if (isInvalidAccount) {
        errorMsg = `Invalid Account: ${data.responseMessage || 'Invalid Card/Account/Customer Number/Virtual Account'}. Beneficiary bank account not found or invalid. Please check the account number.`;
      } else if (isInvalidFieldFormat) {
        errorMsg = `Invalid Field Format: ${data.responseMessage || 'Invalid Field Format'}. Please provide proper request values (e.g. amount.currency must be IDR).`;
      }

      return {
        success: isSuccess,
        responseCode,
        responseMessage: data.responseMessage,
        isInsufficientFund,
        isInactiveAccount,
        isUnauthorized,
        isInvalidAccount,
        isInvalidFieldFormat,
        partnerReferenceNo,
        referenceNo: data.referenceNo,
        beneficiaryAccountNumber: data.beneficiaryAccountNumber || params.beneficiaryAccountNumber,
        beneficiaryAccountName: data.beneficiaryAccountName,
        beneficiaryBankCode: data.beneficiaryBankCode || params.beneficiaryBankCode,
        beneficiaryBankName: data.beneficiaryBankName,
        beneficiaryBankShortName: data.beneficiaryBankShortName,
        amount: data.amount ? parseFloat(data.amount.value) : amountVal,
        feeAmount: data.additionalInfo?.feeAmount ? parseFloat(data.additionalInfo.feeAmount.value) : undefined,
        maxAmount: data.additionalInfo?.maxAmount ? parseFloat(data.additionalInfo.maxAmount.value) : undefined,
        rawResponse: data,
        error: errorMsg
      };
    } catch (err: any) {
      console.error('[DanaDisbursementService] bankAccountInquiry error:', err.message);
      return {
        success: false,
        partnerReferenceNo,
        beneficiaryAccountNumber: params.beneficiaryAccountNumber,
        beneficiaryBankCode: params.beneficiaryBankCode,
        error: err.message
      };
    }
  }

  /**
   * Disburses funds directly to a Bank Account (e.g. BCA 014, Mandiri 008, BRI 002).
   * Uses asymmetric RSA-SHA256 signature over the request body hash.
   */
  public async disburseToBank(params: DisburseToBankParams): Promise<DisburseToBankResult> {
    const partnerReferenceNo = params.partnerReferenceNo || `BANK-REF-${Date.now()}`;
    const externalId = `EXT-BANK-${Date.now()}`;

    const bodyObj = {
      partnerReferenceNo,
      beneficiaryAccountNumber: params.beneficiaryAccountNumber,
      beneficiaryBankCode: params.beneficiaryBankCode,
      amount: {
        value: `${params.amount.toFixed(2)}`,
        currency: params.currency || 'IDR'
      },
      additionalInfo: {
        fundType: params.fundType || 'MERCHANT_WITHDRAW_FOR_CORPORATE',
        needNotify: String(params.needNotify ?? false)
      }
    };

    try {
      console.log(`[DanaDisbursementService] Disbursing Rp ${params.amount} to Bank ${params.beneficiaryBankCode} (${params.beneficiaryAccountNumber})...`);
      const { res, data } = await this.dispatcher.executeSnapPost(
        '/v1.0/emoney/transfer-bank.htm',
        bodyObj,
        externalId
      );

      const responseCode = String(data.responseCode || '');
      const isSuccess = responseCode === '2004300' || (res.ok && responseCode.startsWith('200'));
      const isInProgress = responseCode === '2024300' || responseCode.startsWith('202') || res.status === 202;
      const isInconsistent = responseCode === '4044318' || data.responseMessage === 'Inconsistent Request';
      const isInsufficientFund = responseCode === '4034314' || data.responseMessage === 'Insufficient Fund';
      const isInactiveAccount = responseCode === '4034318' || data.responseMessage?.includes('Inactive Account');
      const isInvalidFieldFormat = responseCode === '4004301' || data.responseMessage?.includes('Invalid Field Format');
      const isMissingMandatoryField = responseCode === '4004302' || data.responseMessage?.includes('Mandatory Field');
      const isUnauthorized = responseCode === '4014300' || res.status === 401 || data.responseMessage?.includes('Unauthorized') || data.responseMessage?.includes('Invalid Signature');
      const isGeneralError = responseCode === '5004300' || (res.status === 500 && data.responseMessage?.includes('General Error'));
      const isSuspectedFraud = responseCode === '4034303' || data.responseMessage?.includes('Suspected Fraud');
      const status: 'SUCCESS' | 'IN_PROGRESS' | 'FAILED' = isSuccess
        ? 'SUCCESS'
        : (isInProgress ? 'IN_PROGRESS' : 'FAILED');

      let errorMsg = (isSuccess || isInProgress) ? undefined : (data.responseMessage || JSON.stringify(data));
      if (isInconsistent) {
        const detail = data.additionalInfo?.resultMsg ? ` (${data.additionalInfo.resultMsg})` : '';
        errorMsg = `Inconsistent Request: ${data.responseMessage || 'Repeated request with mismatched parameters'}${detail}`;
      } else if (isInsufficientFund) {
        errorMsg = `Insufficient Fund: ${data.responseMessage || 'Corporate/Partner balance is insufficient for transfer'}`;
      } else if (isInactiveAccount) {
        errorMsg = `Inactive Account: ${data.responseMessage || 'Beneficiary or merchant account is inactive'}`;
      } else if (isInvalidFieldFormat) {
        errorMsg = `Invalid Field Format: ${data.responseMessage || 'Request contained invalid field format. Please provide proper request values (e.g. amount.currency must be IDR).'}`;
      } else if (isMissingMandatoryField) {
        errorMsg = `Missing Mandatory Field: ${data.responseMessage || 'Required parameter missing'}. Please provide proper parameter request.`;
      } else if (isUnauthorized) {
        errorMsg = `Unauthorized: ${data.responseMessage || 'Unauthorized Invalid Signature. Please verify SNAP BI RSA keypair credentials.'}`;
      } else if (isGeneralError) {
        errorMsg = `General Error: ${data.responseMessage || 'General Error'}. Please ask user to retry transaction.`;
      } else if (isSuspectedFraud) {
        errorMsg = `Suspected Fraud: ${data.responseMessage || 'Suspected Fraud'}. Transfer blocked for security compliance. Beneficiary account flagged by risk management.`;
      }

      return {
        success: isSuccess || isInProgress,
        isInProgress,
        isInconsistent,
        isInsufficientFund,
        isInactiveAccount,
        isInvalidFieldFormat,
        isMissingMandatoryField,
        isUnauthorized,
        isGeneralError,
        isSuspectedFraud,
        status,
        responseCode,
        responseMessage: data.responseMessage,
        partnerReferenceNo,
        referenceNo: data.referenceNo || data.referenceNumber,
        transactionDate: data.transactionDate,
        amount: params.amount,
        rawResponse: data,
        error: errorMsg
      };
    } catch (err: any) {
      console.error('[DanaDisbursementService] disburseToBank error:', err.message);
      return {
        success: false,
        isInProgress: false,
        status: 'FAILED',
        partnerReferenceNo,
        amount: params.amount,
        error: err.message
      };
    }
  }
}
