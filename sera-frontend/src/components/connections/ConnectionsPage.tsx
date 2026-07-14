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

const CAPABILITIES: Record<string, { name: string, icon: any, price: string }[]> = {
  software: [
    { name: "GitHub", icon: "github-icon", price: "10 USDC/mo" },
    { name: "Cloudflare", icon: Cloud, price: "5 USDC/mo" },
    { name: "Supabase", icon: Database, price: "15 USDC/mo" },
    { name: "Railway", icon: Server, price: "5 USDC/mo" },
    { name: "Vercel", icon: Activity, price: "10 USDC/mo" },
    { name: "Docker", icon: Box, price: "Free" },
    { name: "Kubernetes", icon: Terminal, price: "25 USDC/mo" },
  ],
  finance: [
    { name: "Base", icon: Wallet, price: "Free (Included)" },
    { name: "Ethereum", icon: Wallet, price: "Free (Included)" },
    { name: "Coinbase", icon: Activity, price: "5 USDC/mo" },
  ],
  communication: [
    { name: "Discord", icon: "discord-icon", price: "Free" },
    { name: "Telegram", icon: "telegram-icon", price: "5 USDC/mo" },
    { name: "Slack", icon: MessageCircle, price: "5 USDC/mo" },
    { name: "Gmail", icon: "gmail-icon", price: "Free" },
  ],
  productivity: [
    { name: "Notion", icon: BookOpen, price: "5 USDC/mo" },
    { name: "Google Calendar", icon: CalendarCheck, price: "Free" },
    { name: "Linear", icon: Activity, price: "10 USDC/mo" },
  ],
  commerce: [
    { name: "Shopify", icon: Store, price: "15 USDC/mo" },
    { name: "WooCommerce", icon: Store, price: "10 USDC/mo" },
    { name: "Gumroad", icon: Store, price: "5 USDC/mo" },
  ],
  social: [
    { name: "X", icon: "x-icon", price: "Free (Included)" },
    { name: "Instagram", icon: Megaphone, price: "10 USDC/mo" },
    { name: "YouTube", icon: MonitorPlay, price: "15 USDC/mo" },
    { name: "LinkedIn", icon: Megaphone, price: "15 USDC/mo" },
    { name: "Bluesky", icon: "bluesky-icon", price: "Free" },
  ],
  smarthome: [
    { name: "Home Assistant", icon: Home, price: "Free" },
    { name: "Philips Hue", icon: Home, price: "5 USDC/mo" },
    { name: "SmartThings", icon: Home, price: "5 USDC/mo" },
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

        <div style={{ display: "grid", gridTemplateColumns: isMobileView ? "repeat(1, 1fr)" : "repeat(auto-fill, minmax(240px, 1fr))", gap: isMobileView ? 12 : 20 }}>
          {caps.map(cap => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.name}
                style={{
                  display: "flex", flexDirection: "column", gap: 12,
                  padding: isMobileView ? "16px 12px" : "20px 16px", borderRadius: 16, border: `1px solid ${theme.border}`,
                  background: theme.surface2, transition: "transform 200ms ease",
                  cursor: "default",
                  position: "relative",
                  overflow: "hidden"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {typeof Icon === "string" ? (
                      <svg width={20} height={20} style={{ fill: theme.ink }}>
                        <use href={`/icons.svg#${Icon}`} />
                      </svg>
                    ) : (
                      <Icon size={20} color={theme.ink} strokeWidth={1.5} />
                    )}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: theme.ink, background: theme.surface, border: `1px solid ${theme.border}`, padding: "4px 8px", borderRadius: 8 }}>
                    {cap.price}
                  </div>
                </div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 500, color: theme.ink }}>
                  {cap.name}
                </div>
                <div style={{ fontSize: 11, color: theme.inkSoft, marginTop: -4 }}>
                  Available in Marketplace
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
