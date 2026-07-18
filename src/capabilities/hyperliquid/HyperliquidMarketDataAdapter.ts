export type HyperliquidCandleInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '8h' | '12h' | '1d' | '3d' | '1w' | '1M';

export interface HyperliquidCandle {
  startTime: number;
  endTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades: number;
  interval: HyperliquidCandleInterval;
  coin: string;
}

export interface HyperliquidBookLevel { price: string; size: string; orderCount: number; }
export interface HyperliquidOrderBook { coin: string; timestamp: number; bids: HyperliquidBookLevel[]; asks: HyperliquidBookLevel[]; }

type FetchLike = typeof fetch;

/** Read-only public market-data adapter. It has no signing, account, or order methods. */
export class HyperliquidMarketDataAdapter {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly infoUrl = 'https://api.hyperliquid.xyz/info'
  ) {}

  async getAllMids(): Promise<Record<string, string>> {
    return this.info({ type: 'allMids' }) as Promise<Record<string, string>>;
  }

  async getCandles(coin: string, interval: HyperliquidCandleInterval, startTime: number, endTime: number): Promise<HyperliquidCandle[]> {
    this.assertCoin(coin);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime) throw new Error('Invalid candle time range.');
    const data = await this.info({ type: 'candleSnapshot', req: { coin, interval, startTime, endTime } }) as any[];
    return data.map(candle => ({ startTime: candle.t, endTime: candle.T, open: candle.o, high: candle.h, low: candle.l, close: candle.c, volume: candle.v, trades: candle.n, interval: candle.i, coin: candle.s }));
  }

  async getOrderBook(coin: string): Promise<HyperliquidOrderBook> {
    this.assertCoin(coin);
    const data = await this.info({ type: 'l2Book', coin }) as any;
    const toLevels = (levels: any[]): HyperliquidBookLevel[] => levels.map(level => ({ price: level.px, size: level.sz, orderCount: level.n }));
    return { coin: data.coin, timestamp: data.time, bids: toLevels(data.levels?.[0] || []), asks: toLevels(data.levels?.[1] || []) };
  }

  private async info(body: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetchImpl(this.infoUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Hyperliquid info request failed (${response.status}).`);
    return response.json();
  }

  private assertCoin(coin: string): void {
    if (!/^[A-Za-z0-9:@._/-]{1,64}$/.test(coin)) throw new Error('Invalid Hyperliquid coin identifier.');
  }
}
