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
              {connector.id === 'polymarket' ? (
                <img src="/polymarket.png" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : connector.id === 'hyperliquid-market-data' ? (
                <img src="/hyperliquid.png" width={22} height={22} style={{ borderRadius: 6 }} />
              ) : connector.id === 'wallet' ? (
                <img src="/base.svg" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
