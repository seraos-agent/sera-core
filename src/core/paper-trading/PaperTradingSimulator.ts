export type PaperSide = 'BUY' | 'SELL';
export interface PaperOrder { id: string; side: PaperSide; quantity: number; referencePrice: number; }
export interface PaperFill { orderId: string; fillPrice: number; fee: number; slippageCost: number; notional: number; }

/** Local execution simulator. It does not connect to an exchange or hold credentials. */
export class PaperTradingSimulator {
  constructor(private readonly feeRate = 0.0005, private readonly slippageBps = 2) {}

  fill(order: PaperOrder): PaperFill {
    if (order.quantity <= 0 || order.referencePrice <= 0) throw new Error('Paper order quantity and reference price must be positive.');
    const slippage = this.slippageBps / 10_000;
    const fillPrice = order.referencePrice * (order.side === 'BUY' ? 1 + slippage : 1 - slippage);
    const notional = fillPrice * order.quantity;
    return { orderId: order.id, fillPrice, notional, fee: notional * this.feeRate, slippageCost: Math.abs(fillPrice - order.referencePrice) * order.quantity };
  }

  realizedPnl(entry: PaperFill, exit: PaperFill, direction: 'LONG' | 'SHORT'): number {
    const quantity = entry.notional / entry.fillPrice;
    const gross = (exit.fillPrice - entry.fillPrice) * quantity * (direction === 'LONG' ? 1 : -1);
    return gross - entry.fee - exit.fee;
  }
}
