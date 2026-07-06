import { Activity, Copy, Check, ExternalLink } from "lucide-react";
import type { ThemeType } from "../../theme";
import { ProposalCard } from "./ProposalCard";

export function MessageBubble({ theme, msg, onCopy, copied, onApprove }: {
  theme: ThemeType;
  msg: any;
  onCopy: (id: number, content: string) => void;
  copied: number | null;
  onApprove: (proposalId: string, action: 'APPROVE' | 'REJECT') => void;
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
            wordBreak: "break-word",
          }}
        >
          {msg.content}
          {msg.streaming && <span style={{ display: "inline-block", width: 6, height: 14, background: theme.accent, marginLeft: 3, verticalAlign: "-2px", animation: "chatui-blink 1s step-end infinite" }} />}
        </div>
        
        {msg.actionLinks && msg.actionLinks.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {msg.actionLinks.map((link: any, idx: number) => (
              <a
                key={idx}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: theme.surface2, border: `1px solid ${theme.border}`,
                  padding: "6px 12px", borderRadius: 8, textDecoration: "none",
                  color: theme.ink, fontFamily: "Inter, sans-serif", fontSize: 13,
                  fontWeight: 500, transition: "background 0.2s"
                }}
              >
                {link.label}
                <ExternalLink size={13} color={theme.inkSoft} />
              </a>
            ))}
          </div>
        )}
        
        {msg.proposal && (
          <ProposalCard 
            theme={theme} 
            proposal={msg.proposal} 
            onRespond={onApprove} 
          />
        )}

        {!isUser && !msg.streaming && !msg.proposal && (
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
