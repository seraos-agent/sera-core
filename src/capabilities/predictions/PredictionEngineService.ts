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
}

export class PredictionEngineService {
  public markets: ArenaMarket[] = [];
  public orders: ArenaOrder[] = [];
  public priceHistory: Candle[] = [];
  
  // Mock balances for users (1000 Mock USDC default)
  public mockBalances: Record<string, number> = {};
  
  private eventBus: EventEmitter;
  private currentBtcPrice: number = 0;
  private hasInitializedStrikePrice: boolean = false;

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
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
    return {
      balance: this.getBalance(userId),
      orders: userOrders
    };
  }

  public getOrderBook(marketId: string) {
    const pendingOrders = this.orders.filter(o => o.marketId === marketId && o.status === 'PENDING');
    return {
      up: pendingOrders.filter(o => o.side === 'UP'),
      down: pendingOrders.filter(o => o.side === 'DOWN')
    };
  }

  public async placeOrder(userId: string, marketId: string, side: 'UP' | 'DOWN', amount: number) {
    const balance = this.getBalance(userId);
    if (balance < amount) throw new Error("Insufficient mock balance.");
    if (amount <= 0) throw new Error("Amount must be greater than 0.");

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
    this.matchOrders(marketId);
    return order;
  }

  private matchOrders(marketId: string) {
    // Find all pending UP orders and DOWN orders for this market
    const pendingUp = this.orders.filter(o => o.marketId === marketId && o.status === 'PENDING' && o.side === 'UP');
    const pendingDown = this.orders.filter(o => o.marketId === marketId && o.status === 'PENDING' && o.side === 'DOWN');

    // Simple FIFO matching of EXACT amounts (to keep it simple for P2P simulation)
    // In a real orderbook, we would do partial fills, but we keep it simple here.
    for (const upOrder of pendingUp) {
      if (upOrder.status !== 'PENDING') continue;
      const match = pendingDown.find(d => d.status === 'PENDING' && d.amount === upOrder.amount);
      if (match) {
        upOrder.status = 'MATCHED';
        upOrder.matchedWith = match.id;
        match.status = 'MATCHED';
        match.matchedWith = upOrder.id;
        console.log(`[Arena] Matched order ${upOrder.id} (UP) with ${match.id} (DOWN) for $${upOrder.amount}`);
      }
    }
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

        // Settle orders
        const marketOrders = this.orders.filter(o => o.marketId === market.id);
        for (const order of marketOrders) {
          if (order.status === 'PENDING') {
            // Refund pending orders
            this.mockBalances[order.userId] += order.amount;
            order.status = 'SETTLED';
          } else if (order.status === 'MATCHED') {
            // Payout winners
            if (order.side === market.outcome) {
              // Winner gets their stake + opponent's stake (2x amount)
              this.mockBalances[order.userId] += (order.amount * 2);
            }
            order.status = 'SETTLED';
          }
          // Notify portfolio update
          this.eventBus.emit(`arena:portfolio_updated:${order.userId}`, this.getPortfolio(order.userId));
        }

        // Schedule auto-restart for this market
        setTimeout(() => {
          if (!market) return;
          market.strikePrice = this.currentBtcPrice;
          const duration = market.title.includes('15m') ? 15 : 5;
          market.expiryTime = Date.now() + duration * 60 * 1000;
          market.resolved = false;
          market.outcome = undefined;
          
          // Clear settled orders from memory to avoid leak
          this.orders = this.orders.filter(o => o.marketId !== market.id || o.status !== 'SETTLED');
          
          console.log(`[Arena] Restarted market ${market.id} with new target $${market.strikePrice}`);
          this.eventBus.emit('arena:markets_updated', this.getActiveMarkets());
        }, 5000);
      }
    }
    return resolved;
  }
}
