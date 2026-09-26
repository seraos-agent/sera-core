import { useState, useEffect, useRef } from "react";
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

import { EmailLoginGateway } from "./components/auth/EmailLoginGateway";
import { LaunchCodeGateway } from './components/auth/LaunchCodeGateway';

import { BillingModal } from "./components/sidebar/BillingModal";
import { createConfig, http, WagmiProvider } from 'wagmi';
import { base, mainnet, polygon, arbitrum } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [base, mainnet, polygon, arbitrum],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
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

  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sera_session_token');
    }
    return null;
  });

  const [userEmail, setUserEmail] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sera_user_email');
    }
    return null;
  });

  const { walletState, setWalletState } = useWallet();
  const isUserAuthenticated = Boolean(sessionToken && userEmail);

  const activeDeviceScope = userEmail ? `email:${userEmail}` : 'anonymous';
  const { socket, messages, setMessages, sendMessage, currentActivity, cancelChat, googleDrive, connectGoogleDrive, disconnectGoogleDrive, threads, connectThreads, disconnectThreads, telegram, telegramLinkCode, generateTelegramLink, whatsapp, whatsappLinkData, generateWhatsAppLink, disconnectWhatsApp, governanceRecommendations, respondToGovernanceRecommendation } = useSocket(
    setWalletState,
    setMode,
    activeDeviceScope,
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

  const handleSendMessage = (text: string, images?: string[], documents?: any[]) => {
    sendMessage(text, images, documents);
  };

  const shellWidth = "100%";
  const shellHeight = isMobileView ? "var(--tg-viewport-height, 100dvh)" : "100vh";

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const lastAccountKeyRef = useRef<string | null>(null);

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
    const currentAccountKey = isBypassed ? 'dev-bypassed' : (userEmail ? `email:${userEmail}` : 'disconnected');
    // Only clear messages and reset wallet when switching to a DIFFERENT account
    if (lastAccountKeyRef.current !== null && lastAccountKeyRef.current !== currentAccountKey) {
      setMessages([]);
      setWalletState(INITIAL_WALLET);
      setCurrentView("chat");
    }
    lastAccountKeyRef.current = currentAccountKey;

    if (socket) {
      const requestChallenge = async () => {
        // Passwordless Email Session Token (Primary & Only Auth Protocol)
        const savedSessionToken = sessionToken || (typeof window !== 'undefined' ? localStorage.getItem('sera_session_token') : null);
        const savedEmail = userEmail || (typeof window !== 'undefined' ? localStorage.getItem('sera_user_email') : null);
        if (savedSessionToken && savedEmail) {
          socket.emit("auth:login", {
            token: savedSessionToken,
            email: savedEmail,
            userId: `email:${savedEmail}`
          });
        }
      };

      const handleAuthSuccess = (data: { token?: string; email?: string; userId?: string }) => {
        if (data?.token) {
          const finalEmail = data?.email || userEmail || '';
          localStorage.setItem('sera_session_token', data.token);
          if (finalEmail) {
            localStorage.setItem('sera_user_email', finalEmail);
            setUserEmail(finalEmail);
          }
          setSessionToken(data.token);
        }
        const billingScope = userEmail ? `email:${userEmail}` : (data?.email ? `email:${data.email}` : undefined);
        if (billingScope) {
          socket.emit("billing:fetch", { address: billingScope });
        }
      };

      const handleAuthError = (err: any) => {
        if (sessionToken) {
          console.warn('[App] Session token invalid or expired:', err?.message);
          localStorage.removeItem('sera_session_token');
          localStorage.removeItem('sera_user_email');
          setSessionToken(null);
          setUserEmail(null);
        }
        setWalletState(prev => ({
          ...prev,
          syncing: false,
          error: err?.message || "Authentication failed."
        }));
      };

      const handleSubscriptionRequired = () => {
        const billingScope = userEmail ? `email:${userEmail}` : undefined;
        if (billingScope) socket.emit("billing:fetch", { address: billingScope });
      };

      socket.on("auth:challenge", requestChallenge);
      socket.on("auth:success", handleAuthSuccess);
      socket.on("auth:error", handleAuthError);
      socket.on("subscription:required", handleSubscriptionRequired);

      socket.on('connector:catalog', setActiveConnectors);
      socket.on('connector:status_changed', setActiveConnectors);
      socket.emit('connector:list');

      if (sessionToken && userEmail) {
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
  }, [socket, isBypassed, sessionToken, userEmail, setMessages, setWalletState]);

  if (!isMounted) return null;

  // 1. If not authenticated, check launch code then show EmailLoginGateway
  if (!isUserAuthenticated && !isBypassed) {
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
        <EmailLoginGateway
          theme={THEME[mode]}
          onAuthenticated={({ token, userId, email: loggedInEmail }) => {
            localStorage.setItem('sera_session_token', token);
            localStorage.setItem('sera_user_email', loggedInEmail);
            setSessionToken(token);
            setUserEmail(loggedInEmail);
            if (socket) {
              socket.emit("auth:login", { token, userId, email: loggedInEmail });
            }
          }}
        />

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
          userEmail={userEmail}
          onOpenBilling={() => setBillingOpen(true)}
          activeConnectors={activeConnectors}
        />

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
          userEmail={userEmail || undefined}
          isMobileView={isMobileView}
          mode={mode}
          onModeChange={setMode}
          onBack={() => { setCurrentView("chat"); setSidebarOpen(true); }}
          onManageWallet={() => {}}
          onDisconnect={() => {
            localStorage.removeItem('sera_session_token');
            localStorage.removeItem('sera_user_email');
            setSessionToken(null);
            setUserEmail(null);
            socket?.emit('auth:logout');
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
            whatsapp={whatsapp}
            whatsappLinkData={whatsappLinkData}
            onGenerateWhatsAppLink={generateWhatsAppLink}
            onDisconnectWhatsApp={disconnectWhatsApp}
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
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <InnerApp />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
