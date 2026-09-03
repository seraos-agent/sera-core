import { Activity, Copy, Check, ExternalLink, Download, Maximize2, X, ZoomIn, ZoomOut, FileSpreadsheet, FileText } from "lucide-react";
import type { ThemeType } from "../../theme";
import { ProposalCard } from "./ProposalCard";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, useEffect, useRef, useCallback } from 'react';
import { CognitiveProcessCard } from './CognitiveProcessCard';

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

function CodeBlockCard({ children, theme }: { children: any; theme: ThemeType }) {
  const [copied, setCopied] = useState(false);

  const extractText = (child: any): string => {
    if (!child) return '';
    if (typeof child === 'string') return child;
    if (Array.isArray(child)) return child.map(extractText).join('');
    if (child.props && child.props.children) return extractText(child.props.children);
    return '';
  };

  const rawText = extractText(children).trim();
  const langMatch = children?.props?.className ? /language-(\w+)/.exec(children.props.className) : null;
  const language = langMatch ? langMatch[1].toUpperCase() : 'LOGIC / CODE';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!rawText) return;
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        margin: "14px 0",
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: theme.surface2 || "rgba(0,0,0,0.03)",
        overflow: "hidden",
        fontSize: "0.9em",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "7px 12px",
          background: theme.surface || "rgba(0,0,0,0.02)",
          borderBottom: `1px solid ${theme.border}`,
          fontSize: "0.78em",
          fontWeight: 600,
          color: theme.inkSoft,
          letterSpacing: "0.04em",
          userSelect: "none"
        }}
      >
        <span>{language}</span>
        <button
          onClick={handleCopy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "transparent",
            border: "none",
            color: copied ? "#10B981" : theme.inkSoft,
            cursor: "pointer",
            fontSize: "0.95em",
            fontWeight: 500,
            padding: "2px 6px",
            borderRadius: 4,
            transition: "all 0.2s ease"
          }}
          title="Salin ke clipboard"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span>{copied ? "Disalin!" : "Salin"}</span>
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "12px 14px",
          color: theme.ink,
          background: "transparent",
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          fontSize: "0.92em",
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowX: "hidden",
        }}
      >
        {children}
      </pre>
    </div>
  );
}

interface MiniBarChartProps {
  title?: string;
  description?: string;
  footer?: string;
  items: Array<{
    label: string;
    value?: string;
    percentage: number;
    color?: string;
  }>;
  theme: ThemeType;
}

function MiniBarChart({ title, description, footer, items, theme }: MiniBarChartProps) {
  return (
    <div style={{
      margin: "16px 0 20px 0",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      maxWidth: 520,
      width: "100%"
    }}>
      {title && (
        <div style={{ fontWeight: 700, fontSize: "1.05em", color: theme.ink, lineHeight: 1.3 }}>
          {title}
        </div>
      )}
      {description && (
        <div style={{ fontSize: "0.86em", color: theme.inkSoft, lineHeight: 1.4 }}>
          {description}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "0.92em" }}>
              <span style={{ fontWeight: 700, color: theme.ink }}>{item.label}</span>
              {item.value && <span style={{ fontWeight: 600, color: theme.ink }}>{item.value}</span>}
            </div>
            <div style={{
              width: "100%",
              height: 7,
              borderRadius: 999,
              background: theme.surface2 || "rgba(0,0,0,0.06)",
              overflow: "hidden",
              position: "relative"
            }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, Math.max(0, item.percentage))}%`,
                borderRadius: 999,
                background: item.color || (idx === 0 ? "#3B82F6" : "#60A5FA"),
                transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)"
              }} />
            </div>
          </div>
        ))}
      </div>
      {footer && (
        <div style={{ fontSize: "0.78em", color: theme.inkFaint, fontStyle: "italic", marginTop: 2 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

function parseBarChart(rawText: string) {
  const lines = rawText.trim().split('\n');
  let title = '';
  let description = '';
  let footer = '';
  const items: Array<{ label: string; value?: string; percentage: number }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase().startsWith('title:')) {
      title = trimmed.slice(6).trim();
    } else if (trimmed.toLowerCase().startsWith('description:') || trimmed.toLowerCase().startsWith('desc:')) {
      description = trimmed.replace(/^(description|desc):/i, '').trim();
    } else if (trimmed.toLowerCase().startsWith('footer:') || trimmed.toLowerCase().startsWith('note:')) {
      footer = trimmed.replace(/^(footer|note):/i, '').trim();
    } else if (trimmed.includes('|')) {
      const parts = trimmed.split('|').map(p => p.trim());
      if (parts.length >= 2) {
        const label = parts[0];
        const value = parts.length >= 3 ? parts[1] : undefined;
        const pctStr = parts.length >= 3 ? parts[2] : parts[1];
        let pct = parseFloat(pctStr.replace('%', ''));
        if (isNaN(pct)) pct = 50;
        items.push({ label, value, percentage: pct });
      }
    } else if (trimmed.includes(',')) {
      const parts = trimmed.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        const label = parts[0];
        const value = parts.length >= 3 ? parts[1] : undefined;
        const pctStr = parts.length >= 3 ? parts[2] : parts[1];
        let pct = parseFloat(pctStr.replace('%', ''));
        if (isNaN(pct)) pct = 50;
        items.push({ label, value, percentage: pct });
      }
    }
  }

  return { title, description, footer, items };
}

function normalizeMarkdownContent(content: string): string {
  if (typeof content !== 'string') return content;
  return content.replace(/(?<!-)\s*—\s*(?!-)/g, ', ');
}



function DraggableTableContainer({ children, theme }: { children: React.ReactNode; theme: ThemeType }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isDownRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);

  const checkScrollability = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 2;
    setCanScrollLeft(hasOverflow && el.scrollLeft > 4);
    setCanScrollRight(hasOverflow && Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScrollability();
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      checkScrollability();
    });
    observer.observe(el);

    const timer = setTimeout(checkScrollability, 100);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [checkScrollability]);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDownRef.current) return;
      const el = containerRef.current;
      if (!el) return;

      const deltaX = e.clientX - startXRef.current;
      if (Math.abs(deltaX) > 3) {
        if (!hasMovedRef.current) {
          hasMovedRef.current = true;
          setIsDragging(true);
        }
        el.scrollLeft = startScrollLeftRef.current - deltaX;
        checkScrollability();
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDownRef.current) {
        isDownRef.current = false;
        setIsDragging(false);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [checkScrollability]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth + 2) return;

    isDownRef.current = true;
    startXRef.current = e.clientX;
    startScrollLeftRef.current = el.scrollLeft;
    hasMovedRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth + 2) return;

    // Convert vertical wheel to horizontal scroll for this table container on desktop
    if (Math.abs(e.deltaY) > 0 && Math.abs(e.deltaX) === 0) {
      const atStart = el.scrollLeft <= 0;
      const atEnd = Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth - 1;

      if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atStart)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        checkScrollability();
      }
    } else {
      checkScrollability();
    }
  };

  const hasOverflow = canScrollLeft || canScrollRight;

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '100%', margin: '14px 0 18px 0' }}>
      {/* Subtle Left Scroll Indicator */}
      {canScrollLeft && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 5,
          width: 32,
          background: `linear-gradient(to right, ${theme.surface || theme.bg}, transparent)`,
          pointerEvents: 'none',
          zIndex: 3,
          borderRadius: '4px 0 0 4px',
        }} />
      )}

      {/* Subtle Right Scroll Indicator */}
      {canScrollRight && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 5,
          width: 32,
          background: `linear-gradient(to left, ${theme.surface || theme.bg}, transparent)`,
          pointerEvents: 'none',
          zIndex: 3,
          borderRadius: '0 4px 4px 0',
        }} />
      )}

      <div
        ref={containerRef}
        className="clean-table-container"
        onMouseDown={handleMouseDown}
        onScroll={checkScrollability}
        onWheel={handleWheel}
        style={{
          cursor: isDragging ? 'grabbing' : (hasOverflow ? 'grab' : 'auto'),
          userSelect: isDragging ? 'none' : 'auto',
          WebkitUserSelect: isDragging ? 'none' : 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function MessageBubble({ theme, msg, onCopy, copied, onApprove, onClearChat, walletState, isMobileView }: {
  theme: ThemeType;
  msg: any;
  onCopy: (id: number, content: string) => void;
  copied: number | null;
  onApprove: (proposalId: string, action: 'APPROVE' | 'REJECT', candidateId?: string) => void;
  onClearChat?: () => void;
  walletState: any;
  isMobileView?: boolean;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const isUser = msg.role === "user";

  let cleanedContent = normalizeMarkdownContent(msg.content || '')
    .replace(/\[sheet\]\s*\{[\s\S]*\}/gi, '');

  // If companion action button links exist at the end of the message, strip duplicate inline links from body text
  if (msg.actionLinks && msg.actionLinks.length > 0) {
    for (const link of msg.actionLinks) {
      if (link.url) {
        const escapedUrl = link.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match standalone link lines e.g. "📄 [Title](url)" or "- [Title](url)"
        const lineRegex = new RegExp(`^\\s*(?:📄|•|-|\\*|🔗)?\\s*\\[[^\\]]+\\]\\(${escapedUrl}\\)\\s*$`, 'gim');
        cleanedContent = cleanedContent.replace(lineRegex, '');

        // Match any inline instance
        const inlineRegex = new RegExp(`(?:📄|🔗)?\\s*\\[[^\\]]+\\]\\(${escapedUrl}\\)`, 'gi');
        cleanedContent = cleanedContent.replace(inlineRegex, '');
      }
    }
    cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n');
  }

  const displayContent = cleanedContent.trim();

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

        {/* Cognitive Process Dropdown (Strictly at the TOP of Agent Message) */}
        {!isUser && msg.cognitiveSteps && msg.cognitiveSteps.length > 0 && (
          <CognitiveProcessCard
            theme={theme}
            steps={msg.cognitiveSteps}
            isLive={msg.streaming}
            durationSeconds={msg.durationSeconds}
            hadTools={msg.hadTools}
            startTime={msg.startTime}
          />
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
              fontSize: isMobileView ? 15.5 : 14.5,
              lineHeight: isMobileView ? 1.68 : 1.65,
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
                    blockquote: ({ _node, ...props }: any) => (
                      <blockquote
                        style={{
                          borderLeft: `3.5px solid ${theme.accent}`,
                          margin: "12px 0",
                          color: theme.ink,
                          background: theme.surface2 || "rgba(0,0,0,0.03)",
                          padding: "10px 16px",
                          borderRadius: "0 10px 10px 0",
                          border: `1px solid ${theme.border}`,
                          borderLeftWidth: 3.5,
                          borderLeftColor: theme.accent,
                          fontSize: "0.93em",
                          lineHeight: 1.55
                        }}
                        {...props}
                      />
                    ),
                    table: ({ _node, ...props }: any) => (
                      <DraggableTableContainer theme={theme}>
                        <table style={{
                          minWidth: "100%",
                          width: "max-content",
                          borderCollapse: "collapse",
                          fontSize: "0.92em",
                          textAlign: "left",
                          lineHeight: 1.6,
                          background: "transparent"
                        }} {...props} />
                      </DraggableTableContainer>
                    ),
                    thead: ({ _node, ...props }: any) => (
                      <thead style={{ background: "transparent" }} {...props} />
                    ),
                    tbody: ({ _node, ...props }: any) => (
                      <tbody {...props} />
                    ),
                    tr: ({ _node, ...props }: any) => (
                      <tr style={{ borderBottom: `1px solid ${theme.border}` }} {...props} />
                    ),
                    th: ({ _node, ...props }: any) => (
                      <th style={{
                        borderBottom: `1.5px solid ${theme.border}`,
                        padding: "8px 24px 8px 0",
                        textAlign: "left",
                        fontWeight: 600,
                        color: theme.inkSoft,
                        whiteSpace: "nowrap",
                        fontSize: "0.88em",
                        letterSpacing: "0.01em"
                      }} {...props} />
                    ),
                    td: ({ _node, ...props }: any) => (
                      <td style={{
                        borderBottom: `1px solid ${theme.border}`,
                        padding: "10px 24px 10px 0",
                        color: theme.ink,
                        whiteSpace: "nowrap",
                        fontSize: "0.93em"
                      }} {...props} />
                    ),
                    hr: ({ _node, ...props }: any) => <hr style={{ border: 0, borderBottom: `1px solid ${theme.border}`, margin: "20px 0" }} {...props} />,
                    pre: ({ _node, ...props }: any) => {
                      const child = props.children;
                      if (child && child.props && (child.props.className === 'language-barchart' || child.props.className === 'language-chart')) {
                        return <>{child}</>;
                      }
                      return <CodeBlockCard theme={theme}>{child}</CodeBlockCard>;
                    },
                    code: ({ _node, className, ...props }: any) => {
                      const match = /language-(\w+)/.exec(className || '');
                      const lang = match ? match[1].toLowerCase() : '';
                      
                      if (lang === 'barchart' || lang === 'chart') {
                        const parsed = parseBarChart(String(props.children || ''));
                        return <MiniBarChart {...parsed} theme={theme} />;
                      }

                      const hasNewline = String(props.children).includes('\n');
                      if (match || hasNewline) {
                        return <code style={{ fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace" }} className={className} {...props} />;
                      }
                      return <code style={{ background: theme.surface2 || 'rgba(0,0,0,0.04)', padding: "2px 6px", borderRadius: 5, fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace", fontSize: "0.88em", color: theme.ink, border: `1px solid ${theme.border}` }} className={className} {...props} />;
                    },
                    img: ({ _node, ...props }: any) => {
                      return (
                        <span style={{ position: "relative", display: "inline-block", marginTop: 12, maxWidth: "100%" }}>
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
                        </span>
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
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {msg.actionLinks.map((link: any, idx: number) => {
              const isSheet = (link.label || '').toLowerCase().includes('sheet') || (link.url || '').includes('spreadsheets') || (link.label || '').toLowerCase().includes('google');
              return (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: isSheet ? `${theme.accent}12` : theme.surface2,
                    border: `1px solid ${isSheet ? theme.accent + '40' : theme.border}`,
                    padding: "8px 14px",
                    borderRadius: 10,
                    textDecoration: "none",
                    color: isSheet ? theme.accent : theme.ink,
                    fontFamily: "Inter, sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    transition: "all 0.2s ease",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.04)"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.04)";
                  }}
                >
                  {isSheet ? <FileSpreadsheet size={16} color={theme.accent} /> : <ExternalLink size={14} color={theme.inkSoft} />}
                  <span>{link.label}</span>
                </a>
              );
            })}
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
