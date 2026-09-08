import { X, Plus, PanelLeftClose, PanelLeftOpen, UserCircle, Battery, Wallet, Clock, Zap, Send } from "lucide-react";
import type { ThemeType } from "../../theme";
import { useAccount } from 'wagmi';
import type { WalletState } from "../../hooks/useWallet";

export type SidebarView = "chat" | "wallet" | "connections" | "automations" | "profile" | "threads_settings";

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
              title={!open ? "Manage Value" : undefined}
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
                  Manage Value
                </span>
              )}
            </div>

            <div
              onClick={() => {
                navigate("automations" as SidebarView);
              }}
              title={!open ? "Active Intents" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: open ? "8px 6px" : "12px", borderRadius: 8,
                cursor: "pointer", transition: "background 150ms",
                marginBottom: 2,
                justifyContent: open ? "flex-start" : "center",
                background: currentView === "automations" ? theme.accentSoft : "transparent"
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = currentView === "automations" ? theme.accentSoft : theme.surface; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = currentView === "automations" ? theme.accentSoft : "transparent"; }}
            >
              <Clock size={18} color={currentView === "automations" ? theme.accent : theme.inkSoft} style={{ flexShrink: 0 }} />
              {open && (
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: currentView === "automations" ? theme.accent : theme.inkSoft, fontWeight: currentView === "automations" ? 600 : 500, whiteSpace: "nowrap", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  Active Intents
                </span>
              )}
            </div>



            {activeConnectors?.filter(c => c.isActive || c.alwaysActive).map((c) => {
              // Hide internal connectors from sidebar
              if (c.id === 'wallet' || c.id === 'autonomy' || c.id === 'communication') return null;

              // Hide any unrecognized connectors that don't have UI icons
              if (!['threads', 'telegram', 'whatsapp', 'google_drive', 'hyperliquid'].includes(c.id)) return null;

              return (
                <div
                  key={c.id}
                  onClick={() => navigate(c.id === 'threads' ? "threads_settings" : "connections" as SidebarView)}
                  title={!open ? c.name : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: open ? "8px 6px" : "12px", borderRadius: 8,
                    cursor: "pointer", transition: "background 150ms",
                    marginBottom: 2,
                    justifyContent: open ? "flex-start" : "center",
                    background: "transparent"
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = theme.surface; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {c.id === 'wallet' ? (
                    <img src="/base.svg" width={18} height={18} style={{ flexShrink: 0, borderRadius: 4, objectFit: "cover" }} />
                  ) : c.id === 'hyperliquid' ? (
                    <img src="/hyperliquid.png" width={18} height={18} style={{ flexShrink: 0, borderRadius: 4, objectFit: "contain" }} />
                  ) : c.id === 'threads' ? (
                    <svg viewBox="0 0 192 192" width={18} height={18} fill={theme.ink} style={{ flexShrink: 0 }}>
                      <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.773 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" />
                    </svg>
                  ) : c.id === 'telegram' ? (
                    <Send size={18} color={theme.inkSoft} style={{ flexShrink: 0 }} />
                  ) : c.id === 'whatsapp' ? (
                    <svg viewBox="0 0 24 24" width={18} height={18} fill="#25D366" style={{ flexShrink: 0 }}>
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.65 3.742-.983zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                    </svg>
                  ) : c.id === 'google_drive' ? (
                    <img src="/google-drive.svg" width={18} height={18} style={{ flexShrink: 0, objectFit: "contain" }} />
                  ) : (
                    <Zap size={18} color={theme.inkSoft} style={{ flexShrink: 0 }} />
                  )}
                  {open && (
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkSoft, fontWeight: 500, whiteSpace: "nowrap", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.id === 'hyperliquid' ? 'Hyperliquid' : (c.id === 'telegram' ? 'Telegram' : (c.id === 'whatsapp' ? 'WhatsApp' : (c.id === 'google_drive' ? 'Google Drive' : (c.id === 'threads' ? 'Threads' : c.name.split(' (')[0]))))}
                    </span>
                  )}
                  {open && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
          {onOpenBilling && (
            <div
              onClick={onOpenBilling}
              style={{
                marginTop: "auto",
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
