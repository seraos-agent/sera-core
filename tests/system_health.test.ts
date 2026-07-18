import { describe, expect, it } from 'vitest';
import { PaperTradingSimulator } from '../src/core/paper-trading/PaperTradingSimulator';
import { ResearchHypothesisBuilder } from '../src/core/research/ResearchHypothesisBuilder';
import { DomainProductContractRegistry } from '../src/core/products/DomainProductContractRegistry';
import { HyperliquidTradingProductContract } from '../src/capabilities/hyperliquid/HyperliquidTradingProductContract';

/** Safe deployment-health scenario: local-only, no provider or exchange access. */
describe('system health scenario', () => {
  it('keeps product access, research, and simulated execution inside their declared boundaries', () => {
    const contracts = new DomainProductContractRegistry();
    contracts.register(HyperliquidTradingProductContract);
    expect(contracts.resolveWorkClass('hyperliquid-trading', 'HYPERLIQUID_MARKET_SUMMARY')).toBe('OPERATIONAL');

    const research = new ResearchHypothesisBuilder().build([
      { timestamp: 1, open: 100, high: 100, low: 100, close: 100 },
      { timestamp: 2, open: 106, high: 106, low: 106, close: 106 }
    ], { lookbackCandles: 1, thresholdPercent: 5 });
    expect(research.status).toBe('HYPOTHESIS');
    expect(research.limitations.join(' ')).toMatch(/not a trading signal/i);

    const simulated = new PaperTradingSimulator().fill({ id: 'local-only', side: 'BUY', quantity: 1, referencePrice: 100 });
    expect(simulated.fillPrice).toBeGreaterThan(100);
    expect(HyperliquidTradingProductContract.liveTradingEnabled).toBe(false);
  });
});
