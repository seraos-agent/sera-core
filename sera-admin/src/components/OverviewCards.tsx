import React from 'react';
import { Users, Radio, Coins, Zap, Cloud, Server } from 'lucide-react';
import { AdminOverview } from '../types';

interface OverviewCardsProps {
  overview: AdminOverview | null;
  totalCredits: number;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({ overview, totalCredits }) => {
  if (!overview) return null;

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const cards = [
    {
      title: 'TOTAL REGISTERED USERS',
      value: (overview.totalUsers ?? 0).toLocaleString(),
      subtitle: `${overview.activeSessions ?? 0} active session${overview.activeSessions === 1 ? '' : 's'}`,
      icon: Users
    },
    {
      title: 'REALTIME INSTANCES',
      value: (overview.activeSessions ?? 0).toString(),
      subtitle: 'Active socket runtimes',
      icon: Radio,
      isLive: true
    },
    {
      title: 'TOTAL COMPUTE CREDITS',
      value: totalCredits > 0 && isFinite(totalCredits) ? totalCredits.toLocaleString() : 'Pool Active',
      subtitle: 'Circulating agent compute',
      icon: Coins
    },
    {
      title: 'ACTIVE AUTOMATIONS',
      value: (overview.activeTriggers || overview.activeAutomations || 0).toString(),
      subtitle: 'Daemon crons & triggers',
      icon: Zap
    },
    {
      title: 'CLOUD INTEGRATIONS',
      value: (overview.activeCloudConnections ?? 0).toString(),
      subtitle: 'Drive, Threads, Telegram, WA',
      icon: Cloud
    },
    {
      title: 'CORE UPTIME',
      value: formatUptime(overview.uptimeSeconds || 0),
      subtitle: `Node ${overview.nodeVersion || 'v22'}`,
      icon: Server
    }
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '12px',
      marginBottom: '24px'
    }}>
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="glass-card"
            style={{
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              backgroundColor: '#131317',
              border: '1px solid #1F1F26',
              borderRadius: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.04em', color: '#71717A' }}>
                {card.title}
              </span>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: '#1A1A22',
                border: '1px solid #262630',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#A1A1AA'
              }}>
                <Icon size={14} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#F4F4F6', letterSpacing: '-0.02em' }}>
                  {card.value}
                </span>
                {card.isLive && (
                  <span className="status-indicator status-active" title="Runtime Active" />
                )}
              </div>
              <p style={{ fontSize: '0.72rem', color: '#71717A' }}>
                {card.subtitle}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
