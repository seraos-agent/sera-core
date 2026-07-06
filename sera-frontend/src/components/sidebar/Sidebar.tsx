import { X, Plus, Settings, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { CONNECTORS } from "../../theme";
import type { ThemeType } from "../../theme";

interface SidebarProps {
  theme: ThemeType;
  open: boolean;
  onClose: () => void;
  onToggle?: () => void;
  isMobileView: boolean;
  onNavigate: (view: "chat" | "wallet" | "connections" | "automations") => void;
}

export function Sidebar({ theme, open, onClose, onToggle, isMobileView, onNavigate }: SidebarProps) {
  const isOverlay = isMobileView;
  const sidebarWidth = open ? 252 : 68;

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
              {open && <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, color: theme.ink }}>SERA</span>}
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
                onNavigate("connections");
                if (isMobileView) onClose();
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: open ? "8px 4px" : "10px", cursor: "pointer", marginBottom: 6,
                justifyContent: open ? "flex-start" : "center", borderRadius: 8
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

            {CONNECTORS.map((c) => {
              const Icon = c.icon;
              const isClickable = c.id === "wallet" || c.id === "automations";
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    if (isClickable) {
                      onNavigate(c.id as any);
                      if (isMobileView) onClose();
                    }
                  }}
                  title={!open ? c.name : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: open ? "8px 6px" : "12px", borderRadius: 8,
                    cursor: isClickable ? "pointer" : "default",
                    transition: "background 150ms",
                    justifyContent: open ? "flex-start" : "center",
                    position: "relative"
                  }}
                  onMouseEnter={e => { if (isClickable) (e.currentTarget as HTMLElement).style.background = theme.surface; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <Icon size={15} color={theme.inkSoft} style={{ flexShrink: 0 }} />
                  {open && (
                    <span style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name}
                    </span>
                  )}
                  {open && (
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: theme.status, flexShrink: 0 }} title="Connected" />
                  )}
                  {!open && isClickable && (
                    <span style={{ position: "absolute", top: 8, right: 8, width: 6, height: 6, borderRadius: "50%", background: theme.status }} title="Connected" />
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: open ? "12px 4px 2px" : "12px 0 2px", justifyContent: open ? "flex-start" : "center", flexDirection: open ? "row" : "column-reverse" }}>
            {open && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.ink, fontWeight: 600, whiteSpace: "nowrap" }}>Sera Admin</span>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 9, fontWeight: 700, background: theme.accentSoft, color: theme.accent, padding: "2px 5px", borderRadius: 4, letterSpacing: 0.5, flexShrink: 0 }}>PRO</span>
              </div>
            )}

            <button
              title={!open ? "Settings" : undefined}
              style={{ display: "flex", alignItems: "center", padding: "4px", borderRadius: 6, border: "none", background: "transparent", color: theme.inkFaint, cursor: "pointer", flexShrink: 0 }}
            >
              <Settings size={15} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
