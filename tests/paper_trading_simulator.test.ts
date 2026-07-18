import { describe, expect, it } from 'vitest';
import { PaperTradingSimulator } from '../src/core/paper-trading/PaperTradingSimulator';

describe('PaperTradingSimulator', () => {
  it('applies slippage and fees locally without exchange access', () => {
    const simulator = new PaperTradingSimulator();
    const entry = simulator.fill({ id: 'entry', side: 'BUY', quantity: 1, referencePrice: 100 });
    const exit = simulator.fill({ id: 'exit', side: 'SELL', quantity: 1, referencePrice: 110 });
    expect(entry.fillPrice).toBeGreaterThan(100);
    expect(exit.fillPrice).toBeLessThan(110);
    expect(simulator.realizedPnl(entry, exit, 'LONG')).toBeGreaterThan(0);
  });
});
