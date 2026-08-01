import { useState } from "react";
import { ChevronLeft as CloseIcon, CheckCircle2, MonitorPlay, ArrowRight, AlertCircle, X } from "lucide-react";
import type { ThemeType } from "../../theme";

interface QuestDashboardProps {
  theme: ThemeType;
  onBack: () => void;
  isMobileView?: boolean;
}

export function QuestDashboard({ theme, onBack, isMobileView }: QuestDashboardProps) {
  const [points, setPoints] = useState(0);
  const [claimedDaily, setClaimedDaily] = useState(false);
  const [modalState, setModalState] = useState<{ isOpen: boolean; type: "error" | "success"; message: string } | null>(null);

  const handleClaimDaily = () => {
    if (claimedDaily) return;
    setPoints(prev => prev + 500);
    setClaimedDaily(true);
  };

  const handleExchange = () => {
    if (points < 1000) {
      setModalState({
        isOpen: true,
        type: "error",
        message: "You need a minimum of 1,000 Sera Points to exchange for Agent Credits. Keep completing quests to earn more!"
      });
      return;
    }
    // Mock exchange logic
    setModalState({
      isOpen: true,
      type: "success",
      message: `Successfully exchanged ${points.toLocaleString()} points for ${(points * 100).toLocaleString()} Agent Credits!`
    });
    setPoints(0);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: theme.bg, animation: "walletPageIn 400ms cubic-bezier(.4,0,.2,1) forwards", minWidth: 0, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobileView ? "12px 16px" : "12px 24px", borderBottom: "none", background: theme.bg, flexShrink: 0 }}>
        <button 
          onClick={onBack} 
          style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex", borderRadius: 6, transition: "background 0.2s" }}
          onMouseEnter={(e) => e.currentTarget.style.background = theme.surface2}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          <CloseIcon size={18} />
        </button>
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 15, color: theme.ink }}>
          Quests & Airdrops
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: isMobileView ? 24 : 48 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          
          {/* Balance Card */}
          <div style={{ 
            background: `linear-gradient(135deg, ${theme.accentSoft}, ${theme.surface2})`,
            border: `1px solid ${theme.border}`,
            borderRadius: 20, padding: 24, marginBottom: 32,
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <div>
              <div style={{ fontSize: 13, color: theme.inkSoft, marginBottom: 4 }}>Total Sera Points</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: theme.ink, fontFamily: "Inter, sans-serif" }}>
                {points.toLocaleString()} <span style={{ fontSize: 16, color: theme.inkSoft, fontWeight: 400 }}>PTS</span>
              </div>
            </div>
            <button 
              onClick={handleExchange}
              style={{
                background: points >= 1000 ? theme.accent : theme.surface,
                color: points >= 1000 ? "#fff" : theme.inkSoft,
                border: `1px solid ${points >= 1000 ? theme.accent : theme.border}`,
                padding: "10px 20px", borderRadius: 12, fontWeight: 600,
                cursor: points >= 1000 ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s"
              }}
            >
              Exchange <ArrowRight size={16} />
            </button>
          </div>

          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 18, fontWeight: 600, color: theme.ink, marginBottom: 16 }}>
            Available Quests
          </div>

          {/* Quests List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            
            {/* Daily Check-in */}
            <div style={{ 
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: theme.surface2, border: `1px solid ${theme.border}`,
              padding: "16px 20px", borderRadius: 16
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 44, height: 44, background: theme.surface, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle2 size={20} color={theme.ink} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, marginBottom: 2 }}>Daily Check-in</div>
                  <div style={{ fontSize: 13, color: theme.inkSoft }}>Log in today to claim points</div>
                </div>
              </div>
              <button 
                onClick={handleClaimDaily}
                disabled={claimedDaily}
                style={{
                  background: claimedDaily ? theme.surface : "transparent",
                  border: `1px solid ${claimedDaily ? theme.border : theme.ink}`,
                  color: claimedDaily ? theme.inkSoft : theme.ink,
                  padding: "8px 16px", borderRadius: 10, fontWeight: 600,
                  cursor: claimedDaily ? "not-allowed" : "pointer"
                }}
              >
                {claimedDaily ? "Claimed" : "+500 PTS"}
              </button>
            </div>

            {/* X Engagement */}
            <div style={{ 
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: theme.surface2, border: `1px solid ${theme.border}`,
              padding: "16px 20px", borderRadius: 16
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 44, height: 44, background: theme.surface, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width={18} height={18} style={{ fill: theme.ink }}>
                    <use href={`/icons.svg#x-icon`} />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, marginBottom: 2 }}>X (Twitter) Connect</div>
                  <div style={{ fontSize: 13, color: theme.inkSoft }}>Connect your X account</div>
                </div>
              </div>
              <button 
                style={{
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  color: theme.inkSoft,
                  padding: "8px 16px", borderRadius: 10, fontWeight: 600,
                  cursor: "not-allowed"
                }}
              >
                Dev Mode
              </button>
            </div>

            {/* Youtube Watch */}
            <div style={{ 
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: theme.surface2, border: `1px solid ${theme.border}`,
              padding: "16px 20px", borderRadius: 16
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 44, height: 44, background: theme.surface, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MonitorPlay size={20} color={theme.ink} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, marginBottom: 2 }}>Watch & Earn</div>
                  <div style={{ fontSize: 13, color: theme.inkSoft }}>Find hidden passwords on YouTube</div>
                </div>
              </div>
              <button 
                style={{
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  color: theme.inkSoft,
                  padding: "8px 16px", borderRadius: 10, fontWeight: 600,
                  cursor: "not-allowed"
                }}
              >
                Dev Mode
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Custom Modal Overlay */}
      {modalState?.isOpen && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, animation: "fadeIn 200ms ease"
        }}>
          <div style={{
            background: theme.surface2,
            border: `1px solid ${theme.border}`,
            borderRadius: 24, padding: "32px 24px",
            width: "90%", maxWidth: 360,
            display: "flex", flexDirection: "column", alignItems: "center",
            boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            position: "relative",
            animation: "slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1)"
          }}>
            <button
              onClick={() => setModalState(null)}
              style={{
                position: "absolute", top: 16, right: 16,
                background: "transparent", border: "none", color: theme.inkSoft,
                cursor: "pointer", padding: 4
              }}
            >
              <X size={20} />
            </button>

            <div style={{
              width: 56, height: 56, borderRadius: 28,
              background: modalState.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
              color: modalState.type === "success" ? "#10b981" : "#ef4444",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 16
            }}>
              {modalState.type === "success" ? <CheckCircle2 size={28} /> : <AlertCircle size={28} />}
            </div>

            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 18, fontWeight: 700, color: theme.ink, marginBottom: 8, textAlign: "center" }}>
              {modalState.type === "success" ? "Exchange Successful" : "Not Enough Points"}
            </div>
            
            <div style={{ fontSize: 14, color: theme.inkSoft, textAlign: "center", lineHeight: 1.5, marginBottom: 24 }}>
              {modalState.message}
            </div>

            <button
              onClick={() => setModalState(null)}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 12,
                background: modalState.type === "success" ? "#10b981" : theme.surface,
                color: modalState.type === "success" ? "#fff" : theme.ink,
                border: `1px solid ${modalState.type === "success" ? "#10b981" : theme.border}`,
                fontWeight: 600, fontSize: 15, cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              {modalState.type === "success" ? "Awesome!" : "Understood"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
