import { describe, expect, it, vi } from 'vitest';
import { HyperliquidMarketDataAdapter } from '../src/capabilities/hyperliquid/HyperliquidMarketDataAdapter';

describe('HyperliquidMarketDataAdapter', () => {
  it('uses the public info endpoint for read-only candles and never needs credentials', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => new Response(JSON.stringify([{ t: 1, T: 2, o: '1', h: '2', l: '0.5', c: '1.5', v: '10', n: 3, i: '1h', s: 'BTC' }]), { status: 200 }));
    const adapter = new HyperliquidMarketDataAdapter(fetchMock as any);
    const candles = await adapter.getCandles('BTC', '1h', 1, 2);
    expect(candles[0]).toMatchObject({ coin: 'BTC', close: '1.5', trades: 3 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ type: 'candleSnapshot' });
  });
});
