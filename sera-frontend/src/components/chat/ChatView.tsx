import { useEffect, useRef, useCallback, useState } from "react";
import type { ThemeType } from "../../theme";
import { MessageBubble } from "./MessageBubble";
import { EmptyState } from "./EmptyState";
import { ChatInput } from "./ChatInput";
import { Socket } from "socket.io-client";
import { CognitiveStreamPanel } from "./CognitiveStreamPanel";
import { GovernanceRecommendationCard } from "./proposal/GovernanceRecommendationCard";
import { CognitiveProcessCard } from "./CognitiveProcessCard";

interface ChatViewProps {
  theme: ThemeType;
  messages: any[];
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  isMobileView: boolean;
  onOpenSidebar: () => void;
  onSend: (text: string, images?: string[], documents?: any[]) => void;
  socket: Socket | null;
  currentActivity: any | null;
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

  const isNearBottomRef = useRef(true);

  const checkIfNearBottom = useCallback(() => {
    if (!scrollRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // Within 140px of bottom is considered "near bottom"
    return scrollHeight - scrollTop - clientHeight <= 140;
  }, []);

  const handleScroll = useCallback(() => {
    isNearBottomRef.current = checkIfNearBottom();
  }, [checkIfNearBottom]);

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
    const lastMsg = messages[messages.length - 1];
    const isUserSentLast = lastMsg?.role === 'user';

    // If user sent a message, ALWAYS scroll to bottom
    if (isUserSentLast) {
      isNearBottomRef.current = true;
      scrollToBottom('smooth');
      const timer = setTimeout(() => scrollToBottom('auto'), 80);
      return () => clearTimeout(timer);
    }

    // Otherwise, only auto-scroll if the user is already near the bottom
    if (isNearBottomRef.current) {
      scrollToBottom('smooth');
      const timer = setTimeout(() => scrollToBottom('auto'), 80);
      return () => clearTimeout(timer);
    }
  }, [messages, currentActivity, showObservations, scrollToBottom]);

  // Use ResizeObserver on the messages content wrapper ONLY if user is already near bottom
  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver(() => {
      // Do NOT yank scroll to bottom if user scrolled up to view/expand old messages
      if (isNearBottomRef.current) {
        scrollToBottom('smooth');
      }
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
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: isMobileView ? "68px 14px 180px" : "80px 26px 200px",
          maskImage: "linear-gradient(to bottom, transparent 0px, black 56px, black 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0px, black 56px, black 100%)",
        }}
      >
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
                isMobileView={isMobileView}
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
              <div style={{ display: "flex", justifyContent: "flex-start", margin: "16px 0 12px" }}>
                <CognitiveProcessCard
                  theme={theme}
                  phase={typeof currentActivity === 'object' ? currentActivity.phase : (String(currentActivity).toLowerCase().includes('working') ? 'WORKING' : 'THINKING')}
                  subText={typeof currentActivity === 'object' ? currentActivity.subText : String(currentActivity)}
                  steps={typeof currentActivity === 'object' ? currentActivity.cognitiveSteps : []}
                  isLive={true}
                  startTime={typeof currentActivity === 'object' ? currentActivity.startTime : undefined}
                />
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
