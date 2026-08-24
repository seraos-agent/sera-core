/**
 * HyperliquidClient — Low-level API wrapper for Hyperliquid Info & Exchange endpoints.
 *
 * Architecture role: Capability / Infrastructure adapter.
 * - Info endpoints (read-only, no auth): market data, balances, open orders.
 * - Exchange endpoints (EIP-712 signed): place order, cancel order.
 *
 * Uses the @nktkas/hyperliquid community TypeScript SDK.
 * Defaults to testnet; set HYPERLIQUID_MAINNET=true for production.
 */
import { privateKeyToAccount } from 'viem/accounts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HLSpotMeta {
  tokens: HLSpotToken[];
  universe: HLSpotPair[];
}

export interface HLSpotToken {
  name: string;
  szDecimals: number;
  weiDecimals: number;
  index: number;
  isCanonical: boolean;
  evmContract: string | null;
  fullName: string | null;
}

export interface HLSpotPair {
  name: string;
  tokens: [number, number]; // [base token index, quote token index]
  index: number;
  isCanonical: boolean;
}

export interface HLSpotMarketData {
  coin: string;
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  volume24h: number;
  prevDayPx: number;
  priceChange24hPercent: number;
}

export interface HLAccountBalance {
  coin: string;
  hold: string;   // locked in open orders
  total: string;  // total balance
  entryNtl: string;
  token: number;
}

export interface HLOpenOrder {
  coin: string;
  limitPx: string;
  oid: number;
  side: 'B' | 'A';  // B = buy, A = sell (ask)
  sz: string;
  timestamp: number;
}

export interface HLOrderParams {
  coin: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  sizeUsdc: number;         // for market orders: amount in USDC
  sizeCoin?: number;        // for limit orders: amount in coin units
  limitPrice?: number;      // required for limit orders
  slippagePercent?: number; // market order slippage tolerance (default 1%)
}

export interface HLOrderResult {
  success: boolean;
  orderId?: number;
  status?: string;
  filledSize?: string;
  avgPrice?: string;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HL_MAINNET_URL = 'https://api.hyperliquid.xyz';
const HL_TESTNET_URL = 'https://api.hyperliquid-testnet.xyz';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class HyperliquidClient {
  private readonly baseUrl: string;
  private readonly isMainnet: boolean;
  private readonly agentPrivateKey: string | null;
  private readonly masterAddress: string | null;

  constructor() {
    this.isMainnet = process.env.HYPERLIQUID_MAINNET === 'true';
    this.baseUrl = this.isMainnet ? HL_MAINNET_URL : HL_TESTNET_URL;
    this.agentPrivateKey = process.env.HYPERLIQUID_AGENT_PRIVATE_KEY || null;
    this.masterAddress = process.env.HYPERLIQUID_MASTER_ADDRESS || null;

    const env = this.isMainnet ? 'MAINNET' : 'TESTNET';
    console.log(`[HyperliquidClient] Initialized on ${env} (${this.baseUrl})`);
    if (!this.agentPrivateKey) {
      console.warn('[HyperliquidClient] HYPERLIQUID_AGENT_PRIVATE_KEY not set — exchange operations will fail.');
    }
  }

  // =========================================================================
  // INFO ENDPOINTS (read-only, no auth)
  // =========================================================================

  /**
   * Fetches all spot token metadata and trading pairs.
   */
  public async getSpotMeta(): Promise<HLSpotMeta> {
    const response = await this.infoRequest({ type: 'spotMeta' });
    return response as HLSpotMeta;
  }

  /**
   * Fetches live spot market data for a specific coin.
   * Supports both major assets (ETH, BTC, SOL, etc.) and native spot tokens (HYPE, PURR).
   */
  public async getSpotMarketData(coin: string): Promise<HLSpotMarketData> {
    const cleanCoin = coin.toUpperCase().trim();
    
    // 1. Fetch live mid prices across all Hyperliquid markets
    const allMids = await this.infoRequest({ type: 'allMids' }) as Record<string, string>;
    const midPriceStr = allMids[cleanCoin] || allMids[`@${cleanCoin}`] || '0';
    const midPrice = parseFloat(midPriceStr);

    // 2. Fetch 24h market context for major assets (Perps/Spot unified)
    try {
      const perpContexts = await this.infoRequest({ type: 'metaAndAssetCtxs' });
      const universe = (perpContexts as any[])[0]?.universe || [];
      const assetCtxs = (perpContexts as any[])[1] || [];

      const perpIndex = universe.findIndex((u: any) => u.name.toUpperCase() === cleanCoin);
      if (perpIndex >= 0 && assetCtxs[perpIndex]) {
        const ctx = assetCtxs[perpIndex];
        const prevDayPx = parseFloat(ctx.prevDayPx || '0');
        const volume24h = parseFloat(ctx.dayNtlVlm || '0');
        const priceChange24hPercent = prevDayPx > 0
          ? ((midPrice - prevDayPx) / prevDayPx) * 100
          : 0;

        return {
          coin: cleanCoin,
          midPrice,
          bestBid: midPrice * 0.9995,
          bestAsk: midPrice * 1.0005,
          volume24h,
          prevDayPx,
          priceChange24hPercent: Number(priceChange24hPercent.toFixed(2))
        };
      }
    } catch (e: any) {
      console.warn('[HyperliquidClient] metaAndAssetCtxs fallback:', e.message);
    }

    // 3. Fallback to spot universe for native spot-only pairs (e.g. PURR)
    try {
      const contexts = await this.infoRequest({ type: 'spotMetaAndAssetCtxs' });
      const meta = (contexts as any[])[0] as HLSpotMeta;
      const assetCtxs = (contexts as any[])[1] || [];

      const pairIndex = meta?.universe?.findIndex(
        (p: HLSpotPair) => p.name.toUpperCase() === cleanCoin || p.name.toUpperCase() === `${cleanCoin}/USDC`
      ) ?? -1;

      const ctx = (pairIndex >= 0 ? assetCtxs[pairIndex] : {}) || {};
      const prevDayPx = parseFloat(ctx.prevDayPx || '0');
      const volume24h = parseFloat(ctx.dayNtlVlm || '0');
      const priceChange24hPercent = prevDayPx > 0
        ? ((midPrice - prevDayPx) / prevDayPx) * 100
        : 0;

      return {
        coin: cleanCoin,
        midPrice,
        bestBid: midPrice * 0.999,
        bestAsk: midPrice * 1.001,
        volume24h,
        prevDayPx,
        priceChange24hPercent: Number(priceChange24hPercent.toFixed(2))
      };
    } catch {
      return {
        coin: cleanCoin,
        midPrice,
        bestBid: midPrice * 0.999,
        bestAsk: midPrice * 1.001,
        volume24h: 0,
        prevDayPx: midPrice,
        priceChange24hPercent: 0
      };
    }
  }

  /**
   * Fetches spot balances for a given wallet address.
   */
  public async getAccountBalances(address?: string): Promise<HLAccountBalance[]> {
    const addr = address || this.masterAddress;
    if (!addr) throw new Error('No wallet address available for balance query.');

    const response = await this.infoRequest({
      type: 'spotClearinghouseState',
      user: addr
    });

    return (response as any).balances || [];
  }

  /**
   * Fetches open orders for a given wallet address.
   */
  public async getOpenOrders(address?: string): Promise<HLOpenOrder[]> {
    const addr = address || this.masterAddress;
    if (!addr) throw new Error('No wallet address available for open orders query.');

    const response = await this.infoRequest({
      type: 'openOrders',
      user: addr
    });

    return response as HLOpenOrder[];
  }

  // =========================================================================
  // EXCHANGE ENDPOINTS (EIP-712 signed)
  // =========================================================================

  /**
   * Places a spot order on Hyperliquid.
   * Spot assets use index: 10000 + pair_index from spotMeta.
   */
  public async placeOrder(params: HLOrderParams, spotAssetIndex: number): Promise<HLOrderResult> {
    if (!this.agentPrivateKey || !this.masterAddress) {
      return {
        success: false,
        errorMessage: 'Hyperliquid agent wallet not configured. Set HYPERLIQUID_AGENT_PRIVATE_KEY and HYPERLIQUID_MASTER_ADDRESS.'
      };
    }

    try {
      const isBuy = params.side === 'buy';

      // For market orders: use IOC with aggressive price
      // For limit orders: use GTC with exact price
      let price: string;
      let tif: string;

      if (params.orderType === 'market') {
        // Market order simulated via IOC with slippage
        const slippage = params.slippagePercent || 1.0;
        const marketData = await this.getSpotMarketData(params.coin);
        const basePrice = isBuy ? marketData.bestAsk : marketData.bestBid;
        const slippageMultiplier = isBuy ? (1 + slippage / 100) : (1 - slippage / 100);
        price = (basePrice * slippageMultiplier).toFixed(6);
        tif = 'Ioc';
      } else {
        // Limit order
        if (!params.limitPrice) {
          return { success: false, errorMessage: 'Limit price is required for limit orders.' };
        }
        price = params.limitPrice.toFixed(6);
        tif = 'Gtc';
      }

      // Calculate size in coin units
      let sizeCoin: string;
      if (params.sizeCoin) {
        sizeCoin = params.sizeCoin.toFixed(6);
      } else {
        // Convert USDC amount to coin units
        const marketData = await this.getSpotMarketData(params.coin);
        const coinAmount = params.sizeUsdc / marketData.midPrice;
        sizeCoin = coinAmount.toFixed(6);
      }

      // Build the order action payload
      const orderAction = {
        type: 'order',
        orders: [{
          a: spotAssetIndex,  // 10000 + pair index for spot
          b: isBuy,
          p: price,
          s: sizeCoin,
          r: false,           // not reduce-only for spot
          t: { limit: { tif } }
        }],
        grouping: 'na'
      };

      const result = await this.exchangeRequest(orderAction);

      // Parse response
      const response = result?.response;
      if (response?.type === 'order') {
        const statuses = response.data?.statuses || [];
        const firstStatus = statuses[0] || {};

        if (firstStatus.filled || firstStatus.resting) {
          const fillData = firstStatus.filled || firstStatus.resting;
          return {
            success: true,
            orderId: fillData.oid,
            status: firstStatus.filled ? 'filled' : 'resting',
            filledSize: fillData.totalSz || sizeCoin,
            avgPrice: fillData.avgPx || price
          };
        }

        if (firstStatus.error) {
          return { success: false, errorMessage: firstStatus.error };
        }
      }

      return {
        success: true,
        status: 'submitted',
        orderId: undefined
      };
    } catch (error: any) {
      console.error('[HyperliquidClient] placeOrder error:', error.message);
      return { success: false, errorMessage: error.message };
    }
  }

  /**
   * Cancels a resting limit order.
   */
  public async cancelOrder(coin: string, orderId: number, spotAssetIndex: number): Promise<HLOrderResult> {
    if (!this.agentPrivateKey || !this.masterAddress) {
      return {
        success: false,
        errorMessage: 'Hyperliquid agent wallet not configured.'
      };
    }

    try {
      const cancelAction = {
        type: 'cancel',
        cancels: [{ a: spotAssetIndex, o: orderId }]
      };

      await this.exchangeRequest(cancelAction);
      return { success: true, status: 'cancelled', orderId };
    } catch (error: any) {
      console.error('[HyperliquidClient] cancelOrder error:', error.message);
      return { success: false, errorMessage: error.message };
    }
  }

  /**
   * Returns the master wallet address.
   */
  public getMasterAddress(): string | null {
    return this.masterAddress;
  }

  // =========================================================================
  // INTERNAL HTTP HELPERS
  // =========================================================================

  private async infoRequest(payload: Record<string, any>): Promise<any> {
    const url = `${this.baseUrl}/info`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid Info API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private async exchangeRequest(action: Record<string, any>): Promise<any> {
    if (!this.agentPrivateKey || !this.masterAddress) {
      throw new Error('Agent wallet not configured.');
    }

    const nonce = Date.now();
    const connectionId = this.isMainnet
      ? '0xa4B1000000000000000000000000000000000000' // Mainnet connection
      : '0x0000000000000000000000000000000000000000'; // Testnet

    // EIP-712 typed data for Hyperliquid exchange actions
    const domain = {
      name: 'Exchange',
      version: '1',
      chainId: 1337,
      verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`
    };

    const types = {
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' }
      ]
    };

    // Sign with the agent private key
    const account = privateKeyToAccount(this.agentPrivateKey as `0x${string}`);
    const { signTypedData } = await import('viem/accounts');

    const signature = await signTypedData({
      privateKey: this.agentPrivateKey as `0x${string}`,
      domain,
      types,
      primaryType: 'Agent',
      message: {
        source: 'a',
        connectionId: connectionId as `0x${string}`
      }
    });

    const url = `${this.baseUrl}/exchange`;
    const body = {
      action,
      nonce,
      signature,
      vaultAddress: null
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hyperliquid Exchange API error: ${response.status} — ${errorText}`);
    }

    return response.json();
  }
}
