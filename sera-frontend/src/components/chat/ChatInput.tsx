import React, { useRef, useState } from "react";
import { Plus, Mic, ArrowUp, Bell, FileText, X, PanelLeft } from "lucide-react";
import type { ThemeType } from "../../theme";

export function ChatInput({ 
  theme, 
  onSend, 
  disabled,
  onToggleObservations,
  showObservations,
  unreadCount = 0,
  isMobileView,
  onOpenSidebar
}: { 
  theme: ThemeType, 
  onSend: (text: string) => void, 
  disabled?: boolean,
  onToggleObservations?: () => void,
  showObservations?: boolean,
  unreadCount?: number,
  isMobileView?: boolean,
  onOpenSidebar?: () => void
}) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (text.length > 250 || text.split('\n').length > 5) {
      e.preventDefault();
      setAttachments(prev => [...prev, text]);
    }
  };

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || disabled) return;
    
    let finalText = "";
    if (attachments.length > 0) {
      attachments.forEach((att, i) => {
        finalText += `[Pasted Text ${i + 1}]\n${att}\n\n`;
      });
    }
    finalText += input.trim();
    
    onSend(finalText.trim());
    setInput("");
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  return (
    <div style={{ padding: "0", flexShrink: 0 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", position: "relative" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 24,
            padding: "12px 14px 10px",
          }}
        >
          {attachments.length > 0 && (
            <div style={{ display: "flex", gap: 8, padding: "2px 8px 12px", overflowX: "auto", flexWrap: "wrap" }}>
              {attachments.map((_, idx) => (
                <div key={idx} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: theme.surface2, padding: "6px 10px", borderRadius: 8,
                  border: `1px solid ${theme.border}`, fontSize: 13, color: theme.ink
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.9 }}>
                    <FileText size={14} color={theme.inkSoft} />
                    <span style={{ fontWeight: 500 }}>Pasted</span>
                  </div>
                  <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, display: "flex", padding: 2, marginLeft: 4 }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            className="chatui-textarea"
            value={input}
            onChange={autoGrow}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Ask anything..."
            rows={1}
            disabled={disabled}
            style={{
              width: "100%",
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: theme.ink,
              fontFamily: "Inter, sans-serif",
              fontSize: 15,
              lineHeight: 1.5,
              padding: "2px 8px 10px",
              maxHeight: 160,
              minHeight: 24,
              boxSizing: "border-box"
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <div style={{ display: "flex", gap: 8, paddingLeft: 6, position: "relative" }}>
              {isMobileView && onOpenSidebar && (
                <button
                  title="Menu"
                  onClick={onOpenSidebar}
                  style={{
                    background: "transparent", border: "none", color: theme.inkSoft, 
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}
                >
                  <PanelLeft size={20} />
                </button>
              )}
              <button
                title="Attach file"
                disabled={disabled}
                style={{
                  background: "transparent", border: "none", color: theme.inkSoft, 
                  cursor: disabled ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                <Plus size={20} />
              </button>
              
              <button
                title="Observations"
                onClick={onToggleObservations}
                disabled={disabled}
                style={{
                  background: showObservations ? theme.surface2 : "transparent", border: "none", 
                  color: showObservations ? theme.ink : theme.inkSoft, 
                  cursor: disabled ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 8, padding: 4, marginLeft: -4, transition: "all 0.2s",
                  position: "relative"
                }}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <div style={{
                    position: "absolute", top: 3, right: 3,
                    background: "#ef4444",
                    width: 8, height: 8, borderRadius: "50%",
                    border: `1.5px solid ${theme.surface}`
                  }} />
                )}
              </button>
            </div>
            
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                title="Voice input"
                disabled={disabled}
                style={{
                  background: "transparent", border: "none", color: theme.inkSoft, 
                  cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center"
                }}
              >
                <Mic size={20} />
              </button>

              <button
                onClick={handleSend}
                disabled={(!input.trim() && attachments.length === 0) || disabled}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "none",
                  background: (input.trim() || attachments.length > 0) && !disabled ? theme.accent : theme.surface2,
                  color: (input.trim() || attachments.length > 0) && !disabled ? theme.accentInk : theme.inkSoft,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: (input.trim() || attachments.length > 0) && !disabled ? "pointer" : "default",
                  flexShrink: 0,
                  transform: (input.trim() || attachments.length > 0) && !disabled ? "scale(1)" : "scale(0.95)",
                  transition: "all 180ms ease",
                }}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: theme.inkSoft, fontFamily: "Inter, sans-serif", marginTop: 14 }}>
          Sera can make mistakes. Verify important information.
        </div>
      </div>
    </div>
  );
}
