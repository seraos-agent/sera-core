export function formatHyperliquidMarketSummary(data: Record<string, any>): string {
  const price = data.mid || data.markPrice || 'n/a';
  const spread = data.bestBid?.price && data.bestAsk?.price ? `${data.bestBid.price} / ${data.bestAsk.price}` : 'n/a';
  return `${data.coin} Hyperliquid (read-only): mid ${price}; bid/ask ${spread}; funding ${data.funding ?? 'n/a'}; OI ${data.openInterest ?? 'n/a'}; 24h notional ${data.dayNotionalVolume ?? 'n/a'}.`;
}

export function analyzeHyperliquidMarketSnapshot(data: Record<string, any>): { observations: string[]; boundedInterpretation: string[]; limitations: string[] } {
  const observations = [
    `Mid ${data.mid ?? data.markPrice ?? 'n/a'}; best bid ${data.bestBid?.price ?? 'n/a'}; best ask ${data.bestAsk?.price ?? 'n/a'}.`,
    `Funding ${data.funding ?? 'n/a'}; open interest ${data.openInterest ?? 'n/a'}; 24h notional ${data.dayNotionalVolume ?? 'n/a'}.`
  ];
  const boundedInterpretation = [
    'A tight bid-ask spread describes top-of-book liquidity at this snapshot only.',
    'Funding and open interest describe positioning conditions; neither establishes a directional trade signal on its own.'
  ];
  const limitations = [
    'Displayed orders can be cancelled or filled; order-book imbalance is not proof of future price direction.',
    'This snapshot cannot establish institutional participation, market stability, or causation without historical comparison and validation.'
  ];
  return { observations, boundedInterpretation, limitations };
}
