import { Activity, Copy, Check, ExternalLink, Download, Maximize2, X, ZoomIn, ZoomOut, FileSpreadsheet, FileText } from "lucide-react";
import type { ThemeType } from "../../theme";
import { ProposalCard } from "./ProposalCard";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, useEffect, useRef } from 'react';

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dismissProgress, setDismissProgress] = useState(0);

  const initialDistanceRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Reset position when zoom is reset to 1
  useEffect(() => {
    if (scale <= 1) {
      setPosition({ x: 0, y: 0 });
    }
  }, [scale]);

  // Keyboard Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Double tap / double click to toggle zoom
  const handleDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      setScale(current => (current > 1.2 ? 1 : 2.5));
      setPosition({ x: 0, y: 0 });
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  // Touch event handlers for mobile gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // 2 fingers: Pinch gesture
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialDistanceRef.current = dist;
      initialScaleRef.current = scale;
      setIsDragging(false);
    } else if (e.touches.length === 1) {
      // 1 finger: Drag / Pan or Swipe-to-dismiss
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setDragStart({ x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y });
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialDistanceRef.current !== null) {
      // Pinching
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / initialDistanceRef.current;
      const newScale = Math.min(Math.max(initialScaleRef.current * factor, 0.8), 4.5);
      setScale(newScale);
    } else if (e.touches.length === 1 && isDragging) {
      const deltaX = e.touches[0].clientX - touchStartRef.current.x;
      const deltaY = e.touches[0].clientY - touchStartRef.current.y;

      if (scale > 1.05) {
        // Pan while zoomed in
        setPosition({
          x: e.touches[0].clientX - dragStart.x,
          y: e.touches[0].clientY - dragStart.y
        });
      } else {
        // Swipe down to dismiss at normal scale
        if (deltaY > 0) {
          setDismissProgress(deltaY);
          setPosition({ x: deltaX * 0.3, y: deltaY });
        }
      }
    }
  };

  const handleTouchEnd = () => {
    initialDistanceRef.current = null;
    setIsDragging(false);

    if (scale < 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }

    if (scale <= 1.05 && dismissProgress > 90) {
      onClose();
    } else {
      setDismissProgress(0);
      if (scale <= 1.05) {
        setPosition({ x: 0, y: 0 });
      }
    }
  };

  // Mouse wheel zoom on desktop
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    setScale(s => Math.min(Math.max(s + delta, 1), 4));
  };

  // Mouse drag on desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1.05) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1.05) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const opacity = Math.max(0.2, 1 - dismissProgress / 300);

  return (
    <div
      onClick={onClose}
      onWheel={handleWheel}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `rgba(0, 0, 0, ${0.9 * opacity})`,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Floating Controls */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          gap: 8,
          zIndex: 100000
        }}
      >
        <button
          onClick={() => {
            setScale(current => (current > 1.2 ? 1 : 2.5));
            setPosition({ x: 0, y: 0 });
          }}
          title="Toggle Zoom"
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            borderRadius: '50%',
            width: 38,
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {scale > 1.2 ? <ZoomOut size={17} /> : <ZoomIn size={17} />}
        </button>
        <a
          href={src}
          download={`Sera_Image_${Date.now()}.png`}
          target="_blank"
          rel="noopener noreferrer"
          title="Download Image"
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            borderRadius: '50%',
            width: 38,
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          <Download size={17} />
        </a>
        <button
          onClick={onClose}
          title="Close (Esc)"
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: '#fff',
            borderRadius: '50%',
            width: 38,
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={19} />
        </button>
      </div>

      {/* Helper hint for mobile/desktop */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          color: 'rgba(255, 255, 255, 0.75)',
          fontSize: 12,
          padding: '6px 14px',
          borderRadius: 20,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          pointerEvents: 'none'
        }}
      >
        {scale > 1 ? 'Drag to pan • Double-tap to reset' : 'Pinch or double-tap to zoom • Swipe down to close'}
      </div>

      {/* Interactive Image Container */}
      <div
        onClick={handleDoubleTap}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          maxWidth: '96vw',
          maxHeight: '90vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
          touchAction: 'none'
        }}
      >
        <img
          src={src}
          alt="Preview"
          draggable={false}
          style={{
            maxWidth: '100%',
            maxHeight: '85vh',
            objectFit: 'contain',
            borderRadius: 12,
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6)',
            pointerEvents: 'none'
          }}
        />
      </div>
    </div>
  );
}

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
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
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

  const hasImages = msg.images && msg.images.length > 0;
  const hasDocs = msg.documents && msg.documents.length > 0;
  const hasText = Boolean(displayContent && displayContent.trim());

  return (
    <div
      style={{
        display: "flex",
        marginBottom: 22,
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div style={{ maxWidth: "100%", width: isUser ? "auto" : "100%", display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
        {/* Document Attachments Card */}
        {hasDocs && (
          <div style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: hasText || hasImages ? 8 : 0,
            justifyContent: isUser ? "flex-end" : "flex-start",
            maxWidth: "100%"
          }}>
            {msg.documents.map((doc: any, i: number) => {
              const name = doc.name || doc.filename || 'document.csv';
              const isSpreadsheet = name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls');
              const sizeKb = doc.size ? (doc.size / 1024).toFixed(1) + ' KB' : (doc.totalRows ? `${doc.totalRows} rows` : 'File');
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: isUser ? theme.bubbleUser : theme.surface2,
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: `1px solid ${theme.border}`,
                    color: isUser ? theme.bubbleUserInk : theme.ink,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
                  }}
                >
                  {isSpreadsheet ? (
                    <FileSpreadsheet size={18} color="#10B981" />
                  ) : (
                    <FileText size={18} color={theme.accent} />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", maxWidth: 220, overflow: "hidden" }}>
                    <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {name}
                    </span>
                    <span style={{ fontSize: 11, opacity: 0.75 }}>{sizeKb}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Standalone Media Attachment Cards (Separated from Text Bubble) */}
        {hasImages && (
          <div style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: hasText ? 8 : 0,
            justifyContent: isUser ? "flex-end" : "flex-start",
            maxWidth: "100%"
          }}>
            {msg.images.map((imgUrl: string, i: number) => (
              <div
                key={i}
                onClick={() => setLightboxSrc(imgUrl)}
                style={{
                  position: "relative",
                  maxWidth: 320,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: `1px solid ${theme.border}`,
                  boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
                  cursor: "pointer",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  background: theme.surface2
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.08)";
                }}
              >
                <img 
                  src={imgUrl} 
                  alt="attachment" 
                  style={{ maxWidth: "100%", maxHeight: 260, display: "block", objectFit: "cover" }} 
                />
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    background: "rgba(0, 0, 0, 0.55)",
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                    color: "#FFF",
                    borderRadius: "50%",
                    width: 28,
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                  }}
                  title="Click to view full image"
                >
                  <Maximize2 size={13} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Text Message Bubble */}
        {(hasText || isUser) && (
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
              whiteSpace: isUser ? "pre-wrap" : "normal",
              wordBreak: "break-word",
              maxWidth: "100%",
              minWidth: 0,
              opacity: isUser && msg.status === "pending" ? 0.7 : 1,
              transition: "opacity 0.25s ease",
            }}
          >
            <div className="markdown-content" style={{ display: "flex", flexDirection: "column", maxWidth: "100%", minWidth: 0 }}>
              {isUser ? (
                <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                  {displayContent && <span>{displayContent}</span>}
                  {msg.status === "pending" && (
                    <span style={{ fontSize: 10, opacity: 0.65, fontStyle: "italic", whiteSpace: "nowrap" }}>
                      • sending
                    </span>
                  )}
                </span>
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
                    h1: ({ _node, ...props }: any) => <h1 style={{ fontSize: "1.4em", fontWeight: 700, margin: "20px 0 12px 0", color: theme.ink }} {...props} />,
                    h2: ({ _node, ...props }: any) => <h2 style={{ fontSize: "1.2em", fontWeight: 600, margin: "18px 0 10px 0", color: theme.ink, borderBottom: `1px solid ${theme.border}`, paddingBottom: 6 }} {...props} />,
                    h3: ({ _node, ...props }: any) => <h3 style={{ fontSize: "1.1em", fontWeight: 600, margin: "16px 0 8px 0", color: theme.ink }} {...props} />,
                    blockquote: ({ _node, ...props }: any) => <blockquote style={{ borderLeft: `3px solid ${theme.accent}`, margin: "12px 0", paddingLeft: 14, color: theme.inkSoft, fontStyle: "italic", background: theme.surface2, padding: "8px 14px", borderRadius: "0 8px 8px 0" }} {...props} />,
                    table: ({ _node, ...props }: any) => (
                      <div style={{
                        width: "100%",
                        maxWidth: "100%",
                        overflowX: "auto",
                        WebkitOverflowScrolling: "touch",
                        margin: "14px 0",
                        borderRadius: 10,
                        border: `1px solid ${theme.border}`,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                        background: theme.surface
                      }}>
                        <table style={{
                          minWidth: "100%",
                          width: "max-content",
                          borderCollapse: "collapse",
                          fontSize: "0.88em",
                          textAlign: "left",
                          lineHeight: 1.5
                        }} {...props} />
                      </div>
                    ),
                    th: ({ _node, ...props }: any) => (
                      <th style={{
                        borderBottom: `1px solid ${theme.border}`,
                        padding: "10px 14px",
                        textAlign: "left",
                        fontWeight: 600,
                        background: theme.surface2,
                        color: theme.ink,
                        whiteSpace: "nowrap"
                      }} {...props} />
                    ),
                    td: ({ _node, ...props }: any) => (
                      <td style={{
                        borderBottom: `1px solid ${theme.border}`,
                        padding: "9px 14px",
                        color: theme.ink,
                        whiteSpace: "nowrap"
                      }} {...props} />
                    ),
                    hr: ({ _node, ...props }: any) => <hr style={{ border: 0, borderBottom: `1px solid ${theme.border}`, margin: "20px 0" }} {...props} />,
                    pre: ({ _node, ...props }: any) => <pre style={{ background: "#1E1E1E", color: "#D4D4D4", padding: 16, borderRadius: 8, overflowX: "auto", margin: "14px 0", fontSize: "0.9em", border: `1px solid ${theme.border}` }} {...props} />,
                    code: ({ _node, className, ...props }: any) => {
                      const hasNewline = String(props.children).includes('\n');
                      const match = /language-(\w+)/.exec(className || '');
                      if (match || hasNewline) {
                        return <code style={{ fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace" }} className={className} {...props} />;
                      }
                      return <code style={{ background: theme.surface2, padding: "3px 6px", borderRadius: 4, fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", fontSize: "0.9em", color: theme.accent, border: `1px solid ${theme.border}` }} className={className} {...props} />;
                    },
                    img: ({ _node, ...props }: any) => {
                      return (
                        <div style={{ position: "relative", display: "inline-block", marginTop: 12, maxWidth: "100%" }}>
                          <img
                            onClick={() => props.src && setLightboxSrc(props.src)}
                            style={{ maxWidth: "100%", height: "auto", borderRadius: 12, display: "block", border: `1px solid ${theme.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", cursor: "pointer" }}
                            {...props}
                          />
                          <a
                            href={props.src}
                            download={`Sera_Image_${Date.now()}.png`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              position: "absolute",
                              bottom: 12,
                              right: 12,
                              background: "rgba(0, 0, 0, 0.6)",
                              backdropFilter: "blur(4px)",
                              WebkitBackdropFilter: "blur(4px)",
                              color: "#FFF",
                              border: "1px solid rgba(255, 255, 255, 0.2)",
                              borderRadius: "50%",
                              width: 36,
                              height: 36,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              transition: "all 0.2s",
                              textDecoration: "none"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(0, 0, 0, 0.8)";
                              e.currentTarget.style.transform = "scale(1.05)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(0, 0, 0, 0.6)";
                              e.currentTarget.style.transform = "scale(1)";
                            }}
                            title="Download Image"
                          >
                            <Download size={18} />
                          </a>
                        </div>
                      );
                    }
                  }}
                >
                  {displayContent}
                </ReactMarkdown>
              )}
              {msg.streaming && <span style={{ display: "inline-block", width: 6, height: 14, background: theme.accent, marginLeft: 3, verticalAlign: "-2px", animation: "chatui-blink 1s step-end infinite" }} />}
            </div>
          </div>
        )}

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

      {/* Interactive Lightbox Modal */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
