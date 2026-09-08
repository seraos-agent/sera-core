import React from 'react';
import { Server, Cpu, Database, CheckCircle2, ShieldCheck, Terminal } from 'lucide-react';
import { AdminOverview } from '../types';

interface SystemHealthProps {
  overview: AdminOverview | null;
}

export const SystemHealth: React.FC<SystemHealthProps> = ({ overview }) => {
  if (!overview) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-panel" style={{ padding: '20px 24px', backgroundColor: '#111115', border: '1px solid #1E1E26' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Server size={16} style={{ color: '#A1A1AA' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#F4F4F6' }}>
            Runtime Infrastructure & Health
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: '#0D0D11', border: '1px solid #1C1C24' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <CheckCircle2 size={14} style={{ color: '#10B981' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#71717A' }}>Container Host</span>
            </div>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#F4F4F6' }}>Asia Southeast 1 (Jakarta)</p>
            <p style={{ fontSize: '0.7rem', color: '#71717A', marginTop: '2px' }}>Cloud Run Managed Service</p>
          </div>

          <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: '#0D0D11', border: '1px solid #1C1C24' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Cpu size={14} style={{ color: '#A1A1AA' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#71717A' }}>Node Engine</span>
            </div>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#F4F4F6' }}>{overview.nodeVersion || 'v22'}</p>
            <p style={{ fontSize: '0.7rem', color: '#71717A', marginTop: '2px' }}>Linux x86_64 Actor Model</p>
          </div>

          <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: '#0D0D11', border: '1px solid #1C1C24' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Database size={14} style={{ color: '#A1A1AA' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#71717A' }}>Vault & DB</span>
            </div>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#F4F4F6' }}>Supabase Postgres</p>
            <p style={{ fontSize: '0.7rem', color: '#71717A', marginTop: '2px' }}>RLS & Encrypted Vault</p>
          </div>

          <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: '#0D0D11', border: '1px solid #1C1C24' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <ShieldCheck size={14} style={{ color: '#A1A1AA' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#71717A' }}>Auth Guard</span>
            </div>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#F4F4F6' }}>Dual-Layer Security</p>
            <p style={{ fontSize: '0.7rem', color: '#71717A', marginTop: '2px' }}>Supabase JWT + Master Key</p>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '20px 24px', backgroundColor: '#111115', border: '1px solid #1E1E26' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
          <Terminal size={15} style={{ color: '#71717A' }} />
          <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#F4F4F6' }}>
            Environment Telemetry
          </h3>
        </div>

        <pre style={{
          backgroundColor: '#09090C',
          border: '1px solid #1C1C24',
          borderRadius: '8px',
          padding: '14px',
          color: '#D4D4D8',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.75rem',
          overflowX: 'auto',
          lineHeight: '1.5'
        }}>
{JSON.stringify({
  service: 'SERA-CORE Runtime',
  domain: 'api.seraos.xyz',
  uptimeSeconds: overview.uptimeSeconds,
  timestamp: new Date(overview.serverTimestamp).toISOString(),
  activeInstancesCount: overview.activeSessions,
  totalUsersRegistered: overview.totalUsers,
  activeAutomations: overview.activeAutomations || overview.activeTriggers,
  cloudIntegrationsCount: overview.activeCloudConnections,
  adminContext: overview.adminUser
}, null, 2)}
        </pre>
      </div>
    </div>
  );
};
