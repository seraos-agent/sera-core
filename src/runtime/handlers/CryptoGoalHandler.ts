import { BaseSpotMarketCapability } from '../../capabilities/spot/BaseSpotMarketCapability';
import { TokenResolverService } from '../../capabilities/spot/TokenResolverService';
import { HyperliquidSpotCapability } from '../../capabilities/hyperliquid/HyperliquidSpotCapability';
import { EmitResultFn } from './types';

/**
 * CryptoGoalHandler — Manages on-chain spot swaps, token resolution, and Hyperliquid spot trading.
 */
export class CryptoGoalHandler {
  private readonly spotMarket = new BaseSpotMarketCapability();
  private readonly tokenResolver = new TokenResolverService();

  constructor(
    private readonly getHyperliquidSpotCapability: () => HyperliquidSpotCapability,
    private readonly sessionId: string,
    private readonly emitResult: EmitResultFn,
    private readonly personalWalletAddress?: string,
    private readonly getCurrentWalletAddress?: () => string | undefined
  ) {}

  private get hlSpot(): HyperliquidSpotCapability {
    return this.getHyperliquidSpotCapability();
  }

  public async handleSpotSwap(requestId: string, parameters: Record<string, any>): Promise<void> {
    const fromToken = parameters.fromToken || 'USDC';
    const toToken = parameters.toToken || 'WETH';
    const amountIn = Number(parameters.amount || 10);
    const recipient = parameters.recipient || (this.getCurrentWalletAddress ? this.getCurrentWalletAddress() : undefined) || '0x0000000000000000000000000000000000000000';

    const result = await this.spotMarket.executeSpotSwap({
      fromTokenSymbol: fromToken,
      toTokenSymbol: toToken,
      amountInUsdc: amountIn,
      recipientAddress: recipient
    });

    this.emitResult(requestId, result.success, result, result.errorMessage);
  }

  public async handleResolveToken(requestId: string, parameters: Record<string, any>): Promise<void> {
    const query = String(parameters.query || parameters.coin || 'WETH');
    const metadata = await this.tokenResolver.resolveToken(query);
    this.emitResult(requestId, true, metadata);
  }

  public async handleHLSpotMarketData(requestId: string, parameters: Record<string, any>): Promise<void> {
    const rawCoin = String(parameters.coin || parameters.query || parameters.symbol || '').trim();
    const isTopQuery = !rawCoin || ['all', 'top', 'coins', 'crypto', 'tokens', 'market', 'rankings', 'overview'].includes(rawCoin.toLowerCase()) || parameters.limit !== undefined;

    if (isTopQuery) {
      const limit = Number(parameters.limit || 10);
      const topData = await this.hlSpot.getTopMarketData(limit);
      this.emitResult(requestId, true, {
        provider: 'Hyperliquid Spot',
        mode: 'TOP_MARKET_OVERVIEW',
        count: topData.length,
        tokens: topData.map(d => ({
          symbol: d.coin,
          name: d.token.fullName,
          priceUsdc: d.midPrice,
          bestBid: d.bestBid,
          bestAsk: d.bestAsk,
          volume24h: d.volume24h,
          priceChange24hPercent: d.priceChange24hPercent
        }))
      });
      return;
    }

    const data = await this.hlSpot.getMarketData(rawCoin);
    this.emitResult(requestId, true, {
      provider: 'Hyperliquid Spot',
      mode: 'SPOT',
      symbol: data.coin,
      name: data.token.fullName,
      midPrice: data.midPrice,
      bestBid: data.bestBid,
      bestAsk: data.bestAsk,
      volume24h: data.volume24h,
      priceChange24hPercent: data.priceChange24hPercent
    });
  }

  public async handleHLSpotOrder(requestId: string, parameters: Record<string, any>): Promise<void> {
    const coin = String(parameters.coin || '').trim();
    const side = (parameters.side || 'buy') as 'buy' | 'sell';
    const amount = Number(parameters.amount || 0);
    const orderType = (parameters.orderType || 'market') as 'market' | 'limit';
    const limitPrice = parameters.limitPrice ? Number(parameters.limitPrice) : undefined;
    const userAddress = this.personalWalletAddress || this.sessionId;

    if (!coin) throw new Error('Please specify which token to trade (e.g. HYPE, ETH, BTC).');
    if (amount <= 0) throw new Error('Please specify a valid amount in USDC.');

    const result = await this.hlSpot.executeOrder({
      coin,
      side,
      amountUsdc: amount,
      orderType,
      limitPrice,
      userAddress
    });
    this.emitResult(requestId, result.success, result, result.errorMessage);
  }

  public async handleHLSpotCancel(requestId: string, parameters: Record<string, any>): Promise<void> {
    const coin = String(parameters.coin || '').trim();
    const orderId = Number(parameters.orderId || 0);

    if (!coin) throw new Error('Please specify the token symbol of the order to cancel.');
    if (!orderId) throw new Error('Please specify the order ID to cancel.');

    const result = await this.hlSpot.cancelOrder(coin, orderId);
    this.emitResult(requestId, result.success, result, result.errorMessage);
  }

  public async handleHLSpotPortfolio(requestId: string): Promise<void> {
    const userAddress = this.personalWalletAddress || this.sessionId;
    const portfolio = await this.hlSpot.getPortfolio(userAddress);
    this.emitResult(requestId, true, {
      provider: 'Hyperliquid Spot',
      mode: 'PORTFOLIO',
      items: portfolio.items,
      totalValueUsdc: portfolio.totalValueUsdc,
      userAddress
    });
  }

  public async handleHLSpotOpenOrders(requestId: string): Promise<void> {
    const orders = await this.hlSpot.getOpenOrders();
    this.emitResult(requestId, true, {
      provider: 'Hyperliquid Spot',
      mode: 'OPEN_ORDERS',
      orders: orders.map(o => ({
        coin: o.coin,
        side: o.side === 'B' ? 'buy' : 'sell',
        price: o.limitPx,
        size: o.sz,
        orderId: o.oid,
        timestamp: o.timestamp
      }))
    });
  }
}
