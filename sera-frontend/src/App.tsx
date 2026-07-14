import { useState, useEffect } from "react";
import { THEME, FONT_LINK_ID } from "./theme";
import { useWallet } from "./hooks/useWallet";
import { useSocket } from "./hooks/useSocket";
import { Sidebar } from "./components/sidebar/Sidebar";
import { WalletPage } from "./components/wallet/WalletPage";
import { ChatView } from "./components/chat/ChatView";
import { ConnectionsPage } from "./components/connections/ConnectionsPage";
import { AutomationsPage } from "./components/automations/AutomationsPage";
import { AccountModal } from "./components/account/AccountModal";

import { LandingPage } from "./components/landing/LandingPage";
import { createWeb3Modal, useWeb3ModalTheme, useWeb3Modal } from '@web3modal/wagmi/react';
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
import { WagmiProvider, useAccount } from 'wagmi';
import { base, mainnet, polygon, arbitrum } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient();
const projectId = '58d806d66c104f547275d0afe4086b04';

const metadata = {
  name: 'SERA OS',
  description: 'SERA OS Web3 Interface',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://sera-os.app',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

const chains = [base, mainnet, polygon, arbitrum] as const;
const wagmiConfig = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
});

createWeb3Modal({
  wagmiConfig,
  projectId,
  themeMode: 'light',
});

function useFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
  }, []);
}

function InnerApp() {
  useFonts();
  const [mode, setMode] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("sera_theme");
    return (saved === "light" || saved === "dark") ? saved : "light";
  });

  const { setThemeMode } = useWeb3ModalTheme();

  useEffect(() => {
    setThemeMode(mode);
  }, [mode, setThemeMode]);

  useEffect(() => {
    localStorage.setItem("sera_theme", mode);
  }, [mode]);

  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [currentView, setCurrentView] = useState<"chat" | "wallet" | "connections" | "automations">(() => {
    const saved = localStorage.getItem("sera_view") as any;
    return ["chat", "wallet", "connections", "automations"].includes(saved) ? saved : "chat";
  });

  useEffect(() => {
    localStorage.setItem("sera_view", currentView);
  }, [currentView]);

  const [lastViewedCount, setLastViewedCount] = useState(0);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  const { walletState, setWalletState } = useWallet();
  const { socket, messages, setMessages, observations, setObservations, currentActivity, cancelChat } = useSocket(setWalletState, setMode);

  const theme = THEME[mode];

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      setIsMobileView(isMobile);
      if (!isMobile) setSidebarOpen(true);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSend = (text: string) => {
    const nextMsgId = Date.now();
    const userMsg = { id: nextMsgId, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    if (text.toLowerCase().includes("github") && (text.toLowerCase().includes("beli") || text.toLowerCase().includes("pasang") || text.toLowerCase().includes("install"))) {
      // Mock agent response for purchasing a product
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          role: "assistant",
          type: "proposal",
          proposal: {
            proposalId: "mock_purchase_github",
            intent: "PURCHASE_INTEGRATION",
            parameters: {
              integrationName: "GitHub",
              priceUsdc: 10
            }
          }
        }]);
      }, 800);
      return;
    }

    if (socket) {
      socket.emit("chat:message", text);
    } else {
      setMessages(prev => [...prev, { id: nextMsgId + 1, type: "activity", content: "Koneksi ke Core terputus." }]);
    }
  };

  const shellWidth = "100%";
  const shellHeight = isMobileView ? "100dvh" : "100vh";

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const { isConnected, address } = useAccount();
  const { open } = useWeb3Modal();
  const [isBypassed, setIsBypassed] = useState(false);

  useEffect(() => {
    // Kapan pun address/isBypassed berubah, langsung bersihkan state UI secara lokal (Optimistic Clear)
    // agar pengguna tidak melihat sisa chat dari akun sebelumnya.
    setMessages([]);
    setObservations([]);
    setCurrentView("chat"); // Selalu kembalikan pengguna ke halaman chat default

    if (socket && isConnected && address) {
      socket.emit("auth:login", { address });
    }

    if (socket) {
      const handleSubscriptionRequired = () => {
        setIsAccountModalOpen(true);
      };
      socket.on("subscription:required", handleSubscriptionRequired);
      return () => {
        socket.off("subscription:required", handleSubscriptionRequired);
      };
    }
  }, [socket, isConnected, address, isBypassed, setMessages, setObservations]);

  if (!isMounted) return null;

  if (!isConnected && !isBypassed) {
    return (
      <div style={{ backgroundColor: mode === "light" ? "#f3f4f6" : "#000", minHeight: "100vh", position: "relative" }}>
        <LandingPage onLaunchApp={() => open()} />
        
        {/* Tombol Bypass khusus Localhost */}
        {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
          <button 
            onClick={() => {
              setIsBypassed(true);
              if (socket) {
                socket.emit("auth:login", {});
              }
            }}
            style={{ 
              position: "fixed", bottom: 20, right: 20, background: "#ef4444", color: "#fff", 
              border: "none", padding: "10px 20px", borderRadius: 12, cursor: "pointer", 
              fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 12px rgba(239, 68, 68, 0.4)",
              fontFamily: "Inter, sans-serif"
            }}
          >
            🚧 Bypass Auth (Dev)
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", backgroundColor: mode === "light" ? "#f3f4f6" : "#000", fontFamily: "Inter, sans-serif" }}>
          <style>{`
          body { margin: 0; padding: 0; overflow: hidden; }
          @keyframes chatui-blink { 50% { opacity: 0; } }
          @keyframes chatui-pulse { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(2.6); opacity: 0; } }
          .chatui-shell, .chatui-shell * { transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease; }
          .chatui-textarea::placeholder { color: ${theme.inkFaint}; }
          .chatui-textarea { scrollbar-width: thin; }
        `}</style>

          <div

            className="chatui-shell"
            style={{
              width: shellWidth,
              maxWidth: "100%",
              height: shellHeight,
              background: theme.bg,
              borderRadius: isMobileView ? 28 : 0,
              border: isMobileView ? `1px solid ${theme.border}` : "none",
              overflow: "hidden",
              display: "flex",
              position: "relative",
              boxShadow: isMobileView ? theme.shellShadow : "none",
            }}
          >
            <Sidebar
              theme={theme}
              open={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              onToggle={() => setSidebarOpen(!sidebarOpen)}
              isMobileView={isMobileView}
              onNavigate={setCurrentView}
              walletState={walletState}
              onAccountClick={() => setIsAccountModalOpen(true)}
            />

            <AccountModal
              theme={theme}
              isOpen={isAccountModalOpen}
              onClose={() => setIsAccountModalOpen(false)}
              walletState={walletState}
              socket={socket}
              isMobileView={isMobileView}
              onDisconnect={() => {
                setIsAccountModalOpen(false);
                if (isConnected) {
                  open();
                } else {
                  setIsBypassed(false);
                }
              }}
            />

            {currentView === "wallet" ? (
              <WalletPage
                theme={theme}
                walletState={walletState}
                socket={socket}
                isMobileView={isMobileView}
                onBack={() => { setCurrentView("chat"); setSidebarOpen(true); }}
              />
            ) : currentView === "connections" ? (
              <ConnectionsPage
                theme={theme}
                walletState={walletState}
                isMobileView={isMobileView}
                onBack={() => { setCurrentView("chat"); setSidebarOpen(true); }}
              />
            ) : currentView === "automations" ? (
              <AutomationsPage
                theme={theme}
                socket={socket}
                isMobileView={isMobileView}
                onBack={() => { setCurrentView("chat"); setSidebarOpen(true); }}
              />
            ) : (
              <ChatView
                theme={theme}
                messages={messages}
                setMessages={setMessages}
                isMobileView={isMobileView}
                onOpenSidebar={() => setSidebarOpen(true)}
                onSend={handleSend}
                socket={socket}
                observations={observations}
                lastViewedCount={lastViewedCount}
                setLastViewedCount={setLastViewedCount}
                currentActivity={currentActivity}
                onCancelChat={cancelChat}
              />
            )}
          </div>
        </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <InnerApp />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
