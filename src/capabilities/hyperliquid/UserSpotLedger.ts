/**
 * UserSpotLedger — Tracks user-specific spot token holdings in SERA.
 *
 * Architecture Role: Capability / Multi-Tenant State
 * - Isolates each user's asset holdings from the server's master omnibus pool.
 * - Records spot buy/sell fills per user address.
 * - Computes real-time USD valuations based on live Hyperliquid market prices.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface UserTokenHolding {
  coin: string;
  amount: number;
  costBasisUsdc: number;
  lastUpdatedAt: number;
}

export interface UserPortfolioRecord {
  userAddress: string;
  holdings: Record<string, UserTokenHolding>;
}

export class UserSpotLedger {
  private storePath: string;
  private records: Map<string, UserPortfolioRecord> = new Map();

  constructor(customPath?: string) {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.storePath = customPath || path.join(dataDir, 'user_spot_ledger.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf8');
        const data = JSON.parse(raw) as Record<string, UserPortfolioRecord>;
        for (const [addr, record] of Object.entries(data)) {
          this.records.set(addr.toLowerCase(), record);
        }
      }
    } catch (e: any) {
      console.warn('[UserSpotLedger] Failed to load ledger, starting fresh:', e.message);
    }
  }

  private save(): void {
    try {
      const obj: Record<string, UserPortfolioRecord> = {};
      for (const [addr, record] of this.records.entries()) {
        obj[addr] = record;
      }
      fs.writeFileSync(this.storePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e: any) {
      console.error('[UserSpotLedger] Failed to save ledger:', e.message);
    }
  }

  /**
   * Records a buy order fill for a user.
   */
  public recordBuy(userAddress: string, coin: string, amountCoin: number, costUsdc: number): void {
    const cleanAddr = userAddress.toLowerCase().trim();
    const cleanCoin = coin.toUpperCase().trim();

    let userRecord = this.records.get(cleanAddr);
    if (!userRecord) {
      userRecord = { userAddress: cleanAddr, holdings: {} };
      this.records.set(cleanAddr, userRecord);
    }

    const current = userRecord.holdings[cleanCoin] || {
      coin: cleanCoin,
      amount: 0,
      costBasisUsdc: 0,
      lastUpdatedAt: Date.now()
    };

    current.amount += amountCoin;
    current.costBasisUsdc += costUsdc;
    current.lastUpdatedAt = Date.now();

    userRecord.holdings[cleanCoin] = current;
    this.save();
    console.log(`[UserSpotLedger] Credited ${amountCoin} ${cleanCoin} to user ${cleanAddr}`);
  }

  /**
   * Records a sell order fill for a user.
   */
  public recordSell(userAddress: string, coin: string, amountCoin: number, proceedsUsdc: number): void {
    const cleanAddr = userAddress.toLowerCase().trim();
    const cleanCoin = coin.toUpperCase().trim();

    const userRecord = this.records.get(cleanAddr);
    if (!userRecord || !userRecord.holdings[cleanCoin]) {
      console.warn(`[UserSpotLedger] User ${cleanAddr} attempted to sell unrecorded token ${cleanCoin}`);
      return;
    }

    const current = userRecord.holdings[cleanCoin];
    current.amount = Math.max(0, current.amount - amountCoin);
    current.costBasisUsdc = Math.max(0, current.costBasisUsdc - proceedsUsdc);
    current.lastUpdatedAt = Date.now();

    if (current.amount <= 0.000001) {
      delete userRecord.holdings[cleanCoin];
    } else {
      userRecord.holdings[cleanCoin] = current;
    }

    this.save();
    console.log(`[UserSpotLedger] Debited ${amountCoin} ${cleanCoin} from user ${cleanAddr}`);
  }

  /**
   * Retrieves all holdings for a specific user.
   */
  public getUserHoldings(userAddress: string): UserTokenHolding[] {
    const cleanAddr = userAddress.toLowerCase().trim();
    const record = this.records.get(cleanAddr);
    if (!record) return [];
    return Object.values(record.holdings).filter(h => h.amount > 0);
  }
}
