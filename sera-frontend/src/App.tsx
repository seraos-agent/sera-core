import { useState, useRef, useEffect, useCallback } from "react";
import { Menu, X, Plus, Moon, Sun, Copy, Check, Settings, Mic, ArrowUp, Wallet, Globe, Activity, ShieldCheck, MoreVertical } from "lucide-react";
import { io, Socket } from "socket.io-client";

const FONT_LINK_ID = "chatui-fonts";

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

const THEME = {
  light: {
    bg: "#F3F4F6",
    surface: "#FFFFFF",
    surface2: "#F8F9FA",
    border: "#E5E7EB",
    ink: "#191C1F",
    inkSoft: "#686F78",
    inkFaint: "#A4AAB2",
    accent: "#3452E0",
    accentHover: "#2A41B8",
    accentSoft: "#E7EAFB",
    accentInk: "#FFFFFF",
    status: "#0E9C87",
    statusSoft: "#DFF3EF",
    bubbleUser: "#EAECEE", // Perfect middle-ground light gray (not too heavy, not too white)
    bubbleUserInk: "#191C1F",
    shellShadow: "0 1px 2px rgba(16,24,32,0.04), 0 16px 40px rgba(16,24,32,0.10)",
  },
  dark: {
    bg: "#121417",
    surface: "#1A1D21",
    surface2: "#1F2226",
    border: "#2B2F34",
    ink: "#ECEDEF",
    inkSoft: "#8D939C",
    inkFaint: "#565C64",
    accent: "#6E85FF",
    accentHover: "#8B9EFF",
    accentSoft: "#1D2340",
    accentInk: "#08120F",
    status: "#2DD4BF",
    statusSoft: "#132C29",
    bubbleUser: "#2A302F",
    bubbleUserInk: "#ECEFF1",
    shellShadow: "0 1px 2px rgba(0,0,0,0.3), 0 20px 48px rgba(0,0,0,0.45)",
  },
};

// Fallback initial state before backend connects
const INITIAL_WALLET = {
  address: "Connecting...",
  fullAddress: "Connecting...",
  balance: "...",
  chain: "Base Mainnet",
  vaultAddress: "",
};

const CONNECTORS = [
  { id: "wallet", name: "Agentic Wallet", icon: Wallet },
  { id: "x", name: "X", icon: Globe },
];

const SUGGESTIONS = [
  "Cek allowance saya di blockchain",
  "Jadwalkan pembayaran bulanan",
  "Analisa portofolio aset",
  "Hubungkan ke Slack",
];

// Identicon functions removed per user request

const DEMO_REPLY = "Transaksi telah dieksekusi. Saya telah melaporkan state mutation kembali ke WorldState untuk memastikan sistem kita tersinkronisasi. Ada tugas operasional lain yang bisa saya bantu hari ini?";

let nextMsgId = 1000;

function SignalMark({ active, size = 14, color }: { active: boolean, size?: number, color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, height: size }} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: active ? 10 : 4,
            height: 4,
            borderRadius: 2,
            background: color,
            opacity: active ? 1 : 0.55,
            transition: "width 420ms cubic-bezier(.4,0,.2,1), opacity 420ms",
            transitionDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </span>
  );
}

function MessageBubble({ theme, msg, onCopy, copied, onApprove }: any) {
  const isUser = msg.role === "user";
  
  // Custom renderer for SERA Activity Node
  if (msg.type === "activity") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-start", margin: "16px 0" }}>
        <div style={{ 
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 12, color: theme.inkFaint, fontFamily: "Inter, sans-serif",
          fontWeight: 500
        }}>
          <Activity size={13} color={theme.inkFaint} />
          {msg.content}
        </div>
      </div>
    );
  }

  // Custom renderer for SERA Approval
  if (msg.type === "approval") {
    return (
      <div style={{ display: "flex", marginBottom: 22, justifyContent: "flex-start" }}>
        <div style={{ 
          maxWidth: "78%", background: theme.surface, border: `1px solid ${theme.border}`,
          borderRadius: 12, overflow: "hidden", fontFamily: "Inter, sans-serif"
        }}>
          <div style={{ background: theme.accentSoft, padding: "12px 16px", borderBottom: `1px solid ${theme.border}`, display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={16} color={theme.accent} />
            <span style={{ fontSize: 13, fontWeight: 600, color: theme.accentHover }}>Otorisasi Diperlukan</span>
          </div>
          <div style={{ padding: "16px", fontSize: 14, color: theme.ink, lineHeight: 1.5 }}>
            {msg.content}
            {msg.status === 'pending' && (
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button 
                  onClick={() => onApprove(msg.id, false)}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.surface2, color: theme.ink, cursor: "pointer", fontWeight: 500 }}
                >Tolak</button>
                <button 
                  onClick={() => onApprove(msg.id, true)}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "none", background: theme.accent, color: theme.accentInk, cursor: "pointer", fontWeight: 500 }}
                >Setujui Eksekusi</button>
              </div>
            )}
            {msg.status === 'approved' && (
              <div style={{ marginTop: 12, padding: "8px", background: theme.statusSoft, color: theme.status, borderRadius: 6, fontSize: 12, textAlign: "center", fontWeight: 500 }}>
                Disetujui. Melanjutkan operasi...
              </div>
            )}
            {msg.status === 'rejected' && (
              <div style={{ marginTop: 12, padding: "8px", background: theme.surface2, color: theme.inkSoft, borderRadius: 6, fontSize: 12, textAlign: "center", fontWeight: 500 }}>
                Ditolak. Operasi dibatalkan.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        marginBottom: 22,
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
        <div
          style={{
            background: isUser ? theme.bubbleUser : "transparent",
            color: isUser ? theme.bubbleUserInk : theme.ink,
            padding: isUser ? "10px 16px" : "2px 0",
            borderRadius: isUser ? 18 : 0,
            borderBottomRightRadius: isUser ? 4 : 0,
            boxShadow: isUser && theme.bubbleUser === "#FFFFFF" ? "0 1px 2px rgba(0,0,0,0.05), 0 1px 1px rgba(0,0,0,0.02)" : "none",
            fontFamily: "Inter, sans-serif",
            fontSize: 14.5,
            lineHeight: 1.65,
            whiteSpace: "pre-wrap",
          }}
        >
          {msg.content}
          {msg.streaming && <span style={{ display: "inline-block", width: 6, height: 14, background: theme.accent, marginLeft: 3, verticalAlign: "-2px", animation: "chatui-blink 1s step-end infinite" }} />}
        </div>
        {!isUser && !msg.streaming && (
          <button
            onClick={() => onCopy(msg.id, msg.content)}
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: theme.inkFaint,
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              padding: "3px 4px",
            }}
          >
            {copied === msg.id ? <Check size={13} /> : <Copy size={13} />}
            {copied === msg.id ? "Disalin" : "Salin"}
          </button>
        )}
      </div>
    </div>
  );
}

function WalletPanel({ theme, walletState, onCopyWallet, walletCopied, onClose }: any) {
  const [swapAmount, setSwapAmount] = useState("");
  const [swapDir, setSwapDir] = useState<"toVault" | "toAgent">("toVault");
  const [swapStatus, setSwapStatus] = useState<"idle" | "pending" | "done">("idle");
  const [notification, setNotification] = useState("");

  const agentAddr = walletState.fullAddress || "";
  const vaultAddr = walletState.vaultAddress || "";
  const shortAgent = agentAddr ? agentAddr.slice(0, 6) + "..." + agentAddr.slice(-4) : "—";
  const shortVault = vaultAddr ? vaultAddr.slice(0, 6) + "..." + vaultAddr.slice(-4) : "—";

  const handleSwap = () => {
    if (!swapAmount || isNaN(parseFloat(swapAmount))) return;
    setSwapStatus("pending");
    setTimeout(() => {
      setSwapStatus("done");
      setNotification("Transfer completed");
      setTimeout(() => { setSwapStatus("idle"); setNotification(""); }, 3000);
    }, 1400);
  };

  const handleFlip = () => setSwapDir(d => d === "toVault" ? "toAgent" : "toVault");

  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      background: theme.surface2, zIndex: 30,
      display: "flex", flexDirection: "column",
      animation: "walletPanelIn 200ms cubic-bezier(.4,0,.2,1) forwards",
    }}>
      <style>{`
        @keyframes walletPanelIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes notifIn { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px" }}>
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, color: theme.ink }}>Wallets</span>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex" }}>
          <X size={18} />
        </button>
      </div>

      {/* Balance */}
      <div style={{ padding: "0 20px", marginBottom: 28 }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 600, color: theme.inkFaint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Total Balance</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 28, fontWeight: 500, color: theme.ink, letterSpacing: -0.5 }}>{walletState.balance}</div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: theme.inkFaint, marginTop: 4 }}>Base Mainnet</div>
      </div>

      {/* Wallet List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 20px", marginBottom: 32 }}>
        {[
          { label: "Main Wallet", addr: shortAgent, fullAddr: agentAddr, tag: "EOA" },
          { label: "Agent Vault", addr: shortVault, fullAddr: vaultAddr, tag: "Vault" },
        ].map(({ label, addr, fullAddr, tag }) => (
          <div key={tag} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: theme.bg, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Wallet size={16} color={theme.inkSoft} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, color: theme.ink }}>{label}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.inkFaint, marginTop: 2 }}>{addr || "—"}</div>
            </div>
            <button onClick={() => onCopyWallet(fullAddr)} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkFaint, padding: 6, display: "flex" }}>
              {walletCopied ? <Check size={14} color={theme.status} /> : <Copy size={14} />}
            </button>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: theme.border, margin: "0 20px 24px" }} />

      {/* Transfer */}
      <div style={{ padding: "0 20px" }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 600, color: theme.inkFaint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>Transfer</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, background: theme.bg, borderRadius: 10, padding: "8px 12px", border: `1px solid ${theme.border}` }}>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500, color: swapDir === "toVault" ? theme.inkSoft : theme.accent }}>
            {swapDir === "toVault" ? "Main" : "Vault"}
          </span>
          <button onClick={handleFlip} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex", transition: "transform 300ms", transform: swapDir === "toAgent" ? "rotate(180deg)" : "rotate(0deg)" }}>
            <Activity size={14} />
          </button>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500, color: swapDir === "toVault" ? theme.accent : theme.inkSoft }}>
            {swapDir === "toVault" ? "Vault" : "Main"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 12px", borderRadius: 10, background: theme.surface, border: `1px solid ${theme.border}`, height: 42 }}>
            <input
              type="number"
              placeholder="0.00"
              value={swapAmount}
              onChange={e => setSwapAmount(e.target.value)}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 500, color: theme.ink, width: 0 }}
            />
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500, color: theme.inkFaint }}>USDC</span>
          </div>
          <button
            onClick={handleSwap}
            disabled={!swapAmount || swapStatus === "pending"}
            style={{
              height: 42, padding: "0 16px", borderRadius: 10, border: "none",
              background: swapAmount ? theme.accent : theme.bg,
              color: swapAmount ? theme.accentInk : theme.inkFaint,
              fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500,
              cursor: swapAmount ? "pointer" : "default",
              transition: "background 200ms, color 200ms",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {swapStatus === "pending" ? (
              <span style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${theme.accentInk}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 600ms linear infinite" }} />
            ) : swapStatus === "done" ? (
              <Check size={16} />
            ) : "Send"}
          </button>
        </div>
      </div>

      {notification && (
        <div style={{
          position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: theme.ink, color: theme.surface, padding: "10px 20px", borderRadius: 24,
          fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500,
          whiteSpace: "nowrap", boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
          animation: "notifIn 250ms cubic-bezier(.4,0,.2,1) forwards", zIndex: 40,
        }}>
          {notification}
        </div>
      )}
    </div>
  );
}

function Sidebar({ theme, open, onClose, isMobileView, onCopyWallet, walletCopied, mode, setMode, walletState }: any) {
  const isOverlay = isMobileView;
  const [showWalletPanel, setShowWalletPanel] = useState(false);

  return (
    <>
      {isOverlay && open && (
        <div
          onClick={onClose}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 20 }}
        />
      )}
      <div
        style={{
          position: isOverlay ? "absolute" : "relative",
          zIndex: 21,
          top: 0, left: 0, bottom: 0,
          width: isOverlay ? 260 : open ? 252 : 0,
          background: theme.surface2,
          borderRight: `1px solid ${theme.border}`,
          overflow: "hidden",
          transition: "width 240ms cubic-bezier(.4,0,.2,1), transform 240ms cubic-bezier(.4,0,.2,1)",
          transform: isOverlay ? (open ? "translateX(0)" : "translateX(-100%)") : "none",
          display: "flex", flexDirection: "column", flexShrink: 0, height: "100%",
        }}
      >
        {/* Wallet panel overlay */}
        {showWalletPanel && (
          <WalletPanel
            theme={theme}
            walletState={walletState}
            onCopyWallet={onCopyWallet}
            walletCopied={walletCopied}
            onClose={() => setShowWalletPanel(false)}
          />
        )}

        <div style={{ width: isOverlay ? 260 : 252, padding: "16px 14px", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, color: theme.ink }}>SERA</span>
            </div>
            {isOverlay && (
              <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4 }}>
                <X size={18} />
              </button>
            )}
          </div>

          {/* Balance summary — always visible */}
          <div style={{ display: "flex", flexDirection: "column", padding: "2px 4px", marginBottom: 22 }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, color: theme.inkFaint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Saldo</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 600, color: theme.ink }}>{walletState.balance}</div>
            <div
              onClick={() => onCopyWallet(walletState.fullAddress)}
              style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", marginTop: 4, width: "fit-content" }}
              title="Salin alamat agen"
            >
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.inkFaint }}>{walletState.address}</span>
              {walletCopied ? <Check size={10} color={theme.status} /> : <Copy size={10} color={theme.inkFaint} />}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 4px", cursor: "pointer", marginBottom: 6,
              }}
            >
              <Plus size={15} color={theme.inkSoft} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkSoft, fontWeight: 500 }}>
                Tambah Koneksi
              </span>
            </div>

            {CONNECTORS.map((c) => {
              const Icon = c.icon;
              const isWallet = c.id === "wallet";
              return (
                <div
                  key={c.id}
                  onClick={() => isWallet && setShowWalletPanel(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 6px", borderRadius: 8,
                    cursor: isWallet ? "pointer" : "default",
                    transition: "background 150ms",
                  }}
                  onMouseEnter={e => { if (isWallet) (e.currentTarget as HTMLElement).style.background = theme.surface; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <Icon size={15} color={theme.inkSoft} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: theme.status, flexShrink: 0 }} title="Terhubung" />
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "12px 4px 2px" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.ink, fontWeight: 600 }}>Sera Admin</span>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 9, fontWeight: 700, background: theme.accentSoft, color: theme.accent, padding: "2px 5px", borderRadius: 4, letterSpacing: 0.5 }}>PRO</span>
            </div>
            <button
              onClick={() => setMode(mode === "light" ? "dark" : "light")}
              title={mode === "light" ? "Mode gelap" : "Mode terang"}
              style={{ display: "flex", alignItems: "center", padding: "4px", borderRadius: 6, border: "none", background: "transparent", color: theme.inkSoft, cursor: "pointer" }}
            >
              {mode === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <Settings size={15} color={theme.inkFaint} style={{ cursor: "pointer" }} />
          </div>
        </div>
      </div>
    </>
  );
}


function EmptyState({ theme }: any) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: theme.accent, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <SignalMark active={false} size={12} color={theme.accentInk} />
      </div>
      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 24, color: theme.ink, marginBottom: 28 }}>
        Operational Partner SERA siap membantu.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 380 }}>
        {SUGGESTIONS.slice(0, 3).map((s) => (
          <div
            key={s}
            style={{
              padding: "7px 14px",
              borderRadius: 20,
              border: `1px solid ${theme.border}`,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              color: theme.inkSoft,
              cursor: "pointer",
            }}
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  useFonts();
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [walletState, setWalletState] = useState(INITIAL_WALLET);
  const [copied, setCopied] = useState<number | null>(null);
  const [walletCopied, setWalletCopied] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleCopy = useCallback((id: number) => {
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const handleCopyWallet = useCallback((fullAddress: string) => {
    navigator.clipboard.writeText(fullAddress);
    setWalletCopied(true);
    setTimeout(() => setWalletCopied(false), 1500);
  }, []);

  const streamReply = useCallback((fullText: string, id: number) => {
    let i = 0;
    const step = () => {
      i += Math.max(1, Math.round(fullText.length / 90));
      const chunk = fullText.slice(0, i);
      setMessages((prev) => {
        const exists = prev.find(m => m.id === id);
        if (!exists) {
          return [...prev, { id, role: "agent", content: chunk, streaming: i < fullText.length }];
        }
        return prev.map((m) => (m.id === id ? { ...m, content: chunk, streaming: i < fullText.length } : m));
      });
      if (i < fullText.length) {
        setTimeout(step, 16);
      }
    };
    step();
  }, []);

  useEffect(() => {
    const newSocket = io("ws://localhost:3001");
    setSocket(newSocket);

    newSocket.on("chat:reply", (data: any) => {
      streamReply(data.content, data.id || Date.now());
    });

    newSocket.on("chat:activity", (data: any) => {
      setMessages(prev => [...prev, { id: data.id || Date.now(), type: "activity", content: data.content }]);
    });

    newSocket.on("ui:command", (cmd: any) => {
      if (cmd.type === "SET_THEME") {
        setMode(cmd.payload);
      }
    });

    newSocket.on("wallet:update", (data: any) => {
      setWalletState(prev => ({
        ...prev,
        address: data.address.slice(0, 6) + "..." + data.address.slice(-4),
        fullAddress: data.address,
        balance: `${Number(data.balance).toFixed(2)} ${data.asset || 'USDC'}`,
        chain: data.network,
        // If backend sends a separate vault address, store it; otherwise keep previous
        vaultAddress: data.vaultAddress || prev.vaultAddress,
      }));
    });

    return () => { newSocket.close(); };
  }, [streamReply]);

  const handleApprove = (id: number, approved: boolean) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: approved ? 'approved' : 'rejected' } : m));
    
    if (approved) {
      setTimeout(() => {
        setMessages(prev => [...prev, { id: nextMsgId++, type: "activity", content: "Menandatangani transaksi dan menyiarkan ke Base Sepolia..." }]);
        
        const agentId = nextMsgId++;
        setTimeout(() => {
          setMessages(prev => [...prev, { id: agentId, role: "agent", content: "", streaming: true }]);
          streamReply(DEMO_REPLY, agentId);
        }, 1000);
      }, 500);
    }
  };

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    const userMsg = { id: nextMsgId++, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    
    if (socket) {
      socket.emit("chat:message", text);
    } else {
      setMessages(prev => [...prev, { id: nextMsgId++, type: "activity", content: "Koneksi ke Core terputus." }]);
    }
  }, [input, socket]);

  const handleKeyDown = (e: any) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const autoGrow = (e: any) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const shellWidth = isMobileView ? 390 : "100%";
  const shellHeight = isMobileView ? 720 : "100vh"; // Changed to full viewport for desktop

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
        <Sidebar theme={theme} open={sidebarOpen} onClose={() => setSidebarOpen(false)} isMobileView={isMobileView} onCopyWallet={handleCopyWallet} walletCopied={walletCopied} mode={mode} setMode={setMode} walletState={walletState} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: isMobileView ? "12px 14px" : "12px 20px",
              borderBottom: `1px solid ${theme.border}`,
              flexShrink: 0,
            }}
          >
            {(isMobileView || !sidebarOpen) && (
              <button onClick={() => setSidebarOpen(true)} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex" }}>
                <Menu size={18} />
              </button>
            )}
            <div style={{ marginLeft: "auto" }}>
              <button style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex" }}>
                <MoreVertical size={18} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: isMobileView ? "18px 14px" : "24px 26px" }}>
            {messages.length === 0 ? (
              <EmptyState theme={theme} />
            ) : (
              <div style={{ maxWidth: 640, margin: "0 auto" }}>
                {messages.map((m) => (
                  <MessageBubble key={m.id} theme={theme} msg={m} onCopy={handleCopy} copied={copied} onApprove={handleApprove} />
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: isMobileView ? "10px 14px 16px" : "10px 26px 20px", flexShrink: 0 }}>
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 22,
                  padding: "12px 12px 8px",
                }}
              >
                <textarea
                  ref={textareaRef}
                  className="chatui-textarea"
                  value={input}
                  onChange={autoGrow}
                  onKeyDown={handleKeyDown}
                  placeholder="Tulis pesan ke SERA..."
                  rows={1}
                  style={{
                    width: "100%",
                    resize: "none",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: theme.ink,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 14.5,
                    lineHeight: 1.5,
                    padding: "2px 4px 10px",
                    maxHeight: 160,
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    title="Lampirkan file"
                    style={{
                      width: 30, height: 30, borderRadius: "50%", border: `1px solid ${theme.border}`,
                      background: "transparent", color: theme.inkSoft, display: "flex", alignItems: "center",
                      justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "background 150ms, border-color 150ms",
                    }}
                  >
                    <Plus size={15} />
                  </button>

                  <div style={{ flex: 1 }} />

                  <button
                    title="Masukan suara"
                    style={{
                      width: 30, height: 30, borderRadius: "50%", border: `1px solid ${theme.border}`,
                      background: "transparent", color: theme.inkSoft, display: "flex", alignItems: "center",
                      justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "background 150ms, border-color 150ms",
                    }}
                  >
                    <Mic size={14} />
                  </button>

                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      border: "none",
                      background: input.trim() ? theme.accent : theme.surface2,
                      color: input.trim() ? theme.accentInk : theme.inkFaint,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: input.trim() ? "pointer" : "default",
                      flexShrink: 0,
                      transform: input.trim() ? "scale(1)" : "scale(0.94)",
                      transition: "background 180ms ease, transform 180ms cubic-bezier(.4,0,.2,1), color 180ms ease",
                    }}
                  >
                    <ArrowUp size={16} />
                  </button>
                </div>
              </div>
              <div style={{ textAlign: "center", fontSize: 11, color: theme.inkFaint, marginTop: 8 }}>
                SERA is an Operational Partner. AI can make mistakes. Check important information.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
