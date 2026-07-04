import { useEffect, useRef, useCallback, useState } from "react";
import { Menu, MoreVertical, Trash } from "lucide-react";
import type { ThemeType } from "../../theme";
import { MessageBubble } from "./MessageBubble";
import { EmptyState } from "./EmptyState";
import { ChatInput } from "./ChatInput";
import { Socket } from "socket.io-client";
import { CognitiveStreamPanel } from "./CognitiveStreamPanel";

interface ChatViewProps {
  theme: ThemeType;
  messages: any[];
  isMobileView: boolean;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onSend: (text: string) => void;
  socket: Socket | null;
  observations: any[];
}

export function ChatView({
  theme,
  messages,
  isMobileView,
  sidebarOpen,
  onOpenSidebar,
  onSend,
  socket,
  observations
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showObservations, setShowObservations] = useState(false);

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
  const paddingBottomVal = isMobileView ? "10px 14px 8px" : "10px 26px 12px";

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

          
          <div style={{ position: "relative" }}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex" }}
            >
              <MoreVertical size={18} />
            </button>
            {dropdownOpen && (
              <>
                <div 
                  style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }} 
                  onClick={() => setDropdownOpen(false)} 
                />
                <div style={{ 
                  position: "absolute", right: 0, top: "100%", marginTop: 8,
                  background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.1)", padding: 8, zIndex: 100, minWidth: 160
                }}>
                  <button 
                    onClick={() => { handleClearChat(); setDropdownOpen(false); }}
                    style={{ 
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      background: "transparent", border: "none", cursor: "pointer", 
                      color: "#ef4444", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500,
                      padding: "10px 12px", borderRadius: 8, textAlign: "left", transition: "background 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <Trash size={16} />
                    Clear Chat
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: paddingVal }}>
        {messages.length === 0 ? (
          <EmptyState theme={theme} />
        ) : (
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            {messages.map((m) => (
              <MessageBubble key={m.id} theme={theme} msg={m} onCopy={handleCopy} copied={copied} onApprove={handleApprove} />
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{ padding: paddingBottomVal, flexShrink: 0, position: "relative" }}>
        {showObservations && (
          <CognitiveStreamPanel 
            theme={theme} 
            observations={observations} 
            onClose={() => setShowObservations(false)} 
          />
        )}
        <ChatInput 
          theme={theme} 
          onSend={onSend} 
          disabled={!socket}
          showObservations={showObservations}
          onToggleObservations={() => setShowObservations(!showObservations)}
          unreadCount={observations.length}
        />
      </div>
    </div>
  );
}
