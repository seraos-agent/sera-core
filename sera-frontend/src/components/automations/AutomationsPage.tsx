import { useEffect, useState } from "react";
import { Clock, Play, Pause, Activity, Zap, ArrowLeft } from "lucide-react";
import type { ThemeType } from "../../theme";
import { Socket } from "socket.io-client";

interface AutomationsPageProps {
  theme: ThemeType;
  socket: Socket | null;
  onBack: () => void;
}

export function AutomationsPage({ theme, socket, onBack }: AutomationsPageProps) {
  const [triggers, setTriggers] = useState<any[]>([]);

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

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {triggers.length === 0 ? (
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
              <div style={{ fontSize: 15, fontWeight: 500, color: theme.ink, marginBottom: 4 }}>Nothing is running yet</div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                SERA is not managing any ongoing tasks right now. Start a conversation to give SERA an instruction.
              </div>
            </div>
          </div>
        ) : (
          triggers.map(t => (
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
                    {t.type === 'TEMPORAL' ? <Clock size={20} color={theme.accent} /> : <Zap size={20} color={theme.accent} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: theme.ink, marginBottom: 2 }}>{t.intent.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 13, color: theme.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{t.id}</span>
                      <span style={{ color: theme.border }}>•</span>
                      <span>{t.type === 'TEMPORAL' && t.cronExpression ? t.cronExpression : 'Interval-based'}</span>
                    </div>
                  </div>
                </div>
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
              </div>

              {t.parameters && Object.keys(t.parameters).length > 0 && (
                <div style={{ 
                  background: theme.isDark ? "rgba(0,0,0,0.2)" : theme.bg, 
                  padding: 12, borderRadius: 8, fontSize: 13, color: theme.inkSoft,
                  fontFamily: "monospace"
                }}>
                  {JSON.stringify(t.parameters, null, 2)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
