import { describe, it, expect } from 'vitest';
import { TokenResolverService } from '../src/capabilities/spot/TokenResolverService';
import { BaseSpotMarketCapability } from '../src/capabilities/spot/BaseSpotMarketCapability';

describe('Base Network Token Discovery & Universal Spot Trading', () => {
  it('resolves established low-risk tokens (WETH, USDC, AERO)', async () => {
    const resolver = new TokenResolverService();
    const weth = await resolver.resolveToken('WETH');

    expect(weth.symbol).toBe('WETH');
    expect(weth.address).toBe('0x4200000000000000000000000000000000000006');
    expect(weth.riskLevel).toBe('LOW_RISK');
  });

  it('classifies volatile meme tokens (TOSHI, unlisted tokens) as HIGH_RISK_HIGH_REWARD with educational warnings', async () => {
    const resolver = new TokenResolverService();
    const toshi = await resolver.resolveToken('TOSHI');
    const custom = await resolver.resolveToken('NEW_MEME');

    expect(toshi.riskLevel).toBe('HIGH_RISK_HIGH_REWARD');
    expect(toshi.riskEducationSummary).toContain('HIGH RISK / HIGH REWARD');

    expect(custom.riskLevel).toBe('HIGH_RISK_HIGH_REWARD');
    expect(custom.riskEducationSummary).toContain('low liquidity');
  });

  it('generates spot swap quotes with 0.20% Volume Take Rate + Gas Fee Surcharge', async () => {
    const spotMarket = new BaseSpotMarketCapability();
    const quote = await spotMarket.getSwapQuote('USDC', 'WETH', 1000);

    expect(quote.fromToken.symbol).toBe('USDC');
    expect(quote.toToken.symbol).toBe('WETH');
    expect(quote.feeBreakdown.volumeTakeRateFeeUsdc).toBe(2.0); // 0.20% of $1,000 = $2.00 USDC
    expect(quote.feeBreakdown.totalFeeUsdc).toBeGreaterThan(2.0);
    expect(quote.expectedOutputUnits).toBeGreaterThan(0);
  });

  it('executes spot swap on Base network and returns transaction hash and risk disclosures', async () => {
    const spotMarket = new BaseSpotMarketCapability();
    const result = await spotMarket.executeSpotSwap({
      fromTokenSymbol: 'USDC',
      toTokenSymbol: 'TOSHI',
      amountInUsdc: 50,
      recipientAddress: '0x1234567890123456789012345678901234567890'
    });

    expect(result.success).toBe(true);
    expect(result.transactionHash).toMatch(/^0xbase/);
    expect(result.feeBreakdown.volumeTakeRateFeeUsdc).toBe(0.10); // 0.20% of $50 = $0.10
    expect(result.riskEducationSummary).toContain('HIGH RISK / HIGH REWARD');
  });
});
