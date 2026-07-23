import { useState, useEffect } from "react";
import {
  ChevronLeft as CloseIcon,
  Wallet,
  MessageCircle,
  Activity,
  CheckCircle2,
  Clock
} from "lucide-react";
import type { ThemeType } from "../../theme";

interface WorkspacePageProps {
  theme: ThemeType;
  walletState?: any; // Kept for backwards compatibility with App.tsx if still passed
  onBack: () => void;
  isMobileView?: boolean;
}

interface CapabilityItem {
  name: string;
  icon: any;
  status: "Active" | "Ready";
  description: string;
}

const CATEGORIES = [
  { id: "finance", name: "Finance & Trading", icon: Wallet, description: "Manage Web3 wallets, balances, and market trading" },
  { id: "communication", name: "Channels & Messaging", icon: MessageCircle, description: "Interactive channels and workspace integrations" },
];

const CAPABILITIES: Record<string, CapabilityItem[]> = {
  finance: [
    { name: "Hyperliquid", icon: Activity, status: "Active", description: "Real-time candles, orderbooks & perpetual trading" },
    { name: "Base Network", icon: Wallet, status: "Active", description: "On-chain USDC/ETH transfers & Agent Vault" },
    { name: "Ethereum Mainnet", icon: Wallet, status: "Active", description: "L1 asset tracking and balance monitoring" },
  ],
  communication: [
    { name: "Slack", icon: MessageCircle, status: "Active", description: "Interactive bot via Slack Socket Mode (@sera)" },
    { name: "Telegram", icon: "telegram-icon", status: "Ready", description: "Instant messaging bot integration" },
    { name: "X (Twitter)", icon: "x-icon", status: "Ready", description: "Social market sentiment & automated updates" },
  ],
};

export function ConnectionsPage({ theme, onBack, isMobileView }: WorkspacePageProps) {
  const sidePad = isMobileView ? 16 : 32;
  const titleSize = isMobileView ? 22 : 36;

  const [activeCategory, setActiveCategory] = useState<string | null>(() => {
    return localStorage.getItem("sera_active_category") || null;
  });

  useEffect(() => {
    if (activeCategory === null) {
      localStorage.removeItem("sera_active_category");
    } else {
      localStorage.setItem("sera_active_category", activeCategory);
    }
  }, [activeCategory]);

  const renderCategories = () => (
    <div style={{ display: "grid", gridTemplateColumns: isMobileView ? "repeat(1, 1fr)" : "repeat(auto-fill, minmax(240px, 1fr))", gap: isMobileView ? 12 : 20 }}>
      {CATEGORIES.map(cat => {
        const Icon = cat.icon;
        const capCount = CAPABILITIES[cat.id]?.length || 0;
        return (
          <div
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            style={{
              display: "flex", flexDirection: "column", gap: isMobileView ? 12 : 16,
              padding: isMobileView ? "20px 16px" : "28px 24px", borderRadius: 20, border: `1px solid ${theme.border}`,
              background: theme.surface2, transition: "transform 200ms ease, border-color 200ms ease",
              cursor: "pointer",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translateY(-3px)";
              e.currentTarget.style.borderColor = theme.inkSoft;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = theme.border;
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ width: isMobileView ? 44 : 52, height: isMobileView ? 44 : 52, borderRadius: 16, background: theme.surface, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={isMobileView ? 20 : 24} color={theme.ink} strokeWidth={1.5} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, background: theme.surface, border: `1px solid ${theme.border}`, padding: "4px 10px", borderRadius: 12 }}>
                {capCount} {capCount === 1 ? 'Product' : 'Products'}
              </span>
            </div>
            <div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: isMobileView ? 15 : 17, fontWeight: 600, color: theme.ink, marginBottom: 4 }}>
                {cat.name}
              </div>
              <div style={{ fontSize: 13, color: theme.inkSoft, lineHeight: 1.4 }}>
                {cat.description}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderCapabilities = (catId: string) => {
    const category = CATEGORIES.find(c => c.id === catId);
    const caps = CAPABILITIES[catId] || [];

    return (
      <div style={{ animation: "walletPageIn 300ms ease forwards" }}>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: isMobileView ? 24 : 32, fontWeight: 500, color: theme.ink, marginBottom: 8, letterSpacing: -0.5 }}>
          {category?.name}
        </div>
        <div style={{ fontSize: 14, color: theme.inkSoft, marginBottom: isMobileView ? 24 : 36 }}>
          {category?.description}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobileView ? "repeat(1, 1fr)" : "repeat(auto-fill, minmax(260px, 1fr))", gap: isMobileView ? 12 : 20 }}>
          {caps.map(cap => {
            const Icon = cap.icon;
            const isActive = cap.status === "Active";
            return (
              <div
                key={cap.name}
                style={{
                  display: "flex", flexDirection: "column", gap: 14,
                  padding: isMobileView ? "18px 14px" : "22px 18px", borderRadius: 18, border: `1px solid ${theme.border}`,
                  background: theme.surface2, transition: "transform 200ms ease",
                  cursor: "default",
                  position: "relative",
                  overflow: "hidden"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: theme.surface, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {typeof Icon === "string" ? (
                      <svg width={20} height={20} style={{ fill: theme.ink }}>
                        <use href={`/icons.svg#${Icon}`} />
                      </svg>
                    ) : (
                      <Icon size={20} color={theme.ink} strokeWidth={1.5} />
                    )}
                  </div>
                  <div style={{ 
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 11, fontWeight: 600, 
                    color: isActive ? "#10b981" : theme.inkSoft, 
                    background: isActive ? "rgba(16, 185, 129, 0.1)" : theme.surface, 
                    border: `1px solid ${isActive ? "rgba(16, 185, 129, 0.2)" : theme.border}`, 
                    padding: "4px 10px", borderRadius: 20 
                  }}>
                    {isActive ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {cap.status}
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: theme.ink, marginBottom: 4 }}>
                    {cap.name}
                  </div>
                  <div style={{ fontSize: 12, color: theme.inkSoft, lineHeight: 1.4 }}>
                    {cap.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: theme.bg, animation: "walletPageIn 400ms cubic-bezier(.4,0,.2,1) forwards", minWidth: 0, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobileView ? "12px 16px" : "12px 24px", borderBottom: "none", background: theme.bg, flexShrink: 0 }}>
        <button 
          onClick={activeCategory === null ? onBack : () => setActiveCategory(null)} 
          style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex", borderRadius: 6, transition: "background 0.2s" }}
          onMouseEnter={(e) => e.currentTarget.style.background = theme.surface2}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          <CloseIcon size={18} />
        </button>
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 15, color: theme.ink }}>
          Workspace
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: `${isMobileView ? 24 : 48}px ${sidePad}px` }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          {activeCategory === null ? (
            <>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: titleSize, fontWeight: 400, color: theme.ink, marginBottom: 12, letterSpacing: -0.5, textAlign: "center" }}>
                The world Sera can operate in.
              </div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: isMobileView ? 14 : 16, color: theme.inkSoft, marginBottom: 48, textAlign: "center", maxWidth: 480, margin: "0 auto 48px", lineHeight: 1.5 }}>
                Explore the mapped capabilities. No configuration required. Sera will request access when needed.
              </div>
              {renderCategories()}
            </>
          ) : (
            renderCapabilities(activeCategory)
          )}

        </div>
      </div>
    </div>
  );
}
