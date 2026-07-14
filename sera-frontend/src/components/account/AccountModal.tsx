import { useEffect } from "react";
import type { ThemeType } from "../../theme";
import type { WalletState } from "../../hooks/useWallet";
import { LogOut, Check } from "lucide-react";
import { Socket } from "socket.io-client";

const UsdcIcon = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 2000 2000" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1000 2000c554.17 0 1000-445.83 1000-1000S1554.17 0 1000 0 0 445.83 0 1000s445.83 1000 1000 1000z" fill="#2775ca" />
    <path d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34s41.67-95.83 125-95.83c75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-16.67-91.67-91.67-162.5-187.5-170.83v-100c0-16.67-12.5-29.17-33.33-33.34h-62.5c-16.67 0-29.17 12.5-33.34 33.34v95.83c-125 16.67-204.16 100-204.16 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5s-58.34 112.5-137.5 112.5c-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c16.66 104.16 83.33 179.16 220.83 200v100c0 16.66 12.5 29.16 33.33 33.33h62.5c16.67 0 29.17-12.5 33.34-33.33v-100c125-20.84 208.33-108.34 208.33-220.84z" fill="#fff" />
    <path d="M787.5 1595.83c-325-116.66-491.67-479.16-370.83-800 62.5-175 200-308.33 370.83-370.83 16.67-8.33 25-20.83 25-41.67V325c0-16.67-8.33-29.17-25-33.33-4.17 0-12.5 0-16.67 4.16-395.83 125-612.5 545.84-487.5 941.67 75 233.33 254.17 412.5 487.5 487.5 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-8.33 4.17-16.66v-58.34c0-12.5-12.5-29.16-25-37.5zM1229.17 295.83c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 8.33-4.17 16.67v58.33c0 16.67 12.5 33.33 25 41.67 325 116.66 491.67 479.16 370.83 800-62.5 175-200 308.33-370.83 370.83-16.67 8.33-25 20.83-25 41.67V1700c0 16.67 8.33 29.17 25 33.33 4.17 0 12.5 0 16.67-4.16 395.83-125 612.5-545.84 487.5-941.67-75-237.5-258.34-416.67-487.5-491.67z" fill="#fff" />
  </svg>
);

interface AccountModalProps {
  theme: ThemeType;
  isOpen: boolean;
  onClose: () => void;
  walletState: WalletState;
  socket: Socket | null;
  onDisconnect: () => void;
  isMobileView?: boolean;
}

export function AccountModal({ theme, isOpen, onClose, walletState, socket, onDisconnect, isMobileView }: AccountModalProps) {
  useEffect(() => {
    if (!isOpen || !socket || !walletState.address) return;

    // Fetch initial billing status when modal opens
    socket.emit("billing:fetch", { address: walletState.address });

    // Note: We used to listen to 'billing:update' here to show remaining periods,
    // but the UI was simplified to remove the balance text.
    // The event is still emitted by the backend and can be used in the future.
  }, [isOpen, socket, walletState.address]);

  if (!isOpen) return null;

  const handleTopUp = (amountUsdc: number) => {
    if (!socket || !walletState.address) return;
    socket.emit("billing:topup_dev_mock", { address: walletState.address, amountUsdc });
  };

  const shortAddress = walletState.address
    ? `${walletState.address.slice(0, 6)}...${walletState.address.slice(-4)}`
    : "Not Connected";

  // Theming for the cards to match the requested minimalist aesthetic
  const cardBg = theme.isDark ? "#202123" : theme.surface;
  const cardBorder = theme.isDark ? "#3A3B3E" : theme.border;
  const textPrimary = theme.ink;
  const textSecondary = theme.inkSoft;

  const buttonPrimaryBg = theme.isDark ? "#FFFFFF" : "#000000";
  const buttonPrimaryText = theme.isDark ? "#000000" : "#FFFFFF";
  const buttonSecondaryBg = "transparent";
  const buttonSecondaryBorder = theme.isDark ? "#56585D" : theme.border;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: theme.isDark ? "rgba(0, 0, 0, 0.8)" : "rgba(0, 0, 0, 0.6)",
      display: "flex", justifyContent: "center", alignItems: "center",
      zIndex: 1000, fontFamily: "Inter, sans-serif"
    }}>
      <div style={{
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: isMobileView ? 0 : 24,
        padding: isMobileView ? "64px 16px 24px 16px" : "48px 32px 32px 32px",
        width: "100%",
        maxWidth: 900,
        height: isMobileView ? "100%" : "auto",
        maxHeight: isMobileView ? "100%" : "90vh",
        overflowY: "auto",
        boxShadow: isMobileView ? "none" : "0 24px 48px rgba(0, 0, 0, 0.4)",
        position: "relative"
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: isMobileView ? 16 : 24, right: isMobileView ? 16 : 24,
            background: "transparent", border: "none", color: theme.inkSoft, fontSize: 28, cursor: "pointer",
            lineHeight: 1
          }}
        >
          &times;
        </button>

        {/* Header (Minimalist Serif) */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{ margin: "0 0 0 0", color: textPrimary, fontSize: isMobileView ? 24 : 32, fontWeight: 500, fontFamily: "Fraunces, serif" }}>
            Plans that grow with you
          </h2>
        </div>

        {/* Subscription Tiers */}
        <div style={{ display: "grid", gridTemplateColumns: isMobileView ? "1fr" : "1fr 1fr 1fr", gap: 20, marginBottom: 32 }}>

          {/* FREE TIER */}
          <div style={{
            background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: "28px 24px",
            display: "flex", flexDirection: "column"
          }}>
            <div style={{ color: textPrimary, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Free</div>
            <div style={{ fontSize: 14, color: textSecondary, marginBottom: 24, minHeight: 40 }}>Try Sera's basic features</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
              <div style={{ fontSize: 32, fontWeight: 600, color: textPrimary, lineHeight: 1 }}>-</div>
            </div>

            <button disabled style={{
              width: "100%", padding: "12px 0", borderRadius: 8, border: `1px solid ${buttonSecondaryBorder}`,
              background: buttonSecondaryBg, color: textSecondary, fontWeight: 500, cursor: "not-allowed",
              marginBottom: 32
            }}>
              Current Plan
            </button>

            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>Includes:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {["Basic conversation", "Standard thinking limits", "Web search capability", "Limited context memory"].map((feature, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: textSecondary }}>
                  <Check size={16} color={textSecondary} style={{ flexShrink: 0, marginTop: 1 }} />
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* PRO TIER */}
          <div style={{
            background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: "28px 24px",
            display: "flex", flexDirection: "column"
          }}>
            <div style={{ color: textPrimary, fontSize: 20, fontWeight: 600, marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Pro
              <span style={{ fontSize: 11, background: "rgba(255,255,255,0.1)", padding: "4px 8px", borderRadius: 12, fontWeight: 500, color: textSecondary }}>
                Most Popular
              </span>
            </div>
            <div style={{ fontSize: 14, color: textSecondary, marginBottom: 24, minHeight: 40 }}>Research, automate, and build</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <UsdcIcon size={32} />
              <div style={{ fontSize: 32, fontWeight: 600, color: textPrimary, lineHeight: 1 }}>20</div>
            </div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 24 }}>Billed monthly</div>

            <button
              onClick={() => handleTopUp(20)}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
                background: buttonPrimaryBg, color: buttonPrimaryText, fontWeight: 500, cursor: "pointer",
                marginBottom: 32, transition: "opacity 150ms"
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              Get Pro plan
            </button>

            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>Includes:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {["10k Base LLM Tokens / month", "Sera Base Agent (Standard Intelligence)", "Full Cognitive Execution & Memory"].map((feature, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: textSecondary }}>
                  <Check size={16} color={textSecondary} style={{ flexShrink: 0, marginTop: 1 }} />
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* ELITE TIER */}
          <div style={{
            background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: "28px 24px",
            display: "flex", flexDirection: "column"
          }}>
            <div style={{ color: textPrimary, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Elite</div>
            <div style={{ fontSize: 14, color: textSecondary, marginBottom: 24, minHeight: 40 }}>Higher limits, priority access</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <UsdcIcon size={32} />
              <div style={{ fontSize: 32, fontWeight: 600, color: textPrimary, lineHeight: 1 }}>300</div>
            </div>
            <div style={{ fontSize: 12, color: textSecondary, marginBottom: 24 }}>Billed monthly</div>

            <button
              onClick={() => handleTopUp(300)}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
                background: buttonPrimaryBg, color: buttonPrimaryText, fontWeight: 500, cursor: "pointer",
                marginBottom: 32, transition: "opacity 150ms"
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              Get Elite plan
            </button>

            <div style={{ fontSize: 13, color: textSecondary, marginBottom: 12 }}>Includes:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {["100k Base LLM Tokens / month", "Sera Advanced Agent (Max Intelligence)", "Unlocked Deep Reasoning Mode", "Priority Execution & Unlimited Tasks"].map((feature, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: textSecondary }}>
                  <Check size={16} color={textSecondary} style={{ flexShrink: 0, marginTop: 1 }} />
                  {feature}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexDirection: isMobileView ? "column" : "row", gap: isMobileView ? 16 : 0 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", color: textSecondary, fontSize: 13 }}>
            <div>Wallet: <span style={{ fontFamily: "monospace", color: textPrimary }}>{shortAddress}</span></div>
          </div>
          <button
            onClick={() => {
              onClose();
              onDisconnect();
            }}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8,
              background: "transparent", color: textSecondary, border: `1px solid ${buttonSecondaryBorder}`,
              fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "background 150ms"
            }}
            onMouseEnter={e => (e.currentTarget.style.background = theme.surface)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <LogOut size={16} /> Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
