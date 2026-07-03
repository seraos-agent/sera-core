import React, { useEffect, useRef, useCallback, useState } from "react";
import { Menu, MoreVertical } from "lucide-react";
import type { ThemeType } from "../../theme";
import { MessageBubble } from "./MessageBubble";
import { EmptyState } from "./EmptyState";
import { ChatInput } from "./ChatInput";
import { Socket } from "socket.io-client";

interface ChatViewProps {
  theme: ThemeType;
  messages: any[];
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  isMobileView: boolean;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onSend: (text: string) => void;
  socket: Socket | null;
  streamReply: (fullText: string, id: number) => void;
}

export function ChatView({
  theme,
  messages,
  setMessages,
  isMobileView,
  sidebarOpen,
  onOpenSidebar,
  onSend,
  socket,
  streamReply
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

  const handleApprove = useCallback((id: number, approved: boolean) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: approved ? 'approved' : 'rejected' } : m));
    
    if (approved) {
      setTimeout(() => {
        const nextMsgId1 = Date.now();
        setMessages(prev => [...prev, { id: nextMsgId1, type: "activity", content: "Menandatangani transaksi dan menyiarkan ke Base Sepolia..." }]);
        
        const nextMsgId2 = Date.now() + 1;
        setTimeout(() => {
          setMessages(prev => [...prev, { id: nextMsgId2, role: "agent", content: "", streaming: true }]);
          streamReply("Transaksi telah dieksekusi. Saya telah melaporkan state mutation kembali ke WorldState untuk memastikan sistem kita tersinkronisasi. Ada tugas operasional lain yang bisa saya bantu hari ini?", nextMsgId2);
        }, 1000);
      }, 500);
    }
  }, [setMessages, streamReply]);

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
        <div style={{ marginLeft: "auto" }}>
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
