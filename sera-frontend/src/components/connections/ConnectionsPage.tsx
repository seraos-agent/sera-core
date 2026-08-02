import { useState, useEffect } from "react";
import {
  ChevronLeft as CloseIcon,
  Wallet,
  MessageCircle,
  Activity,
  CheckCircle2,
  Clock,
  Gift,
  MonitorPlay,
  Server,
  Shield,
  Power,
  PowerOff
} from "lucide-react";
import type { ThemeType } from "../../theme";
import { QuestDashboard } from "../quests/QuestDashboard";
import { McpConnectorPanel } from "./McpConnectorPanel";
import { ActivationModal } from "./ActivationModal";

interface WorkspacePageProps {
  theme: ThemeType;
  walletState?: any;
  onBack: () => void;
  isMobileView?: boolean;
  socket?: any;
}

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

const CATEGORIES = [
  { id: "finance", name: "Finance & Trading", icon: Wallet, description: "Manage Web3 wallets, balances, and market trading" },
  { id: "communication", name: "Channels & Messaging", icon: MessageCircle, description: "Interactive channels and workspace integrations" },
  { id: "quests", name: "Quests & Airdrops", icon: Gift, description: "Complete tasks to earn points and free Agent Credits" },
  { id: "connectors", name: "Platform Connectors", icon: Server, description: "External AI platforms & MCP (Model Context Protocol) integrations" },
];

/** Fallback static capabilities for categories not backed by connectors (quests). */
const STATIC_CAPABILITIES: Record<string, { name: string; icon: any; status: "Active" | "Ready"; description: string }[]> = {
  quests: [
    { name: "Daily Check-in", icon: CheckCircle2, status: "Ready", description: "Log in daily to claim free Sera Points" },
    { name: "X (Twitter) Engagement", icon: "x-icon", status: "Ready", description: "Earn points by interacting with AI-generated posts" },
    { name: "Watch & Earn", icon: MonitorPlay, status: "Ready", description: "Find hidden passwords in YouTube videos for rewards" },
  ],
};

const CATEGORY_ICON_MAP: Record<string, any> = {
  finance: Activity,
  communication: MessageCircle,
  connectors: Server,
};

export function ConnectionsPage({ theme, onBack, isMobileView, socket }: WorkspacePageProps) {
  const sidePad = isMobileView ? 16 : 32;
  const titleSize = isMobileView ? 22 : 36;

  const [activeCategory, setActiveCategory] = useState<string | null>(() => {
    return localStorage.getItem("sera_active_category") || null;
  });

  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [activationTarget, setActivationTarget] = useState<ConnectorSummary | null>(null);

  // Fetch connector catalog from backend
  useEffect(() => {
    if (!socket) return;

    socket.emit('connector:list');

    const handleCatalog = (data: ConnectorSummary[]) => setConnectors(data);
    const handleStatusChanged = (data: ConnectorSummary[]) => setConnectors(data);

    socket.on('connector:catalog', handleCatalog);
    socket.on('connector:status_changed', handleStatusChanged);

    return () => {
      socket.off('connector:catalog', handleCatalog);
      socket.off('connector:status_changed', handleStatusChanged);
    };
  }, [socket]);

  useEffect(() => {
    if (activeCategory === null) {
      localStorage.removeItem("sera_active_category");
    } else {
      localStorage.setItem("sera_active_category", activeCategory);
    }
  }, [activeCategory]);

  const handleActivate = (connectorId: string) => {
    if (!socket) return;
    socket.emit('connector:activate', { connectorId });
  };

  const handleDeactivate = (connectorId: string) => {
    if (!socket) return;
    socket.emit('connector:deactivate', { connectorId });
  };

  // Group connectors by category
  const connectorsByCategory = connectors.reduce<Record<string, ConnectorSummary[]>>((acc, c) => {
    if (!acc[c.category]) acc[c.category] = [];
    acc[c.category].push(c);
    return acc;
  }, {});

  const getCategoryCount = (catId: string): number => {
    if (catId === 'quests') return STATIC_CAPABILITIES.quests?.length || 0;
    if (catId === 'connectors') return 1 + (connectorsByCategory['connectors']?.length || 0);
    return connectorsByCategory[catId]?.length || 0;
  };

  const renderCategories = () => (
    <div style={{ display: "grid", gridTemplateColumns: isMobileView ? "repeat(1, 1fr)" : "repeat(auto-fill, minmax(240px, 1fr))", gap: isMobileView ? 12 : 20 }}>
      {CATEGORIES.map(cat => {
        const Icon = cat.icon;
        const capCount = getCategoryCount(cat.id);
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

  const renderConnectorCard = (connector: ConnectorSummary) => {
    const Icon = CATEGORY_ICON_MAP[connector.category] || Activity;
    return (
      <div
        key={connector.id}
        style={{
          display: "flex", flexDirection: "column", gap: 14,
          padding: isMobileView ? "18px 14px" : "22px 18px", borderRadius: 18, border: `1px solid ${theme.border}`,
          background: theme.surface2, transition: "transform 200ms ease",
          cursor: "default", position: "relative", overflow: "hidden"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, background: theme.surface, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {connector.id === 'polymarket' ? (
              <img src="/polymarket.png" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : connector.id === 'hyperliquid-market-data' ? (
              <img src="/hyperliquid.png" width={22} height={22} style={{ borderRadius: 6 }} />
            ) : connector.id === 'wallet' ? (
              <img src="/base.svg" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <Icon size={20} color={theme.ink} strokeWidth={1.5} />
            )}
          </div>
          {connector.alwaysActive ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 600, color: "#6366f1",
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              padding: "4px 10px", borderRadius: 20
            }}>
              <Shield size={12} /> Always On
            </div>
          ) : connector.isActive ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 600, color: "#10b981",
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              padding: "4px 10px", borderRadius: 20
            }}>
              <CheckCircle2 size={12} /> Active
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 600, color: theme.inkSoft,
              background: theme.surface, border: `1px solid ${theme.border}`,
              padding: "4px 10px", borderRadius: 20
            }}>
              <Clock size={12} /> Available
            </div>
          )}
        </div>
        <div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: theme.ink, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            {connector.name}
            {connector.network && (
              <span style={{ fontSize: 10, fontWeight: 500, color: theme.inkFaint, background: theme.surface, border: `1px solid ${theme.border}`, padding: "2px 8px", borderRadius: 8 }}>
                {connector.network}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: theme.inkSoft, lineHeight: 1.4 }}>
            {connector.description}
          </div>
        </div>

        {/* Action Button */}
        {!connector.alwaysActive && (
          <div style={{ marginTop: 4 }}>
            {connector.isActive ? (
              <button
                onClick={() => handleDeactivate(connector.id)}
                style={{
                  width: "100%", padding: "8px 0", borderRadius: 10,
                  border: `1px solid ${theme.border}`, background: "transparent",
                  color: theme.inkSoft, fontFamily: "Inter, sans-serif",
                  fontSize: 12, fontWeight: 500, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "all 150ms",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)"; e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = theme.inkSoft; e.currentTarget.style.borderColor = theme.border; }}
              >
                <PowerOff size={13} /> Deactivate
              </button>
            ) : (
              <button
                onClick={() => setActivationTarget(connector)}
                style={{
                  width: "100%", padding: "8px 0", borderRadius: 10,
                  border: "none",
                  background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentHover})`,
                  color: "#fff", fontFamily: "Inter, sans-serif",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "opacity 150ms",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                <Power size={13} /> Activate
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCapabilities = (catId: string) => {
    if (catId === "quests") {
      return <QuestDashboard theme={theme} onBack={() => setActiveCategory(null)} isMobileView={isMobileView} />;
    }
    if (catId === "connectors") {
      return <McpConnectorPanel theme={theme} onBack={() => setActiveCategory(null)} isMobileView={isMobileView} socket={socket} />;
    }

    const category = CATEGORIES.find(c => c.id === catId);
    const caps = connectorsByCategory[catId] || [];

    return (
      <div style={{ animation: "walletPageIn 300ms ease forwards" }}>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: isMobileView ? 24 : 32, fontWeight: 500, color: theme.ink, marginBottom: 8, letterSpacing: -0.5 }}>
          {category?.name}
        </div>
        <div style={{ fontSize: 14, color: theme.inkSoft, marginBottom: isMobileView ? 24 : 36 }}>
          {category?.description}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobileView ? "repeat(1, 1fr)" : "repeat(auto-fill, minmax(260px, 1fr))", gap: isMobileView ? 12 : 20 }}>
          {caps.map(connector => renderConnectorCard(connector))}
        </div>

        {caps.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: theme.inkSoft, fontSize: 14 }}>
            No connectors registered for this category yet.
          </div>
        )}
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
                Explore and activate connectors. Sera will only use capabilities you have explicitly approved.
              </div>
              {renderCategories()}
            </>
          ) : (
            renderCapabilities(activeCategory)
          )}

        </div>
      </div>

      {/* Activation Modal */}
      {activationTarget && (
        <ActivationModal
          theme={theme}
          connector={activationTarget}
          onActivate={handleActivate}
          onClose={() => setActivationTarget(null)}
        />
      )}
    </div>
  );
}
