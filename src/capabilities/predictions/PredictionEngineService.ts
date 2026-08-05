import { EventEmitter } from 'events';

export interface ArenaMarket {
  id: string;
  title: string;
  asset: 'BTC';
  strikePrice: number;
  expiryTime: number;
  resolved: boolean;
  outcome?: 'UP' | 'DOWN';
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ArenaOrder {
  id: string;
  userId: string;
  marketId: string;
  side: 'UP' | 'DOWN';
  amount: number;
  status: 'PENDING' | 'MATCHED' | 'SETTLED';
  matchedWith?: string; 
  won?: boolean;
  payout?: number;
}

export class PredictionEngineService {
  public markets: ArenaMarket[] = [];
  public orders: ArenaOrder[] = [];
  public orderHistory: ArenaOrder[] = [];
  public priceHistory: Candle[] = [];
  
  // Mock balances for users (1000 Mock USDC default)
  public mockBalances: Record<string, number> = {};
  
  private eventBus: EventEmitter;
  private currentBtcPrice: number = 0;
  private hasInitializedStrikePrice: boolean = false;

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    // Seed initial balance for users (in memory)
    this.mockBalances['0xE657...3E12'] = 1000; 
    
    // Seed AMM with massive liquidity
    this.mockBalances['SYSTEM_AMM'] = 1000000;
    this.initializeRollingMarkets();
  }

  private initializeRollingMarkets() {
    const now = Date.now();
    this.markets.push({
      id: 'btc-5m-rolling',
      title: 'BTC Up or Down 5m',
      asset: 'BTC',
      strikePrice: 64200, // Will be updated on first tick
      expiryTime: now + 5 * 60 * 1000,
      resolved: false
    });
    this.markets.push({
      id: 'btc-15m-rolling',
      title: 'BTC Up or Down 15m',
      asset: 'BTC',
      strikePrice: 64200,
      expiryTime: now + 15 * 60 * 1000,
      resolved: false
    });
    this.injectSeedLiquidity('btc-5m-rolling');
    this.injectSeedLiquidity('btc-15m-rolling');
  }

  private injectSeedLiquidity(marketId: string) {
    const seedAmount = 50; // 50 USDC seed on each side to prevent extreme odds
    this.orders.push({ id: Math.random().toString(36).substring(7), userId: 'SYSTEM_SEED', marketId, side: 'UP', amount: seedAmount, status: 'PENDING' });
    this.orders.push({ id: Math.random().toString(36).substring(7), userId: 'SYSTEM_SEED', marketId, side: 'DOWN', amount: seedAmount, status: 'PENDING' });
  }

  public getBalance(userId: string): number {
    if (this.mockBalances[userId] === undefined) {
      this.mockBalances[userId] = 1000; // Give new users 1000 Mock USDC
    }
    return this.mockBalances[userId];
  }

  public getActiveMarkets(): ArenaMarket[] {
    return this.markets.filter(m => !m.resolved);
  }

  public getPortfolio(userId: string) {
    const userOrders = this.orders.filter(o => o.userId === userId);
    const userHistory = this.orderHistory.filter(o => o.userId === userId);
    return {
      balance: this.getBalance(userId),
      orders: userOrders,
      history: userHistory
    };
  }

  public getOrderBook(marketId: string) {
    const pendingOrders = this.orders.filter(o => o.marketId === marketId && o.status === 'PENDING');
    const matchedOrders = this.orders.filter(o => o.marketId === marketId && o.status === 'MATCHED');
    return {
      up: pendingOrders.filter(o => o.side === 'UP'),
      down: pendingOrders.filter(o => o.side === 'DOWN'),
      recentMatches: [] // Parimutuel has no real-time matches
    };
  }

  public async placeOrder(userId: string, marketId: string, side: 'UP' | 'DOWN', amount: number) {
    const balance = this.getBalance(userId);
    if (balance < amount) throw new Error("Insufficient mock balance.");
    if (amount < 1) throw new Error("Minimum bet is 1 USDC.");

    const market = this.markets.find(m => m.id === marketId);
    if (!market) throw new Error("Market not found.");
    if (market.resolved || Date.now() >= market.expiryTime) {
      throw new Error("Market is already closed for betting.");
    }

    // Deduct balance
    this.mockBalances[userId] -= amount;

    const order: ArenaOrder = {
      id: Math.random().toString(36).substring(7),
      userId,
      marketId,
      side,
      amount,
      status: 'PENDING'
    };

    this.orders.push(order);
    return order;
  }

  public async tick() {
    await this.updateBtcPrice();
    const resolvedCount = this.resolveExpiredMarkets();
    
    if (resolvedCount > 0) {
      this.eventBus.emit('arena:markets_updated', this.getActiveMarkets());
    }
  }

  private async updateBtcPrice() {
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
      const data = await res.json();
      if (data && data.price) {
        this.currentBtcPrice = parseFloat(data.price);
        
        if (!this.hasInitializedStrikePrice && this.currentBtcPrice > 0) {
          for (const m of this.markets) {
            if (m.strikePrice === 64200) {
              m.strikePrice = this.currentBtcPrice;
            }
          }
          this.hasInitializedStrikePrice = true;
          this.eventBus.emit('arena:markets_updated', this.getActiveMarkets());
        }

        // Create 1-second candles (data points) for smooth line
        const nowSec = Math.floor(Date.now() / 1000);
        const candleTime = nowSec;
        
        const lastCandle = this.priceHistory[this.priceHistory.length - 1];
        if (!lastCandle || lastCandle.time !== candleTime) {
          this.priceHistory.push({
            time: candleTime,
            open: this.currentBtcPrice,
            high: this.currentBtcPrice,
            low: this.currentBtcPrice,
            close: this.currentBtcPrice
          });
          if (this.priceHistory.length > 900) this.priceHistory.shift(); // Keep last 15 mins of 1-sec data
        } else {
          lastCandle.close = this.currentBtcPrice;
          if (this.currentBtcPrice > lastCandle.high) lastCandle.high = this.currentBtcPrice;
          if (this.currentBtcPrice < lastCandle.low) lastCandle.low = this.currentBtcPrice;
        }
        
        this.eventBus.emit('arena:price_tick', { 
          price: this.currentBtcPrice, 
          candle: this.priceHistory[this.priceHistory.length - 1] 
        });
      }
    } catch (e) {
      console.error('[Arena] Failed to fetch BTC price', e);
    }
  }

  private resolveExpiredMarkets(): number {
    if (this.currentBtcPrice === 0) return 0;
    const now = Date.now();
    let resolved = 0;

    for (const market of this.markets) {
      if (!market.resolved && now >= market.expiryTime) {
        market.resolved = true;
        market.outcome = this.currentBtcPrice > market.strikePrice ? 'UP' : 'DOWN';
        resolved++;
        
        console.log(`[Arena] Resolved market ${market.id}. Outcome: ${market.outcome} (Price: ${this.currentBtcPrice})`);

        const marketOrders = this.orders.filter(o => o.marketId === market.id && o.status === 'PENDING');
        const totalUp = marketOrders.filter(o => o.side === 'UP').reduce((sum, o) => sum + o.amount, 0);
        const totalDown = marketOrders.filter(o => o.side === 'DOWN').reduce((sum, o) => sum + o.amount, 0);
        
        const grossPool = totalUp + totalDown;
        const netPool = grossPool * 0.98;

        for (const order of marketOrders) {
          if (totalUp === 0 || totalDown === 0) {
            if (order.userId !== 'SYSTEM_SEED') this.mockBalances[order.userId] += order.amount;
            order.status = 'SETTLED';
            order.won = false;
            order.payout = order.amount;
            if (order.userId !== 'SYSTEM_SEED') this.orderHistory.push(order);
            continue;
          }

          if (order.side === market.outcome) {
            const winningPool = market.outcome === 'UP' ? totalUp : totalDown;
            const payout = (order.amount / winningPool) * netPool;
            if (order.userId !== 'SYSTEM_SEED') this.mockBalances[order.userId] += payout;
            order.won = true;
            order.payout = payout;
          } else {
            order.won = false;
            order.payout = 0;
          }
          
          order.status = 'SETTLED';
          if (order.userId !== 'SYSTEM_SEED') this.orderHistory.push(order);
        }
        
        if (this.orderHistory.length > 1000) this.orderHistory = this.orderHistory.slice(-1000);

        const uniqueUsers = Array.from(new Set(marketOrders.map(o => o.userId)));
        for (const uid of uniqueUsers) {
          this.eventBus.emit(`arena:portfolio_updated:${uid}`, this.getPortfolio(uid));
        }

        setTimeout(() => {
          if (!market) return;
          market.strikePrice = this.currentBtcPrice;
          const duration = market.title.includes('15m') ? 15 : 5;
          market.expiryTime = Date.now() + duration * 60 * 1000;
          market.resolved = false;
          market.outcome = undefined;
          this.injectSeedLiquidity(market.id);
          console.log(`[Arena] Restarted market ${market.id} with new target $${market.strikePrice}`);
          this.eventBus.emit('arena:markets_updated', this.getActiveMarkets());
        }, 3000);
      }
    }
    return resolved;
  }
}
