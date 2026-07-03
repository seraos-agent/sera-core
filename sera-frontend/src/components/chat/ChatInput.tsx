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
    <div style={{ padding: "10px 0 20px", flexShrink: 0 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 22,
            padding: "12px 12px 8px",
          }}
        >
          <textarea
            ref={textareaRef}
            className="chatui-textarea"
            value={input}
            onChange={autoGrow}
            onKeyDown={handleKeyDown}
            placeholder="Tulis pesan ke SERA..."
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
              fontSize: 14.5,
              lineHeight: 1.5,
              padding: "2px 4px 10px",
              maxHeight: 160,
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              title="Lampirkan file"
              disabled={disabled}
              style={{
                width: 30, height: 30, borderRadius: "50%", border: `1px solid ${theme.border}`,
                background: "transparent", color: theme.inkSoft, display: "flex", alignItems: "center",
                justifyContent: "center", cursor: disabled ? "default" : "pointer", flexShrink: 0, transition: "background 150ms, border-color 150ms",
              }}
            >
              <Plus size={15} />
            </button>

            <div style={{ flex: 1 }} />

            <button
              title="Masukan suara"
              disabled={disabled}
              style={{
                width: 30, height: 30, borderRadius: "50%", border: `1px solid ${theme.border}`,
                background: "transparent", color: theme.inkSoft, display: "flex", alignItems: "center",
                justifyContent: "center", cursor: disabled ? "default" : "pointer", flexShrink: 0, transition: "background 150ms, border-color 150ms",
              }}
            >
              <Mic size={14} />
            </button>

            <button
              onClick={handleSend}
              disabled={!input.trim() || disabled}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "none",
                background: input.trim() && !disabled ? theme.accent : theme.surface2,
                color: input.trim() && !disabled ? theme.accentInk : theme.inkFaint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() && !disabled ? "pointer" : "default",
                flexShrink: 0,
                transform: input.trim() && !disabled ? "scale(1)" : "scale(0.94)",
                transition: "background 180ms ease, transform 180ms cubic-bezier(.4,0,.2,1), color 180ms ease",
              }}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 11, color: theme.inkFaint, marginTop: 8 }}>
          SERA is an Operational Partner. AI can make mistakes. Check important information.
        </div>
      </div>
    </div>
  );
}
