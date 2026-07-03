import { Activity, ShieldCheck, Copy, Check } from "lucide-react";
import type { ThemeType } from "../../theme";

export function MessageBubble({ theme, msg, onCopy, copied, onApprove }: {
  theme: ThemeType;
  msg: any;
  onCopy: (id: number, content: string) => void;
  copied: number | null;
  onApprove: (id: number, approved: boolean) => void;
}) {
  const isUser = msg.role === "user";
  
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
