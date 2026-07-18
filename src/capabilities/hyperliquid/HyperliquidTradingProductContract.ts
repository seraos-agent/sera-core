export const HyperliquidTradingProductContract = {
  id: 'hyperliquid-trading',
  capabilities: ['HYPERLIQUID_MARKET_SUMMARY'],
  intentRoutes: {
    HYPERLIQUID_MARKET_SUMMARY: 'OPERATIONAL',
    HYPERLIQUID_RESEARCH: 'COMPLEX',
    HYPERLIQUID_PLACE_ORDER: 'HIGH_RISK'
  },
  liveTradingEnabled: false,
  requiresHumanApproval: { HYPERLIQUID_PLACE_ORDER: true }
} as const;
