import React, { useRef, useState } from "react";
import { Plus, ArrowUp, Bell, FileText, X, PanelLeft, Image as ImageIcon, Camera, Square } from "lucide-react";
import type { ThemeType } from "../../theme";

interface ChatInputProps {
  theme: ThemeType;
  onSend: (text: string) => void;
  disabled?: boolean;
  isProcessing?: boolean;
  onToggleObservations?: () => void;
  showObservations?: boolean;
  unreadCount?: number;
  isMobileView?: boolean;
  onOpenSidebar?: () => void;
  onCancelChat?: () => void;
}

export function ChatInput({ 
  theme, 
  onSend, 
  disabled,
  isProcessing,
  onToggleObservations,
  showObservations,
  unreadCount = 0,
  isMobileView,
  onOpenSidebar,
  onCancelChat
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachMenu]);

  const handleAttachOption = (type: 'document' | 'image' | 'camera') => {
    setShowAttachMenu(false);
    if (fileInputRef.current) {
      if (type === 'document') {
        fileInputRef.current.accept = '.pdf,.txt,.csv,.md,.json';
        fileInputRef.current.removeAttribute('capture');
      } else if (type === 'image') {
        fileInputRef.current.accept = 'image/*';
        fileInputRef.current.removeAttribute('capture');
      } else if (type === 'camera') {
        fileInputRef.current.accept = 'image/*';
        fileInputRef.current.setAttribute('capture', 'environment');
      }
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // For now, mock adding the file name to attachments
    setAttachments(prev => [...prev, `[Attached: ${file.name}]`]);
    e.target.value = ''; // Reset
  };

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
        
        {/* Hidden file input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileChange}
        />
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
              <div ref={menuRef} style={{ position: "relative" }}>
                <button
                  title="Attach file"
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  disabled={disabled}
                  style={{
                    background: showAttachMenu ? theme.surface2 : "transparent", border: "none", 
                    color: showAttachMenu ? theme.ink : theme.inkSoft, 
                    cursor: disabled ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 8, padding: 4, transition: "all 0.2s"
                  }}
                >
                  <Plus size={20} />
                </button>
                
                {/* Pop-up Menu */}
                {showAttachMenu && (
                  <div style={{
                    position: "absolute", bottom: "100%", left: 0, marginBottom: 8,
                    background: theme.surface, border: `1px solid ${theme.border}`,
                    borderRadius: 12, padding: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                    display: "flex", flexDirection: "column", gap: 2, minWidth: 160, zIndex: 50,
                    animation: "walletPageIn 150ms cubic-bezier(0.16, 1, 0.3, 1) forwards"
                  }}>
                    <button
                      onClick={() => handleAttachOption('document')}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        background: "transparent", border: "none", borderRadius: 6,
                        color: theme.ink, fontSize: 13, fontWeight: 500, cursor: "pointer",
                        transition: "background 0.2s", width: "100%", textAlign: "left"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = theme.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <FileText size={16} color={theme.inkSoft} />
                      Document
                    </button>
                    <button
                      onClick={() => handleAttachOption('image')}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        background: "transparent", border: "none", borderRadius: 6,
                        color: theme.ink, fontSize: 13, fontWeight: 500, cursor: "pointer",
                        transition: "background 0.2s", width: "100%", textAlign: "left"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = theme.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <ImageIcon size={16} color={theme.inkSoft} />
                      Library
                    </button>
                    <button
                      onClick={() => handleAttachOption('camera')}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        background: "transparent", border: "none", borderRadius: 6,
                        color: theme.ink, fontSize: 13, fontWeight: 500, cursor: "pointer",
                        transition: "background 0.2s", width: "100%", textAlign: "left"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = theme.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <Camera size={16} color={theme.inkSoft} />
                      Camera
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                title="Observations"
                onClick={onToggleObservations}
                disabled={disabled}
                style={{
                  background: showObservations ? theme.surface2 : "transparent", border: "none", 
                  color: showObservations ? theme.ink : theme.inkSoft, 
                  cursor: disabled ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 8, padding: 4, transition: "all 0.2s",
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

              <button
                onClick={() => {
                  if (isProcessing) {
                    if (onCancelChat) onCancelChat();
                  } else {
                    handleSend();
                  }
                }}
                disabled={(!isProcessing && !input.trim() && attachments.length === 0) || (disabled && !isProcessing)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "none",
                  background: isProcessing ? theme.surface2 : ((input.trim() || attachments.length > 0) && !disabled ? theme.accent : theme.surface2),
                  color: isProcessing ? theme.ink : ((input.trim() || attachments.length > 0) && !disabled ? theme.accentInk : theme.inkSoft),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isProcessing || ((input.trim() || attachments.length > 0) && !disabled) ? "pointer" : "default",
                  flexShrink: 0,
                  transform: isProcessing || ((input.trim() || attachments.length > 0) && !disabled) ? "scale(1)" : "scale(0.95)",
                  transition: "all 180ms ease",
                }}
              >
                {isProcessing ? (
                  <Square size={14} fill="currentColor" strokeWidth={0} />
                ) : (
                  <ArrowUp size={18} />
                )}
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
