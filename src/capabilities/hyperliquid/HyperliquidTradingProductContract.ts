import { DomainProductContract } from '../../core/products/DomainProductContractRegistry';

export const HyperliquidTradingProductContract: DomainProductContract = {
  id: 'hyperliquid-trading',
  capabilities: ['HYPERLIQUID_MARKET_SUMMARY', 'HYPERLIQUID_CANDLES'],
  intentRoutes: {
    HYPERLIQUID_MARKET_SUMMARY: 'OPERATIONAL',
    HYPERLIQUID_CANDLES: 'OPERATIONAL',
    HYPERLIQUID_RESEARCH: 'COMPLEX',
    HYPERLIQUID_PLACE_ORDER: 'HIGH_RISK'
  },
  liveTradingEnabled: false,
  requiresHumanApproval: { HYPERLIQUID_PLACE_ORDER: true }
};
