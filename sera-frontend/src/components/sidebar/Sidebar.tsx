import { X, Plus, Moon, Sun, Settings } from "lucide-react";
import { CONNECTORS } from "../../theme";
import type { ThemeType } from "../../theme";

interface SidebarProps {
  theme: ThemeType;
  open: boolean;
  onClose: () => void;
  isMobileView: boolean;
  mode: "light" | "dark";
  setMode: (mode: "light" | "dark") => void;
  onNavigate: (view: "chat" | "wallet") => void;
}

export function Sidebar({ theme, open, onClose, isMobileView, mode, setMode, onNavigate }: SidebarProps) {
  const isOverlay = isMobileView;

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
          width: isOverlay ? 260 : open ? 252 : 0,
          background: theme.surface2,
          borderRight: `1px solid ${theme.border}`,
          overflow: "hidden",
          transition: "width 240ms cubic-bezier(.4,0,.2,1), transform 240ms cubic-bezier(.4,0,.2,1)",
          transform: isOverlay ? (open ? "translateX(0)" : "translateX(-100%)") : "none",
          display: "flex", flexDirection: "column", flexShrink: 0, height: "100%",
        }}
      >
        <div style={{ width: isOverlay ? 260 : 252, padding: "16px 14px", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", justifyItems: "space-between", padding: "2px 4px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
              <img src="/sera-logo.png" alt="Sera" style={{ width: 22, height: 22, objectFit: "contain" }} />
              <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, color: theme.ink }}>SERA</span>
            </div>
            {isOverlay && (
              <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4 }}>
                <X size={18} />
              </button>
            )}
          </div>


          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 4px", cursor: "pointer", marginBottom: 6,
              }}
            >
              <Plus size={15} color={theme.inkSoft} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkSoft, fontWeight: 500 }}>
                Add Connection
              </span>
            </div>

            {CONNECTORS.map((c) => {
              const Icon = c.icon;
              const isWallet = c.id === "wallet";
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (isWallet) {
                      onNavigate("wallet");
                      if (isMobileView) onClose();
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 6px", borderRadius: 8,
                    cursor: isWallet ? "pointer" : "default",
                    transition: "background 150ms",
                  }}
                  onMouseEnter={e => { if (isWallet) (e.currentTarget as HTMLElement).style.background = theme.surface; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <Icon size={15} color={theme.inkSoft} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: theme.status, flexShrink: 0 }} title="Connected" />
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "12px 4px 2px" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.ink, fontWeight: 600 }}>Sera Admin</span>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 9, fontWeight: 700, background: theme.accentSoft, color: theme.accent, padding: "2px 5px", borderRadius: 4, letterSpacing: 0.5 }}>PRO</span>
            </div>
            <button
              onClick={() => setMode(mode === "light" ? "dark" : "light")}
              title={mode === "light" ? "Dark mode" : "Light mode"}
              style={{ display: "flex", alignItems: "center", padding: "4px", borderRadius: 6, border: "none", background: "transparent", color: theme.inkSoft, cursor: "pointer" }}
            >
              {mode === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <Settings size={15} color={theme.inkFaint} style={{ cursor: "pointer" }} />
          </div>
        </div>
      </div>
    </>
  );
}
