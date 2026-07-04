import { useEffect, useState } from "react";
import { Clock, Play, Pause, Activity, Zap, ArrowLeft, Trash2 } from "lucide-react";
import type { ThemeType } from "../../theme";
import { Socket } from "socket.io-client";

interface AutomationsPageProps {
  theme: ThemeType;
  socket: Socket | null;
  onBack: () => void;
}

export function AutomationsPage({ theme, socket, onBack }: AutomationsPageProps) {
  const [triggers, setTriggers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');

  useEffect(() => {
    if (!socket) return;
    
    const handleUpdate = (data: any[]) => {
      setTriggers(data);
    };

    socket.on('automations:update', handleUpdate);
    socket.emit('automations:fetch');

    return () => {
      socket.off('automations:update', handleUpdate);
    };
  }, [socket]);

  return (
    <div style={{ flex: 1, padding: "32px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button 
            onClick={onBack}
            style={{
              background: "transparent", border: "none", cursor: "pointer", 
              display: "flex", alignItems: "center", justifyContent: "center",
              color: theme.inkSoft, padding: 8, borderRadius: 8, transition: "background 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = theme.surface2}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: theme.ink, fontFamily: "Inter, sans-serif", letterSpacing: "-0.5px" }}>Active Intent Stream</h1>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
              Ongoing automations and decisions SERA is currently managing for you.
            </p>
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          background: theme.surface2, color: theme.ink,
          border: `1px solid ${theme.border}`, padding: "0 10px", height: 26, borderRadius: 13,
          fontSize: 13, fontWeight: 600, fontFamily: "Inter, sans-serif"
        }}>
          {triggers.length}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <button 
          onClick={() => setActiveTab('ACTIVE')}
          style={{
            padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13,
            background: activeTab === 'ACTIVE' ? theme.ink : theme.surface2,
            color: activeTab === 'ACTIVE' ? theme.surface : theme.inkSoft,
            transition: 'all 0.2s'
          }}>
          Active ({triggers.filter(t => t.state === 'ACTIVE').length})
        </button>
        <button 
          onClick={() => setActiveTab('COMPLETED')}
          style={{
            padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontWeight: 600, fontSize: 13,
            background: activeTab === 'COMPLETED' ? theme.ink : theme.surface2,
            color: activeTab === 'COMPLETED' ? theme.surface : theme.inkSoft,
            transition: 'all 0.2s'
          }}>
          Completed ({triggers.filter(t => t.state !== 'ACTIVE').length})
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {(activeTab === 'ACTIVE' ? triggers.filter(t => t.state === 'ACTIVE') : triggers.filter(t => t.state !== 'ACTIVE')).length === 0 ? (
          <div style={{ 
            padding: "48px 40px", textAlign: "center", border: `1px dashed ${theme.border}`, 
            borderRadius: 16, color: theme.inkFaint, fontFamily: "Inter, sans-serif",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16
          }}>
            <div style={{ 
              width: 56, height: 56, borderRadius: 28, background: theme.surface2, 
              display: "flex", alignItems: "center", justifyContent: "center" 
            }}>
              <Activity size={28} opacity={0.6} />
            </div>
            <div style={{ maxWidth: 280 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: theme.ink, marginBottom: 4 }}>
                {activeTab === 'ACTIVE' ? "Nothing is running yet" : "No completed tasks"}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                {activeTab === 'ACTIVE' 
                  ? "SERA is not managing any ongoing tasks right now. Start a conversation to give SERA an instruction." 
                  : "You don't have any completed automations yet."}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: activeTab === 'COMPLETED' ? 0.7 : 1 }}>
            {(activeTab === 'ACTIVE' ? triggers.filter(t => t.state === 'ACTIVE') : triggers.filter(t => t.state !== 'ACTIVE')).map(t => renderTriggerCard(t, theme, socket))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper to render a trigger card ──────────────────────────────────────────
function renderTriggerCard(t: any, theme: any, socket: Socket | null) {
  const rawIntent = t.action?.type || "UNKNOWN_ACTION";
  const isTransfer = rawIntent === 'TRANSFER_FUNDS';
  let title = rawIntent.replace(/_/g, ' ');
  if (isTransfer) title = "Scheduled Transfer";

  const scheduleStr = t.condition?.humanIntent || t.condition?.internalCompiled || "Event-based";
  const p = t.action?.payload || {};

  return (
    <div key={t.id} style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      padding: 20,
      display: "flex",
      flexDirection: "column",
      gap: 16,
      boxShadow: theme.isDark ? "0 4px 12px rgba(0,0,0,0.2)" : "0 2px 8px rgba(0,0,0,0.02)",
      fontFamily: "Inter, sans-serif"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: theme.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {t.type === 'TIME' ? <Clock size={20} color={theme.accent} /> : <Zap size={20} color={theme.accent} />}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, marginBottom: 2 }}>{title}</div>
            <div style={{ fontSize: 13, color: theme.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{t.id}</span>
              <span style={{ color: theme.border }}>•</span>
              <span>{scheduleStr}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            background: t.state === 'ACTIVE' ? theme.statusSoft : theme.surface2,
            color: t.state === 'ACTIVE' ? theme.status : theme.inkSoft,
            padding: "4px 10px",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 4
          }}>
            {t.state === 'ACTIVE' ? <Play size={12} /> : <Pause size={12} />}
            {t.state}
          </div>
          <button 
            onClick={() => {
              if (window.confirm("Are you sure you want to delete this automation?")) {
                socket?.emit('automations:delete', t.id);
              }
            }}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 6,
              borderRadius: 6,
              color: theme.inkFaint,
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme.surface2;
              e.currentTarget.style.color = "#ff4444";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = theme.inkFaint;
            }}
            title="Delete this trigger"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</span>
          <span style={{ fontSize: 14, color: theme.ink }}>
            {isTransfer ? 'Transfer assets from SERA Vault' : title}
          </span>
        </div>

        {isTransfer && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recipient</span>
              <span style={{ fontSize: 14, color: p.recipient ? theme.ink : theme.status, fontWeight: p.recipient ? 400 : 500 }}>
                {p.recipient || 'Not set yet ⚠️'}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</span>
              <span style={{ fontSize: 14, color: p.amount ? theme.ink : theme.status, fontWeight: p.amount ? 400 : 500 }}>
                {p.amount ? `${p.amount} ${p.asset?.toUpperCase() || 'USDC'}` : 'Not set yet ⚠️'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
