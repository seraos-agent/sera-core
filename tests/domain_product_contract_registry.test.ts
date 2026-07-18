import { describe, expect, it } from 'vitest';
import { DomainProductContractRegistry } from '../src/core/products/DomainProductContractRegistry';
import { HyperliquidTradingProductContract } from '../src/capabilities/hyperliquid/HyperliquidTradingProductContract';

describe('DomainProductContractRegistry', () => {
  it('validates and resolves the read-only Hyperliquid pilot boundary', () => {
    const registry = new DomainProductContractRegistry();
    registry.register(HyperliquidTradingProductContract);

    expect(registry.resolveWorkClass('hyperliquid-trading', 'HYPERLIQUID_CANDLES')).toBe('OPERATIONAL');
    expect(() => registry.resolveWorkClass('hyperliquid-trading', 'HYPERLIQUID_PLACE_ORDER')).not.toThrow();
    expect(() => registry.assertCapabilitiesAvailable('hyperliquid-trading', ['HYPERLIQUID_MARKET_SUMMARY'])).toThrow(/HYPERLIQUID_CANDLES/);
  });

  it('refuses a high-risk route that tries to omit human approval', () => {
    const registry = new DomainProductContractRegistry();
    expect(() => registry.register({
      id: 'unsafe-product', capabilities: ['WRITE'], liveTradingEnabled: false,
      intentRoutes: { WRITE: 'HIGH_RISK' }
    })).toThrow(/human approval/);
  });
});
