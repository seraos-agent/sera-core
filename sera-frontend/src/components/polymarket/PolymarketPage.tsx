import { useState, useEffect } from "react";
import type { ThemeType } from "../../theme";
import { ArrowLeft, RefreshCw, Zap, Bot, BrainCircuit, X, BarChart2 } from "lucide-react";
import "./Polymarket.css";

interface PolymarketPageProps {
  theme: ThemeType;
  isMobileView: boolean;
  socket?: any;
  onBack: () => void;
  onTradeMarket?: (market: any, outcomeLabel: string, price: string) => void;
}

export function PolymarketPage({ theme, isMobileView, socket, onBack, onTradeMarket }: PolymarketPageProps) {
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Trending");
  const [tradeMode, setTradeMode] = useState<"direct" | "agent">("direct");
  const [betSlip, setBetSlip] = useState<{ market: any, outcomeLabel: string, price: string } | null>(null);
  const [betAmount, setBetAmount] = useState<string>("10");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [portfolioData, setPortfolioData] = useState<{ usdcBalance: string, allowance: string, openOrders: any[] } | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  const tabs = ["Trending", "Crypto", "Politics", "Sports", "Pop Culture", "Portfolio"];

  const fetchMarkets = async (tab: string) => {
    setLoading(true);
    try {
      const res = await fetch(`https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100`);
      const data = await res.json();
      
      const parsedMarkets: any[] = [];
      for (const event of data) {
        if (!event.markets) continue;
        
        if (tab !== "Trending") {
          const tags = event.tags || [];
          const hasTag = tags.some((t: any) => t.label?.toLowerCase() === tab.toLowerCase());
          if (!hasTag) continue;
        }
        for (const m of event.markets) {
          if (m.active && !m.closed) {
            let outcomes: any[] = [];
            let outcomePrices: any[] = [];
            let clobTokenIds: any[] = [];
            try { outcomes = JSON.parse(m.outcomes || "[]"); } catch (e) {}
            try { outcomePrices = JSON.parse(m.outcomePrices || "[]"); } catch (e) {}
            try { clobTokenIds = JSON.parse(m.clobTokenIds || "[]"); } catch (e) {}
            
            parsedMarkets.push({
              id: m.id,
              title: event.title || m.question,
              question: m.question,
              image: event.image || m.image,
              volume: m.volumeNum || 0,
              outcomes,
              outcomePrices,
              clobTokenIds,
            });
          }
        }
      }
      
      parsedMarkets.sort((a, b) => b.volume - a.volume);
      setMarkets(parsedMarkets.slice(0, 20));
    } catch (e) {
      console.error("Failed to fetch polymarket events", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "Portfolio") {
      setPortfolioLoading(true);
      socket?.emit("polymarket:fetch_portfolio");
    } else {
      fetchMarkets(activeTab);
    }
  }, [activeTab, socket]);

  const [tradeStatus, setTradeStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    if (!socket) return;
    const handleTradeResult = (result: { success: boolean, message: string }) => {
      setIsSubmitting(false);
      setTradeStatus({
        type: result.success ? 'success' : 'error',
        message: result.message
      });
      if (result.success) {
        setTimeout(() => {
          setBetSlip(null);
          setTradeStatus(null);
          if (activeTab === "Portfolio") socket.emit("polymarket:fetch_portfolio");
        }, 1500);
      }
    };
    
    const handleAuthError = (err: any) => {
      setIsSubmitting(false);
      setPortfolioLoading(false);
      setTradeStatus({ type: 'error', message: err.message || 'Authentication error' });
    };

    const handlePortfolioData = (data: any) => {
      console.log('[PolymarketPage] handlePortfolioData received:', data);
      setPortfolioLoading(false);
      if (data.success) {
        setPortfolioData({ usdcBalance: data.usdcBalance, allowance: data.allowance, openOrders: data.openOrders });
      }
    };

    socket.on('polymarket:direct_trade_result', handleTradeResult);
    socket.on('auth:error', handleAuthError);
    socket.on('polymarket:portfolio_data', handlePortfolioData);
    return () => {
      socket.off('polymarket:direct_trade_result', handleTradeResult);
      socket.off('auth:error', handleAuthError);
      socket.off('polymarket:portfolio_data', handlePortfolioData);
    };
  }, [socket, activeTab]);

  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `$${(vol / 1000).toFixed(1)}K`;
    return `$${Math.floor(vol)}`;
  };

  return (
    <div className="poly-page" style={{ background: theme.surface, color: theme.ink }}>
      {/* Header */}
      <div className="poly-header" style={{ borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isMobileView && (
            <button onClick={onBack} style={{ background: "none", border: "none", color: theme.ink, padding: 0, display: "flex", cursor: "pointer" }}>
              <ArrowLeft size={20} />
            </button>
          )}
          <img src="/polymarket.png" width={24} height={24} style={{ borderRadius: 4 }} alt="Polymarket" />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Polymarket</h2>
        </div>
        
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, background: theme.surface2, padding: 4, borderRadius: 8, border: `1px solid ${theme.border}` }}>
          <button 
            title="Direct Trade: Execute trades instantly using your background Agent Wallet."
            onClick={() => setTradeMode("direct")}
            style={{ 
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", 
              borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: tradeMode === "direct" ? theme.accent : "transparent",
              color: tradeMode === "direct" ? "#fff" : theme.inkSoft
            }}>
            <Zap size={14} /> Direct
          </button>
          <button 
            title="Agent Assisted: Send to chat to get AI analysis and a detailed trade proposal."
            onClick={() => setTradeMode("agent")}
            style={{ 
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", 
              borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: tradeMode === "agent" ? theme.accent : "transparent",
              color: tradeMode === "agent" ? "#fff" : theme.inkSoft
            }}>
            <Bot size={14} /> Agent
          </button>
        </div>
      </div>

      {/* Categories */}
      <div className="poly-tabs-scroll" style={{ borderBottom: `1px solid ${theme.border}` }}>
        <div className="poly-tabs">
          {tabs.map(tab => (
            <div
              key={tab}
              className={`poly-tab ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
              style={{
                color: activeTab === tab ? theme.ink : theme.inkSoft,
                borderBottomColor: activeTab === tab ? theme.ink : "transparent"
              }}
            >
              {tab}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="poly-content">
        {activeTab === "Portfolio" ? (
          portfolioLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200, color: theme.inkSoft }}>
              <RefreshCw size={24} className="spin" />
              <span style={{ marginLeft: 10 }}>Loading portfolio...</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "0 12px" }}>
              <div style={{ background: theme.surface2, padding: 24, borderRadius: 12, border: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ color: theme.inkSoft, fontSize: 14, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1 }}>Agentic Wallet Balance</span>
                <span style={{ color: theme.ink, fontSize: 36, fontWeight: 700 }}>
                  ${parseFloat(portfolioData?.usdcBalance || "0").toFixed(2)}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <img src="/polymarket.png" width={16} height={16} alt="" style={{ borderRadius: 16 }} />
                  <span style={{ fontSize: 13, color: theme.inkSoft }}>Polygon USDC (Bridged)</span>
                </div>
              </div>
              
              <div>
                <h3 style={{ margin: "0 0 16px 0", fontSize: 18, color: theme.ink }}>Active Orders</h3>
                {!portfolioData?.openOrders || portfolioData.openOrders.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, background: theme.surface2, borderRadius: 12, border: `1px dashed ${theme.border}`, color: theme.inkSoft }}>
                    <BarChart2 size={32} style={{ opacity: 0.5, marginBottom: 12 }} />
                    <p style={{ margin: 0 }}>No active orders found.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {portfolioData.openOrders.map((order: any, idx: number) => (
                      <div key={idx} style={{ background: theme.surface2, padding: 16, borderRadius: 8, border: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                            {order.side === "BUY" ? "Buy" : "Sell"} {order.tokenID?.slice(0, 8)}...
                          </div>
                          <div style={{ fontSize: 13, color: theme.inkSoft }}>
                            {order.size} shares @ {order.price}¢
                          </div>
                        </div>
                        <div style={{ background: theme.accent + "20", color: theme.accent, padding: "4px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                          OPEN
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        ) : loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200, color: theme.inkSoft }}>
            <RefreshCw size={24} className="spin" />
            <span style={{ marginLeft: 10 }}>Loading markets...</span>
          </div>
        ) : (
          <div className="poly-grid">
            {markets.map(m => {
              const yesIndex = m.outcomes.findIndex((o: string) => o.toLowerCase() === "yes");
              const noIndex = m.outcomes.findIndex((o: string) => o.toLowerCase() === "no");
              const isBinary = yesIndex !== -1 && noIndex !== -1;
              
              const topOutcomes = isBinary 
                ? [{ label: "Yes", price: m.outcomePrices[yesIndex], color: "#27ae60" }, { label: "No", price: m.outcomePrices[noIndex], color: "#e74c3c" }]
                : m.outcomes.slice(0, 2).map((o: string, i: number) => ({ label: o, price: m.outcomePrices[i], color: i === 0 ? "#3498db" : "#9b59b6" }));

              return (
                <div key={m.id} className="poly-card" style={{ background: theme.surface2, borderColor: theme.border }}>
                  <div className="poly-card-header">
                    <div style={{ display: "flex", gap: 12 }}>
                      {m.image && <img src={m.image} alt="" className="poly-card-icon" />}
                      <h3 className="poly-card-title">{m.question}</h3>
                    </div>
                    <button 
                      title="Analyze this market with Sera"
                      className="poly-analyze-btn"
                      onClick={() => {
                        const msg = `Please analyze this Polymarket event for me: "${m.title}". I'm trying to decide if I should bet Yes or No.`;
                        // Send fake event to trigger the chat since PolymarketPage doesn't receive handleSend directly, but we can reuse onTradeMarket with a flag if we want, or add onChat command.
                        // Actually, since we only have onTradeMarket, let's just use it to send a generic chat. Wait, onTradeMarket is formatted specifically.
                        // Let's just emit to socket 'chat:message'.
                        socket?.emit('chat:message', msg);
                        onBack();
                      }}
                      style={{ color: theme.inkSoft, background: "transparent", border: "none", cursor: "pointer", padding: 4 }}
                    >
                      <BrainCircuit size={18} />
                    </button>
                  </div>
                  
                  <div className="poly-outcomes">
                    {topOutcomes.map((out: any, idx: number) => (
                      <div key={idx} className="poly-outcome-row">
                        <span className="poly-outcome-label">{out.label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span className="poly-outcome-pct" style={{ color: out.color }}>
                            {Math.round(parseFloat(out.price) * 100) || 0}%
                          </span>
                          <button 
                            className="poly-trade-btn" 
                            style={{ background: out.color + "20", color: out.color }}
                            onClick={() => {
                              if (tradeMode === "agent") {
                                onTradeMarket?.(m, out.label, out.price);
                              } else {
                                setBetSlip({ market: m, outcomeLabel: out.label, price: out.price });
                                setBetAmount("10");
                              }
                            }}
                          >
                            Buy {out.label}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="poly-card-footer" style={{ color: theme.inkSoft }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="poly-live-dot" />
                      {formatVolume(m.volume)} Vol.
                    </div>
                    <BarChart2 size={16} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bet Slip Modal (Direct Trade) */}
      {betSlip && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100
        }}>
          <div style={{
            background: theme.surface, width: 360, borderRadius: 12, border: `1px solid ${theme.border}`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column"
          }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Direct Trade</h3>
              <button onClick={() => setBetSlip(null)} style={{ background: "none", border: "none", color: theme.inkSoft, cursor: "pointer", padding: 0 }}><X size={20}/></button>
            </div>
            
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, color: theme.inkSoft, marginBottom: 4 }}>Market</div>
                <div style={{ fontWeight: 500 }}>{betSlip.market.title}</div>
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, background: theme.surface2, borderRadius: 8 }}>
                <span style={{ fontWeight: 600 }}>Buy {betSlip.outcomeLabel}</span>
                <span style={{ color: theme.accent, fontWeight: 600 }}>{Math.round(parseFloat(betSlip.price) * 100)}¢</span>
              </div>
              
              <div>
                <div style={{ fontSize: 13, color: theme.inkSoft, marginBottom: 4 }}>Amount (USDC)</div>
                <input 
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`,
                    background: theme.surface2, color: theme.ink, fontSize: 16, outline: "none"
                  }}
                  disabled={isSubmitting}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: theme.inkSoft }}>
                <span>Est. Shares</span>
                <span style={{ color: theme.ink, fontWeight: 500 }}>
                  {(parseFloat(betAmount) / parseFloat(betSlip.price)).toFixed(2)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: theme.inkSoft }}>
                <span>Potential Return</span>
                <span style={{ color: "#27ae60", fontWeight: 600 }}>
                  ${(parseFloat(betAmount) / parseFloat(betSlip.price)).toFixed(2)}
                </span>
              </div>
              
              {tradeStatus && (
                <div style={{
                  padding: 12, borderRadius: 8, fontSize: 13,
                  background: tradeStatus.type === 'success' ? '#27ae6020' : '#e74c3c20',
                  color: tradeStatus.type === 'success' ? '#27ae60' : '#e74c3c',
                  border: `1px solid ${tradeStatus.type === 'success' ? '#27ae6050' : '#e74c3c50'}`
                }}>
                  {tradeStatus.message}
                </div>
              )}
            </div>

            <div style={{ padding: 16, borderTop: `1px solid ${theme.border}` }}>
              <button
                disabled={isSubmitting || !parseFloat(betAmount) || tradeStatus?.type === 'success'}
                onClick={() => {
                  setTradeStatus(null);
                  setIsSubmitting(true);
                  socket?.emit("polymarket:direct_trade", {
                    marketId: betSlip.market.id,
                    tokenId: betSlip.market.clobTokenIds[betSlip.market.outcomes.indexOf(betSlip.outcomeLabel)] || "",
                    marketQuestion: betSlip.market.title,
                    outcomeLabel: betSlip.outcomeLabel,
                    amount: parseFloat(betAmount)
                  });
                }}
                style={{
                  width: "100%", padding: 14, borderRadius: 8, border: "none", 
                  background: isSubmitting || tradeStatus?.type === 'success' ? theme.inkSoft : theme.accent,
                  color: "#fff", fontSize: 15, fontWeight: 600, cursor: isSubmitting ? "not-allowed" : "pointer",
                  display: "flex", justifyContent: "center", alignItems: "center", gap: 8
                }}
              >
                {isSubmitting ? <RefreshCw size={18} className="spin" /> : tradeStatus?.type === 'success' ? "Success" : "Place Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
