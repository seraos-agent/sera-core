import { useState, useEffect } from "react";
import { THEME, FONT_LINK_ID } from "./theme";
import { useWallet } from "./hooks/useWallet";
import { useSocket } from "./hooks/useSocket";
import { Sidebar } from "./components/sidebar/Sidebar";
import { WalletPage } from "./components/wallet/WalletPage";
import { ChatView } from "./components/chat/ChatView";
import { ConnectionsPage } from "./components/connections/ConnectionsPage";
import { AutomationsPage } from "./components/automations/AutomationsPage";

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

export default function App() {
  useFonts();
  
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [currentView, setCurrentView] = useState<"chat" | "wallet" | "connections" | "automations">("chat");

  const { walletState, setWalletState } = useWallet();
  const { socket, messages, setMessages } = useSocket(setWalletState, setMode);

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
    
    if (socket) {
      socket.emit("chat:message", text);
    } else {
      setMessages(prev => [...prev, { id: nextMsgId + 1, type: "activity", content: "Koneksi ke Core terputus." }]);
    }
  };

  const shellWidth = isMobileView ? 390 : "100%";
  const shellHeight = isMobileView ? 720 : "100vh";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", backgroundColor: "#000", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        body { margin: 0; padding: 0; }
        @keyframes chatui-blink { 50% { opacity: 0; } }
        @keyframes chatui-pulse { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(2.6); opacity: 0; } }
        .chatui-shell, .chatui-shell * { transition: background-color 260ms ease, border-color 260ms ease, color 260ms ease; }
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
          mode={mode} 
          setMode={setMode} 
          onNavigate={setCurrentView} 
        />

        {currentView === "wallet" ? (
          <WalletPage
            theme={theme}
            walletState={walletState}
            socket={socket}
            onBack={() => { setCurrentView("chat"); setSidebarOpen(true); }}
          />
        ) : currentView === "connections" ? (
          <ConnectionsPage 
            theme={theme}
            onBack={() => { setCurrentView("chat"); setSidebarOpen(true); }}
          />
        ) : currentView === "automations" ? (
          <AutomationsPage
            theme={theme}
            socket={socket}
            onBack={() => { setCurrentView("chat"); setSidebarOpen(true); }}
          />
        ) : (
          <ChatView
            theme={theme}
            messages={messages}
            isMobileView={isMobileView}
            sidebarOpen={sidebarOpen}
            onOpenSidebar={() => setSidebarOpen(true)}
            onSend={handleSend}
            socket={socket}
          />
        )}
      </div>
    </div>
  );
}
