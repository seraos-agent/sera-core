import { describe, expect, it } from 'vitest';
import { HyperliquidTradingProductContract } from '../src/capabilities/hyperliquid/HyperliquidTradingProductContract';
import { HyperliquidMarketDataCapability } from '../src/capabilities/hyperliquid/HyperliquidMarketDataCapability';
describe('Hyperliquid pilot contract', () => {
  it('exposes only a read-only market tool and keeps live trading disabled', () => {
    expect(HyperliquidTradingProductContract.liveTradingEnabled).toBe(false);
    expect(HyperliquidTradingProductContract.intentRoutes.HYPERLIQUID_PLACE_ORDER).toBe('HIGH_RISK');
    expect(new HyperliquidMarketDataCapability().getTools()[0]).toMatchObject({ name: 'HYPERLIQUID_MARKET_SUMMARY', requiresApproval: false, unsafe: false });
  });
});
