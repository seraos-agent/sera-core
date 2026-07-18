import { SeraTool } from '../../core/cognitive/Tool';

/** Local-only trading capability for transparent demos and policy testing. */
export class PaperTradingCapability {
  public getTools(): SeraTool[] {
    return [{
      name: 'PAPER_TRADE',
      description: 'Simulate a Hyperliquid perpetual buy or sell using the current public mid price. This is local paper trading only: it never sends an order, uses credentials, or changes a real balance.',
      parameters: {
        type: 'object',
        properties: {
          coin: { type: 'string', description: 'Perpetual coin symbol, e.g. BTC.' },
          side: { type: 'string', enum: ['BUY', 'SELL'] },
          quantity: { type: 'number', minimum: 0.000001, description: 'Virtual asset quantity to simulate.' }
        },
        required: ['coin', 'side', 'quantity']
      },
      requiresApproval: false,
      irreversible: false,
      unsafe: false
    }];
  }
}
