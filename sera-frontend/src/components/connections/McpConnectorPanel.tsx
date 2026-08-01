import { useState, useEffect } from "react";
import { ChevronLeft, Copy, Key, Trash2, Check } from "lucide-react";
import type { ThemeType } from "../../theme";

interface McpConnectorPanelProps {
  theme: ThemeType;
  onBack: () => void;
  isMobileView?: boolean;
  socket: any;
}

export function McpConnectorPanel({ theme, onBack, isMobileView, socket }: McpConnectorPanelProps) {
  const [keys, setKeys] = useState<Array<{ key: string; masked: string }>>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.emit("mcp:list_keys");

    const onKeysList = (data: Array<{ key: string; masked: string }>) => setKeys(data);
    const onKeyGenerated = (data: { key: string }) => setNewKey(data.key);

    socket.on("mcp:keys_list", onKeysList);
    socket.on("mcp:key_generated", onKeyGenerated);

    return () => {
      socket.off("mcp:keys_list", onKeysList);
      socket.off("mcp:key_generated", onKeyGenerated);
    };
  }, [socket]);

  const handleGenerate = () => socket?.emit("mcp:generate_key");
  const handleRevoke = (key: string) => socket?.emit("mcp:revoke_key", { key });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const claudeConfig = `{
  "mcpServers": {
    "sera": {
      "command": "node",
      "args": ["path/to/sera-mcp-stdio.js"],
      "env": {
        "SERA_API_KEY": "${newKey || "sk-sera-YOUR_KEY_HERE"}",
        "SERA_CORE_URL": "http://127.0.0.1:3001"
      }
    }
  }
}`;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: theme.bg, animation: "walletPageIn 400ms cubic-bezier(.4,0,.2,1) forwards", minWidth: 0, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobileView ? "12px 16px" : "12px 24px", borderBottom: "none", background: theme.bg, flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex", borderRadius: 6, transition: "background 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = theme.surface2)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 15, color: theme.ink }}>
          Claude / ChatGPT Connector
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: isMobileView ? 24 : 48 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {/* Intro */}
          <div style={{ fontSize: 14, color: theme.inkSoft, lineHeight: 1.6, marginBottom: 28 }}>
            Connect Sera to <strong style={{ color: theme.ink }}>Claude Desktop</strong>, <strong style={{ color: theme.ink }}>ChatGPT</strong>, or any
            MCP-compatible platform. Generate an API key below, then add it to your platform's MCP configuration.
          </div>

          {/* Generate Key */}
          <div style={{
            background: `linear-gradient(135deg, ${theme.accentSoft}, ${theme.surface2})`,
            border: `1px solid ${theme.border}`, borderRadius: 20,
            padding: 24, marginBottom: 24,
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: theme.ink, marginBottom: 4, fontFamily: "Inter, sans-serif" }}>
                API Keys
              </div>
              <div style={{ fontSize: 13, color: theme.inkSoft }}>
                {keys.length === 0 ? "No keys yet. Generate one to get started." : `${keys.length} active key${keys.length > 1 ? "s" : ""}`}
              </div>
            </div>
            <button
              onClick={handleGenerate}
              style={{
                background: theme.accent, color: "#fff",
                border: "none", padding: "10px 20px", borderRadius: 12,
                fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
                transition: "opacity 0.2s"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <Key size={16} /> Generate Key
            </button>
          </div>

          {/* Newly generated key (shown once, with copy button) */}
          {newKey && (
            <div style={{
              background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: 16, padding: 20, marginBottom: 24
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#10b981", marginBottom: 8 }}>
                ✅ New API Key Generated
              </div>
              <div style={{ fontSize: 12, color: theme.inkSoft, marginBottom: 12 }}>
                Copy this key now — it will only be shown in full once.
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: theme.surface, borderRadius: 10, padding: "10px 14px",
                border: `1px solid ${theme.border}`, fontFamily: "monospace", fontSize: 13, color: theme.ink,
                wordBreak: "break-all"
              }}>
                <span style={{ flex: 1 }}>{newKey}</span>
                <button
                  onClick={() => handleCopy(newKey, "newKey")}
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    color: copied === "newKey" ? "#10b981" : theme.inkSoft, padding: 4,
                    flexShrink: 0
                  }}
                >
                  {copied === "newKey" ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Existing keys list */}
          {keys.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
              {keys.map((k) => (
                <div key={k.key} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: theme.surface2, border: `1px solid ${theme.border}`,
                  borderRadius: 12, padding: "12px 16px"
                }}>
                  <div style={{ fontFamily: "monospace", fontSize: 13, color: theme.ink }}>{k.masked}</div>
                  <button
                    onClick={() => handleRevoke(k.key)}
                    style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      color: "#ef4444", padding: 4, display: "flex"
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Claude Desktop Config */}
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 600, color: theme.ink, marginBottom: 12 }}>
            Claude Desktop Configuration
          </div>
          <div style={{ fontSize: 13, color: theme.inkSoft, marginBottom: 12 }}>
            Add this to your Claude Desktop <code style={{ background: theme.surface, padding: "2px 6px", borderRadius: 4 }}>mcp.json</code> file:
          </div>
          <div style={{
            position: "relative", background: theme.surface,
            border: `1px solid ${theme.border}`, borderRadius: 14,
            padding: 16, marginBottom: 28, overflowX: "auto"
          }}>
            <pre style={{
              margin: 0, fontFamily: "monospace", fontSize: 12,
              color: theme.ink, lineHeight: 1.6, whiteSpace: "pre-wrap"
            }}>
              {claudeConfig}
            </pre>
            <button
              onClick={() => handleCopy(claudeConfig, "config")}
              style={{
                position: "absolute", top: 12, right: 12,
                background: theme.surface2, border: `1px solid ${theme.border}`,
                borderRadius: 8, padding: "6px 10px", cursor: "pointer",
                color: copied === "config" ? "#10b981" : theme.inkSoft,
                display: "flex", alignItems: "center", gap: 4, fontSize: 12
              }}
            >
              {copied === "config" ? <Check size={14} /> : <Copy size={14} />}
              {copied === "config" ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Available Tools */}
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 600, color: theme.ink, marginBottom: 12 }}>
            Available Tools
          </div>
          <div style={{ fontSize: 13, color: theme.inkSoft, marginBottom: 16 }}>
            Once connected, Claude / ChatGPT can invoke these Sera tools:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { name: "sera_chat", desc: "Send messages to your Sera agent" },
              { name: "sera_wallet_balance", desc: "Check wallet balance" },
              { name: "sera_wallet_transfer", desc: "Propose a transfer (requires approval)" },
              { name: "sera_memory_read", desc: "Read Sera's working memory" },
              { name: "sera_billing_status", desc: "Check Agent Credits balance" },
            ].map((tool) => (
              <div key={tool.name} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: theme.surface2, border: `1px solid ${theme.border}`,
                borderRadius: 12, padding: "12px 16px"
              }}>
                <code style={{
                  fontSize: 12, fontFamily: "monospace", color: theme.accent,
                  background: theme.surface, padding: "4px 8px", borderRadius: 6,
                  flexShrink: 0
                }}>
                  {tool.name}
                </code>
                <span style={{ fontSize: 13, color: theme.inkSoft }}>{tool.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
