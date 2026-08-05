import { useState, useEffect } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { CountdownTimer } from "./CountdownTimer";
import type { ThemeType } from "../../theme";
import type { Socket } from "socket.io-client";
import { PredictionMarketDetailPage } from "./PredictionMarketDetailPage";

interface PredictionArenaPageProps {
  theme: ThemeType;
  onBack: () => void;
  socket: Socket | null;
}

export function PredictionArenaPage({ theme, onBack, socket }: PredictionArenaPageProps) {
  const [activeTab, setActiveTab] = useState<string>("Markets");
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMarketId, setActiveMarketId] = useState<string | null>(null);
  
  const [portfolioData, setPortfolioData] = useState<{ balance: number, orders: any[] } | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const isMobileView = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    if (activeTab === "Portfolio") {
      setPortfolioLoading(true);
      socket?.emit("arena:fetch_portfolio");
    } else {
      setLoading(true);
      socket?.emit("arena:fetch_markets");
    }
  }, [activeTab, socket]);

  useEffect(() => {
    if (!socket) return;
    
    const handleMarkets = (data: any[]) => {
      setMarkets(data);
      setLoading(false);
    };

    const handlePortfolio = (data: any) => {
      setPortfolioData(data);
      setPortfolioLoading(false);
    };

    const handleAuthError = () => {
      setPortfolioLoading(false);
    };

    socket.on('arena:markets', handleMarkets);
    socket.on('arena:portfolio', handlePortfolio);
    socket.on('auth:error', handleAuthError);

    return () => {
      socket.off('arena:markets', handleMarkets);
      socket.off('arena:portfolio', handlePortfolio);
      socket.off('auth:error', handleAuthError);
    };
  }, [socket, activeTab]);

  if (activeMarketId && socket) {
    return (
      <PredictionMarketDetailPage 
        theme={theme} 
        socket={socket} 
        marketId={activeMarketId} 
        onBack={() => setActiveMarketId(null)} 
        isMobileView={isMobileView} 
      />
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: theme.bg, height: "100%", overflowY: "auto" }}>
      
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${theme.border}`, background: theme.surface }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button 
            onClick={onBack}
            style={{ background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: theme.inkSoft }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: theme.ink, fontFamily: "Inter, sans-serif" }}>Sera Arena</h2>
            <div style={{ fontSize: 13, color: theme.inkSoft, marginTop: 4 }}>P2P Price Predictions</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="poly-tabs-scroll" style={{ borderBottom: `1px solid ${theme.border}` }}>
        <div className="poly-tabs">
          {["Markets", "Portfolio"].map(tab => (
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

      <div className="poly-content">
        
        {/* Portfolio View */}
        {activeTab === "Portfolio" && (
          portfolioLoading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200, color: theme.inkSoft }}>
              <RefreshCw size={24} className="spin" />
              <span style={{ marginLeft: 10 }}>Loading portfolio...</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ background: theme.surface2, padding: 24, borderRadius: 12, border: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 13, color: theme.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Mock USDC Balance</div>
                <span style={{ color: theme.ink, fontSize: 36, fontWeight: 700 }}>
                  ${(portfolioData?.balance || 0).toFixed(2)}
                </span>
                <div style={{ fontSize: 12, color: theme.inkFaint }}>Simulation Funds Only</div>
              </div>

              <div>
                <h3 style={{ margin: "0 0 16px 0", fontSize: 16, color: theme.ink }}>Active & Pending Orders</h3>
                {portfolioData?.orders && portfolioData.orders.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {portfolioData.orders.map((order: any, i: number) => (
                      <div key={i} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 16, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, color: theme.ink }}>Market: {order.marketId}</div>
                          <div style={{ fontSize: 13, color: theme.inkSoft, marginTop: 4 }}>
                            Side: <span style={{ color: order.side === 'UP' ? '#2ecc71' : '#e74c3c', fontWeight: 600 }}>{order.side}</span> | 
                            Amount: ${order.amount}
                          </div>
                        </div>
                        <div style={{ 
                          padding: "4px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                          background: order.status === 'PENDING' ? theme.accentSoft : order.status === 'MATCHED' ? '#2ecc7120' : theme.surface2,
                          color: order.status === 'PENDING' ? theme.accent : order.status === 'MATCHED' ? '#2ecc71' : theme.inkSoft
                        }}>
                          {order.status}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: 40, color: theme.inkSoft, background: theme.surface, borderRadius: 12, border: `1px dashed ${theme.border}` }}>
                    No orders found. Go to Markets to place a prediction!
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* Markets View */}
        {activeTab === "Markets" && (
          loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200, color: theme.inkSoft }}>
              <RefreshCw size={24} className="spin" />
              <span style={{ marginLeft: 10 }}>Loading markets...</span>
            </div>
          ) : markets.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: theme.inkSoft, background: theme.surface, borderRadius: 12, border: `1px solid ${theme.border}` }}>
              No active markets found.
            </div>
          ) : (
            <div className="poly-grid">
              {markets.map((m: any) => (
                <div key={m.id} className="poly-card" style={{ background: theme.surface2, borderColor: theme.border, cursor: "pointer" }} onClick={() => setActiveMarketId(m.id)}>
                  <div className="poly-card-header">
                    <div style={{ display: "flex", gap: 12 }}>
                      <div className="poly-card-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f39c12', color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                        ₿
                      </div>
                      <h3 className="poly-card-title">{m.title}</h3>
                    </div>
                  </div>
                  <div className="poly-outcomes">
                    <div className="poly-outcome-row">
                      <span className="poly-outcome-label">Yes (UP)</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <button 
                          className="poly-trade-btn" 
                          style={{ background: "#27ae6020", color: "#27ae60" }}
                        >
                          Trade
                        </button>
                      </div>
                    </div>
                    <div className="poly-outcome-row">
                      <span className="poly-outcome-label">No (DOWN)</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <button 
                          className="poly-trade-btn" 
                          style={{ background: "#e74c3c20", color: "#e74c3c" }}
                        >
                          Trade
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="poly-card-footer">
                    <CountdownTimer expiryTime={m.expiryTime} resolved={m.resolved} size={12} />
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
