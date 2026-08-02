import { ClobClient, Side } from '@polymarket/clob-client';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { SecretManager } from '../../core/secrets/SecretManager';

export class PolymarketService {
  private secretManager: SecretManager;
  private client: ClobClient | null = null;
  private isInitialized = false;

  constructor(secretManager: SecretManager) {
    this.secretManager = secretManager;
  }

  /**
   * Initializes the CLOB client by generating or loading L2 credentials via EIP-712.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized && this.client) return;

    const privateKey = await this.secretManager.getAgenticWalletPrivateKey();
    if (!privateKey) throw new Error('[PolymarketService] No agentic wallet found.');

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com')
    });

    try {
      const host = 'https://clob.polymarket.com';
      const chainId = 137;
      
      const tempClient = new ClobClient(host, chainId, walletClient);
      const creds = await tempClient.createApiKey();
      
      this.client = new ClobClient(host, chainId, walletClient, creds);
      this.isInitialized = true;
      console.log('[PolymarketService] ✅ Successfully authenticated with Polymarket CLOB.');
    } catch (error: any) {
      console.error('[PolymarketService] ❌ Failed to initialize CLOB client:', error.message);
      throw error;
    }
  }

  /**
   * Searches for active markets on Polymarket.
   */
  public async searchMarkets(query: string = '', limit: number = 10): Promise<any> {
    try {
      const url = `https://gamma-api.polymarket.com/events?query=${encodeURIComponent(query)}&active=true&closed=false`;
      const res = await fetch(url);
      const events = await res.json();
      
      let results: any[] = [];
      for (const event of events) {
        if (!event.markets) continue;
        for (const m of event.markets) {
          if (m.active && !m.closed) {
            let clobTokenIds = [];
            try { clobTokenIds = JSON.parse(m.clobTokenIds || '[]'); } catch (e) {}
            let outcomes = [];
            try { outcomes = JSON.parse(m.outcomes || '[]'); } catch (e) {}
            
            results.push({
              title: event.title || m.question,
              question: m.question,
              conditionId: m.conditionId,
              outcomes: outcomes,
              clobTokenIds: clobTokenIds,
              volume: m.volumeNum
            });
          }
        }
      }
      
      // Sort by volume descending
      results.sort((a, b) => (b.volume || 0) - (a.volume || 0));
      
      return results.slice(0, limit);
    } catch (error: any) {
      throw new Error(`Failed to search markets: ${error.message}`);
    }
  }

  /**
   * Submits a trade order to the CLOB.
   * side: 'BUY' or 'SELL'
   * orderType: 'MARKET' or 'LIMIT'
   */
  public async submitOrder(
    tokenId: string, 
    side: 'BUY' | 'SELL', 
    amountShares: number, 
    orderType: 'MARKET' | 'LIMIT', 
    price?: number
  ): Promise<any> {
    await this.initialize();
    try {
      let finalPrice = price;
      
      // If Market order, we must calculate the clearing price based on the orderbook
      if (orderType === 'MARKET') {
        const book = await this.client!.getOrderBook(tokenId);
        
        // Very basic implementation: buy at the best ask + a small slippage tolerance, sell at best bid - tolerance
        if (side === 'BUY') {
          if (!book.asks || book.asks.length === 0) throw new Error('No asks available for market buy');
          const bestAsk = parseFloat(book.asks[0].price);
          finalPrice = Math.min(bestAsk + 0.01, 0.99); // max out at 99 cents
        } else {
          if (!book.bids || book.bids.length === 0) throw new Error('No bids available for market sell');
          const bestBid = parseFloat(book.bids[0].price);
          finalPrice = Math.max(bestBid - 0.01, 0.01);
        }
      }

      if (finalPrice === undefined) {
        throw new Error('Price is required for LIMIT orders');
      }

      return await this.client!.createOrder({
        tokenID: tokenId,
        price: finalPrice,
        side: side === 'BUY' ? Side.BUY : Side.SELL,
        size: amountShares,
        feeRateBps: 0,
      });
    } catch (error: any) {
      throw new Error(`Failed to submit order: ${error.message}`);
    }
  }

  /**
   * Gets the orderbook for a specific token (Yes/No share).
   */
  public async getOrderBook(tokenId: string): Promise<any> {
    await this.initialize();
    try {
      return await this.client!.getOrderBook(tokenId);
    } catch (error: any) {
      throw new Error(`Failed to get orderbook: ${error.message}`);
    }
  }
}
