import React, { useState, useEffect } from 'react';
import { Zap, Trash2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { GlobalTrigger } from '../types';
import { fetchGlobalTriggers, cancelUserTrigger } from '../api';

export const AutomationsMonitor: React.FC = () => {
  const [triggers, setTriggers] = useState<GlobalTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadTriggers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchGlobalTriggers();
      setTriggers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch global triggers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTriggers();
  }, []);

  const handleCancel = async (sessionId: string, triggerId: string) => {
    if (!confirm(`Cancel trigger ${triggerId} for session ${sessionId}?`)) return;
    try {
      setCancellingId(triggerId);
      await cancelUserTrigger(sessionId, triggerId);
      await loadTriggers();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel trigger');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '20px 24px', backgroundColor: '#111115', border: '1px solid #1E1E26' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={16} style={{ color: '#A1A1AA' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#F4F4F6' }}>
              Daemon Automations & Triggers
            </h2>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#71717A', marginTop: '2px' }}>
            Active cron schedules, temporal monitors, and event conditions across all agent runtimes.
          </p>
        </div>

        <button
          onClick={loadTriggers}
          style={{
            padding: '6px 12px',
            backgroundColor: '#181822',
            border: '1px solid #282834',
            borderRadius: '6px',
            color: '#D4D4D8',
            fontSize: '0.75rem',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          borderRadius: '6px',
          backgroundColor: '#1E1416',
          border: '1px solid #382024',
          color: '#F87171',
          fontSize: '0.78rem',
          marginBottom: '16px'
        }}>
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', color: '#71717A', gap: '8px' }}>
          <Loader2 size={18} className="animate-spin" />
          <span style={{ fontSize: '0.82rem' }}>Querying triggers...</span>
        </div>
      ) : triggers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#71717A' }}>
          <Clock size={28} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
          <p style={{ fontSize: '0.82rem', fontWeight: 500, color: '#A1A1AA' }}>No background automations currently running.</p>
          <p style={{ fontSize: '0.72rem', marginTop: '3px' }}>Triggers scheduled by users will appear here.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1E1E26', color: '#71717A', fontSize: '0.7rem' }}>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>TRIGGER ID</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>SESSION</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>TYPE</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>CONDITION</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>TASK / ACTION</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {triggers.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #16161C' }}>
                  <td style={{ padding: '12px' }}>
                    <span className="font-mono" style={{ color: '#E4E4E7', fontWeight: 500 }}>
                      {t.id}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span className="font-mono" style={{ color: '#A1A1AA' }}>
                      {t.sessionId}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 500,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#181822',
                      color: '#A1A1AA',
                      border: '1px solid #242430'
                    }}>
                      {t.type || 'CRON'}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span className="font-mono" style={{ fontSize: '0.75rem', color: '#D4D4D8' }}>
                      {typeof t.condition === 'string' ? t.condition : JSON.stringify(t.condition || '')}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#8E8E98' }}>
                      {t.prompt || t.task || 'System trigger'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleCancel(t.sessionId, t.id)}
                      disabled={cancellingId === t.id}
                      title="Terminate Trigger"
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: '#1E1416',
                        color: '#F87171',
                        border: '1px solid #341E22',
                        fontSize: '0.7rem',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
