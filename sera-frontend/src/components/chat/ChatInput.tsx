import React, { useRef, useState } from "react";
import { Plus, Mic, ArrowUp } from "lucide-react";
import type { ThemeType } from "../../theme";

export function ChatInput({ theme, onSend, disabled }: { theme: ThemeType, onSend: (text: string) => void, disabled?: boolean }) {
  const [input, setInput] = useState("");
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

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  return (
    <div style={{ padding: "0 0 30px", flexShrink: 0 }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        
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
          <textarea
            ref={textareaRef}
            className="chatui-textarea"
            value={input}
            onChange={autoGrow}
            onKeyDown={handleKeyDown}
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
            <div style={{ display: "flex", gap: 8, paddingLeft: 6 }}>
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
                disabled={!input.trim() || disabled}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "none",
                  background: input.trim() && !disabled ? theme.accent : theme.surface2,
                  color: input.trim() && !disabled ? theme.accentInk : theme.inkSoft,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: input.trim() && !disabled ? "pointer" : "default",
                  flexShrink: 0,
                  transform: input.trim() && !disabled ? "scale(1)" : "scale(0.95)",
                  transition: "all 180ms ease",
                }}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: theme.inkSoft, fontFamily: "Inter, sans-serif", marginTop: 14 }}>
          SERA can make mistakes. Verify important information.
        </div>
      </div>
    </div>
  );
}
