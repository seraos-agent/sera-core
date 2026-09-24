import { StoreProfile } from '../../communication/services/StoreProfileService';

export type SnapErrorCategory =
  | 'SUCCESS'
  | 'IN_PROGRESS'
  | 'UNAUTHORIZED'
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export interface SnapClassificationResult {
  category: SnapErrorCategory;
  isSuccess: boolean;
  isInProgress: boolean;
  isUnauthorized: boolean;
  isNotFound: boolean;
  isForbidden: boolean;
  isValidationError: boolean;
  isServerError: boolean;
  reasonCode?: string;
  userFacingMessage?: string;
}

export interface DanaTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: number;
}

export interface StoreSettlementParams {
  store: StoreProfile;
  grossAmount: number;
  orderId: string;
  customFeePercent?: number;
  note?: string;
}

export interface StoreSettlementResult {
  success: boolean;
  status?: 'SUCCESS' | 'IN_PROGRESS' | 'FAILED';
  isInProgress?: boolean;
  isInconsistent?: boolean;
  isInsufficientFund?: boolean;
  isInactiveAccount?: boolean;
  isInvalidFieldFormat?: boolean;
  isMissingMandatoryField?: boolean;
  isDoNotHonor?: boolean;
  isInternalServerError?: boolean;
  isGeneralError?: boolean;
  isUnauthorized?: boolean;
  isSuspectedFraud?: boolean;
  responseCode?: string;
  responseMessage?: string;
  orderId: string;
  storeId: string;
  storeName: string;
  grossAmount: number;
  platformFee: number;
  netPayout: number;
  payoutMethod: 'DANA' | 'BANK' | 'UNCONFIGURED';
  destination: string;
  partnerReferenceNo?: string;
  referenceNo?: string;
  isDuplicate?: boolean;
  error?: string;
}

export interface CreateOrderParams {
  orderId?: string;
  partnerReferenceNo?: string;
  amount: number;
  amountValueOverride?: string;
  currency?: string;
  title?: string;
  userSessionId?: string;
  returnUrl?: string;
  notifyUrl?: string;
  validUpTo?: string;
  buyerExternalUserId?: string;
  mcc?: string;
  storeId?: string;
  storeName?: string;
  headers?: Record<string, string | null | undefined>;
  endpoint?: string;
}

export interface CreateOrderResult {
  success: boolean;
  responseCode?: string;
  responseMessage?: string;
  orderId: string;
  partnerReferenceNo: string;
  referenceNo?: string;
  webRedirectUrl?: string;
  checkoutUrl?: string;
  qrCodeUrl?: string;
  qrContent?: string;
  isUnauthorized?: boolean;
  isMissingMandatoryField?: boolean;
  isInvalidFieldFormat?: boolean;
  isInconsistent?: boolean;
  isExceedLimit?: boolean;
  isTransactionNotPermitted?: boolean;
  isInvalidMerchant?: boolean;
  isGeneralError?: boolean;
  isInternalServerError?: boolean;
  rawResponse?: any;
  error?: string;
}

export interface DisburseToBalanceParams {
  customerNumber?: string;
  amount: number;
  feeAmount?: number;
  partnerReferenceNo?: string;
  fundType?: string;
}

export interface DisburseToBalanceResult {
  success: boolean;
  responseCode?: string;
  responseMessage?: string;
  isInsufficientFund?: boolean;
  isDoNotHonor?: boolean;
  isMissingMandatoryField?: boolean;
  isInconsistent?: boolean;
  isInternalServerError?: boolean;
  isGeneralError?: boolean;
  partnerReferenceNo: string;
  referenceNo?: string;
  customerNumber?: string;
  amount: number;
  rawResponse?: any;
  error?: string;
}

export interface AccountInquiryParams {
  customerNumber: string;
  amount?: number;
  partnerReferenceNo?: string;
  fundType?: string;
}

export interface AccountInquiryResult {
  success: boolean;
  responseCode?: string;
  responseMessage?: string;
  isExceedLimit?: boolean;
  isDoNotHonor?: boolean;
  isUnauthorized?: boolean;
  partnerReferenceNo: string;
  customerNumber: string;
  customerName?: string;
  amount?: number;
  feeAmount?: number;
  feeType?: string;
  customerMonthlyInLimit?: string;
  minAmount?: number;
  maxAmount?: number;
  rawResponse?: any;
  error?: string;
}

export interface TopupStatusParams {
  originalPartnerReferenceNo: string;
  originalReferenceNo?: string;
  serviceCode?: string;
  additionalInfo?: Record<string, any>;
}

export interface TopupStatusResult {
  success: boolean;
  responseCode?: string;
  responseMessage?: string;
  isNotFound?: boolean;
  originalPartnerReferenceNo: string;
  originalReferenceNo?: string;
  serviceCode?: string;
  latestTransactionStatus?: string;
  transactionStatusDesc?: string;
  isTransactionSuccess?: boolean;
  isTransactionFailed?: boolean;
  amount?: number;
  rawResponse?: any;
  error?: string;
}

export interface BankAccountInquiryParams {
  beneficiaryAccountNumber: string;
  beneficiaryBankCode: string;
  amount?: number;
  currency?: string;
  partnerReferenceNo?: string;
  fundType?: string;
}

export interface BankAccountInquiryResult {
  success: boolean;
  responseCode?: string;
  responseMessage?: string;
  isInsufficientFund?: boolean;
  isInactiveAccount?: boolean;
  isUnauthorized?: boolean;
  isInvalidAccount?: boolean;
  isInvalidFieldFormat?: boolean;
  partnerReferenceNo: string;
  referenceNo?: string;
  beneficiaryAccountNumber: string;
  beneficiaryAccountName?: string;
  beneficiaryBankCode: string;
  beneficiaryBankName?: string;
  beneficiaryBankShortName?: string;
  amount?: number;
  feeAmount?: number;
  maxAmount?: number;
  rawResponse?: any;
  error?: string;
}

export interface DisburseToBankParams {
  beneficiaryAccountNumber: string;
  beneficiaryBankCode: string;
  amount: number;
  currency?: string;
  partnerReferenceNo?: string;
  fundType?: string;
  needNotify?: boolean;
}

export interface DisburseToBankResult {
  success: boolean;
  isInProgress?: boolean;
  isInconsistent?: boolean;
  isInsufficientFund?: boolean;
  isInactiveAccount?: boolean;
  isInvalidFieldFormat?: boolean;
  isMissingMandatoryField?: boolean;
  isUnauthorized?: boolean;
  isGeneralError?: boolean;
  isSuspectedFraud?: boolean;
  status: 'SUCCESS' | 'IN_PROGRESS' | 'FAILED';
  responseCode?: string;
  responseMessage?: string;
  partnerReferenceNo: string;
  referenceNo?: string;
  transactionDate?: string;
  amount: number;
  rawResponse?: any;
  error?: string;
}

export interface PaymentInfoItem {
  payMethod: string;
  payOption?: string;
}

export interface ConsultPayParams {
  amount: number;
  currency?: string;
  merchantId?: string;
  partnerReferenceNo?: string;
  title?: string;
  headers?: Record<string, string | null | undefined>;
}

export interface ConsultPayResult {
  success: boolean;
  responseCode?: string;
  responseMessage?: string;
  paymentInfos: PaymentInfoItem[];
  isUnauthorized?: boolean;
  rawResponse?: any;
  error?: string;
}

export interface DebitPaymentStatusParams {
  merchantId?: string;
  originalPartnerReferenceNo?: string;
  originalReferenceNo?: string;
  serviceCode?: string;
  amount?: number;
  currency?: string;
  headers?: Record<string, string | null | undefined>;
}

export interface DebitPaymentStatusResult {
  success: boolean;
  responseCode?: string;
  responseMessage?: string;
  originalPartnerReferenceNo?: string;
  originalReferenceNo?: string;
  serviceCode?: string;
  latestTransactionStatus?: string;
  transactionStatusDesc?: string;
  isPaid?: boolean;
  isPending?: boolean;
  isClosed?: boolean;
  isFailed?: boolean;
  isMissingMandatoryField?: boolean;
  isUnauthorized?: boolean;
  amount?: number;
  currency?: string;
  rawResponse?: any;
  error?: string;
}

export interface RefundOrderParams {
  merchantId?: string;
  originalPartnerReferenceNo: string;
  refundAmount: number;
  amountValueOverride?: string;
  partnerRefundNo?: string;
  originalReferenceNo?: string;
  reason?: string;
  currency?: string;
  headers?: Record<string, string | null | undefined>;
}

export interface RefundOrderResult {
  success: boolean;
  responseCode?: string;
  responseMessage?: string;
  originalPartnerReferenceNo?: string;
  originalReferenceNo?: string;
  partnerRefundNo?: string;
  refundNo?: string;
  refundAmount?: number;
  currency?: string;
  refundTime?: string;
  serviceCode?: string;
  isRefundSuccess?: boolean;
  isInProgress?: boolean;
  isNotFound?: boolean;
  isInvalidStatus?: boolean;
  isUnauthorized?: boolean;
  isMissingMandatoryField?: boolean;
  isTransactionNotPermitted?: boolean;
  isInconsistentRequest?: boolean;
  isInsufficientFunds?: boolean;
  isInternalServerError?: boolean;
  isMerchantStatusAbnormal?: boolean;
  rawResponse?: any;
  error?: string;
}

export interface CancelOrderParams {
  merchantId?: string;
  subMerchantId?: string;
  partnerReferenceNo?: string;
  originalPartnerReferenceNo: string;
  originalReferenceNo?: string;
  originalExternalId?: string;
  externalStoreId?: string;
  reason?: string;
  amount: number;
  amountValueOverride?: string;
  currency?: string;
  additionalInfo?: Record<string, any>;
  headers?: Record<string, string | null | undefined>;
}

export interface CancelOrderResult {
  success: boolean;
  responseCode?: string;
  responseMessage?: string;
  originalPartnerReferenceNo?: string;
  originalReferenceNo?: string;
  partnerReferenceNo?: string;
  cancelTime?: string;
  isCancelSuccess?: boolean;
  isInProgress?: boolean;
  isNotFound?: boolean;
  isInvalidStatus?: boolean;
  isUnauthorized?: boolean;
  isMissingMandatoryField?: boolean;
  isDoNotHonor?: boolean;
  isInvalidMerchant?: boolean;
  isTransactionExpired?: boolean;
  isTransactionNotPermitted?: boolean;
  isInsufficientFunds?: boolean;
  isInternalServerError?: boolean;
  isCancelFailed?: boolean;
  rawResponse?: any;
  error?: string;
}
