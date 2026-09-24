import fs from 'fs';
import path from 'path';

export interface OrderSettlementRecord {
  orderId: string;
  storeId: string;
  storeName: string;
  grossAmount: number;
  platformFee: number;
  netPayout: number;
  payoutMethod: 'DANA' | 'BANK' | 'UNCONFIGURED';
  destination: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'REFUNDED' | 'CANCELLED';
  partnerReferenceNo?: string;
  referenceNo?: string;
  error?: string;
  settledAt: number;
  attempts?: number;
  lastAttemptAt?: number;
  refundDetails?: {
    refundNo?: string;
    partnerRefundNo?: string;
    refundAmount?: number;
    refundedAt?: number;
    reason?: string;
    status?: 'SUCCESS' | 'PENDING' | 'FAILED';
    error?: string;
  };
  cancelDetails?: {
    cancelTime?: string;
    reason?: string;
    cancelledAt?: number;
    status?: 'SUCCESS' | 'PENDING' | 'FAILED';
    error?: string;
  };
}

export interface OrderSettlementStoreOptions {
  persistLocally?: boolean;
  storageFilePath?: string;
}

/**
 * OrderSettlementStore — Idempotency ledger and audit store for marketplace merchant payouts.
 * Prevents double-disbursement on webhook retries and tracks settlement history.
 *
 * Conforms to Rule 7 (Universal Codebase Language: English Standard).
 */
export class OrderSettlementStore {
  private static instance: OrderSettlementStore | null = null;
  private readonly records = new Map<string, OrderSettlementRecord>();
  private readonly filePath: string;
  private readonly persistLocally: boolean;

  constructor(options: OrderSettlementStoreOptions = {}) {
    this.persistLocally = options.persistLocally ?? true;
    this.filePath = options.storageFilePath || path.resolve(process.cwd(), '.data', 'order_settlements.json');
    this.loadRecords();
  }

  public static getInstance(options?: OrderSettlementStoreOptions): OrderSettlementStore {
    if (!OrderSettlementStore.instance) {
      OrderSettlementStore.instance = new OrderSettlementStore(options);
    }
    return OrderSettlementStore.instance;
  }

  private loadRecords(): void {
    if (!this.persistLocally) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.orderId) {
              this.records.set(item.orderId, item);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[OrderSettlementStore] Failed to load local settlement records:', err.message);
    }
  }

  private saveRecords(): void {
    if (!this.persistLocally) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.records.values());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('[OrderSettlementStore] Failed to persist settlement records:', err.message);
    }
  }

  /**
   * Checks if an order has already been successfully disbursed.
   */
  public hasBeenSettled(orderId: string): boolean {
    const rec = this.records.get(orderId);
    return rec !== undefined && rec.status === 'SUCCESS';
  }

  /**
   * Retrieves settlement record by order ID.
   */
  public getSettlement(orderId: string): OrderSettlementRecord | undefined {
    return this.records.get(orderId);
  }

  /**
   * Records or updates a settlement transaction in the ledger.
   */
  public recordSettlement(record: OrderSettlementRecord): void {
    const existing = this.records.get(record.orderId);
    const attempts = (existing?.attempts || 0) + 1;
    const updated: OrderSettlementRecord = {
      ...record,
      attempts,
      lastAttemptAt: Date.now()
    };
    this.records.set(record.orderId, updated);
    this.saveRecords();
  }

  /**
   * Lists all settlements for a specific merchant store.
   * By default, returns all transactions recorded for the store.
   */
  public listStoreSettlements(storeId: string, options?: { includeFailed?: boolean }): OrderSettlementRecord[] {
    return Array.from(this.records.values()).filter((r) => {
      if (r.storeId !== storeId) return false;
      if (options?.includeFailed === false && r.status === 'FAILED') return false;
      return true;
    });
  }

  /**
   * Retrieves visible transaction history for end-users.
   * In compliance with DANA Partner Action requirements:
   * "Transaction marked as FAILED, user can't see any transaction in history page"
   * Only SUCCESS, CANCELLED, or REFUNDED transactions are shown to users;
   * Orders that FAILED at checkout or authorization are excluded from the history page.
   */
  public getUserTransactionHistory(storeId?: string, destination?: string): OrderSettlementRecord[] {
    return Array.from(this.records.values()).filter((r) => {
      if (r.status === 'FAILED') return false;
      if (storeId && r.storeId !== storeId) return false;
      if (destination && r.destination !== destination) return false;
      return true;
    });
  }

  /**
   * Retrieves pending or failed settlements eligible for retry.
   */
  public getFailedSettlements(storeId?: string): OrderSettlementRecord[] {
    return Array.from(this.records.values()).filter((r) => {
      if (r.status !== 'FAILED') return false;
      if (storeId && r.storeId !== storeId) return false;
      return true;
    });
  }

  /**
   * Finds settlement record by partnerReferenceNo or referenceNo.
   */
  public findSettlementByReference(reference: string): OrderSettlementRecord | undefined {
    for (const rec of this.records.values()) {
      if (rec.partnerReferenceNo === reference || rec.referenceNo === reference || rec.orderId === reference) {
        return rec;
      }
    }
    return undefined;
  }

  /**
   * Updates settlement status (e.g. from PENDING to SUCCESS upon receiving disburse webhook).
   */
  public updateSettlementStatus(
    reference: string,
    status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'REFUNDED',
    details?: { referenceNo?: string; error?: string }
  ): OrderSettlementRecord | undefined {
    const rec = this.findSettlementByReference(reference);
    if (!rec) return undefined;

    rec.status = status;
    if (details?.referenceNo) rec.referenceNo = details.referenceNo;
    if (details?.error !== undefined) rec.error = details.error;
    rec.lastAttemptAt = Date.now();
    this.records.set(rec.orderId, rec);
    this.saveRecords();
    return rec;
  }

  /**
   * Records or marks an order as refunded in the ledger.
   * Enables users to view refunded transactions in transaction history.
   */
  public recordRefund(
    reference: string,
    refundDetails: {
      refundNo?: string;
      partnerRefundNo?: string;
      refundAmount?: number;
      reason?: string;
      status?: 'SUCCESS' | 'PENDING' | 'FAILED';
      error?: string;
    },
    refundStatus: 'SUCCESS' | 'PENDING' | 'FAILED' | boolean = 'SUCCESS'
  ): OrderSettlementRecord | undefined {
    const rec = this.findSettlementByReference(reference);
    if (!rec) return undefined;

    const normalizedStatus: 'SUCCESS' | 'PENDING' | 'FAILED' =
      typeof refundStatus === 'boolean'
        ? (refundStatus ? 'PENDING' : 'SUCCESS')
        : refundStatus;

    if (normalizedStatus === 'SUCCESS') {
      rec.status = 'REFUNDED';
    } else if (normalizedStatus === 'PENDING') {
      rec.status = 'PENDING';
    }
    // If FAILED: retain original payment status (e.g. SUCCESS), but record refundDetails with status 'FAILED' and error
    rec.refundDetails = {
      ...refundDetails,
      status: normalizedStatus,
      refundedAt: Date.now()
    };
    rec.lastAttemptAt = Date.now();
    this.records.set(rec.orderId, rec);
    this.saveRecords();
    return rec;
  }

  /**
   * Records or marks an order as cancelled in the ledger.
   * Enables users to view cancelled transactions in transaction history.
   */
  public recordCancel(
    reference: string,
    cancelDetails: {
      cancelTime?: string;
      reason?: string;
      status?: 'SUCCESS' | 'PENDING' | 'FAILED';
      error?: string;
    },
    cancelStatus: 'SUCCESS' | 'PENDING' | 'FAILED' = 'SUCCESS'
  ): OrderSettlementRecord | undefined {
    let rec = this.findSettlementByReference(reference);
    if (!rec) {
      // Record new settlement placeholder if not yet tracked
      this.recordSettlement({
        orderId: reference,
        storeId: 'DEFAULT',
        storeName: 'Platform Store',
        grossAmount: 0,
        platformFee: 0,
        netPayout: 0,
        payoutMethod: 'DANA',
        destination: 'N/A',
        status: cancelStatus === 'SUCCESS' ? 'CANCELLED' : (cancelStatus === 'PENDING' ? 'PENDING' : 'FAILED'),
        partnerReferenceNo: reference,
        settledAt: Date.now()
      });
      rec = this.findSettlementByReference(reference);
    }
    if (!rec) return undefined;

    if (cancelStatus === 'SUCCESS') {
      rec.status = 'CANCELLED';
    } else if (cancelStatus === 'PENDING') {
      rec.status = 'PENDING';
    }
    rec.cancelDetails = {
      ...cancelDetails,
      cancelledAt: Date.now(),
      status: cancelStatus
    };
    rec.lastAttemptAt = Date.now();
    this.records.set(rec.orderId, rec);
    this.saveRecords();
    return rec;
  }

  /**
   * Clears in-memory records (useful for test isolation).
   */
  public clear(): void {
    this.records.clear();
  }
}
