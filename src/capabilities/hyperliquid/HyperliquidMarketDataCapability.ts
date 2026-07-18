import { SeraTool } from '../../core/cognitive/Tool';

export class HyperliquidMarketDataCapability {
  getTools(): SeraTool[] {
    return [{
      name: 'HYPERLIQUID_MARKET_SUMMARY',
      description: 'Read-only Hyperliquid market summary: current mid price and top order-book levels. Never places or modifies orders.',
      parameters: { type: 'object', properties: { coin: { type: 'string', description: 'Perpetual coin symbol, e.g. BTC.' } }, required: ['coin'] },
      requiresApproval: false,
      irreversible: false,
      unsafe: false
    }];
  }
}
