/**
 * HyperliquidSpotCapability — High-level business logic for Hyperliquid spot trading.
 *
 * Architecture role: Capability / Business Logic
 * - Provides market data, quotes, order execution, portfolio, and order management.
 * - Integrates AutoBridgeService to ensure sufficient USDC before trading.
 * - Integrates GasAbstractionService for SERA's fee model.
 * - User-facing methods return clean, structured results for the DialogueResultNarrator.
 */
import { HyperliquidClient, HLOrderParams, HLOrderResult, HLSpotMarketData, HLAccountBalance, HLOpenOrder } from './HyperliquidClient';
import { HyperliquidTokenRegistry, HLResolvedToken } from './HyperliquidTokenRegistry';
import { AutoBridgeService } from './AutoBridgeService';
import { GasAbstractionService, FeeBreakdownResult } from '../wallet/GasAbstractionService';
import { UserSpotLedger } from './UserSpotLedger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HLSpotQuote {
  coin: string;
  side: 'buy' | 'sell';
  amountUsdc: number;
  estimatedCoinAmount: number;
  midPrice: number;
  feeBreakdown: FeeBreakdownResult;
  netAmountUsdc: number;   // amount after fees
  token: HLResolvedToken;
}

export interface HLSpotOrderResult {
  success: boolean;
  coin: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  amountUsdc: number;
  estimatedCoinAmount: number;
  orderId?: number;
  status?: string;
  filledSize?: string;
  avgPrice?: string;
  feeBreakdown: FeeBreakdownResult;
  bridgeRequired?: boolean;
  errorMessage?: string;
}

export interface HLPortfolioItem {
  coin: string;
  amount: number;
  holdAmount: number;     // locked in open orders
  valueUsdc: number;
}

export interface HLPortfolio {
  items: HLPortfolioItem[];
  totalValueUsdc: number;
  userAddress?: string;
}

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

export class HyperliquidSpotCapability {
  private client: HyperliquidClient;
  private tokenRegistry: HyperliquidTokenRegistry;
  private autoBridge: AutoBridgeService;
  private gasService: GasAbstractionService;
  private userLedger: UserSpotLedger;
  private minOrderUsdc: number;

  constructor(
    client: HyperliquidClient,
    tokenRegistry: HyperliquidTokenRegistry,
    autoBridge: AutoBridgeService,
    gasService: GasAbstractionService,
    userLedger?: UserSpotLedger
  ) {
    this.client = client;
    this.tokenRegistry = tokenRegistry;
    this.autoBridge = autoBridge;
    this.gasService = gasService;
    this.userLedger = userLedger || new UserSpotLedger();
    this.minOrderUsdc = parseFloat(process.env.HL_MIN_ORDER_USDC || '10.0');
  }

  // =========================================================================
  // MARKET DATA
  // =========================================================================

  /**
   * Fetches live market data for a specific token.
   */
  public async getMarketData(coin: string): Promise<HLSpotMarketData & { token: HLResolvedToken }> {
    const token = await this.tokenRegistry.resolveToken(coin);
    if (!token) {
      throw new Error(`Token "${coin}" is not available for spot trading on Hyperliquid.`);
    }

    const marketData = await this.client.getSpotMarketData(token.symbol);
    return { ...marketData, token };
  }

  /**
   * Fetches real-time top crypto tokens ranked dynamically by 24h trading volume directly from Hyperliquid L1 node.
   */
  public async getTopMarketData(limit: number = 10): Promise<Array<HLSpotMarketData & { token: HLResolvedToken }>> {
    const topMarkets = await this.client.getTopRankedTokens(limit);

    const resolvedResults = await Promise.all(
      topMarkets.map(async (m) => {
        try {
          const token = await this.tokenRegistry.resolveToken(m.coin);
          return {
            ...m,
            token: token || {
              symbol: m.coin,
              fullName: m.coin,
              spotAssetIndex: 10000,
              pairIndex: 0,
              szDecimals: 4,
              weiDecimals: 8,
              isCanonical: true
            }
          };
        } catch {
          return null;
        }
      })
    );

    return resolvedResults.filter((r): r is (HLSpotMarketData & { token: HLResolvedToken }) => r !== null);
  }

  // =========================================================================
  // QUOTING
  // =========================================================================

  /**
   * Calculates a quote for a spot trade including SERA fee breakdown.
   */
  public async getQuote(coin: string, side: 'buy' | 'sell', amountUsdc: number): Promise<HLSpotQuote> {
    if (amountUsdc < this.minOrderUsdc) {
      throw new Error(`Minimum order amount is $${this.minOrderUsdc} USDC.`);
    }

    const token = await this.tokenRegistry.resolveToken(coin);
    if (!token) {
      throw new Error(`Token "${coin}" is not available for spot trading on Hyperliquid.`);
    }

    const marketData = await this.client.getSpotMarketData(token.symbol);
    const feeBreakdown = this.gasService.calculateTotalTransactionFee('TRADING', amountUsdc);

    const netAmountUsdc = Math.max(0, amountUsdc - feeBreakdown.totalFeeUsdc);
    const estimatedCoinAmount = side === 'buy'
      ? netAmountUsdc / marketData.midPrice
      : amountUsdc / marketData.midPrice; // selling coin → get USDC

    return {
      coin: token.symbol,
      side,
      amountUsdc,
      estimatedCoinAmount: Number(estimatedCoinAmount.toFixed(6)),
      midPrice: marketData.midPrice,
      feeBreakdown,
      netAmountUsdc,
      token
    };
  }

  // =========================================================================
  // ORDER EXECUTION
  // =========================================================================

  /**
   * Executes a spot order with automatic bridging if needed.
   * This is the main entry point for trading.
   */
  public async executeOrder(params: {
    coin: string;
    side: 'buy' | 'sell';
    amountUsdc: number;
    orderType: 'market' | 'limit';
    limitPrice?: number;
    userAddress?: string;
  }): Promise<HLSpotOrderResult> {
    try {
      // 1. Validate minimum amount
      if (params.amountUsdc < this.minOrderUsdc) {
        return this.errorResult(params, `Minimum order amount is $${this.minOrderUsdc} USDC.`);
      }

      // 2. Resolve token
      const token = await this.tokenRegistry.resolveToken(params.coin);
      if (!token) {
        return this.errorResult(params, `Token "${params.coin}" is not available for spot trading.`);
      }

      // 3. Get quote and fee breakdown
      const quote = await this.getQuote(token.symbol, params.side, params.amountUsdc);

      // 4. For buy orders: ensure sufficient USDC on Hyperliquid
      let bridgeRequired = false;
      if (params.side === 'buy') {
        const bridgeCheck = await this.autoBridge.ensureSufficientBalance(params.amountUsdc);
        bridgeRequired = bridgeCheck.bridgeRequired;

        if (bridgeCheck.bridgeRequired && !bridgeCheck.bridgeResult?.success) {
          return {
            success: false,
            coin: token.symbol,
            side: params.side,
            orderType: params.orderType,
            amountUsdc: params.amountUsdc,
            estimatedCoinAmount: quote.estimatedCoinAmount,
            feeBreakdown: quote.feeBreakdown,
            bridgeRequired: true,
            errorMessage: bridgeCheck.bridgeResult?.errorMessage || 'Insufficient USDC balance on Hyperliquid.'
          };
        }
      }

      // 5. Place the order
      const orderParams: HLOrderParams = {
        coin: token.symbol,
        side: params.side,
        orderType: params.orderType,
        sizeUsdc: quote.netAmountUsdc,
        limitPrice: params.limitPrice,
        slippagePercent: 1.0
      };

      console.log(`[HyperliquidSpotCapability] Executing ${params.orderType} ${params.side} order:`);
      console.log(`  └─ ${params.amountUsdc} USDC → ~${quote.estimatedCoinAmount} ${token.symbol}`);
      console.log(`  └─ Fee: $${quote.feeBreakdown.totalFeeUsdc} (0.20% volume + gas surcharge)`);

      const result = await this.client.placeOrder(orderParams, token.spotAssetIndex);

      // 6. Record fill in UserSpotLedger if order succeeded and userAddress is known
      if (result.success && params.userAddress) {
        const filledAmount = result.filledSize ? parseFloat(result.filledSize) : quote.estimatedCoinAmount;
        if (params.side === 'buy') {
          this.userLedger.recordBuy(params.userAddress, token.symbol, filledAmount, params.amountUsdc);
        } else {
          this.userLedger.recordSell(params.userAddress, token.symbol, filledAmount, params.amountUsdc);
        }
      }

      return {
        success: result.success,
        coin: token.symbol,
        side: params.side,
        orderType: params.orderType,
        amountUsdc: params.amountUsdc,
        estimatedCoinAmount: quote.estimatedCoinAmount,
        orderId: result.orderId,
        status: result.status,
        filledSize: result.filledSize,
        avgPrice: result.avgPrice,
        feeBreakdown: quote.feeBreakdown,
        bridgeRequired,
        errorMessage: result.errorMessage
      };
    } catch (error: any) {
      console.error('[HyperliquidSpotCapability] executeOrder error:', error.message);
      return this.errorResult(params, error.message);
    }
  }

  // =========================================================================
  // ORDER MANAGEMENT
  // =========================================================================

  /**
   * Cancels a resting limit order.
   */
  public async cancelOrder(coin: string, orderId: number): Promise<HLOrderResult> {
    const token = await this.tokenRegistry.resolveToken(coin);
    if (!token) {
      return { success: false, errorMessage: `Token "${coin}" not found.` };
    }
    return this.client.cancelOrder(coin, orderId, token.spotAssetIndex);
  }

  /**
   * Returns all open (resting) orders.
   */
  public async getOpenOrders(): Promise<HLOpenOrder[]> {
    return this.client.getOpenOrders();
  }

  // =========================================================================
  // PORTFOLIO
  // =========================================================================

  /**
   * Aggregates spot token holdings for a specific user with live USD valuations.
   */
  public async getPortfolio(userAddress?: string): Promise<HLPortfolio> {
    if (!userAddress) {
      return { items: [], totalValueUsdc: 0 };
    }

    const userHoldings = this.userLedger.getUserHoldings(userAddress);
    const items: HLPortfolioItem[] = [];
    let totalValueUsdc = 0;

    for (const holding of userHoldings) {
      let valueUsdc = 0;
      try {
        const marketData = await this.client.getSpotMarketData(holding.coin);
        valueUsdc = holding.amount * marketData.midPrice;
      } catch {
        valueUsdc = 0;
      }

      items.push({
        coin: holding.coin,
        amount: holding.amount,
        holdAmount: 0,
        valueUsdc: Number(valueUsdc.toFixed(2))
      });

      totalValueUsdc += valueUsdc;
    }

    return {
      items,
      totalValueUsdc: Number(totalValueUsdc.toFixed(2)),
      userAddress
    };
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private errorResult(params: { coin: string; side: 'buy' | 'sell'; amountUsdc: number; orderType: 'market' | 'limit' }, message: string): HLSpotOrderResult {
    return {
      success: false,
      coin: params.coin,
      side: params.side,
      orderType: params.orderType,
      amountUsdc: params.amountUsdc,
      estimatedCoinAmount: 0,
      feeBreakdown: this.gasService.calculateTotalTransactionFee('TRADING', params.amountUsdc),
      errorMessage: message
    };
  }
}
