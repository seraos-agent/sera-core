import { useState, useEffect } from "react";
import { ChevronLeft, Copy, Key, Trash2, Check, Globe, Laptop, Sparkles } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<"oauth" | "desktop">("oauth");

  const coreUrl = import.meta.env.VITE_API_URL || "https://sera-core-212723620663.asia-southeast1.run.app";
  const sseUrl = `${coreUrl}/mcp/sse`;
  const oauthDiscoveryUrl = `${coreUrl}/.well-known/oauth-authorization-server`;

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

  const claudeDesktopConfig = `{
  "mcpServers": {
    "sera": {
      "command": "npx",
      "args": ["-y", "sera-mcp-stdio"],
      "env": {
        "SERA_API_KEY": "${newKey || (keys[0]?.key ?? "sk-sera-YOUR_API_KEY")}",
        "SERA_API_URL": "${coreUrl}"
      }
    }
  }
}`;

  const toolsList = [
    { name: "sera_chat", desc: "Interactive conversational reasoning & agent delegation" },
    { name: "sera_wallet_balance", desc: "Check Base network Agent Vault on-chain balance" },
    { name: "sera_wallet_transfer", desc: "Propose on-chain token transfers (ETH/USDC)" },
    { name: "sera_spot_market_data", desc: "Real-time Hyperliquid L1 orderbook & prices" },
    { name: "sera_spot_trade", desc: "Propose Hyperliquid spot buy/sell orders" },
    { name: "sera_schedule_create", desc: "Create 24/7 background automation cron tasks" },
    { name: "sera_threads_publish", desc: "Publish posts directly to Meta Threads" },
    { name: "sera_memory_read", desc: "Read persistent working memory & confirmed beliefs" },
    { name: "sera_memory_write", desc: "Store new user preferences into persistent memory" },
    { name: "sera_billing_status", desc: "Check Agent Energy Credits balance & status" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: theme.bg, animation: "walletPageIn 400ms cubic-bezier(.4,0,.2,1) forwards", minWidth: 0, minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobileView ? "12px 16px" : "12px 24px", borderBottom: `1px solid ${theme.border}`, background: theme.bg, flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex", borderRadius: 6, transition: "background 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = theme.surface2)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 15, color: theme.ink }}>
          Platform Connectors (Claude & ChatGPT)
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: isMobileView ? "20px 16px" : "36px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
          
          {/* Main Card Banner */}
          <div style={{
            background: theme.surface2,
            border: `1px solid ${theme.border}`,
            borderRadius: 20,
            padding: isMobileView ? 20 : 28,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            boxShadow: "0 4px 20px rgba(0,0,0,0.03)"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: theme.surface, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={22} color={theme.accent} />
                </div>
                <div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 600, color: theme.ink }}>
                    Model Context Protocol (MCP)
                  </div>
                  <div style={{ fontSize: 13, color: theme.inkSoft, marginTop: 2 }}>
                    Connect Claude & ChatGPT to SERA's Web3 Vault, Hyperliquid L1, and 24/7 Daemons.
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
                background: "rgba(16, 185, 129, 0.1)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.2)"
              }}>
                READY
              </span>
            </div>

            {/* Mode Selector Tabs */}
            <div style={{ display: "flex", gap: 8, marginTop: 8, background: theme.surface, padding: 4, borderRadius: 12, border: `1px solid ${theme.border}` }}>
              <button
                onClick={() => setActiveTab("oauth")}
                style={{
                  flex: 1, padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: activeTab === "oauth" ? theme.surface2 : "transparent",
                  color: activeTab === "oauth" ? theme.ink : theme.inkSoft,
                  boxShadow: activeTab === "oauth" ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.2s"
                }}
              >
                <Globe size={15} /> Claude Web / ChatGPT (OAuth 2.0)
              </button>
              <button
                onClick={() => setActiveTab("desktop")}
                style={{
                  flex: 1, padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: activeTab === "desktop" ? theme.surface2 : "transparent",
                  color: activeTab === "desktop" ? theme.ink : theme.inkSoft,
                  boxShadow: activeTab === "desktop" ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.2s"
                }}
              >
                <Laptop size={15} /> Claude Desktop (Local Stdio)
              </button>
            </div>
          </div>

          {/* Tab 1: OAuth 2.0 Connection */}
          {activeTab === "oauth" && (
            <div style={{
              background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: 20,
              padding: isMobileView ? 20 : 28, display: "flex", flexDirection: "column", gap: 20
            }}>
              <div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: theme.ink, marginBottom: 4 }}>
                  OAuth 2.0 Dynamic Client Discovery
                </div>
                <div style={{ fontSize: 13, color: theme.inkSoft, lineHeight: 1.5 }}>
                  Anthropic Claude and ChatGPT automatically register via RFC 7591. Paste these endpoints into your platform:
                </div>
              </div>

              {/* Endpoint 1: Discovery URL */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, marginBottom: 6 }}>
                  OAuth Discovery Metadata URL (RFC 8414):
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, background: theme.surface,
                  border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 14px"
                }}>
                  <code style={{ flex: 1, fontSize: 12, fontFamily: "monospace", color: theme.ink, wordBreak: "break-all" }}>
                    {oauthDiscoveryUrl}
                  </code>
                  <button
                    onClick={() => handleCopy(oauthDiscoveryUrl, "oauthDiscovery")}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: copied === "oauthDiscovery" ? "#10b981" : theme.inkSoft, padding: 4 }}
                  >
                    {copied === "oauthDiscovery" ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {/* Endpoint 2: SSE URL */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, marginBottom: 6 }}>
                  MCP Server SSE Transport Endpoint:
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, background: theme.surface,
                  border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 14px"
                }}>
                  <code style={{ flex: 1, fontSize: 12, fontFamily: "monospace", color: theme.ink, wordBreak: "break-all" }}>
                    {sseUrl}
                  </code>
                  <button
                    onClick={() => handleCopy(sseUrl, "sseEndpoint")}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: copied === "sseEndpoint" ? "#10b981" : theme.inkSoft, padding: 4 }}
                  >
                    {copied === "sseEndpoint" ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Desktop / API Key Connection */}
          {activeTab === "desktop" && (
            <div style={{
              background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: 20,
              padding: isMobileView ? 20 : 28, display: "flex", flexDirection: "column", gap: 24
            }}>
              {/* API Key Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: theme.ink, marginBottom: 4 }}>
                    Personal API Keys
                  </div>
                  <div style={{ fontSize: 13, color: theme.inkSoft }}>
                    {keys.length === 0 ? "No active keys generated yet." : `${keys.length} active key${keys.length > 1 ? "s" : ""}`}
                  </div>
                </div>
                <button
                  onClick={handleGenerate}
                  style={{
                    background: theme.ink, color: theme.bg, border: "none",
                    padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                    transition: "opacity 0.2s"
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  <Key size={14} /> Generate Key
                </button>
              </div>

              {/* Newly generated key */}
              {newKey && (
                <div style={{
                  background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: 14, padding: 16
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#10b981", marginBottom: 6 }}>
                    New API Key Generated
                  </div>
                  <div style={{ fontSize: 12, color: theme.inkSoft, marginBottom: 10 }}>
                    Copy this key now. It is shown only once for security:
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, background: theme.surface,
                    borderRadius: 10, padding: "8px 12px", border: `1px solid ${theme.border}`
                  }}>
                    <code style={{ flex: 1, fontFamily: "monospace", fontSize: 12, color: theme.ink, wordBreak: "break-all" }}>
                      {newKey}
                    </code>
                    <button
                      onClick={() => handleCopy(newKey, "newKey")}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: copied === "newKey" ? "#10b981" : theme.inkSoft, padding: 4 }}
                    >
                      {copied === "newKey" ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Keys list */}
              {keys.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {keys.map((k) => (
                    <div key={k.key} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: theme.surface, border: `1px solid ${theme.border}`,
                      borderRadius: 10, padding: "10px 14px"
                    }}>
                      <div style={{ fontFamily: "monospace", fontSize: 13, color: theme.ink }}>{k.masked}</div>
                      <button
                        onClick={() => handleRevoke(k.key)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", padding: 4 }}
                        title="Revoke key"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* JSON Snippet */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.ink, marginBottom: 6 }}>
                  Claude Desktop Configuration (<code style={{ fontSize: 12 }}>claude_desktop_config.json</code>)
                </div>
                <div style={{ position: "relative", background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14 }}>
                  <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 12, color: theme.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {claudeDesktopConfig}
                  </pre>
                  <button
                    onClick={() => handleCopy(claudeDesktopConfig, "config")}
                    style={{
                      position: "absolute", top: 10, right: 10, background: theme.surface2,
                      border: `1px solid ${theme.border}`, borderRadius: 8, padding: "4px 8px",
                      cursor: "pointer", color: copied === "config" ? "#10b981" : theme.inkSoft,
                      display: "flex", alignItems: "center", gap: 4, fontSize: 11
                    }}
                  >
                    {copied === "config" ? <Check size={13} /> : <Copy size={13} />}
                    {copied === "config" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Capabilities Showcase */}
          <div style={{
            background: theme.surface2, border: `1px solid ${theme.border}`, borderRadius: 20,
            padding: isMobileView ? 20 : 28
          }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: theme.ink, marginBottom: 4 }}>
              Available MCP Tool Capabilities ({toolsList.length})
            </div>
            <div style={{ fontSize: 13, color: theme.inkSoft, marginBottom: 18 }}>
              Claude & ChatGPT can invoke these tools in real-time when connected:
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobileView ? "1fr" : "repeat(2, 1fr)", gap: 10 }}>
              {toolsList.map((tool) => (
                <div key={tool.name} style={{
                  display: "flex", flexDirection: "column", gap: 4, background: theme.surface,
                  border: `1px solid ${theme.border}`, borderRadius: 12, padding: "12px 14px"
                }}>
                  <code style={{ fontSize: 12, fontFamily: "monospace", color: theme.accent, fontWeight: 600 }}>
                    {tool.name}
                  </code>
                  <span style={{ fontSize: 12, color: theme.inkSoft, lineHeight: 1.4 }}>{tool.desc}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
