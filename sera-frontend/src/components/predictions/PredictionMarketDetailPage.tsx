import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Zap } from "lucide-react";
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
  const [orderBook, setOrderBook] = useState<{ up: Order[]; down: Order[] }>({ up: [], down: [] });
  const [amount, setAmount] = useState<string>("10");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState("");

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);

  useEffect(() => {
    socket.emit("arena:fetch_market_details", marketId);
    socket.emit("arena:fetch_portfolio");

    const onDetails = (data: { market: Market, priceHistory: any[], orderBook: { up: Order[], down: Order[] } }) => {
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
    if (isNaN(val) || val <= 0) {
      setErrorMsg("Please enter a valid amount.");
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

  // Aggregate orderbook
  const totalUp = orderBook.up.reduce((sum, o) => sum + o.amount, 0);
  const totalDown = orderBook.down.reduce((sum, o) => sum + o.amount, 0);

  const displayPrice = currentPrice || market.strikePrice;
  const isUp = displayPrice >= market.strikePrice;
  const priceDiff = Math.abs(displayPrice - market.strikePrice);

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
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          minWidth: 0,
          borderRight: isMobileView ? "none" : `1px solid ${theme.border}`
        }}>
          {/* Market Title and Stats */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ width: 48, height: 48, background: "#f59e0b", borderRadius: "50%", display: "flex", justifyContent: "center", alignItems: "center", color: "white", fontSize: 24, fontWeight: "bold", flexShrink: 0 }}>
                ₿
              </div>
              <div>
                <h1 style={{ margin: "0 0 16px 0", fontSize: 24, fontWeight: 700, color: theme.ink }}>{market.title}</h1>
                <div style={{ display: "flex", gap: 40 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 13, color: theme.inkSoft }}>Price To Beat</span>
                    <span style={{ fontSize: 22, fontWeight: 600, color: theme.inkSoft }}>
                      ${market.strikePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#f59e0b' }}>Current Price</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 13, color: isUp ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {isUp ? "▲" : "▼"} ${priceDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>
                      ${displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <CountdownTimer expiryTime={market.expiryTime} resolved={market.resolved} size={18} />
              {!market.resolved && <span style={{ fontSize: 11, color: theme.inkSoft, marginTop: 4, letterSpacing: 1 }}>MINS SECS</span>}
            </div>
          </div>

          {/* Chart Container */}
          <div style={{
            background: theme.surface,
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            padding: 16,
            height: 440,
            display: "flex",
            flexDirection: "column"
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 16, color: theme.ink }}>Live Price</h3>
            <div ref={chartContainerRef} style={{ flex: 1, width: "100%" }} />
          </div>

          {/* Order Book */}
          <div style={{
            background: theme.surface,
            borderRadius: 12,
            border: `1px solid ${theme.border}`,
            padding: 16
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 16, color: theme.ink }}>Order Book</h3>
            <div style={{ display: "flex", gap: 24 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#10b981", fontWeight: 600, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${theme.border}` }}>
                  Pending UP (${totalUp.toFixed(2)})
                </div>
                {orderBook.up.length === 0 ? (
                  <div style={{ color: theme.inkSoft, fontSize: 13, fontStyle: "italic" }}>No pending UP orders</div>
                ) : (
                  orderBook.up.map(o => (
                    <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, color: theme.ink }}>
                      <span>User {o.userId.substring(0, 6)}...</span>
                      <span>${o.amount.toFixed(2)}</span>
                    </div>
                  ))
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#ef4444", fontWeight: 600, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${theme.border}` }}>
                  Pending DOWN (${totalDown.toFixed(2)})
                </div>
                {orderBook.down.length === 0 ? (
                  <div style={{ color: theme.inkSoft, fontSize: 13, fontStyle: "italic" }}>No pending DOWN orders</div>
                ) : (
                  orderBook.down.map(o => (
                    <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, color: theme.ink }}>
                      <span>User {o.userId.substring(0, 6)}...</span>
                      <span>${o.amount.toFixed(2)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Bet Slip Sidebar */}
        <div style={{
          width: isMobileView ? "100%" : 360,
          background: theme.surface,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          borderLeft: isMobileView ? "none" : `1px solid ${theme.border}`
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.ink }}>Place Order</h2>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14 }}>
              <span style={{ color: theme.inkSoft }}>Balance</span>
              <span style={{ fontWeight: 600, color: theme.ink }}>${balance.toFixed(2)} USDC</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, color: theme.inkSoft, marginBottom: 6 }}>Amount (USDC)</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: theme.inkSoft }}>$</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px 10px 24px",
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
                    +${val}
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
              
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 13, color: theme.ink, fontWeight: 500 }}>To win 💸</span>
                  <span style={{ fontSize: 12, color: theme.inkSoft }}>Avg. Price 50¢</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#10b981" }}>
                  ${(parseFloat(amount) * 2 || 0).toFixed(2)}
                </div>
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
