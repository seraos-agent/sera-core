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

export function ConnectionsPage({ theme, walletState, onBack, isMobileView, socket }: WorkspacePageProps) {
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
      socket.off("connector:status_changed");
    };
  }, [socket]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_SUCCESS' && event.data?.connector) {
        if (socket) {
          socket.emit('connector:activate', { connectorId: event.data.connector });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
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
    
    if (connectorId === 'threads') {
      const authUrl = `https://localhost:3001/api/auth/threads?sessionId=${walletState?.sessionId}`;
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      window.open(authUrl, 'Threads OAuth', `width=${width},height=${height},left=${left},top=${top}`);
    } else {
      socket.emit('connector:activate', { connectorId });
    }
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
            ) : connector.id === 'threads' ? (
              <svg viewBox="0 0 192 192" width={22} height={22} fill={theme.ink}>
                <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.773 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" />
              </svg>
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
