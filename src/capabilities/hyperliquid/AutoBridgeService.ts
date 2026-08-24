/**
 * AutoBridgeService — Automatically bridges USDC from Base to Hyperliquid when needed.
 *
 * Architecture role: Capability / Cross-chain Bridge Adapter
 * - Checks USDC balance on Hyperliquid.
 * - If insufficient for a pending trade, bridges the shortfall from Base.
 * - Uses Circle CCTP (Cross-Chain Transfer Protocol) for secure native USDC transfers.
 * - User never sees this process — SERA handles it transparently.
 *
 * NOTE: Phase 1 implementation provides the interface and logs the bridge intent.
 * Actual on-chain CCTP execution will be wired in Phase 2 when the bridge
 * contracts are tested on testnet. For now, if Hyperliquid balance is sufficient,
 * trading proceeds normally. If insufficient, the service returns a clear error
 * asking the user to deposit manually (graceful degradation).
 */
import { HyperliquidClient } from './HyperliquidClient';

export interface BridgeResult {
  success: boolean;
  amountBridged: number;
  sourceChain: string;
  destinationChain: string;
  estimatedArrivalSeconds: number;
  transactionHash?: string;
  errorMessage?: string;
}

export class AutoBridgeService {
  private client: HyperliquidClient;

  constructor(client: HyperliquidClient) {
    this.client = client;
  }

  /**
   * Ensures that the Hyperliquid account has at least `requiredUsdc` available.
   * If not, attempts to bridge the shortfall from Base.
   *
   * Returns the current available USDC on Hyperliquid after any bridge action.
   */
  public async ensureSufficientBalance(requiredUsdc: number): Promise<{
    availableUsdc: number;
    bridgeRequired: boolean;
    bridgeResult?: BridgeResult;
  }> {
    // 1. Check current USDC balance on Hyperliquid
    const availableUsdc = await this.getHyperliquidUsdcBalance();

    if (availableUsdc >= requiredUsdc) {
      return {
        availableUsdc,
        bridgeRequired: false
      };
    }

    // 2. Calculate shortfall
    const shortfall = requiredUsdc - availableUsdc;
    console.log(`[AutoBridgeService] USDC shortfall on Hyperliquid: need $${requiredUsdc}, have $${availableUsdc}, bridging $${shortfall.toFixed(2)}`);

    // 3. Phase 1: Graceful degradation — inform about manual deposit
    // Phase 2: Execute CCTP bridge automatically
    const bridgeResult = await this.bridgeFromBase(shortfall);

    return {
      availableUsdc: bridgeResult.success ? availableUsdc + shortfall : availableUsdc,
      bridgeRequired: true,
      bridgeResult
    };
  }

  /**
   * Gets the USDC balance on Hyperliquid.
   */
  public async getHyperliquidUsdcBalance(): Promise<number> {
    try {
      const balances = await this.client.getAccountBalances();
      const usdcBalance = balances.find(b => b.coin === 'USDC');
      return usdcBalance ? parseFloat(usdcBalance.total) : 0;
    } catch (error: any) {
      console.warn('[AutoBridgeService] Could not fetch HL balance:', error.message);
      return 0;
    }
  }

  /**
   * Bridges USDC from Base network to Hyperliquid.
   *
   * Phase 1: Returns an informative error guiding the user to deposit manually.
   * Phase 2: Will execute the actual CCTP bridge transaction on-chain.
   */
  private async bridgeFromBase(amountUsdc: number): Promise<BridgeResult> {
    // -----------------------------------------------------------------------
    // PHASE 1: Graceful degradation
    // The CCTP bridge requires on-chain transaction signing on Base, which
    // involves the operational wallet. This will be implemented once the
    // bridge contracts and CCTP integration are tested on testnet.
    // -----------------------------------------------------------------------
    console.log(`[AutoBridgeService] Bridge request: $${amountUsdc} USDC from Base → Hyperliquid`);
    console.log('[AutoBridgeService] Phase 1: Returning manual deposit guidance.');

    return {
      success: false,
      amountBridged: 0,
      sourceChain: 'Base',
      destinationChain: 'Hyperliquid',
      estimatedArrivalSeconds: 120,
      errorMessage: `Your Hyperliquid trading balance needs $${amountUsdc.toFixed(2)} more USDC. ` +
        `Automatic bridging will be available soon. For now, you can deposit USDC to your Hyperliquid account ` +
        `via app.hyperliquid.xyz to start trading.`
    };

    // -----------------------------------------------------------------------
    // PHASE 2: Actual CCTP bridge implementation (future)
    // -----------------------------------------------------------------------
    // const txHash = await this.executeCCTPBridge(amountUsdc);
    // await this.waitForBridgeConfirmation(txHash);
    // return { success: true, amountBridged: amountUsdc, ... };
  }
}
