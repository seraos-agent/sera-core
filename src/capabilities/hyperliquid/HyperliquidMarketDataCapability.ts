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
    }, {
      name: 'HYPERLIQUID_CANDLES',
      description: 'Read-only recent Hyperliquid candles for market analysis. Never places or modifies orders.',
      parameters: { type: 'object', properties: { coin: { type: 'string' }, interval: { type: 'string', enum: ['1m','5m','15m','1h','4h','1d'] }, hours: { type: 'number', minimum: 1, maximum: 720 } }, required: ['coin', 'interval'] },
      requiresApproval: false, irreversible: false, unsafe: false
    }];
  }
}
