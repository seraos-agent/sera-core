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
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  partnerReferenceNo?: string;
  referenceNo?: string;
  error?: string;
  settledAt: number;
  attempts?: number;
  lastAttemptAt?: number;
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
   */
  public listStoreSettlements(storeId: string): OrderSettlementRecord[] {
    return Array.from(this.records.values()).filter((r) => r.storeId === storeId);
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
    status: 'SUCCESS' | 'FAILED' | 'PENDING',
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
   * Clears in-memory records (useful for test isolation).
   */
  public clear(): void {
    this.records.clear();
  }
}
