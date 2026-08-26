import { useEffect, useRef, useCallback, useState } from "react";
import type { ThemeType } from "../../theme";
import { MessageBubble } from "./MessageBubble";
import { EmptyState } from "./EmptyState";
import { ChatInput } from "./ChatInput";
import { Socket } from "socket.io-client";
import { CognitiveStreamPanel } from "./CognitiveStreamPanel";
import { GovernanceRecommendationCard } from "./proposal/GovernanceRecommendationCard";

interface ChatViewProps {
  theme: ThemeType;
  messages: any[];
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  isMobileView: boolean;
  onOpenSidebar: () => void;
  onSend: (text: string, images?: string[]) => void;
  socket: Socket | null;
  currentActivity: string | null;
  onCancelChat: () => void;
  walletState: any;
  governanceRecommendations?: any[];
  onRespondGovernance?: (recommendationId: string, decision: 'APPROVED' | 'REJECTED', rationale?: string) => void;
}

export function ChatView({
  theme,
  messages,
  setMessages,
  isMobileView,
  onOpenSidebar,
  onSend,
  socket,
  currentActivity,
  onCancelChat,
  walletState,
  governanceRecommendations,
  onRespondGovernance
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [showObservations, setShowObservations] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!scrollRef.current) return;
    const { scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight > clientHeight) {
      scrollRef.current.scrollTo({
        top: scrollHeight,
        behavior
      });
    }
  }, []);

  // Instant scroll on new messages / activity state changes
  useEffect(() => {
    scrollToBottom('smooth');
    const timer = setTimeout(() => scrollToBottom('auto'), 80);
    return () => clearTimeout(timer);
  }, [messages, currentActivity, showObservations, scrollToBottom]);

  // Use ResizeObserver on the messages content wrapper to guarantee auto-scroll on any dynamic height change
  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver(() => {
      scrollToBottom('smooth');
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  const handleCopy = useCallback((id: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const handleApprove = useCallback((proposalId: string, action: 'APPROVE' | 'REJECT', candidateId?: string) => {
    if (proposalId === "mock_purchase_github" && action === "APPROVE") {
      window.dispatchEvent(new Event("mock_github_installed"));
    }
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
        padding: isMobileView ? "68px 14px 180px" : "80px 26px 200px",
        maskImage: "linear-gradient(to bottom, transparent 0px, black 56px, black 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0px, black 56px, black 100%)",
      }}>
        {messages.length === 0 ? (
          <EmptyState theme={theme} />
        ) : (
          <div ref={contentRef} style={{ maxWidth: 760, margin: "0 auto" }}>
            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id || idx}
                theme={theme}
                msg={msg}
                onCopy={handleCopy}
                copied={copied}
                onApprove={handleApprove}
                onClearChat={() => socket?.emit("chat:clear")}
                walletState={walletState}
              />
            ))}

            {governanceRecommendations && governanceRecommendations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '16px 0' }}>
                {governanceRecommendations.map((rec) => (
                  <GovernanceRecommendationCard
                    key={rec.id}
                    theme={theme}
                    recommendation={rec}
                    onRespond={(id, decision, rationale) => onRespondGovernance?.(id, decision, rationale)}
                  />
                ))}
              </div>
            )}



            {currentActivity && (
              <div style={{ display: "flex", justifyContent: "flex-start", margin: "20px 0 16px" }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "8px 16px", borderRadius: 20,
                  background: theme.surface2, border: `1px solid ${theme.border}`,
                  fontSize: 12.5, color: theme.inkSoft, fontFamily: "Inter, sans-serif",
                  fontWeight: 500, boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
                }}>
                  <div className="activity-spinner" style={{
                    width: 13, height: 13, border: `2px solid ${theme.accent}40`, borderTopColor: theme.accent, borderRadius: "50%", animation: "spin 1s linear infinite"
                  }} />
                  <span>{currentActivity}</span>
                  <style>{`
                  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                `}</style>
                </div>
              </div>
            )}

            {/* Scroll bottom clearance anchor */}
            <div ref={bottomRef} style={{ height: isMobileView ? 24 : 32 }} />

          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: isMobileView ? "0px 14px max(14px, env(safe-area-inset-bottom, 14px))" : "0px 26px 16px",
        background: theme.bg,
        pointerEvents: "none" // so clicks pass through the gradient
      }}>
        <div style={{ maxWidth: 760, margin: "0 auto", position: "relative", pointerEvents: "auto" }}>
          {showObservations && (
            <CognitiveStreamPanel
              theme={theme}
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
              setShowObservations(!showObservations);
            }}
          />
        </div>
      </div>
    </div>
  );
}
