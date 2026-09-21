import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DanaClient, DanaConfig } from './DanaClient';
import { StoreProfile } from '../../communication/services/StoreProfileService';
import { OrderSettlementStore, OrderSettlementRecord } from './OrderSettlementStore';

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
  orderId: string;
  amount: number;
  title: string;
  userSessionId?: string;
  returnUrl?: string;
}

export interface CreateOrderResult {
  success: boolean;
  orderId: string;
  checkoutUrl?: string;
  qrCodeUrl?: string;
  qrContent?: string;
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

export class DanaPaymentService {
  private client: DanaClient;
  private cachedToken: DanaTokenResponse | null = null;
  private readonly tokenFilePath = path.join(process.cwd(), '.data', 'dana_b2b_token.json');
  private settlementStore: OrderSettlementStore;

  constructor(client?: DanaClient, settlementStore?: OrderSettlementStore) {
    this.client = client || new DanaClient();
    this.settlementStore = settlementStore || OrderSettlementStore.getInstance();
  }

  public getClient(): DanaClient {
    return this.client;
  }

  public getSettlementStore(): OrderSettlementStore {
    return this.settlementStore;
  }

  /**
   * Retrieves a valid B2B Access Token using SNAP BI Asymmetric Signature.
   * Caches token in memory and on disk until 60 seconds before expiration to prevent rate limiting.
   */
  public async getB2BAccessToken(): Promise<string> {
    const now = Date.now();

    // 1. Check in-memory cache
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60000) {
      return this.cachedToken.accessToken;
    }

    // 2. Check disk cache
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const fileContent = JSON.parse(fs.readFileSync(this.tokenFilePath, 'utf8'));
        if (fileContent && fileContent.expiresAt > now + 60000) {
          this.cachedToken = fileContent;
          console.log('[DanaPaymentService] Reusing active B2B Access Token from cache.');
          return (this.cachedToken as DanaTokenResponse).accessToken;
        }
      }
    } catch {}

    // 3. Request fresh token from DANA
    const config = this.client.getConfig();
    const timestamp = this.client.getTimestamp();
    const signature = this.client.generateAsymmetricSignature(timestamp);

    const endpoint = `${config.baseUrl}/v1.0/access-token/b2b.htm`;
    console.log(`[DanaPaymentService] Requesting B2B Access Token from: ${endpoint}`);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TIMESTAMP': timestamp,
        'X-CLIENT-KEY': config.clientId,
        'X-SIGNATURE': signature,
      },
      body: JSON.stringify({
        grantType: 'client_credentials'
      })
    });

    const data = await res.json();
    if (!res.ok || (data.responseCode && !data.responseCode.startsWith('200'))) {
      const errMsg = data.responseMessage || data.error_description || JSON.stringify(data);
      throw new Error(`[DanaPaymentService] Failed to obtain B2B Access Token (${res.status}): ${errMsg}`);
    }

    const expiresIn = Number(data.expiresIn || 900);
    this.cachedToken = {
      accessToken: data.accessToken,
      tokenType: data.tokenType || 'Bearer',
      expiresIn,
      expiresAt: now + (expiresIn * 1000)
    };

    // Save to disk cache
    try {
      const dir = path.dirname(this.tokenFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.tokenFilePath, JSON.stringify(this.cachedToken, null, 2), 'utf8');
    } catch {}

    console.log('[DanaPaymentService] B2B Access Token successfully acquired and cached.');
    return this.cachedToken.accessToken;
  }

  /**
   * Generates a DANA QRIS or Checkout URL for user top-up or payments.
   */
  public async createPaymentOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    try {
      const config = this.client.getConfig();
      const b2bToken = await this.getB2BAccessToken();
      const timestamp = this.client.getTimestamp();

      const returnUrl = params.returnUrl || 'https://api.seraos.xyz/api/dana/callback';
      const notifyUrl = 'https://api.seraos.xyz/api/dana/notify';

      // Standard SNAP MPM QR / Order generation payload
      const payload: any = {
        partnerReferenceNo: params.orderId,
        amount: {
          value: `${params.amount.toFixed(2)}`,
          currency: 'IDR'
        },
        merchantId: config.merchantId,
        terminalId: 'SERA_TERM_01',
        validityPeriod: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 mins TTL
        additionalInfo: {
          title: params.title,
          userSessionId: params.userSessionId,
          returnUrl,
          notifyUrl
        }
      };

      // Hash body with SHA-256 for symmetric signature
      const bodyJson = JSON.stringify(payload);
      const bodyHash = crypto.createHash('sha256').update(bodyJson, 'utf8').digest('hex').toLowerCase();

      // String to sign: POST:/v1.0/qr/qr-mpm-generate.htm:{b2bToken}:{bodyHash}:{timestamp}
      const stringToSign = `POST:/v1.0/qr/qr-mpm-generate.htm:${b2bToken}:${bodyHash}:${timestamp}`;
      const hmac = crypto.createHmac('sha512', config.clientSecret);
      hmac.update(stringToSign, 'utf8');
      const signature = hmac.digest('base64');

      const endpoint = `${config.baseUrl}/v1.0/qr/qr-mpm-generate.htm`;
      console.log(`[DanaPaymentService] Generating Payment Order: ${params.orderId} (Rp ${params.amount})`);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${b2bToken}`,
          'X-TIMESTAMP': timestamp,
          'X-SIGNATURE': signature,
          'X-PARTNER-ID': config.merchantId,
          'X-EXTERNAL-ID': params.orderId,
          'CHANNEL-ID': '95221'
        },
        body: bodyJson
      });

      const data = await res.json();
      const isSuccess = res.ok && (data.responseCode === '2004700' || data.responseCode?.startsWith('200'));

      return {
        success: isSuccess,
        orderId: params.orderId,
        qrCodeUrl: data.qrUrl || data.qrImage || undefined,
        qrContent: data.qrContent || data.qrString || undefined,
        checkoutUrl: data.checkoutUrl || data.webUrl || undefined,
        rawResponse: data,
        error: isSuccess ? undefined : (data.responseMessage || JSON.stringify(data))
      };
    } catch (err: any) {
      console.error('[DanaPaymentService] createPaymentOrder exception:', err.message);
      return {
        success: false,
        orderId: params.orderId,
        error: err.message
      };
    }
  }

  /**
   * Generates a DANA Account Binding URL for WhatsApp / Web users.
   */
  public generateBindingUrl(userSessionId: string, returnUrl?: string): string {
    const config = this.client.getConfig();
    const effectiveReturn = encodeURIComponent(returnUrl || 'https://api.seraos.xyz/api/dana/callback');
    const state = encodeURIComponent(`sess_${userSessionId}_${Date.now()}`);

    // DANA OAuth Authorization URL
    const authBase = config.env === 'production'
      ? 'https://m.dana.id'
      : 'https://m.sandbox.dana.id';

    return `${authBase}/d/portal/oauth?clientId=${config.clientId}&scopes=QUERY_BALANCE,PAYMENT,DIRECT_DEBIT&state=${state}&redirectUrl=${effectiveReturn}`;
  }

  /**
   * Disburses funds to a DANA user account (Customer Top-Up / Send Balance).
   * Uses asymmetric RSA-SHA256 signature over the request body hash.
   */
  public async disburseToBalance(params: DisburseToBalanceParams): Promise<DisburseToBalanceResult> {
    const config = this.client.getConfig();
    const endpointPath = '/rest/v1.0/emoney/topup';
    const url = `${config.baseUrl}${endpointPath}`;
    const timestamp = this.client.getTimestamp();
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

    const bodyJson = JSON.stringify(bodyObj);
    const bodyHash = crypto.createHash('sha256').update(bodyJson, 'utf8').digest('hex').toLowerCase();

    // String to Sign: HTTPMethod + ":" + EndpointUrl + ":" + LowercaseHex(SHA256(Body)) + ":" + Timestamp
    const stringToSign = `POST:${endpointPath}:${bodyHash}:${timestamp}`;
    const pemKey = DanaClient.formatKeyToPem(config.privateKey, 'RSA PRIVATE');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(stringToSign, 'utf8');
    signer.end();
    const signature = signer.sign(pemKey, 'base64');

    const headers = {
      'Content-Type': 'application/json',
      'X-TIMESTAMP': timestamp,
      'X-SIGNATURE': signature,
      'X-PARTNER-ID': config.clientId,
      'X-EXTERNAL-ID': externalId,
      'CHANNEL-ID': '95221'
    };

    try {
      console.log(`[DanaPaymentService] Disbursing Rp ${params.amount} to DANA customer ${params.customerNumber || 'N/A'}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyJson
      });

      const data = await res.json();
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
      console.error('[DanaPaymentService] disburseToBalance error:', err.message);
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
    const config = this.client.getConfig();
    const endpointPath = '/rest/v1.0/emoney/account-inquiry';
    const url = `${config.baseUrl}${endpointPath}`;
    const timestamp = this.client.getTimestamp();
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

    const bodyJson = JSON.stringify(bodyObj);
    const bodyHash = crypto.createHash('sha256').update(bodyJson, 'utf8').digest('hex').toLowerCase();

    const stringToSign = `POST:${endpointPath}:${bodyHash}:${timestamp}`;
    const pemKey = DanaClient.formatKeyToPem(config.privateKey, 'RSA PRIVATE');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(stringToSign, 'utf8');
    signer.end();
    const signature = signer.sign(pemKey, 'base64');

    const headers = {
      'Content-Type': 'application/json',
      'X-TIMESTAMP': timestamp,
      'X-SIGNATURE': signature,
      'X-PARTNER-ID': config.clientId,
      'X-EXTERNAL-ID': externalId,
      'CHANNEL-ID': '95221'
    };

    try {
      console.log(`[DanaPaymentService] Inquiring account for DANA customer ${params.customerNumber}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyJson
      });

      const data = await res.json();
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
      console.error('[DanaPaymentService] accountInquiry error:', err.message);
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
    const config = this.client.getConfig();
    const endpointPath = '/rest/v1.0/emoney/topup-status';
    const url = `${config.baseUrl}${endpointPath}`;
    const timestamp = this.client.getTimestamp();
    const externalId = `EXT-STAT-${Date.now()}`;

    const bodyObj: any = {
      originalPartnerReferenceNo: params.originalPartnerReferenceNo,
      serviceCode: params.serviceCode || '38',
      additionalInfo: params.additionalInfo || {}
    };

    if (params.originalReferenceNo) {
      bodyObj.originalReferenceNo = params.originalReferenceNo;
    }

    const bodyJson = JSON.stringify(bodyObj);
    const bodyHash = crypto.createHash('sha256').update(bodyJson, 'utf8').digest('hex').toLowerCase();

    const stringToSign = `POST:${endpointPath}:${bodyHash}:${timestamp}`;
    const pemKey = DanaClient.formatKeyToPem(config.privateKey, 'RSA PRIVATE');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(stringToSign, 'utf8');
    signer.end();
    const signature = signer.sign(pemKey, 'base64');

    const headers = {
      'Content-Type': 'application/json',
      'X-TIMESTAMP': timestamp,
      'X-SIGNATURE': signature,
      'X-PARTNER-ID': config.clientId,
      'X-EXTERNAL-ID': externalId,
      'CHANNEL-ID': '95221'
    };

    try {
      console.log(`[DanaPaymentService] Inquiring topup status for ${params.originalPartnerReferenceNo}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyJson
      });

      const data = await res.json();
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
      console.error('[DanaPaymentService] topupStatus error:', err.message);
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
    const config = this.client.getConfig();
    const endpointPath = '/v1.0/emoney/bank-account-inquiry.htm';
    const url = `${config.baseUrl}${endpointPath}`;
    const timestamp = this.client.getTimestamp();
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

    const bodyJson = JSON.stringify(bodyObj);
    const bodyHash = crypto.createHash('sha256').update(bodyJson, 'utf8').digest('hex').toLowerCase();

    const stringToSign = `POST:${endpointPath}:${bodyHash}:${timestamp}`;
    const pemKey = DanaClient.formatKeyToPem(config.privateKey, 'RSA PRIVATE');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(stringToSign, 'utf8');
    signer.end();
    const signature = signer.sign(pemKey, 'base64');

    const headers = {
      'Content-Type': 'application/json',
      'X-TIMESTAMP': timestamp,
      'X-SIGNATURE': signature,
      'X-PARTNER-ID': config.clientId,
      'X-EXTERNAL-ID': externalId,
      'CHANNEL-ID': '95221'
    };

    try {
      console.log(`[DanaPaymentService] Inquiring bank account ${params.beneficiaryBankCode}:${params.beneficiaryAccountNumber}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyJson
      });

      const data = await res.json();
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
      console.error('[DanaPaymentService] bankAccountInquiry error:', err.message);
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
    const config = this.client.getConfig();
    const endpointPath = '/v1.0/emoney/transfer-bank.htm';
    const url = `${config.baseUrl}${endpointPath}`;
    const timestamp = this.client.getTimestamp();
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

    const bodyJson = JSON.stringify(bodyObj);
    const bodyHash = crypto.createHash('sha256').update(bodyJson, 'utf8').digest('hex').toLowerCase();

    // SNAP BI Asymmetric Signature for Transaction:
    // String to Sign: HTTPMethod + ":" + EndpointUrl + ":" + LowercaseHex(SHA256(Body)) + ":" + Timestamp
    const stringToSign = `POST:${endpointPath}:${bodyHash}:${timestamp}`;
    const pemKey = DanaClient.formatKeyToPem(config.privateKey, 'RSA PRIVATE');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(stringToSign, 'utf8');
    signer.end();
    const signature = signer.sign(pemKey, 'base64');

    const headers = {
      'Content-Type': 'application/json',
      'X-TIMESTAMP': timestamp,
      'X-SIGNATURE': signature,
      'X-PARTNER-ID': config.clientId,
      'X-EXTERNAL-ID': externalId,
      'CHANNEL-ID': '95221'
    };

    try {
      console.log(`[DanaPaymentService] Disbursing Rp ${params.amount} to Bank ${params.beneficiaryBankCode} (${params.beneficiaryAccountNumber})...`);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyJson
      });

      const data = await res.json();
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
      console.error('[DanaPaymentService] disburseToBank error:', err.message);
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
        console.warn(`[DanaPaymentService] ${errorMsg}`);
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
        console.log(`[DanaPaymentService] Order ${orderId} has already been settled. Skipping duplicate payout.`);
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

      console.log(`[DanaPaymentService] Auto-settling order ${orderId} for "${store.storeName}": Gross Rp ${grossAmount}, Fee Rp ${platformFee}, Net Rp ${netPayout} -> DANA ${danaNumber}`);

      const disburseRes = await this.disburseToBalance({
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

      console.log(`[DanaPaymentService] Auto-settling order ${orderId} for "${store.storeName}": Gross Rp ${grossAmount}, Fee Rp ${platformFee}, Net Rp ${netPayout} -> Bank ${bank.bankCode}:${bank.accountNumber}`);

      const bankRes = await this.disburseToBank({
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

    console.log(`[DanaPaymentService] Retrying ${failed.length} failed settlement(s) for store "${store.storeName}"...`);
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
