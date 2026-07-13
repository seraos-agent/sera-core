import { useState, useEffect } from "react";
import {
  ChevronLeft as CloseIcon,
  MonitorPlay,
  Wallet,
  MessageCircle,
  Store,
  CalendarCheck,
  Megaphone,
  BookOpen,
  Home,
  Cloud,
  Database,
  Server,
  Box,
  Terminal,
  Activity
} from "lucide-react";
import type { ThemeType } from "../../theme";

interface WorkspacePageProps {
  theme: ThemeType;
  walletState?: any; // Kept for backwards compatibility with App.tsx if still passed
  onBack: () => void;
  isMobileView?: boolean;
}


const CATEGORIES = [
  { id: "software", name: "Build Software", icon: MonitorPlay },
  { id: "finance", name: "Manage Money", icon: Wallet },
  { id: "communication", name: "Communicate", icon: MessageCircle },
  { id: "productivity", name: "Stay Organized", icon: CalendarCheck },
  { id: "commerce", name: "Run Business", icon: Store },
  { id: "social", name: "Grow Audience", icon: Megaphone },
  { id: "smarthome", name: "Smart Home", icon: Home },
];

const CAPABILITIES: Record<string, { name: string, icon: any }[]> = {
  software: [
    { name: "GitHub", icon: "github-icon" },
    { name: "Cloudflare", icon: Cloud },
    { name: "Supabase", icon: Database },
    { name: "Railway", icon: Server },
    { name: "Vercel", icon: Activity },
    { name: "Docker", icon: Box },
    { name: "Kubernetes", icon: Terminal },
  ],
  finance: [
    { name: "Base", icon: Wallet },
    { name: "Ethereum", icon: Wallet },
    { name: "Coinbase", icon: Activity },
    { name: "Stripe", icon: Store },
    { name: "PayPal", icon: Wallet },
    { name: "Bank Accounts", icon: BookOpen },
  ],
  communication: [
    { name: "Discord", icon: "discord-icon" },
    { name: "Telegram", icon: "telegram-icon" },
    { name: "Slack", icon: MessageCircle },
    { name: "Gmail", icon: "gmail-icon" },
  ],
  productivity: [
    { name: "Notion", icon: BookOpen },
    { name: "Google Calendar", icon: CalendarCheck },
    { name: "Linear", icon: Activity },
  ],
  commerce: [
    { name: "Shopify", icon: Store },
    { name: "WooCommerce", icon: Store },
    { name: "Gumroad", icon: Store },
  ],
  social: [
    { name: "X", icon: "x-icon" },
    { name: "Instagram", icon: Megaphone },
    { name: "YouTube", icon: MonitorPlay },
    { name: "LinkedIn", icon: Megaphone },
    { name: "Bluesky", icon: "bluesky-icon" },
  ],
  smarthome: [
    { name: "Home Assistant", icon: Home },
    { name: "Philips Hue", icon: Home },
    { name: "SmartThings", icon: Home },
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
    <div style={{ display: "grid", gridTemplateColumns: isMobileView ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(180px, 1fr))", gap: isMobileView ? 12 : 16 }}>
      {CATEGORIES.map(cat => {
        const Icon = cat.icon;
        return (
          <div
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: isMobileView ? 12 : 16,
              padding: isMobileView ? "20px 12px" : "32px 20px", borderRadius: 20, border: `1px solid ${theme.border}`,
              background: theme.surface2, transition: "transform 200ms ease",
              cursor: "pointer",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
            }}
          >
            <div style={{ width: isMobileView ? 44 : 56, height: isMobileView ? 44 : 56, borderRadius: 16, background: theme.surface, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={isMobileView ? 20 : 26} color={theme.ink} strokeWidth={1.5} />
            </div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: isMobileView ? 13 : 15, fontWeight: 600, color: theme.ink, textAlign: "center" }}>
              {cat.name}
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
        <div style={{ fontFamily: "Fraunces, serif", fontSize: isMobileView ? 24 : 32, fontWeight: 500, color: theme.ink, marginBottom: isMobileView ? 24 : 40, letterSpacing: -0.5 }}>
          {category?.name}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobileView ? "repeat(3, 1fr)" : "repeat(auto-fill, minmax(140px, 1fr))", gap: isMobileView ? 12 : 20 }}>
          {caps.map(cap => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.name}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: isMobileView ? 10 : 14,
                  padding: isMobileView ? "16px 8px" : "24px 16px", borderRadius: 16, background: "transparent",
                  transition: "transform 150ms ease",
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
              >
                <div style={{ width: isMobileView ? 56 : 72, height: isMobileView ? 56 : 72, borderRadius: "50%", background: theme.surface, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: theme.ink }}>
                  {typeof Icon === "string" ? (
                    <svg width={isMobileView ? 24 : 36} height={isMobileView ? 24 : 36} style={{ fill: theme.ink }}>
                      <use href={`/icons.svg#${Icon}`} />
                    </svg>
                  ) : (
                    <Icon size={isMobileView ? 24 : 36} strokeWidth={1.2} />
                  )}
                </div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: isMobileView ? 11 : 13, fontWeight: 500, color: theme.inkSoft, textAlign: "center", letterSpacing: 0.2 }}>
                  {cap.name}
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
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: isMobileView ? "12px 16px" : "12px 24px", borderBottom: "none", background: theme.bg
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={activeCategory === null ? onBack : () => setActiveCategory(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, display: "flex", padding: 4 }}>
            <CloseIcon size={18} />
          </button>
        </div>
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
