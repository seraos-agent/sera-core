import { useState, useEffect } from "react";
import { ChevronLeft as CloseIcon, ShieldCheck } from "lucide-react";
import type { ThemeType } from "../../theme";

interface ThreadsSettingsPageProps {
  theme: ThemeType;
  socket: any;
  onDisconnect: () => void;
  onBack: () => void;
  isMobileView: boolean;
}

export function ThreadsSettingsPage({ theme, socket, onDisconnect, onBack, isMobileView }: ThreadsSettingsPageProps) {
  const [settings, setSettings] = useState({
    allowPublishing: true,
    vipReplies: true,
    gatekeeper: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!socket) {
      console.log("[ThreadsSettings] No socket available yet.");
      return;
    }
    
    console.log("[ThreadsSettings] Socket available. Connected:", socket.connected);
    
    const fetchSettings = () => {
      console.log("[ThreadsSettings] Emitting 'threads:get_settings'...");
      socket.emit('threads:get_settings');
    };

    const handleSettings = (data: any) => {
      console.log("[ThreadsSettings] Received 'threads:settings':", data);
      setSettings(data);
      setLoading(false);
    };

    const handleUpdated = (data: any) => {
      console.log("[ThreadsSettings] Received 'threads:settings_updated':", data);
      setSettings(data);
      setSaving(false);
    };

    const handleError = (error: any) => {
      console.error("[ThreadsSettings] Error:", error);
      setLoading(false);
      setSaving(false);
    };

    socket.on('threads:settings', handleSettings);
    socket.on('threads:settings_updated', handleUpdated);
    socket.on('threads:error', handleError);
    socket.on('auth:error', handleError);
    socket.on('auth:success', fetchSettings);

    // Initial fetch
    fetchSettings();

    return () => {
      socket.off('threads:settings', handleSettings);
      socket.off('threads:settings_updated', handleUpdated);
      socket.off('threads:error', handleError);
      socket.off('auth:error', handleError);
      socket.off('auth:success', fetchSettings);
    };
  }, [socket]);

  const handleSave = () => {
    console.log("[ThreadsSettings] Saving settings...", settings);
    setSaving(true);
    socket.emit('threads:update_settings', settings);
  };

  const sidePad = isMobileView ? 16 : 32;

  const getToggleBg = (isActive: boolean) => isActive ? "#10b981" : "rgba(150, 150, 150, 0.25)";
  const getToggleBorder = (isActive: boolean) => isActive ? "#10b981" : "transparent";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", background: theme.bg, animation: "walletPageIn 400ms cubic-bezier(.4,0,.2,1) forwards" }}>
      {/* Header matching other pages */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobileView ? "12px 16px" : "12px 24px", borderBottom: `1px solid ${theme.border}`, background: theme.bg, flexShrink: 0, position: "sticky", top: 0, zIndex: 10 }}>
        <button
          onClick={onBack}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex", borderRadius: 6, transition: "background 0.2s" }}
          onMouseEnter={(e) => e.currentTarget.style.background = theme.surface2}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          <CloseIcon size={18} />
        </button>
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 15, color: theme.ink }}>
          Threads Settings
        </span>
      </div>

      <div style={{ padding: `${isMobileView ? 24 : 48}px ${sidePad}px`, maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        
        {loading && (
          <div style={{
            background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6",
            padding: "12px 16px", borderRadius: 8, marginBottom: 24,
            fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 12
          }}>
            <div style={{
              width: 16, height: 16, border: "2px solid #3b82f6", borderTopColor: "transparent",
              borderRadius: "50%", animation: "spin 1s linear infinite"
            }} />
            Syncing settings with Sera...
          </div>
        )}

        <div style={{
          background: theme.surface2, border: `1px solid ${theme.border}`,
          borderRadius: 20, padding: isMobileView ? 20 : 28,
          display: "flex", flexDirection: "column", gap: 24,
          boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
          opacity: loading ? 0.6 : 1,
          pointerEvents: loading ? "none" : "auto",
          transition: "opacity 0.3s ease"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: theme.ink }}>
            <ShieldCheck size={20} color={theme.accent} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Manage AI Autonomy</h2>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Option 1 */}
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", paddingBottom: 16, borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ flex: 1, paddingRight: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>Autonomous Posting</div>
                <div style={{ fontSize: 13, color: theme.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
                  Allow SERA to publish new posts and share updates on your behalf.
                </div>
              </div>
                <div style={{
                  width: 52, height: 28, borderRadius: 14,
                  background: getToggleBg(settings.allowPublishing),
                  border: `1px solid ${getToggleBorder(settings.allowPublishing)}`,
                  position: "relative", transition: "all 0.2s flex-shrink-0"
                }}>
                  <div style={{
                    position: "absolute", top: 2, left: settings.allowPublishing ? 26 : 2,
                    width: 22, height: 22, borderRadius: "50%", background: "#fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)", transition: "all 0.2s"
                  }} />
                  <input
                    type="checkbox"
                    checked={settings.allowPublishing}
                    onChange={(e) => setSettings({ ...settings, allowPublishing: e.target.checked })}
                    style={{ opacity: 0, width: "100%", height: "100%", cursor: "pointer", position: "absolute", top: 0, left: 0 }}
                  />
                </div>
              </label>

              {/* Option 2 */}
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", paddingBottom: 16, borderBottom: `1px solid ${theme.border}` }}>
                <div style={{ flex: 1, paddingRight: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>VIP Mentions & Replies</div>
                  <div style={{ fontSize: 13, color: theme.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
                    Allow SERA to automatically respond when priority users mention or reply to you.
                  </div>
                </div>
                <div style={{
                  width: 52, height: 28, borderRadius: 14,
                  background: getToggleBg(settings.vipReplies),
                  border: `1px solid ${getToggleBorder(settings.vipReplies)}`,
                  position: "relative", transition: "all 0.2s flex-shrink-0"
                }}>
                  <div style={{
                    position: "absolute", top: 2, left: settings.vipReplies ? 26 : 2,
                    width: 22, height: 22, borderRadius: "50%", background: "#fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)", transition: "all 0.2s"
                  }} />
                  <input
                    type="checkbox"
                    checked={settings.vipReplies}
                    onChange={(e) => setSettings({ ...settings, vipReplies: e.target.checked })}
                    style={{ opacity: 0, width: "100%", height: "100%", cursor: "pointer", position: "absolute", top: 0, left: 0 }}
                  />
                </div>
              </label>

              {/* Option 3 */}
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                <div style={{ flex: 1, paddingRight: 20 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>Gatekeeper Auto-Reply</div>
                  <div style={{ fontSize: 13, color: theme.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
                    Send a friendly automated reply to non-VIPs who mention you, directing them to your app.
                  </div>
                </div>
                <div style={{
                  width: 52, height: 28, borderRadius: 14,
                  background: getToggleBg(settings.gatekeeper),
                  border: `1px solid ${getToggleBorder(settings.gatekeeper)}`,
                  position: "relative", transition: "all 0.2s flex-shrink-0"
                }}>
                  <div style={{
                    position: "absolute", top: 2, left: settings.gatekeeper ? 26 : 2,
                    width: 22, height: 22, borderRadius: "50%", background: "#fff",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)", transition: "all 0.2s"
                  }} />
                  <input
                    type="checkbox"
                    checked={settings.gatekeeper}
                    onChange={(e) => setSettings({ ...settings, gatekeeper: e.target.checked })}
                    style={{ opacity: 0, width: "100%", height: "100%", cursor: "pointer", position: "absolute", top: 0, left: 0 }}
                  />
                </div>
              </label>
            </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "space-between" }}>
          <button
            onClick={() => {
              onDisconnect();
              onBack();
            }}
            style={{
              padding: "12px 20px", borderRadius: 12, border: `1px solid ${theme.border}`,
              background: theme.surface, color: "#ef4444",
              fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 120,
              transition: "background 150ms",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)"}
            onMouseLeave={e => e.currentTarget.style.background = theme.surface}
          >
            Disconnect
          </button>

          <button
            disabled={loading || saving}
            onClick={handleSave}
            style={{
              padding: "12px 32px", borderRadius: 12, border: "none",
              background: theme.ink,
              color: theme.bg,
              fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600,
              cursor: (loading || saving) ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", minWidth: 120,
              transition: "opacity 200ms ease",
              opacity: (loading || saving) ? 0.7 : 1,
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
