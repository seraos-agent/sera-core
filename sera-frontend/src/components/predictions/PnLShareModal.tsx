import { useRef, useState } from "react";
import { X, Download, Send, TrendingUp, TrendingDown } from "lucide-react";
import html2canvas from "html2canvas";
import type { ThemeType } from "../../theme";

interface PnLShareModalProps {
  order: any;
  theme: ThemeType;
  onClose: () => void;
}

export function PnLShareModal({ order, theme: _theme, onClose }: PnLShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 500;

  const isWin = order.won;
  
  let displayPercentage = -100;
  if (isWin && order.payout !== undefined && order.amount !== undefined) {
    const payoutNum = typeof order.payout === 'string' ? parseFloat(order.payout) : order.payout;
    const amountNum = typeof order.amount === 'string' ? parseFloat(order.amount) : order.amount;
    if (amountNum > 0) {
      // Calculate Total Payout Percentage for a more attractive display
      displayPercentage = (payoutNum / amountNum) * 100;
    }
  }
  const roi = isWin ? `${displayPercentage.toFixed(2)}%` : "-100.00%";

  const pnlColor = isWin ? "#00FFA3" : "#FF3366"; // Cyberpunk green/red
  const bgGradient = isWin
    ? "linear-gradient(135deg, #0A1913 0%, #050A08 100%)"
    : "linear-gradient(135deg, #1A0A0E 0%, #0A0406 100%)";

  const formattedMarketId = (order.marketId || "").replace(/-/g, ' ').toUpperCase();

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setIsCapturing(true);
    // Slight delay to allow UI to react before capture
    await new Promise(res => setTimeout(res, 50));
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#000",
        scale: 3, // Ultra HD resolution
        useCORS: true,
        logging: false
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `Sera_Arena_PnL_${order.id}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Failed to capture PnL image", e);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleTwitterShare = () => {
    const text = isWin
      ? `Nailed a +100% ROI on Sera Arena predicting ${formattedMarketId}! 📈🚀 Who's next? #SeraArena #Crypto`
      : `Calculated risk on ${formattedMarketId} at Sera Arena. I'll be back stronger. 💎🙌 #SeraArena`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", zIndex: 9999,
      display: "flex", justifyContent: "center", alignItems: "center",
      padding: isMobile ? 16 : 24
    }}>
      <div style={{ width: "100%", maxWidth: isMobile ? 360 : 420, position: "relative" }}>

        {/* Close Button */}
        <button onClick={onClose} style={{
          position: "absolute", top: -48, right: 0, background: "none",
          border: "none", color: "#fff", cursor: "pointer", zIndex: 10,
          opacity: 0.7
        }}>
          <X size={28} />
        </button>

        {/* The Card (Capturable Area) */}
        <div
          ref={cardRef}
          style={{
            background: bgGradient,
            borderRadius: 24,
            position: "relative",
            overflow: "hidden",
            boxShadow: `0 20px 50px -10px rgba(0,0,0,0.5)`, // Removed neon glow
            border: `1px solid rgba(255, 255, 255, 0.1)`,
            color: "#fff",
            fontFamily: "system-ui, -apple-system, sans-serif"
          }}
        >
          {/* Futuristic Grid Overlay */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
            backgroundSize: "20px 20px",
            opacity: 0.5,
            zIndex: 0
          }} />

          {/* Watermark Logo */}
          <div style={{
            position: "absolute", top: "20%", right: "-10%",
            opacity: 0.05, transform: "rotate(-15deg)", zIndex: 0
          }}>
            {isWin ? <TrendingUp size={300} color={pnlColor} /> : <TrendingDown size={300} color={pnlColor} />}
          </div>

          <div style={{ position: "relative", zIndex: 1, padding: isMobile ? 24 : 32 }}>
            {/* Header: App Name & Market */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isMobile ? 16 : 24 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <img src="/sera-logo.png" alt="Sera Logo" style={{ width: 24, height: 24, objectFit: "contain" }} />
                  <span style={{ fontSize: isMobile ? 14 : 16, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "#fff" }}>
                    Sera Arena
                  </span>
                </div>
                <div style={{ fontSize: isMobile ? 11 : 13, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>
                  Prediction Result
                </div>
              </div>
              <div style={{
                background: "rgba(255,255,255,0.1)", backdropFilter: "blur(4px)",
                padding: "6px 12px", borderRadius: 8, fontSize: isMobile ? 10 : 12, fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.05)", textAlign: "right", maxWidth: "45%"
              }}>
                {formattedMarketId}
              </div>
            </div>

            {/* Massive ROI Display */}
            <div style={{
              fontWeight: 900, fontSize: isMobile ? 48 : 64, color: pnlColor,
              lineHeight: 1, marginBottom: 12
            }}>
              {roi}
            </div>

            {/* Side Indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isMobile ? 24 : 40 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                color: pnlColor, fontSize: isMobile ? 14 : 16, fontWeight: 700,
                background: `${pnlColor}20`, padding: "4px 10px", borderRadius: 6
              }}>
                {order.side === 'UP' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {order.side}
              </div>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: isMobile ? 12 : 14 }}>Position</span>
            </div>

            {/* Bottom Stats Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isMobile ? 12 : 16 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: isMobile ? 12 : 16, borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: isMobile ? 10 : 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Stake Amount</div>
                <div style={{ fontSize: isMobile ? 14 : 20, fontWeight: 700, color: "#fff" }}>{order.amount.toFixed(2)} USDC</div>
              </div>

              <div style={{ background: isWin ? `${pnlColor}10` : "rgba(255,255,255,0.03)", padding: isMobile ? 12 : 16, borderRadius: 12, border: `1px solid ${isWin ? `${pnlColor}40` : "rgba(255,255,255,0.05)"}` }}>
                <div style={{ fontSize: isMobile ? 10 : 11, color: isWin ? pnlColor : "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Payout</div>
                <div style={{ fontSize: isMobile ? 14 : 20, fontWeight: 700, color: isWin ? pnlColor : "#fff" }}>
                  {(order.payout || 0).toFixed(2)} USDC
                </div>
              </div>
            </div>

            {/* Scan / Timestamp */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: isMobile ? 16 : 24, paddingTop: isMobile ? 12 : 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: isMobile ? 10 : 11, color: "rgba(255,255,255,0.4)" }}>
                ID: {order.id.toUpperCase()}<br />
                sera.network
              </div>
              <div style={{ width: isMobile ? 32 : 40, height: isMobile ? 32 : 40, background: "#fff", padding: 2, borderRadius: 4 }}>
                {/* Mock QR Code effect */}
                <div style={{ width: "100%", height: "100%", backgroundImage: `repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 2px, transparent 4px)` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons (Not captured) */}
        {!isCapturing && (
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              onClick={handleDownload}
              style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "16px 0", background: "rgba(255,255,255,0.1)", color: "#fff", border: `1px solid rgba(255,255,255,0.2)`, borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 15, transition: "0.2s" }}
              onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
              onMouseOut={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
            >
              <Download size={20} /> Save Image
            </button>
            <button
              onClick={handleTwitterShare}
              style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "16px 0", background: "#1DA1F2", color: "white", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 15, transition: "0.2s" }}
              onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseOut={e => e.currentTarget.style.transform = "none"}
            >
              <Send size={20} /> Share to X
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
