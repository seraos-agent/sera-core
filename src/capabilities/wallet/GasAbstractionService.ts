export type ActionCategory = 'TRANSFER' | 'SWAP' | 'TRADING' | 'DEFI';

export interface GasEstimateResult {
  ethGasCost: number;
  rawUsdcGasCost: number;
  seraProtocolProfitUsdc: number;
  usdcGasFee: number;
  ethUsdcRate: number;
  gasLimitGwei: number;
}

export interface FeeBreakdownResult {
  actionCategory: ActionCategory;
  transactionAmountUsdc: number;
  ethGasCost: number;
  rawUsdcGasCost: number;
  transferGasSurchargeProfitUsdc: number; // 20% Markup + $0.05 Flat Fee
  volumeTakeRateFeeUsdc: number;          // 0.20% of volume (if SWAP/TRADING/DEFI)
  totalSeraProtocolProfitUsdc: number;    // Transfer Surcharge + Volume Take Rate
  totalFeeUsdc: number;                   // Raw Gas + Total Sera Profit
  ethUsdcRate: number;
}

export class GasAbstractionService {
  private defaultEthUsdcRate: number;
  private bufferMultiplier: number;
  private protocolMarkupPercent: number; // 20% gas markup
  private flatTransferFeeUsdc: number;    // $0.05 flat transfer fee
  private volumeTakeRatePercent: number;  // 0.20% (0.0020) volume take rate

  constructor(
    defaultEthUsdcRate: number = 3000,
    bufferMultiplier: number = 1.1,
    protocolMarkupPercent: number = 0.20,
    flatTransferFeeUsdc: number = 0.05,
    volumeTakeRatePercent: number = 0.0020 // 0.20%
  ) {
    this.defaultEthUsdcRate = defaultEthUsdcRate;
    this.bufferMultiplier = bufferMultiplier;
    this.protocolMarkupPercent = protocolMarkupPercent;
    this.flatTransferFeeUsdc = flatTransferFeeUsdc;
    this.volumeTakeRatePercent = volumeTakeRatePercent;
  }

  /**
   * Calculates comprehensive fee breakdown:
   * - DIRECT TRANSFER: Raw ETH Gas + 20% Gas Markup + $0.05 Flat Fee
   * - SWAP / TRADING / DEFI: Transfer Gas Surcharge + 0.20% Volume Take Rate
   */
  public calculateTotalTransactionFee(
    actionCategory: ActionCategory = 'TRANSFER',
    transactionAmountUsdc: number = 0,
    gasLimit: bigint = 60000n,
    gasPriceWei: bigint = 1000000000n,
    ethUsdcRate: number = this.defaultEthUsdcRate
  ): FeeBreakdownResult {
    const totalWei = gasLimit * gasPriceWei;
    const ethGasCost = Number(totalWei) / 1e18;
    
    // 1. Raw USDC cost with 10% network buffer
    const rawUsdcGasCost = Number((ethGasCost * ethUsdcRate * this.bufferMultiplier).toFixed(4));

    // 2. Transfer Surcharge Profit (20% Markup + $0.05 Flat Fee)
    const markupFee = rawUsdcGasCost * this.protocolMarkupPercent;
    const transferGasSurchargeProfitUsdc = Number((markupFee + this.flatTransferFeeUsdc).toFixed(4));

    // 3. Volume Take Rate Fee (0.20% for SWAP / TRADING / DEFI)
    const isVolumeAction = actionCategory === 'SWAP' || actionCategory === 'TRADING' || actionCategory === 'DEFI';
    const volumeTakeRateFeeUsdc = isVolumeAction
      ? Number((transactionAmountUsdc * this.volumeTakeRatePercent).toFixed(4))
      : 0;

    // 4. Total Sera Protocol Net Profit
    const totalSeraProtocolProfitUsdc = Number((transferGasSurchargeProfitUsdc + volumeTakeRateFeeUsdc).toFixed(4));

    // 5. Total USDC Fee Deducted from User
    const totalFeeUsdc = Number((rawUsdcGasCost + totalSeraProtocolProfitUsdc).toFixed(4));

    return {
      actionCategory,
      transactionAmountUsdc,
      ethGasCost,
      rawUsdcGasCost,
      transferGasSurchargeProfitUsdc,
      volumeTakeRateFeeUsdc,
      totalSeraProtocolProfitUsdc,
      totalFeeUsdc,
      ethUsdcRate
    };
  }

  /** Backward-compatible helper */
  public calculateGasFeeInUsdc(
    gasLimit: bigint = 60000n,
    gasPriceWei: bigint = 1000000000n,
    ethUsdcRate: number = this.defaultEthUsdcRate
  ): GasEstimateResult {
    const full = this.calculateTotalTransactionFee('TRANSFER', 0, gasLimit, gasPriceWei, ethUsdcRate);
    return {
      ethGasCost: full.ethGasCost,
      rawUsdcGasCost: full.rawUsdcGasCost,
      seraProtocolProfitUsdc: full.totalSeraProtocolProfitUsdc,
      usdcGasFee: full.totalFeeUsdc,
      ethUsdcRate: full.ethUsdcRate,
      gasLimitGwei: Number(gasLimit)
    };
  }

  /**
   * Assesses whether a user's USDC balance is sufficient to cover both the transaction amount and the sponsored gas fee in USDC.
   */
  public validateUsdcGasDeduction(
    userUsdcBalance: number,
    transactionAmountUsdc: number,
    gasFeeUsdc: number
  ): { canCover: boolean; totalRequiredUsdc: number; missingUsdc: number } {
    const totalRequiredUsdc = Number((transactionAmountUsdc + gasFeeUsdc).toFixed(4));
    const canCover = userUsdcBalance >= totalRequiredUsdc;
    const missingUsdc = canCover ? 0 : Number((totalRequiredUsdc - userUsdcBalance).toFixed(4));

    return {
      canCover,
      totalRequiredUsdc,
      missingUsdc
    };
  }
}
