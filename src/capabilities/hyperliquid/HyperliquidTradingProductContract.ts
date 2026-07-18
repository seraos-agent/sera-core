import { DomainProductContract } from '../../core/products/DomainProductContractRegistry';

export const HyperliquidTradingProductContract: DomainProductContract = {
  id: 'hyperliquid-trading',
  capabilities: ['HYPERLIQUID_MARKET_SUMMARY', 'HYPERLIQUID_CANDLES', 'PAPER_TRADE'],
  intentRoutes: {
    HYPERLIQUID_MARKET_SUMMARY: 'OPERATIONAL',
    HYPERLIQUID_CANDLES: 'OPERATIONAL',
    PAPER_TRADE: 'OPERATIONAL',
    HYPERLIQUID_RESEARCH: 'COMPLEX',
    HYPERLIQUID_PLACE_ORDER: 'HIGH_RISK'
  },
  liveTradingEnabled: false,
  requiresExplicitAuthority: { HYPERLIQUID_PLACE_ORDER: true }
};
