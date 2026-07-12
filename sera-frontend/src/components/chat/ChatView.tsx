import { useEffect, useRef, useCallback, useState } from "react";
import type { ThemeType } from "../../theme";
import { MessageBubble } from "./MessageBubble";
import { EmptyState } from "./EmptyState";
import { ChatInput } from "./ChatInput";
import { Socket } from "socket.io-client";
import { CognitiveStreamPanel } from "./CognitiveStreamPanel";

interface ChatViewProps {
  theme: ThemeType;
  messages: any[];
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  isMobileView: boolean;
  onOpenSidebar: () => void;
  onSend: (text: string) => void;
  socket: Socket | null;
  observations: any[];
  lastViewedCount: number;
  setLastViewedCount: (n: number) => void;
  currentActivity: string | null;
  onCancelChat: () => void;
}

export function ChatView({
  theme,
  messages,
  setMessages,
  isMobileView,
  onOpenSidebar,
  onSend,
  socket,
  observations,
  lastViewedCount,
  setLastViewedCount,
  currentActivity,
  onCancelChat
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [showObservations, setShowObservations] = useState(false);

  useEffect(() => {
    if (showObservations) {
      setLastViewedCount(observations.length);
    }
  }, [observations.length, showObservations]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentActivity]);

  const handleCopy = useCallback((id: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const handleApprove = useCallback((proposalId: string, action: 'APPROVE' | 'REJECT', candidateId?: string) => {
    if (socket) {
      socket.emit('chat:proposal_response', { proposalId, action, candidateId });
      setMessages(prev => prev.map(m => {
        if (m.proposal && m.proposal.proposalId === proposalId) {
          return { ...m, proposal: { ...m.proposal, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' } };
        }
        return m;
      }));
    }
  }, [socket, setMessages]);


  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>


      {/* Messages area */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto",
        padding: isMobileView ? "72px 14px 120px" : "80px 26px 140px",
        maskImage: "linear-gradient(to bottom, transparent 0px, black 64px, black 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0px, black 64px, black 100%)"
      }}>
        {messages.length === 0 ? (
          <EmptyState theme={theme} />
        ) : (
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id || idx}
                theme={theme}
                msg={msg}
                onCopy={handleCopy}
                copied={copied}
                onApprove={handleApprove}
                onClearChat={() => socket?.emit("chat:clear")}
              />
            ))}

            {currentActivity && (
              <div style={{ display: "flex", justifyContent: "flex-start", margin: "16px 0" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, color: theme.inkFaint, fontFamily: "Inter, sans-serif",
                  fontWeight: 500
                }}>
                  <div className="activity-spinner" style={{
                    width: 12, height: 12, border: `2px solid ${theme.inkFaint}40`, borderTopColor: theme.inkFaint, borderRadius: "50%", animation: "spin 1s linear infinite"
                  }} />
                  {currentActivity}
                  <style>{`
                  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                `}</style>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: isMobileView ? "0px 14px 12px" : "0px 26px 16px",
        background: theme.bg,
        pointerEvents: "none" // so clicks pass through the gradient
      }}>
        <div style={{ maxWidth: 760, margin: "0 auto", position: "relative", pointerEvents: "auto" }}>
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
            isProcessing={!!currentActivity}
            showObservations={showObservations}
            isMobileView={isMobileView}
            onOpenSidebar={onOpenSidebar}
            onCancelChat={onCancelChat}
            onToggleObservations={() => {
              const nextState = !showObservations;
              setShowObservations(nextState);
              if (nextState) {
                setLastViewedCount(observations.length);
              }
            }}
            unreadCount={Math.max(0, observations.length - lastViewedCount)}
          />
        </div>
      </div>
    </div>
  );
}
