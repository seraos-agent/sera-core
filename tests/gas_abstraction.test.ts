import { describe, it, expect } from 'vitest';
import { GasAbstractionService } from '../src/capabilities/wallet/GasAbstractionService';

describe('GasAbstractionService (Dual-Engine Monetization)', () => {
  it('calculates Transfer Fee Surcharge ($0.05 + 20% Gas Markup) for direct transfers', () => {
    const gasService = new GasAbstractionService(3000, 1.1, 0.20, 0.05, 0.0020);
    const fee = gasService.calculateTotalTransactionFee('TRANSFER', 50, 60000n, 1000000000n);

    expect(fee.ethGasCost).toBe(0.00006);
    expect(fee.rawUsdcGasCost).toBe(0.198); // 0.00006 * 3000 * 1.1 = 0.198
    expect(fee.transferGasSurchargeProfitUsdc).toBe(0.0896); // (0.198 * 0.20) + 0.05
    expect(fee.volumeTakeRateFeeUsdc).toBe(0); // Transfer action has 0 volume take rate
    expect(fee.totalSeraProtocolProfitUsdc).toBe(0.0896);
    expect(fee.totalFeeUsdc).toBe(0.2876);
  });

  it('calculates Volume Take Rate (0.20%) + Transfer Surcharge for DEX Swap of $1,000 USDC', () => {
    const gasService = new GasAbstractionService(3000, 1.1, 0.20, 0.05, 0.0020);
    const fee = gasService.calculateTotalTransactionFee('SWAP', 1000, 60000n, 1000000000n);

    expect(fee.transferGasSurchargeProfitUsdc).toBe(0.0896);
    expect(fee.volumeTakeRateFeeUsdc).toBe(2.0); // 1000 * 0.0020 = $2.00 USDC
    expect(fee.totalSeraProtocolProfitUsdc).toBe(2.0896); // 2.00 + 0.0896
    expect(fee.totalFeeUsdc).toBe(2.2876); // 0.198 raw gas + 2.0896 profit
  });

  it('validates whether user USDC balance can cover transaction and total fee', () => {
    const gasService = new GasAbstractionService(3000);
    const valid = gasService.validateUsdcGasDeduction(10, 5, 0.2876);
    expect(valid.canCover).toBe(true);

    const invalid = gasService.validateUsdcGasDeduction(4, 5, 0.2876);
    expect(invalid.canCover).toBe(false);
  });
});
