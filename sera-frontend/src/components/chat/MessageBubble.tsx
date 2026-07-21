import { Activity, Copy, Check, ExternalLink } from "lucide-react";
import type { ThemeType } from "../../theme";
import { ProposalCard } from "./ProposalCard";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, useEffect } from 'react';

function ClearChatCountdownCard({ theme, onClear }: { theme: ThemeType, onClear: () => void }) {
  const [timeLeft, setTimeLeft] = useState(5);
  const [canceled, setCanceled] = useState(false);

  useEffect(() => {
    if (canceled) return;
    if (timeLeft <= 0) {
      onClear();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, canceled, onClear]);

  if (canceled) {
    return <div style={{ color: theme.inkFaint, fontSize: 13, fontStyle: 'italic', padding: '8px 0' }}>Chat history clearing canceled.</div>;
  }

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      background: theme.surface2, 
      border: `1px solid ${theme.border}`, 
      borderRadius: 12, 
      padding: '10px 14px', 
      marginTop: 4, 
      width: '100%', 
      maxWidth: 300 
    }}>
      <div style={{ fontSize: 14, color: theme.ink, fontWeight: 500 }}>
        Clearing chat in <span style={{ color: '#EF4444', fontWeight: 700, marginLeft: 2 }}>{timeLeft}</span>
      </div>
      <button 
        onClick={() => setCanceled(true)}
        style={{
          background: theme.surface, border: `1px solid ${theme.border}`, color: theme.ink,
          padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'background 0.2s'
        }}
      >
        Cancel
      </button>
    </div>
  );
}

export function MessageBubble({ theme, msg, onCopy, copied, onApprove, onClearChat, walletState }: {
  theme: ThemeType;
  msg: any;
  onCopy: (id: number, content: string) => void;
  copied: number | null;
  onApprove: (proposalId: string, action: 'APPROVE' | 'REJECT', candidateId?: string) => void;
  onClearChat?: () => void;
  walletState: any;
}) {
  const isUser = msg.role === "user";
  
  // Format content: replace LLM's long dash (em-dash) with a comma for better natural reading.
  // We use \s*—\s* to catch cases with or without spaces and turn them into a clean comma.
  const displayContent = typeof msg.content === 'string' 
    ? msg.content.replace(/\s*—\s*/g, ', ') 
    : msg.content;

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

  if (msg.type === "clear_chat_countdown") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 22 }}>
        <ClearChatCountdownCard theme={theme} onClear={() => onClearChat && onClearChat()} />
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
      <div style={{ maxWidth: "100%", width: isUser ? "auto" : "100%", display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
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
          <div className="markdown-content" style={{ display: "flex", flexDirection: "column" }}>
            {isUser ? (
              <span>{displayContent}</span>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ node, ...props }) => <p style={{ margin: "0 0 12px 0", lineHeight: 1.6 }} {...props} />,
                  a: ({ node, ...props }) => <a style={{ color: theme.accent, textDecoration: "none", fontWeight: 500 }} target="_blank" rel="noopener noreferrer" {...props} />,
                  ul: ({ node, ...props }) => <ul style={{ paddingLeft: 22, margin: "0 0 12px 0" }} {...props} />,
                  ol: ({ node, ...props }) => <ol style={{ paddingLeft: 22, margin: "0 0 12px 0" }} {...props} />,
                  li: ({ node, ...props }) => <li style={{ marginBottom: 6 }} {...props} />,
                  strong: ({ node, ...props }) => <strong style={{ fontWeight: 600, color: theme.ink }} {...props} />,
                  h1: ({ node, ...props }) => <h1 style={{ fontSize: "1.4em", fontWeight: 700, margin: "20px 0 12px 0", color: theme.ink }} {...props} />,
                  h2: ({ node, ...props }) => <h2 style={{ fontSize: "1.2em", fontWeight: 600, margin: "18px 0 10px 0", color: theme.ink, borderBottom: `1px solid ${theme.border}`, paddingBottom: 6 }} {...props} />,
                  h3: ({ node, ...props }) => <h3 style={{ fontSize: "1.1em", fontWeight: 600, margin: "16px 0 8px 0", color: theme.ink }} {...props} />,
                  blockquote: ({ node, ...props }) => <blockquote style={{ borderLeft: `3px solid ${theme.accent}`, margin: "12px 0", paddingLeft: 14, color: theme.inkSoft, fontStyle: "italic", background: theme.surface2, padding: "8px 14px", borderRadius: "0 8px 8px 0" }} {...props} />,
                  table: ({ node, ...props }) => <div style={{ overflowX: "auto", margin: "16px 0" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95em" }} {...props} /></div>,
                  th: ({ node, ...props }) => <th style={{ borderBottom: `2px solid ${theme.border}`, padding: "10px 12px", textAlign: "left", fontWeight: 600, background: theme.surface2 }} {...props} />,
                  td: ({ node, ...props }) => <td style={{ borderBottom: `1px solid ${theme.border}`, padding: "10px 12px" }} {...props} />,
                  hr: ({ node, ...props }) => <hr style={{ border: 0, borderBottom: `1px solid ${theme.border}`, margin: "20px 0" }} {...props} />,
                  pre: ({ node, ...props }) => <pre style={{ background: "#1E1E1E", color: "#D4D4D4", padding: 16, borderRadius: 8, overflowX: "auto", margin: "14px 0", fontSize: "0.9em", border: `1px solid ${theme.border}` }} {...props} />,
                  code: ({ node, className, ...props }: any) => {
                    const hasNewline = String(props.children).includes('\n');
                    const match = /language-(\w+)/.exec(className || '');
                    if (match || hasNewline) {
                      return <code style={{ fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace" }} className={className} {...props} />;
                    }
                    return <code style={{ background: theme.surface2, padding: "3px 6px", borderRadius: 4, fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", fontSize: "0.9em", color: theme.accent, border: `1px solid ${theme.border}` }} className={className} {...props} />;
                  }
                }}
              >
                {displayContent}
              </ReactMarkdown>
            )}
            {msg.streaming && <span style={{ display: "inline-block", width: 6, height: 14, background: theme.accent, marginLeft: 3, verticalAlign: "-2px", animation: "chatui-blink 1s step-end infinite" }} />}
          </div>
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
            walletState={walletState}
          />
        )}

        {!isUser && !msg.streaming && !msg.proposal && (
          <button
            onClick={() => onCopy(msg.id, displayContent)}
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
            {copied === msg.id ? "Copied" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}
