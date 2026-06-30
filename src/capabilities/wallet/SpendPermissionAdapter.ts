import * as fs from 'fs';
import * as path from 'path';
import { SpendAllowance, TransferRequest, WalletId } from './types';

export class SpendPermissionAdapter {
  private allowances: Map<string, SpendAllowance> = new Map();
  private processedIdempotencyKeys: Set<string> = new Set();
  private persistPath: string;

  constructor() {
    const projectRoot = process.cwd();
    this.persistPath = path.join(projectRoot, '.data', 'spend_permission_mock.json');
    
    this.loadPersistedData();
  }

  private loadPersistedData() {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = fs.readFileSync(this.persistPath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed.allowances) {
          this.allowances = new Map(Object.entries(parsed.allowances));
        }
        if (parsed.processedKeys && Array.isArray(parsed.processedKeys)) {
          this.processedIdempotencyKeys = new Set(parsed.processedKeys);
        }
      } else {
        // We pre-fund the mock for the demo with 0.01 ETH if no state exists
        this.allowances.set('eth', {
          asset: 'eth',
          amount: 0.01,
          period: 'DAILY'
        });
        this.savePersistedData();
      }
    } catch (e) {
      console.error('[SpendPermissionAdapter] Failed to load persisted data:', e);
    }
  }

  private savePersistedData() {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const payload = {
        allowances: Object.fromEntries(this.allowances),
        processedKeys: Array.from(this.processedIdempotencyKeys)
      };

      const data = JSON.stringify(payload);
      const tempPath = this.persistPath + '.tmp';
      fs.writeFileSync(tempPath, data, 'utf8');
      fs.renameSync(tempPath, this.persistPath);
    } catch (e) {
      console.error('[SpendPermissionAdapter] Failed to save persisted data:', e);
    }
  }

  /**
   * The Single Source of Truth for "Can I spend this?"
   */
  async validateAndDeduct(walletId: WalletId, request: TransferRequest): Promise<boolean> {
    if (this.processedIdempotencyKeys.has(request.idempotencyKey)) {
      console.log(`[SpendPermissionAdapter] ⚠️ Denied. Request ID (Idempotency Key) already processed: ${request.idempotencyKey}`);
      return false; // Idempotency check prevents double spend
    }

    const assetKey = request.asset.toLowerCase();
    const allowance = this.allowances.get(assetKey);

    if (!allowance) {
      console.log(`[SpendPermissionAdapter] ❌ Denied. No spend permission found for asset ${assetKey}`);
      return false;
    }

    if (allowance.amount < request.amount) {
      console.log(`[SpendPermissionAdapter] ❌ Denied. Requested ${request.amount} ${assetKey} exceeds allowance of ${allowance.amount} ${assetKey}`);
      return false;
    }

    // Deduct from local allowance state
    allowance.amount -= request.amount;
    this.allowances.set(assetKey, allowance);
    
    // Mark as processed
    this.processedIdempotencyKeys.add(request.idempotencyKey);
    this.savePersistedData();
    
    console.log(`[SpendPermissionAdapter] ✅ Approved. Remaining allowance: ${allowance.amount} ${assetKey}`);
    return true;
  }

  async getRemainingAllowance(walletId: WalletId, asset: string): Promise<number> {
    return this.allowances.get(asset.toLowerCase())?.amount || 0;
  }
}
