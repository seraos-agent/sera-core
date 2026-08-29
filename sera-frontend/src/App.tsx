import { useState, useEffect } from "react";
import { THEME, FONT_LINK_ID } from "./theme";
import { useWallet, INITIAL_WALLET } from "./hooks/useWallet";
import { useSocket } from "./hooks/useSocket";
import { Sidebar } from "./components/sidebar/Sidebar";
import { WalletPage } from "./components/wallet/WalletPage";
import { ChatView } from "./components/chat/ChatView";
import { ConnectionsPage } from "./components/connections/ConnectionsPage";
import { ThreadsSettingsPage } from "./components/connections/ThreadsSettingsPage";
import { AutomationsPage } from "./components/automations/AutomationsPage";
import { ProfilePage } from "./components/profile/ProfilePage";
import type { SidebarView } from "./components/sidebar/Sidebar";

import { ConnectGateway } from "./components/auth/ConnectGateway";
import { LaunchCodeGateway } from './components/auth/LaunchCodeGateway';

import { BillingModal } from "./components/sidebar/BillingModal";
import { createAppKit, useAppKit, useAppKitTheme } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { base, mainnet, polygon, arbitrum } from '@reown/appkit/networks';
import { WagmiProvider, useAccount, useDisconnect, useSignMessage } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient();
const projectId = '58d806d66c104f547275d0afe4086b04';

const metadata = {
  name: 'SERA OS',
  description: 'SERA OS Web3 Interface',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://sera-os.app',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

const networks = [base, mainnet, polygon, arbitrum] as [
  typeof base,
  typeof mainnet,
  typeof polygon,
  typeof arbitrum,
];
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  // Wallet connection is infrastructure only. Conversion and funding remain
  // governed SERA capabilities, never provider-modal actions.
  features: {
    analytics: false,
    swaps: false,
    onramp: false,
    email: true,
    socials: ['google'],
    emailShowWallets: true,
    connectMethodsOrder: ['email', 'social', 'wallet']
  },
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

  const { setThemeMode } = useAppKitTheme();

  useEffect(() => {
    // If inside Telegram WebApp, try to adapt to its theme
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const twa = (window as any).Telegram.WebApp;
      if (twa.colorScheme) {
        setMode(twa.colorScheme === 'dark' ? 'dark' : 'light');
      }
    }
  }, []);

  useEffect(() => {
    setThemeMode(mode);
  }, [mode, setThemeMode]);

  useEffect(() => {
    localStorage.setItem("sera_theme", mode);
  }, [mode]);

  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [billingOpen, setBillingOpen] = useState(false);
  const [currentView, setCurrentView] = useState<SidebarView>(() => {
    const saved = localStorage.getItem("sera_view") as SidebarView | null;
    return saved && ["chat", "wallet", "connections", "automations", "profile", "threads_settings"].includes(saved) ? saved : "chat";
  });

  useEffect(() => {
    localStorage.setItem("sera_view", currentView);
  }, [currentView]);

  const { walletState, setWalletState } = useWallet();
  const { isConnected, address, isReconnecting, isConnecting } = useAccount();
  const { socket, messages, setMessages, sendMessage, currentActivity, cancelChat, googleDrive, connectGoogleDrive, disconnectGoogleDrive, threads, connectThreads, disconnectThreads, telegram, telegramLinkCode, generateTelegramLink, governanceRecommendations, respondToGovernanceRecommendation } = useSocket(
    setWalletState,
    setMode,
    address?.toLowerCase() ?? 'anonymous',
  );

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

  const handleSendMessage = (text: string, images?: string[]) => {
    sendMessage(text, images);
  };

  const shellWidth = "100%";
  const shellHeight = isMobileView ? "var(--tg-viewport-height, 100dvh)" : "100vh";

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { open } = useAppKit();
  const [isBypassed, setIsBypassed] = useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).has('bypass');
    }
    return false;
  });
  const [isLaunchCodeVerified, setIsLaunchCodeVerified] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sera_launch_verified') === 'true';
    }
    return false;
  });
  const [activeConnectors, setActiveConnectors] = useState<any[]>([]);

  // Expand Telegram Mini App if present
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData) {
      (window as any).Telegram.WebApp.ready();
      (window as any).Telegram.WebApp.expand();
    }
  }, []);

  // Automatically emit dev login if bypass was passed via URL
  useEffect(() => {
    if (isBypassed && socket) {
      // Dev bypass
      socket.emit("auth:login", {});

      // Cleanup URL so it looks clean
      if (typeof window !== 'undefined' && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('bypass');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [isBypassed, socket]);

  useEffect(() => {
    // Kapan pun address/isBypassed berubah, langsung bersihkan state UI secara lokal (Optimistic Clear)
    // agar pengguna tidak melihat sisa chat dari akun sebelumnya.
    setMessages([]);
    setWalletState({
      ...INITIAL_WALLET,
      address: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : INITIAL_WALLET.address,
      fullAddress: address || INITIAL_WALLET.fullAddress,
      syncing: true,
    });
    setCurrentView("chat"); // Selalu kembalikan pengguna ke halaman chat default

    if (socket) {
      const requestChallenge = async (data: { message: string }) => {
        if (!isConnected || !address) return;
        setWalletState(prev => ({ ...prev, error: "" })); // Clear previous error

        const tokenKey = `sera_auth_token_${address.toLowerCase()}`;
        const savedToken = localStorage.getItem(tokenKey);

        if (savedToken) {
          socket.emit("auth:login", { address, token: savedToken });
          return;
        }

        try {
          const signature = await signMessageAsync({ account: address, message: data.message });
          socket.emit("auth:login", { address, message: data.message, signature });
        } catch {
          // The server keeps this socket unauthenticated until the user signs.
          setWalletState(prev => ({
            ...prev,
            syncing: false,
            error: "Authentication signature rejected. Please sign the message to authenticate your session."
          }));
        }
      };

      const handleAuthSuccess = (data: { token: string }) => {
        if (address) {
          localStorage.setItem(`sera_auth_token_${address.toLowerCase()}`, data.token);
          socket.emit("billing:fetch", { address: address.toLowerCase() });
        }
      };

      const handleAuthError = (err: any) => {
        if ((err.code === 'INVALID_TOKEN' || err.code === 'UNAUTHENTICATED') && address) {
          if (err.code === 'INVALID_TOKEN') {
            localStorage.removeItem(`sera_auth_token_${address.toLowerCase()}`);
          }
          socket.emit('auth:challenge'); // Retry with fresh challenge
        } else {
          setWalletState(prev => ({
            ...prev,
            syncing: false,
            error: err.message || "Authentication failed."
          }));
        }
      };

      const handleSubscriptionRequired = () => {
        if (address) socket.emit("billing:fetch", { address: address.toLowerCase() });
      };

      socket.on("auth:challenge", requestChallenge);
      socket.on("auth:success", handleAuthSuccess);
      socket.on("auth:error", handleAuthError);
      socket.on("subscription:required", handleSubscriptionRequired);

      socket.on('connector:catalog', setActiveConnectors);
      socket.on('connector:status_changed', setActiveConnectors);
      socket.emit('connector:list');

      if (isConnected && address) {
        socket.emit("auth:challenge");
      }

      return () => {
        socket.off("auth:challenge", requestChallenge);
        socket.off("auth:success", handleAuthSuccess);
        socket.off("auth:error", handleAuthError);
        socket.off("subscription:required", handleSubscriptionRequired);
        socket.off('connector:catalog', setActiveConnectors);
        socket.off('connector:status_changed', setActiveConnectors);
      };
    }
  }, [socket, isConnected, address, isBypassed, setMessages, signMessageAsync, setWalletState]);

  if (!isMounted) return null;

  // Show a loading screen while the wallet is reconnecting on initial load to prevent UI flash
  if (isReconnecting || isConnecting) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        minHeight: "100vh", backgroundColor: mode === "light" ? "#f3f4f6" : "#000",
        fontFamily: "Inter, sans-serif"
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            border: `3px solid ${theme.border}`,
            borderTopColor: theme.ink,
            animation: "spin 1s linear infinite"
          }} />
          <div style={{ color: theme.inkSoft, fontSize: 14, fontWeight: 500, letterSpacing: "0.02em" }}>
            Restoring session...
          </div>
        </div>
        <style>{`
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // 1. If not connected, check launch code then show ConnectGateway
  if (!isConnected && !isBypassed) {
    if (!isLaunchCodeVerified) {
      return (
        <div style={{ backgroundColor: mode === "light" ? "#f3f4f6" : "#000", minHeight: "100vh", position: "relative" }}>
          <LaunchCodeGateway theme={THEME[mode]} onVerify={() => {
            localStorage.setItem('sera_launch_verified', 'true');
            setIsLaunchCodeVerified(true);
          }} />

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
      <div style={{ backgroundColor: mode === "light" ? "#f3f4f6" : "#000", minHeight: "100vh", position: "relative" }}>
        <ConnectGateway theme={THEME[mode]} onConnect={() => {
          setThemeMode(mode);
          window.requestAnimationFrame(() => open());
        }} />

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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: isMobileView ? "100dvh" : "100vh", width: "100vw", backgroundColor: mode === "light" ? "#f3f4f6" : "#000", fontFamily: "Inter, sans-serif", overflow: "hidden" }}>
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
          borderRadius: 0,
          border: "none",
          overflow: "hidden",
          display: "flex",
          position: "relative",
          boxShadow: isMobileView ? "none" : "none",
        }}
      >
        <Sidebar
          theme={theme}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          isMobileView={isMobileView}
          currentView={currentView}
          onNavigate={setCurrentView}
          walletState={walletState}
          onOpenBilling={() => setBillingOpen(true)}
          activeConnectors={activeConnectors}
        />

        {walletState.error && (walletState.error.includes("Authentication") || walletState.error.includes("expired")) && (
          <div style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(6px)"
          }}>
            <div style={{
              background: theme.bg,
              padding: 32,
              borderRadius: 24,
              border: `1px solid ${theme.border}`,
              maxWidth: 360,
              width: "90%",
              textAlign: "center",
              boxShadow: "0 12px 48px rgba(0,0,0,0.5)"
            }}>
              <h2 style={{ margin: "0 0 16px 0", color: theme.ink, fontSize: 20 }}>Signature Required</h2>
              <p style={{ color: theme.inkFaint, fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
                Your wallet must sign a message to securely authenticate your session and load your data.
              </p>
              <button
                onClick={() => {
                  setWalletState(prev => ({ ...prev, error: "", syncing: true }));
                  socket?.emit("auth:challenge");
                }}
                style={{
                  background: theme.accent,
                  color: "#fff",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  width: "100%",
                  fontSize: 15
                }}
              >
                Sign Message Now
              </button>
            </div>
          </div>
        )}

        {billingOpen && (
          <BillingModal
            theme={theme}
            walletState={walletState}
            onClose={() => setBillingOpen(false)}
          />
        )}

        {currentView === "profile" ? <ProfilePage
          theme={theme}
          walletState={walletState}
          isMobileView={isMobileView}
          mode={mode}
          onModeChange={setMode}
          onBack={() => { setCurrentView("chat"); setSidebarOpen(true); }}
          onManageWallet={() => open()}
          onDisconnect={() => {
            if (address) localStorage.removeItem(`sera_auth_token_${address.toLowerCase()}`);
            socket?.emit('auth:logout');
            disconnect();
            setIsBypassed(false);
          }}
        /> : currentView === "wallet" ? (
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
            socket={socket}
            isMobileView={isMobileView}
            threads={threads}
            onConnectThreads={connectThreads}
            onDisconnectThreads={disconnectThreads}
            telegram={telegram}
            telegramLinkCode={telegramLinkCode}
            onGenerateTelegramLink={generateTelegramLink}
            googleDrive={googleDrive}
            onConnectGoogleDrive={connectGoogleDrive}
            onDisconnectGoogleDrive={disconnectGoogleDrive}
            onBack={() => { setCurrentView("chat"); setSidebarOpen(true); }}
          />
        ) : currentView === "automations" ? (
          <AutomationsPage
            theme={theme}
            socket={socket}
            isMobileView={isMobileView}
            onBack={() => { setCurrentView("chat"); setSidebarOpen(true); }}
          />

        ) : currentView === "threads_settings" ? (
          <ThreadsSettingsPage
            theme={theme}
            socket={socket}
            isMobileView={isMobileView}
            onDisconnect={disconnectThreads}
            onBack={() => { setCurrentView("chat"); setSidebarOpen(true); }}
          />
        ) : (
          <ChatView
            theme={theme}
            messages={messages}
            setMessages={setMessages}
            isMobileView={isMobileView}
            onOpenSidebar={() => setSidebarOpen(true)}
            onSend={handleSendMessage}
            socket={socket}
            currentActivity={currentActivity}
            onCancelChat={cancelChat}
            walletState={walletState}
            governanceRecommendations={governanceRecommendations}
            onRespondGovernance={respondToGovernanceRecommendation}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <InnerApp />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
