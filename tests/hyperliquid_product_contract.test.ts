import { describe, expect, it } from 'vitest';
import { HyperliquidTradingProductContract } from '../src/capabilities/hyperliquid/HyperliquidTradingProductContract';
import { HyperliquidMarketDataCapability } from '../src/capabilities/hyperliquid/HyperliquidMarketDataCapability';
import { analyzeHyperliquidMarketSnapshot } from '../src/capabilities/hyperliquid/formatMarketSummary';
import { PaperTradingCapability } from '../src/capabilities/paper-trading/PaperTradingCapability';
import { AutonomyAgreementCapability } from '../src/capabilities/autonomy/AutonomyAgreementCapability';
describe('Hyperliquid pilot contract', () => {
  it('exposes only a read-only market tool and keeps live trading disabled', () => {
    expect(HyperliquidTradingProductContract.liveTradingEnabled).toBe(false);
    expect(HyperliquidTradingProductContract.intentRoutes.HYPERLIQUID_PLACE_ORDER).toBe('HIGH_RISK');
    expect(new HyperliquidMarketDataCapability().getTools()[0]).toMatchObject({ name: 'HYPERLIQUID_MARKET_SUMMARY', requiresApproval: false, unsafe: false });
    expect(new PaperTradingCapability().getTools()[0]).toMatchObject({ name: 'PAPER_TRADE', requiresApproval: false, unsafe: false });
    expect(new AutonomyAgreementCapability().getTools()[0]).toMatchObject({ name: 'ACTIVATE_AUTONOMY_AGREEMENT', requiresApproval: true });
  });
});

it('keeps market interpretation bounded by snapshot limitations', () => {
  const analysis = analyzeHyperliquidMarketSnapshot({ mid: '1', bestBid: { price: '1' }, bestAsk: { price: '2' } });
  expect(analysis.limitations.join(' ')).toMatch(/not proof of future price direction/);
  expect(analysis.boundedInterpretation.join(' ')).toMatch(/neither establishes a directional trade signal/);
});
