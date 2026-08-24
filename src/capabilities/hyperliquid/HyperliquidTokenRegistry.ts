/**
 * HyperliquidTokenRegistry — Resolves token symbols to Hyperliquid spot asset indices.
 *
 * Architecture role: Capability / Token Resolution
 * - Fetches spotMeta on first use and caches the full token list.
 * - Refreshes cache every 5 minutes.
 * - Maps user-friendly symbol queries to Hyperliquid's internal asset index (10000 + pair_index).
 */
import { HyperliquidClient, HLSpotMeta, HLSpotToken, HLSpotPair } from './HyperliquidClient';

export interface HLResolvedToken {
  symbol: string;
  fullName: string;
  spotAssetIndex: number;      // 10000 + pair index (used for order placement)
  pairIndex: number;           // raw pair index in spotMeta.universe
  szDecimals: number;          // size decimal precision for this token
  weiDecimals: number;
  isCanonical: boolean;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class HyperliquidTokenRegistry {
  private client: HyperliquidClient;
  private cache: HLResolvedToken[] = [];
  private lastFetchedAt: number = 0;
  private fetchPromise: Promise<void> | null = null;

  constructor(client: HyperliquidClient) {
    this.client = client;
  }

  /**
   * Ensures the token cache is fresh. Only fetches if stale or empty.
   */
  private async ensureCache(): Promise<void> {
    const now = Date.now();
    if (this.cache.length > 0 && (now - this.lastFetchedAt) < CACHE_TTL_MS) {
      return; // Cache is fresh
    }

    // Prevent concurrent fetches
    if (this.fetchPromise) {
      await this.fetchPromise;
      return;
    }

    this.fetchPromise = this.refreshCache();
    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }
  }

  /**
   * Refreshes the token cache from Hyperliquid's spotMeta endpoint.
   */
  private async refreshCache(): Promise<void> {
    try {
      const meta: HLSpotMeta = await this.client.getSpotMeta();
      const resolved: HLResolvedToken[] = [];

      for (let i = 0; i < meta.universe.length; i++) {
        const pair = meta.universe[i];
        const baseTokenIndex = pair.tokens[0];
        const baseToken = meta.tokens[baseTokenIndex];

        if (!baseToken) continue;

        resolved.push({
          symbol: pair.name.toUpperCase(),
          fullName: baseToken.fullName || baseToken.name || pair.name,
          spotAssetIndex: 10000 + i,
          pairIndex: i,
          szDecimals: baseToken.szDecimals,
          weiDecimals: baseToken.weiDecimals,
          isCanonical: pair.isCanonical
        });
      }

      this.cache = resolved;
      this.lastFetchedAt = Date.now();
      console.log(`[HyperliquidTokenRegistry] Cached ${resolved.length} spot tokens from Hyperliquid.`);
    } catch (error: any) {
      console.error('[HyperliquidTokenRegistry] Failed to refresh token cache:', error.message);
      // Keep stale cache if refresh fails
      if (this.cache.length === 0) {
        throw new Error('Unable to fetch Hyperliquid spot token list. Please try again later.');
      }
    }
  }

  /**
   * Resolves a user query (symbol or name) to a Hyperliquid spot token.
   */
  public async resolveToken(query: string): Promise<HLResolvedToken | null> {
    await this.ensureCache();

    const cleanQuery = query.trim().toUpperCase();

    // 0. Canonical Major Asset Aliases (Always prioritized)
    const CANONICAL_MAJOR_ASSETS: Record<string, { symbol: string; fullName: string }> = {
      'ETH': { symbol: 'ETH', fullName: 'Ethereum' },
      'ETHEREUM': { symbol: 'ETH', fullName: 'Ethereum' },
      'ETHER': { symbol: 'ETH', fullName: 'Ethereum' },
      'BTC': { symbol: 'BTC', fullName: 'Bitcoin' },
      'BITCOIN': { symbol: 'BTC', fullName: 'Bitcoin' },
      'SOL': { symbol: 'SOL', fullName: 'Solana' },
      'SOLANA': { symbol: 'SOL', fullName: 'Solana' },
      'HYPE': { symbol: 'HYPE', fullName: 'Hyperliquid' },
      'HYPERLIQUID': { symbol: 'HYPE', fullName: 'Hyperliquid' },
      'PURR': { symbol: 'PURR', fullName: 'Purr' },
      'ARB': { symbol: 'ARB', fullName: 'Arbitrum' },
      'ARBITRUM': { symbol: 'ARB', fullName: 'Arbitrum' },
      'DOGE': { symbol: 'DOGE', fullName: 'Dogecoin' },
      'AVAX': { symbol: 'AVAX', fullName: 'Avalanche' },
      'BNB': { symbol: 'BNB', fullName: 'BNB Chain' },
      'LINK': { symbol: 'LINK', fullName: 'Chainlink' },
      'SUI': { symbol: 'SUI', fullName: 'Sui' },
    };

    if (CANONICAL_MAJOR_ASSETS[cleanQuery]) {
      const canonical = CANONICAL_MAJOR_ASSETS[cleanQuery];
      // Check if there is an exact spot pair in cache
      const cached = this.cache.find(t => t.symbol === canonical.symbol);
      if (cached) {
        return { ...cached, fullName: canonical.fullName };
      }
      // Return canonical token definition
      return {
        symbol: canonical.symbol,
        fullName: canonical.fullName,
        spotAssetIndex: 10000,
        pairIndex: 0,
        szDecimals: 4,
        weiDecimals: 8,
        isCanonical: true
      };
    }

    // 1. Exact symbol match in cached spot tokens
    const exactMatch = this.cache.find(t => t.symbol === cleanQuery);
    if (exactMatch) return exactMatch;

    // 2. Exact word match in full name (e.g. "PURR" or "PEPE")
    const wordRegex = new RegExp(`\\b${cleanQuery}\\b`, 'i');
    const exactWordMatch = this.cache.find(t => wordRegex.test(t.fullName));
    if (exactWordMatch) return exactWordMatch;

    // 3. Prefix match in symbol or full name
    const prefixMatch = this.cache.find(
      t => t.symbol.startsWith(cleanQuery) || t.fullName.toUpperCase().startsWith(cleanQuery)
    );
    if (prefixMatch) return prefixMatch;

    return null;
  }

  /**
   * Returns the spot asset index (10000 + pair_index) for order placement.
   */
  public async getSpotAssetIndex(symbol: string): Promise<number> {
    const token = await this.resolveToken(symbol);
    if (!token) {
      throw new Error(`Token "${symbol}" is not available for spot trading on Hyperliquid.`);
    }
    return token.spotAssetIndex;
  }

  /**
   * Returns all available spot tokens.
   */
  public async getAllSpotTokens(): Promise<HLResolvedToken[]> {
    await this.ensureCache();
    return [...this.cache];
  }

  /**
   * Returns all canonical (primary) spot tokens.
   */
  public async getCanonicalTokens(): Promise<HLResolvedToken[]> {
    await this.ensureCache();
    return this.cache.filter(t => t.isCanonical);
  }
}
