import { useState } from "react";
import { X, ShieldCheck, AlertTriangle, Zap } from "lucide-react";
import type { ThemeType } from "../../theme";

interface ConnectorSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  riskSummary: string;
  network?: string;
  alwaysActive: boolean;
  isActive: boolean;
  toolCount: number;
  toolNames: string[];
}

interface ActivationModalProps {
  theme: ThemeType;
  connector: ConnectorSummary;
  onActivate: (connectorId: string) => void;
  onClose: () => void;
}

export function ActivationModal({ theme, connector, onActivate, onClose }: ActivationModalProps) {
  const [agreed, setAgreed] = useState(false);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
        animation: "fadeIn 200ms ease forwards",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, calc(100% - 32px))",
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 20,
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
          overflow: "hidden",
          animation: "slideUp 300ms cubic-bezier(.4,0,.2,1) forwards",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: `1px solid ${theme.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: theme.surface2, border: `1px solid ${theme.border}`,
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden"
            }}>
              {connector.id === 'wallet' ? (
                <img src="/base.svg" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : connector.id === 'threads' ? (
                <svg viewBox="0 0 192 192" width={22} height={22} fill={theme.ink}>
                  <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.773 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" />
                </svg>
              ) : (
                <Zap size={20} color={theme.inkSoft} />
              )}
            </div>
            <div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 600, color: theme.ink }}>
                {connector.name}
              </div>
              {connector.network && (
                <div style={{ fontSize: 12, color: theme.inkSoft, marginTop: 2 }}>
                  Network: {connector.network}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: theme.inkSoft, padding: 4, display: "flex", borderRadius: 8,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Risk Summary */}
        <div style={{ padding: "20px 24px" }}>
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "14px 16px", borderRadius: 14,
            background: theme.isDark ? "rgba(251, 191, 36, 0.08)" : "rgba(251, 191, 36, 0.1)",
            border: `1px solid ${theme.isDark ? "rgba(251, 191, 36, 0.15)" : "rgba(251, 191, 36, 0.2)"}`,
            marginBottom: 18,
          }}>
            <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13, lineHeight: 1.55, color: theme.ink }}>
              {connector.riskSummary}
            </div>
          </div>

          {/* Tools that will be unlocked */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Capabilities unlocked ({connector.toolCount})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {connector.toolNames.map(name => (
                <span
                  key={name}
                  style={{
                    fontSize: 11, fontWeight: 500, fontFamily: "monospace",
                    padding: "4px 10px", borderRadius: 8,
                    background: theme.surface2, border: `1px solid ${theme.border}`,
                    color: theme.inkSoft,
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* Consent checkbox */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
            padding: "12px 14px", borderRadius: 12,
            background: agreed ? (theme.isDark ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.06)") : theme.surface2,
            border: `1px solid ${agreed ? "rgba(16, 185, 129, 0.3)" : theme.border}`,
            transition: "all 200ms ease",
          }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: 2, accentColor: theme.accent }}
            />
            <span style={{ fontSize: 13, lineHeight: 1.5, color: theme.ink }}>
              I understand the risks and want to activate <strong>{connector.name}</strong> for my Sera agent.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px 20px",
          display: "flex", gap: 10, justifyContent: "flex-end",
          borderTop: `1px solid ${theme.border}`,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px", borderRadius: 12, border: `1px solid ${theme.border}`,
              background: "transparent", color: theme.inkSoft,
              fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500,
              cursor: "pointer", transition: "background 150ms",
            }}
          >
            Cancel
          </button>
          <button
            disabled={!agreed}
            onClick={() => { onActivate(connector.id); onClose(); }}
            style={{
              padding: "10px 24px", borderRadius: 12, border: "none",
              background: agreed
                ? `linear-gradient(135deg, ${theme.accent}, ${theme.accentHover})`
                : theme.surface2,
              color: agreed ? "#fff" : theme.inkFaint,
              fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600,
              cursor: agreed ? "pointer" : "default",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 200ms ease",
              opacity: agreed ? 1 : 0.6,
            }}
          >
            <ShieldCheck size={15} />
            Activate
          </button>
        </div>
      </div>
    </div>
  );
}
