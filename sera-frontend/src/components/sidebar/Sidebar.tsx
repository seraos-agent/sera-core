import { X, Plus, PanelLeftClose, PanelLeftOpen, UserCircle, Battery, Wallet } from "lucide-react";
import type { ThemeType } from "../../theme";
import { useAccount } from 'wagmi';
import type { WalletState } from "../../hooks/useWallet";

export type SidebarView = "chat" | "wallet" | "connections" | "automations" | "profile";

interface ConnectorSummary {
  id: string;
  name: string;
  isActive: boolean;
  alwaysActive: boolean;
  [key: string]: any;
}

interface SidebarProps {
  theme: ThemeType;
  open: boolean;
  onClose: () => void;
  onToggle?: () => void;
  isMobileView: boolean;
  currentView: SidebarView;
  onNavigate: (view: SidebarView) => void;
  walletState?: WalletState;
  onOpenBilling?: () => void;
  activeConnectors?: ConnectorSummary[];
}

export function Sidebar({ theme, open, onClose, onToggle, isMobileView, currentView, onNavigate, walletState, onOpenBilling, activeConnectors }: SidebarProps) {
  const isOverlay = isMobileView;
  const sidebarWidth = open ? 252 : 68;
  const { address } = useAccount();
  const devAddress = walletState?.fullAddress;
  const shortAddress = address 
    ? `${address.slice(0, 6)}...${address.slice(-4)}` 
    : (devAddress ? `${devAddress.slice(0, 6)}...${devAddress.slice(-4)}` : "Sera Admin");

  const navigate = (view: SidebarView) => {
    onNavigate(view);
    if (isMobileView) onClose();
  };

  return (
    <>
      {isOverlay && open && (
        <div
          onClick={onClose}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 20 }}
        />
      )}
      <div
        style={{
          position: isOverlay ? "absolute" : "relative",
          zIndex: 21,
          top: 0, left: 0, bottom: 0,
          width: isOverlay ? 260 : sidebarWidth,
          background: theme.surface2,
          borderRight: `1px solid ${theme.border}`,
          overflow: "hidden",
          transition: "width 240ms cubic-bezier(.4,0,.2,1), transform 240ms cubic-bezier(.4,0,.2,1)",
          transform: isOverlay ? (open ? "translateX(0)" : "translateX(-100%)") : "none",
          display: "flex", flexDirection: "column", flexShrink: 0, height: "100%",
        }}
      >
        <div style={{ width: isOverlay ? 260 : sidebarWidth, padding: "16px 14px", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box", transition: "width 240ms cubic-bezier(.4,0,.2,1)" }}>
          
          <div style={{ display: "flex", alignItems: "center", justifyContent: open ? "space-between" : "center", padding: open ? "2px 4px 20px" : "2px 0 24px", flexDirection: open ? "row" : "column", gap: open ? 0 : 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
              <img src="/sera-logo.png" alt="Sera" style={{ width: 22, height: 22, objectFit: "contain", flexShrink: 0 }} />
              {open && <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, color: theme.ink }}>Sera</span>}
            </div>
            {!isOverlay && onToggle && (
              <button onClick={onToggle} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex" }}>
                {open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
              </button>
            )}
            {isOverlay && (
              <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4 }}>
                <X size={18} />
              </button>
            )}
          </div>


          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, alignItems: open ? "stretch" : "center" }}>
            <div
              onClick={() => {
                navigate("connections");
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: open ? "8px 4px" : "10px", cursor: "pointer", marginBottom: 6,
                justifyContent: open ? "flex-start" : "center", borderRadius: 8,
                background: currentView === "connections" ? theme.accentSoft : "transparent",
              }}
              title={!open ? "Workspace" : undefined}
            >
              <Plus size={15} color={theme.inkSoft} style={{ flexShrink: 0 }} />
              {open && (
                <span style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkSoft, fontWeight: 500, whiteSpace: "nowrap" }}>
                  Workspace
                </span>
              )}
            </div>

            {/* Core Views */}
            <div
              onClick={() => {
                navigate("wallet" as SidebarView);
              }}
              title={!open ? "Manage Money" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: open ? "8px 6px" : "12px", borderRadius: 8,
                cursor: "pointer", transition: "background 150ms",
                marginBottom: 2,
                justifyContent: open ? "flex-start" : "center",
                background: currentView === "wallet" ? theme.accentSoft : "transparent"
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = currentView === "wallet" ? theme.accentSoft : theme.surface; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = currentView === "wallet" ? theme.accentSoft : "transparent"; }}
            >
              <Wallet size={18} color={currentView === "wallet" ? theme.accent : theme.inkSoft} style={{ flexShrink: 0 }} />
              {open && (
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: currentView === "wallet" ? theme.accent : theme.inkSoft, fontWeight: currentView === "wallet" ? 600 : 500, whiteSpace: "nowrap", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  Manage Money
                </span>
              )}
            </div>

            {activeConnectors?.filter(c => c.isActive || c.alwaysActive).map((c) => {
              // Hide internal connectors from sidebar
              if (c.id === 'wallet' || c.id === 'autonomy' || c.id === 'communication') return null;

              return (
                <div
                  key={c.id}
                  title={!open ? c.name : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: open ? "8px 6px" : "12px", borderRadius: 8,
                    cursor: "default", transition: "background 150ms",
                    marginBottom: 2,
                    justifyContent: open ? "flex-start" : "center",
                    background: "transparent"
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = theme.surface; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {c.id === 'polymarket' ? (
                     <img src="/polymarket.png" width={18} height={18} style={{ flexShrink: 0, borderRadius: 4 }} />
                  ) : c.id === 'hyperliquid-market-data' ? (
                     <img src="/hyperliquid.png" width={18} height={18} style={{ flexShrink: 0, borderRadius: 4 }} />
                  ) : (
                     <svg width={18} height={18} style={{ fill: theme.inkSoft, flexShrink: 0 }}>
                       <use href={`/icons.svg#Server`} />
                     </svg>
                  )}
                  {open && (
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkSoft, fontWeight: 500, whiteSpace: "nowrap", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.name.split(' (')[0]}
                    </span>
                  )}
                  {open && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
          
          <div style={{ flex: 1 }} />

          {onOpenBilling && (
            <div 
              onClick={onOpenBilling}
              style={{ 
                display: "flex", alignItems: "center", gap: 8, padding: open ? "12px 6px" : "12px 0", justifyContent: "center",
                cursor: "pointer", borderRadius: 8, transition: "background 150ms", marginBottom: 4
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = theme.surface; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              title="Monetization / Agent Battery"
            >
              <Battery size={20} color={(walletState?.agentCredits === -1 || (walletState?.agentCredits ?? 0) > 10000) ? "#22c55e" : "#ef4444"} style={{ flexShrink: 0 }} />
            </div>
          )}

          <div 
            onClick={() => {
              navigate("profile");
            }}
            style={{ 
              borderTop: `1px solid ${theme.border}`, paddingTop: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: open ? "12px 6px" : "12px 0", justifyContent: open ? "flex-start" : "center", flexDirection: open ? "row" : "column-reverse",
              cursor: "pointer", borderRadius: 8, transition: "background 150ms", background: currentView === "profile" ? theme.accentSoft : "transparent"
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = theme.surface; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = currentView === "profile" ? theme.accentSoft : "transparent"; }}
          >
            <UserCircle size={18} color={currentView === "profile" ? theme.accent : theme.inkSoft} style={{ flexShrink: 0 }} />
            {open && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: currentView === "profile" ? theme.accent : theme.ink, fontWeight: 600, whiteSpace: "nowrap" }}>{shortAddress}</span>
                {walletState?.tier && (
                  <span style={{ 
                    fontFamily: "Inter, sans-serif", fontSize: 9, fontWeight: 700, 
                    background: walletState?.tier === "WHALE" ? "rgba(168, 85, 247, 0.15)" : (walletState?.tier === "PRO" ? theme.accentSoft : theme.surface2), 
                    color: walletState?.tier === "WHALE" ? "#a855f7" : (walletState?.tier === "PRO" ? theme.accent : theme.inkSoft), 
                    padding: "2px 5px", borderRadius: 4, letterSpacing: 0.5, flexShrink: 0 
                  }}>
                    {walletState?.tier}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
