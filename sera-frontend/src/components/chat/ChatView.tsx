import { useEffect, useRef, useCallback, useState } from "react";
import { Menu, MoreVertical, Trash } from "lucide-react";
import type { ThemeType } from "../../theme";
import { MessageBubble } from "./MessageBubble";
import { EmptyState } from "./EmptyState";
import { ChatInput } from "./ChatInput";
import { Socket } from "socket.io-client";

interface ChatViewProps {
  theme: ThemeType;
  messages: any[];
  isMobileView: boolean;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onSend: (text: string) => void;
  socket: Socket | null;
}

export function ChatView({
  theme,
  messages,
  isMobileView,
  sidebarOpen,
  onOpenSidebar,
  onSend,
  socket
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleCopy = useCallback((id: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const handleApprove = useCallback((proposalId: string, action: 'APPROVE' | 'REJECT') => {
    if (socket) {
      socket.emit('chat:proposal_response', { proposalId, action });
    }
  }, [socket]);

  const handleClearChat = useCallback(() => {
    if (socket) {
      socket.emit('chat:clear');
    }
  }, [socket]);

  const paddingVal = isMobileView ? "18px 14px" : "24px 26px";
  const paddingBottomVal = isMobileView ? "10px 14px 16px" : "10px 26px 20px";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      {/* Header bar */}
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
          <button onClick={onOpenSidebar} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex" }}>
            <Menu size={18} />
          </button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button 
            onClick={handleClearChat}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex", transition: "color 0.2s" }}
            onMouseEnter={(e) => e.currentTarget.style.color = theme.status}
            onMouseLeave={(e) => e.currentTarget.style.color = theme.inkSoft}
            title="Clear Chat History"
          >
            <Trash size={18} />
          </button>
          <button style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex" }}>
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: paddingVal }}>
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

      {/* Input area */}
      <div style={{ padding: paddingBottomVal, flexShrink: 0 }}>
        <ChatInput theme={theme} onSend={onSend} disabled={!socket} />
      </div>
    </div>
  );
}
