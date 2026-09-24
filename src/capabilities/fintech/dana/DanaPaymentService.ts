import { DanaClient, DanaConfig } from './DanaClient';
import { StoreProfile } from '../../communication/services/StoreProfileService';
import { OrderSettlementStore } from './OrderSettlementStore';
import { DanaSnapDispatcher, ISnapDispatcher } from './DanaSnapDispatcher';
import {
  DanaRefundService,
  DanaCheckoutService,
  DanaConsultPayService,
  DanaDisbursementService,
  DanaSettlementCoordinator
} from './services';
import {
  DanaTokenResponse,
  StoreSettlementParams,
  StoreSettlementResult,
  CreateOrderParams,
  CreateOrderResult,
  DisburseToBalanceParams,
  DisburseToBalanceResult,
  AccountInquiryParams,
  AccountInquiryResult,
  TopupStatusParams,
  TopupStatusResult,
  BankAccountInquiryParams,
  BankAccountInquiryResult,
  DisburseToBankParams,
  DisburseToBankResult,
  PaymentInfoItem,
  ConsultPayParams,
  ConsultPayResult,
  DebitPaymentStatusParams,
  DebitPaymentStatusResult,
  RefundOrderParams,
  RefundOrderResult,
  CancelOrderParams,
  CancelOrderResult,
  SnapErrorCategory,
  SnapClassificationResult
} from './types';

// Re-export all types for 100% backwards compatibility
export * from './types';
export * from './SnapResponseClassifier';
export * from './DanaSnapDispatcher';
export * from './services';

/**
 * Facade for DANA SNAP BI Payment and Settlement services.
 * Orchestrates checkout, direct debit status queries, refunds, disbursements, and store settlements
 * through dedicated modular sub-services while maintaining full backward compatibility.
 */
export class DanaPaymentService implements ISnapDispatcher {
  private snapDispatcher: DanaSnapDispatcher;
  private settlementStore: OrderSettlementStore;
  private refundService: DanaRefundService;
  private checkoutService: DanaCheckoutService;
  private consultPayService: DanaConsultPayService;
  private disbursementService: DanaDisbursementService;
  private settlementCoordinator: DanaSettlementCoordinator;

  constructor(client?: DanaClient, settlementStore?: OrderSettlementStore) {
    this.snapDispatcher = new DanaSnapDispatcher(client);
    this.settlementStore = settlementStore || OrderSettlementStore.getInstance();

    this.refundService = new DanaRefundService(this, this.settlementStore);
    this.checkoutService = new DanaCheckoutService(this, this.settlementStore);
    this.consultPayService = new DanaConsultPayService(this);
    this.disbursementService = new DanaDisbursementService(this);
    this.settlementCoordinator = new DanaSettlementCoordinator(this, this.settlementStore);
  }

  // --- Dispatcher & Config Delegation ---

  public getClient(): DanaClient {
    return this.snapDispatcher.getClient();
  }

  public getConfig(): DanaConfig {
    return this.snapDispatcher.getConfig();
  }

  public getSettlementStore(): OrderSettlementStore {
    return this.settlementStore;
  }

  public getUserTransactionHistory(storeId?: string, destination?: string) {
    return this.settlementStore.getUserTransactionHistory(storeId, destination);
  }

  public getDispatcher(): DanaSnapDispatcher {
    return this.snapDispatcher;
  }

  public getRefundService(): DanaRefundService {
    return this.refundService;
  }

  public getCheckoutService(): DanaCheckoutService {
    return this.checkoutService;
  }

  public getConsultPayService(): DanaConsultPayService {
    return this.consultPayService;
  }

  public getDisbursementService(): DanaDisbursementService {
    return this.disbursementService;
  }

  public getSettlementCoordinator(): DanaSettlementCoordinator {
    return this.settlementCoordinator;
  }

  /**
   * Retrieves a valid B2B Access Token using SNAP BI Asymmetric Signature.
   */
  public async getB2BAccessToken(): Promise<string> {
    return this.snapDispatcher.getB2BAccessToken();
  }

  /**
   * Dispatches a signed SNAP BI Asymmetric POST request to DANA API.
   */
  public async executeSnapPost<T = any>(
    endpointPath: string,
    bodyObj: any,
    externalId?: string,
    customHeaders?: Record<string, string | null | undefined>
  ): Promise<{ res: Response; data: T; timestamp: string }> {
    return this.snapDispatcher.executeSnapPost<T>(endpointPath, bodyObj, externalId, customHeaders);
  }

  // --- Checkout & Direct Debit ---

  /**
   * Generates a DANA QRIS or Checkout URL for user top-up or payments.
   */
  public async createPaymentOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    return this.checkoutService.createPaymentOrder(params);
  }

  /**
   * Requests Create Order via DANA Gapura Hosted Checkout (SNAP BI Direct Debit Host-to-Host).
   */
  public async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    return this.checkoutService.createOrder(params);
  }

  /**
   * Requests Consult Pay to retrieve available payment methods for a given amount.
   */
  public async consultPay(params: ConsultPayParams): Promise<ConsultPayResult> {
    return this.consultPayService.consultPay(params);
  }

  /**
   * Queries payment status for a Direct Debit / Hosted Checkout order.
   */
  public async queryDebitPaymentStatus(params: DebitPaymentStatusParams): Promise<DebitPaymentStatusResult> {
    return this.checkoutService.queryDebitPaymentStatus(params);
  }

  /**
   * Requests Cancel Order for a Direct Debit payment.
   * Endpoint: POST /payment-gateway/v1.0/debit/cancel.htm
   * Returns responseCode 2005700 and marks cancel as successful in SettlementStore.
   */
  public async cancelOrder(params: CancelOrderParams): Promise<CancelOrderResult> {
    return this.checkoutService.cancelOrder(params);
  }

  /**
   * Generates a DANA Account Binding URL for WhatsApp / Web users.
   */
  public generateBindingUrl(userSessionId: string, returnUrl?: string): string {
    return this.checkoutService.generateBindingUrl(userSessionId, returnUrl);
  }

  // --- Refund ---

  /**
   * Requests a refund for a previously paid transaction via SNAP BI Debit Refund.
   */
  public async refundOrder(params: RefundOrderParams): Promise<RefundOrderResult> {
    return this.refundService.refundOrder(params);
  }

  // --- Disbursements & Inquiries ---

  /**
   * Disburses funds to a DANA user account (Customer Top-Up / Send Balance).
   */
  public async disburseToBalance(params: DisburseToBalanceParams): Promise<DisburseToBalanceResult> {
    return this.disbursementService.disburseToBalance(params);
  }

  /**
   * Inquires a DANA user account before disbursement / top-up.
   */
  public async accountInquiry(params: AccountInquiryParams): Promise<AccountInquiryResult> {
    return this.disbursementService.accountInquiry(params);
  }

  /**
   * Inquires the status of a previous Disbursement Top-Up transaction.
   */
  public async topupStatus(params: TopupStatusParams): Promise<TopupStatusResult> {
    return this.disbursementService.topupStatus(params);
  }

  /**
   * Inquires a bank account before performing a bank transfer disbursement.
   */
  public async bankAccountInquiry(params: BankAccountInquiryParams): Promise<BankAccountInquiryResult> {
    return this.disbursementService.bankAccountInquiry(params);
  }

  /**
   * Disburses funds directly to a Bank Account (e.g. BCA 014, Mandiri 008, BRI 002).
   */
  public async disburseToBank(params: DisburseToBankParams): Promise<DisburseToBankResult> {
    return this.disbursementService.disburseToBank(params);
  }

  // --- Settlement & Retries ---

  /**
   * Automatically calculates and settles merchant payout for a completed order.
   */
  public async settleStoreOrder(params: StoreSettlementParams): Promise<StoreSettlementResult> {
    return this.settlementCoordinator.settleStoreOrder(params);
  }

  /**
   * Retries all previously failed settlements for a store.
   */
  public async retryFailedSettlements(store: StoreProfile): Promise<StoreSettlementResult[]> {
    return this.settlementCoordinator.retryFailedSettlements(store);
  }
}
