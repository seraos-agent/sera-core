export function formatHyperliquidMarketSummary(data: Record<string, any>): string {
  const price = data.mid || data.markPrice || 'n/a';
  const spread = data.bestBid?.price && data.bestAsk?.price ? `${data.bestBid.price} / ${data.bestAsk.price}` : 'n/a';
  return `${data.coin} Hyperliquid (read-only): mid ${price}; bid/ask ${spread}; funding ${data.funding ?? 'n/a'}; OI ${data.openInterest ?? 'n/a'}; 24h notional ${data.dayNotionalVolume ?? 'n/a'}.`;
}
