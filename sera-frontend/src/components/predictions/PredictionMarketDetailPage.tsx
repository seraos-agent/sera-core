import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Zap, BarChart2 } from "lucide-react";
import { CountdownTimer } from "./CountdownTimer";
import { createChart, ColorType, AreaSeries, LineType, LineStyle } from "lightweight-charts";
import type { IChartApi, ISeriesApi, IPriceLine, LineData, Time } from "lightweight-charts";
import type { ThemeType } from "../../theme";
import type { Socket } from "socket.io-client";

interface Market {
  id: string;
  title: string;
  asset: string;
  strikePrice: number;
  expiryTime: number;
  resolved: boolean;
  outcome?: "UP" | "DOWN";
}

interface Order {
  id: string;
  userId: string;
  marketId: string;
  side: "UP" | "DOWN";
  amount: number;
  status: "PENDING" | "MATCHED" | "SETTLED";
}

interface MarketDetailProps {
  theme: ThemeType;
  socket: Socket;
  marketId: string;
  onBack: () => void;
  isMobileView: boolean;
}

import React from "react";

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <div style={{ color: 'red', padding: 20 }}>Crash: {this.state.error?.message}</div>;
    }
    return this.props.children;
  }
}

export function PredictionMarketDetailPage(props: MarketDetailProps) {
  return (
    <ErrorBoundary>
      <MarketDetailInner {...props} />
    </ErrorBoundary>
  );
}

function MarketDetailInner({ theme, socket, marketId, onBack, isMobileView }: MarketDetailProps) {
  const [market, setMarket] = useState<Market | null>(null);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [orderBook, setOrderBook] = useState<{ up: Order[]; down: Order[]; recentMatches?: Order[] }>({ up: [], down: [] });
  const [amount, setAmount] = useState<string>("10");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);

  useEffect(() => {
    socket.emit("arena:fetch_market_details", marketId);
    socket.emit("arena:fetch_portfolio");

    const onDetails = (data: { market: Market, priceHistory: any[], orderBook: { up: Order[], down: Order[], recentMatches?: Order[] } }) => {
      setMarket(data.market);
      setOrderBook(data.orderBook);
      setPriceHistory(data.priceHistory);
      if (data.priceHistory.length > 0) {
        setCurrentPrice(data.priceHistory[data.priceHistory.length - 1].close);
      }

      if (seriesRef.current && data.priceHistory.length > 0) {
        // lightweight-charts requires time to be sorted and unique
        const uniqueData = data.priceHistory.filter((v, i, a) => a.findIndex(t => t.time === v.time) === i);
        const mappedData = uniqueData.map(d => ({ time: d.time, value: d.close }));
        seriesRef.current.setData(mappedData as LineData<Time>[]);
      }
    };

    const onTick = (payload: { price: number, candle: any }) => {
      setCurrentPrice(payload.price);
      if (seriesRef.current && payload.candle) {
        seriesRef.current.update({ time: payload.candle.time, value: payload.candle.close } as LineData<Time>);
      }
    };

    const onPortfolio = (portfolio: { balance: number, orders: Order[] }) => {
      setBalance(portfolio.balance);
      setMyOrders(portfolio.orders);
    };

    // Also update orderbook if global markets update (we could optimize this later)
    const onMarkets = (markets: Market[]) => {
      const m = markets.find(x => x.id === marketId);
      if (m) setMarket(m);
    };

    socket.on("arena:market_details", onDetails);
    socket.on("arena:price_tick", onTick);
    socket.on("arena:portfolio", onPortfolio);
    socket.on("arena:markets", onMarkets);

    return () => {
      socket.off("arena:market_details", onDetails);
      socket.off("arena:price_tick", onTick);
      socket.off("arena:portfolio", onPortfolio);
      socket.off("arena:markets", onMarkets);
    };
  }, [marketId, socket]);

  // Setup Chart
  const isMarketLoaded = market !== null;
  useEffect(() => {
    if (!isMarketLoaded || !chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: theme.inkSoft,
      },
      grid: {
        vertLines: { color: theme.border },
        horzLines: { color: theme.border },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
      crosshair: {
        mode: 1,
      },
      autoSize: true,
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#f59e0b',
      topColor: 'rgba(245, 158, 11, 0.4)',
      bottomColor: 'rgba(245, 158, 11, 0.0)',
      lineWidth: 2,
      lineType: LineType.Curved,
    });

    priceLineRef.current = areaSeries.createPriceLine({
      price: market.strikePrice,
      color: '#38bdf8', // Sky blue for contrast
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'Target',
    });

    if (priceHistory.length > 0) {
      const uniqueData = priceHistory.filter((v, i, a) => a.findIndex(t => t.time === v.time) === i);
      const mappedData = uniqueData.map(d => ({ time: d.time, value: d.close }));
      areaSeries.setData(mappedData as LineData<Time>[]);
    }

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
    };
  }, [marketId, isMarketLoaded, theme]);

  // Dynamically update target line if strike price changes
  useEffect(() => {
    if (priceLineRef.current && market) {
      priceLineRef.current.applyOptions({ price: market.strikePrice });
    }
  }, [market?.strikePrice]);

  const placeOrder = (side: "UP" | "DOWN") => {
    if (!market || isSubmitting) return;
    const val = parseFloat(amount);
    if (isNaN(val) || val < 1) {
      setErrorMsg("Minimum bet is 1 USDC.");
      return;
    }
    if (val > balance) {
      setErrorMsg("Insufficient balance.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    socket.emit("arena:place_order", { marketId: market.id, side, amount: val });

    // Simulate slight delay to wait for portfolio update
    setTimeout(() => {
      setIsSubmitting(false);
      socket.emit("arena:fetch_portfolio");
      socket.emit("arena:fetch_market_details", marketId); // Refresh orderbook
    }, 500);
  };

  if (!market) {
    return (
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", color: theme.inkSoft }}>
        Loading market details...
      </div>
    );
  }

  // Extract timeLeft calculation if needed elsewhere, but CountdownTimer handles the display.

  // Aggregate orderbook (handled directly in parimutuel math now)

  const displayPrice = currentPrice || market.strikePrice;
  const isUp = displayPrice >= market.strikePrice;
  const priceDiff = Math.abs(displayPrice - market.strikePrice);

  // --- Parimutuel Math ---
  const val = parseFloat(amount) || 0;
  const currentTotalUp = orderBook.up.reduce((sum, o) => sum + o.amount, 0) + 50; // Includes 50 seed liquidity
  const currentTotalDown = orderBook.down.reduce((sum, o) => sum + o.amount, 0) + 50;
  
  // If user bets UP
  const newUpPoolIfUp = currentTotalUp + val;
  const grossPoolIfUp = newUpPoolIfUp + currentTotalDown;
  const netPoolIfUp = grossPoolIfUp * 0.98;
  const upPayout = val > 0 ? (val / newUpPoolIfUp) * netPoolIfUp : 0;
  const upMultiplier = val > 0 ? upPayout / val : 0;

  // If user bets DOWN
  const newDownPoolIfDown = currentTotalDown + val;
  const grossPoolIfDown = currentTotalUp + newDownPoolIfDown;
  const netPoolIfDown = grossPoolIfDown * 0.98;
  const downPayout = val > 0 ? (val / newDownPoolIfDown) * netPoolIfDown : 0;
  const downMultiplier = val > 0 ? downPayout / val : 0;

  // Sentiment Bar Math
  const upPercent = (currentTotalUp / (currentTotalUp + currentTotalDown)) * 100;
  const downPercent = 100 - upPercent;

  // Personal active orders
  const myActiveOrders = myOrders.filter(o => o.marketId === marketId && o.status === 'PENDING');

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "20px 24px",
        borderBottom: `1px solid ${theme.border}`,
        display: "flex",
        alignItems: "center",
        gap: 16
      }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", color: theme.inkSoft, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, padding: 0
        }}>
          <ArrowLeft size={20} /> Back
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: theme.inkSoft }}>
          <Zap size={16} color="#f59e0b" />
          <span style={{ fontWeight: 500 }}>Live Match</span>
        </div>
      </div>

      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: isMobileView ? "column" : "row",
        overflow: "auto"
      }}>
        {/* Left Column: Chart & Order Book */}
        <div style={{
          flex: 1,
          padding: isMobileView ? "16px 0" : 24,
          display: "flex",
          flexDirection: "column",
          gap: isMobileView ? 16 : 24,
          minWidth: 0,
          borderRight: "none"
        }}>
          {/* Market Title and Stats */}
          <div style={{ padding: isMobileView ? "0 16px" : 0, display: "flex", flexDirection: isMobileView ? "column" : "row", justifyContent: "space-between", alignItems: isMobileView ? "flex-start" : "flex-start", gap: isMobileView ? 16 : 0 }}>
            <div style={{ display: "flex", gap: isMobileView ? 12 : 16 }}>
              <div style={{ width: isMobileView ? 28 : 48, height: isMobileView ? 28 : 48, background: "#f59e0b", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", color: "white", fontSize: isMobileView ? 16 : 24, fontWeight: "bold", flexShrink: 0 }}>
                ₿
              </div>
              <div>
                <h1 style={{ margin: "0 0 12px 0", fontSize: isMobileView ? 18 : 24, fontWeight: 700, color: theme.ink }}>{market.title}</h1>
                <div style={{ display: "flex", flexWrap: "wrap", gap: isMobileView ? 16 : 40 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: isMobileView ? 12 : 13, color: theme.inkSoft }}>Price To Beat</span>
                    <span style={{ fontSize: isMobileView ? 18 : 22, fontWeight: 600, color: theme.inkSoft }}>
                      {market.strikePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: isMobileView ? 12 : 13, color: '#f59e0b' }}>Current Price</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: isMobileView ? 12 : 13, color: isUp ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {isUp ? "▲" : "▼"} {priceDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                      </span>
                    </div>
                    <span style={{ fontSize: isMobileView ? 18 : 22, fontWeight: 700, color: '#f59e0b' }}>
                      {displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: isMobileView ? "row" : "column", alignItems: "center", gap: isMobileView ? 8 : 0, alignSelf: isMobileView ? "flex-start" : "auto", background: isMobileView ? theme.surface : "transparent", padding: isMobileView ? "8px 12px" : 0, borderRadius: isMobileView ? 8 : 0, border: isMobileView ? `1px solid ${theme.border}` : "none" }}>
              <CountdownTimer expiryTime={market.expiryTime} resolved={market.resolved} size={isMobileView ? 14 : 18} />
              {!market.resolved && <span style={{ fontSize: 11, color: theme.inkSoft, marginTop: isMobileView ? 0 : 4, letterSpacing: 1 }}>MINS SECS</span>}
            </div>
          </div>

          {/* Chart Container */}
          <div style={{
            margin: isMobileView ? "0 8px" : 0,
            background: theme.surface,
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            padding: isMobileView ? 12 : 16,
            height: isMobileView ? 280 : 440,
            display: "flex",
            flexDirection: "column"
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 16, color: theme.ink }}>Live Price</h3>
            <div ref={chartContainerRef} style={{ flex: 1, width: "100%" }} />
          </div>

          {/* Market Sentiment Bar */}
          <div style={{
            margin: isMobileView ? "0 8px" : 0,
            background: theme.surface,
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            padding: isMobileView ? 16 : 20
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 16, color: theme.ink }}>Market Sentiment</h3>
            
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
              <span style={{ color: "#10b981" }}>UP {upPercent.toFixed(0)}%</span>
              <span style={{ color: "#ef4444" }}>{downPercent.toFixed(0)}% DOWN</span>
            </div>
            
            {/* The Bar */}
            <div style={{ 
              width: "100%", height: 12, borderRadius: 6, overflow: "hidden", 
              display: "flex", background: theme.surface2 
            }}>
              <div style={{ width: `${upPercent}%`, height: "100%", background: "#10b981", transition: "width 0.3s ease" }} />
              <div style={{ width: `${downPercent}%`, height: "100%", background: "#ef4444", transition: "width 0.3s ease" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 12, color: theme.inkSoft, fontWeight: 500 }}>
              <span>
                {(() => {
                  const vol = currentTotalUp + currentTotalDown;
                  if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
                  if (vol >= 1000) return `$${(vol / 1000).toFixed(1)}k`;
                  return `$${vol.toFixed(0)}`;
                })()} Vol.
              </span>
              <BarChart2 size={14} />
            </div>
          </div>
        </div>

        {/* Right Column: Bet Slip Sidebar */}
        <div style={{
          width: isMobileView ? "auto" : 360,
          margin: isMobileView ? "16px 8px 24px 8px" : "24px 24px 24px 0",
          borderRadius: 12,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          padding: isMobileView ? 16 : 24,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          gap: 20
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.ink }}>Place Order</h2>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14 }}>
              <span style={{ fontWeight: 600, color: theme.ink }}>{balance.toFixed(2)} USDC</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, color: theme.inkSoft, marginBottom: 6 }}>Amount (USDC)</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px 10px 12px",
                      background: theme.surface2, border: `1px solid ${theme.border}`,
                      color: theme.ink, borderRadius: 8, fontSize: 16, outline: "none",
                      boxSizing: "border-box"
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {[10, 50, 100].map(val => (
                  <button
                    key={val}
                    onClick={() => setAmount(val.toString())}
                    style={{
                      flex: 1, padding: "6px 0", background: theme.surface2,
                      border: `1px solid ${theme.border}`, borderRadius: 6,
                      color: theme.inkSoft, fontSize: 13, cursor: "pointer"
                    }}
                  >
                    +{val} USDC
                  </button>
                ))}
              </div>

              {errorMsg && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 4 }}>{errorMsg}</div>}

              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                <button
                  disabled={isSubmitting || market.resolved}
                  onClick={() => placeOrder("UP")}
                  style={{
                    flex: 1, background: "#10b981", color: "white",
                    border: "none", padding: "14px 0", borderRadius: 8,
                    fontSize: 16, fontWeight: 600, cursor: (isSubmitting || market.resolved) ? "not-allowed" : "pointer",
                    opacity: (isSubmitting || market.resolved) ? 0.5 : 1
                  }}
                >
                  UP
                </button>
                <button
                  disabled={isSubmitting || market.resolved}
                  onClick={() => placeOrder("DOWN")}
                  style={{
                    flex: 1, background: "#ef4444", color: "white",
                    border: "none", padding: "14px 0", borderRadius: 8,
                    fontSize: 16, fontWeight: 600, cursor: (isSubmitting || market.resolved) ? "not-allowed" : "pointer",
                    opacity: (isSubmitting || market.resolved) ? 0.5 : 1
                  }}
                >
                  DOWN
                </button>
              </div>

              <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: theme.inkSoft }}>Est. UP Payout</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "#10b981" }}>{upPayout.toFixed(2)} USDC <span style={{ fontSize: 13, color: theme.inkSoft, fontWeight: 400 }}>({(upMultiplier * 100).toFixed(0)}%)</span></span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: theme.inkSoft }}>Est. DOWN Payout</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "#ef4444" }}>{downPayout.toFixed(2)} USDC <span style={{ fontSize: 13, color: theme.inkSoft, fontWeight: 400 }}>({(downMultiplier * 100).toFixed(0)}%)</span></span>
                </div>
              </div>

              {/* Personal Active Orders Section */}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px dashed ${theme.border}` }}>
                <h3 style={{ margin: "0 0 12px 0", fontSize: 15, color: theme.ink }}>Your Active Positions</h3>
                {myActiveOrders.length === 0 ? (
                  <div style={{ color: theme.inkSoft, fontSize: 13, fontStyle: "italic" }}>No active bets in this market.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 150, overflowY: "auto", paddingRight: 4 }}>
                    {myActiveOrders.map(o => (
                      <div key={o.id} style={{ 
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", background: theme.surface2, borderRadius: 8,
                        borderLeft: `4px solid ${o.side === 'UP' ? '#10b981' : '#ef4444'}`
                      }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: 11, color: theme.inkSoft, letterSpacing: 0.5 }}>{o.side}</span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>{o.amount.toFixed(2)} USDC</span>
                        </div>
                        <span style={{ fontSize: 11, color: theme.inkSoft, background: theme.surface, padding: "2px 6px", borderRadius: 4 }}>
                          PENDING
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {market.resolved && (
                <div style={{
                  marginTop: 12, padding: 12, background: theme.surface2,
                  borderRadius: 8, textAlign: "center", fontSize: 14, color: theme.ink
                }}>
                  This market has been resolved.<br />
                  Outcome: <strong style={{ color: market.outcome === 'UP' ? '#10b981' : '#ef4444' }}>{market.outcome}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
