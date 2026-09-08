import React, { useState } from 'react';
import {
  Search,
  Filter,
  Copy,
  Check,
  ChevronRight,
  HardDrive,
  MessageCircle,
  Wallet,
  AtSign,
  Bot,
  Layers
} from 'lucide-react';
import { UserSummary } from '../types';

interface UserTableProps {
  users: UserSummary[];
  onSelectUser: (user: UserSummary) => void;
}

export const UserTable: React.FC<UserTableProps> = ({ users, onSelectUser }) => {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DORMANT'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filteredUsers = (users || []).filter((u) => {
    const id = u.id || '';
    const wallet = u.walletAddress || '';
    const matchesSearch =
      id.toLowerCase().includes(search.toLowerCase()) ||
      wallet.toLowerCase().includes(search.toLowerCase());

    const matchesTier = tierFilter === 'ALL' || u.subscriptionTier === tierFilter;

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && u.isInstanceActive) ||
      (statusFilter === 'DORMANT' && !u.isInstanceActive);

    return matchesSearch && matchesTier && matchesStatus;
  });

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'UNLIMITED':
        return {
          bg: '#1C1917',
          border: '#382E1E',
          color: '#FBBF24',
          label: 'UNLIMITED'
        };
      case 'PRO':
        return {
          bg: '#16181D',
          border: '#2A303C',
          color: '#E2E8F0',
          label: 'PRO'
        };
      case 'STARTER':
        return {
          bg: '#141418',
          border: '#262630',
          color: '#A1A1AA',
          label: 'STARTER'
        };
      default:
        return {
          bg: '#111114',
          border: '#1F1F26',
          color: '#71717A',
          label: 'FREE'
        };
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '20px 24px', backgroundColor: '#111115', border: '1px solid #1E1E26' }}>
      {/* Table Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '18px'
      }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#F4F4F6' }}>
            User Accounts & Subscriptions
          </h2>
          <p style={{ fontSize: '0.75rem', color: '#71717A', marginTop: '2px' }}>
            Showing {filteredUsers.length} of {users.length} registered accounts
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#71717A' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search session ID or wallet..."
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                backgroundColor: '#0A0A0E',
                border: '1px solid #202028',
                borderRadius: '6px',
                fontSize: '0.8rem',
                color: '#F4F4F6',
                outline: 'none'
              }}
            />
          </div>

          {/* Tier Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={13} style={{ color: '#71717A' }} />
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              style={{
                backgroundColor: '#0A0A0E',
                border: '1px solid #202028',
                borderRadius: '6px',
                padding: '7px 10px',
                fontSize: '0.8rem',
                color: '#D4D4D8',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Tiers</option>
              <option value="FREE">Free</option>
              <option value="STARTER">Starter</option>
              <option value="PRO">Pro</option>
              <option value="UNLIMITED">Unlimited</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              backgroundColor: '#0A0A0E',
              border: '1px solid #202028',
              borderRadius: '6px',
              padding: '7px 10px',
              fontSize: '0.8rem',
              color: '#D4D4D8',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">All States</option>
            <option value="ACTIVE">Active</option>
            <option value="DORMANT">Dormant</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1E1E26', color: '#71717A', fontSize: '0.7rem', letterSpacing: '0.03em' }}>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>SESSION ID</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>WALLET</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>STATUS</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>TIER</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>CREDITS</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>INTEGRATIONS</th>
              <th style={{ padding: '10px 12px', fontWeight: 600 }}>TRIGGERS</th>
              <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#71717A' }}>
                  No accounts found matching current filters.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const tierInfo = getTierBadge(user.subscriptionTier || 'FREE');
                const isCopied = copiedId === user.id;

                return (
                  <tr
                    key={user.id}
                    onClick={() => onSelectUser(user)}
                    style={{
                      borderBottom: '1px solid #16161C',
                      transition: 'background-color 0.12s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#15151A'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    {/* User ID */}
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '5px',
                          backgroundColor: '#1C1C24',
                          border: '1px solid #262630',
                          color: '#A1A1AA',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.68rem',
                          fontWeight: 600
                        }}>
                          {(user.id || 'U').slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span className="font-mono" style={{ fontWeight: 500, color: '#E4E4E7' }}>
                            {user.id}
                          </span>
                          <button
                            onClick={(e) => handleCopy(user.id, e)}
                            title="Copy ID"
                            style={{ color: '#71717A', display: 'flex', alignItems: 'center' }}
                          >
                            {isCopied ? <Check size={11} style={{ color: '#10B981' }} /> : <Copy size={11} />}
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Wallet Address & Agent Vault */}
                    <td style={{ padding: '12px' }}>
                      {user.walletAddress ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span className="font-mono" style={{ color: '#E4E4E7', fontSize: '0.75rem' }}>
                              {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
                            </span>
                          </div>
                          {user.agentVaultAddress && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                              <span style={{ fontSize: '0.62rem', color: '#71717A', textTransform: 'uppercase' }}>Vault:</span>
                              <span className="font-mono" style={{ color: '#A1A1AA', fontSize: '0.7rem' }}>
                                {user.agentVaultAddress.slice(0, 6)}...{user.agentVaultAddress.slice(-4)}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : user.agentVaultAddress ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '0.62rem', color: '#71717A', textTransform: 'uppercase' }}>Vault:</span>
                          <span className="font-mono" style={{ color: '#A1A1AA', fontSize: '0.75rem' }}>
                            {user.agentVaultAddress.slice(0, 6)}...{user.agentVaultAddress.slice(-4)}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#4B4B55', fontSize: '0.75rem' }}>—</span>
                      )}
                    </td>

                    {/* Runtime Status */}
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`status-indicator ${user.isInstanceActive ? 'status-active' : 'status-dormant'}`} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 500, color: user.isInstanceActive ? '#D4D4D8' : '#71717A' }}>
                          {user.isInstanceActive ? 'Active' : 'Dormant'}
                        </span>
                      </div>
                    </td>

                    {/* Tier Badge */}
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        backgroundColor: tierInfo.bg,
                        border: `1px solid ${tierInfo.border}`,
                        color: tierInfo.color
                      }}>
                        {tierInfo.label}
                      </span>
                    </td>

                    {/* Compute Credits */}
                    <td style={{ padding: '12px' }}>
                      <span className="font-mono" style={{ fontWeight: 500, color: '#E4E4E7' }}>
                        {(user.agentCredits ?? 0).toLocaleString()}
                      </span>
                    </td>

                    {/* Integrations Badges (Clean neutral style) */}
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span
                          title={user.connections?.googleDrive ? 'Google Drive: Connected' : 'Google Drive: Not connected'}
                          style={{
                            padding: '4px 6px',
                            borderRadius: '4px',
                            backgroundColor: user.connections?.googleDrive ? '#181C19' : '#131316',
                            border: `1px solid ${user.connections?.googleDrive ? '#223828' : '#1C1C22'}`,
                            color: user.connections?.googleDrive ? '#A7F3D0' : '#454550',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '0.68rem'
                          }}
                        >
                          <HardDrive size={12} />
                        </span>

                        <span
                          title={user.connections?.telegram ? 'Telegram: Connected' : 'Telegram: Not connected'}
                          style={{
                            padding: '4px 6px',
                            borderRadius: '4px',
                            backgroundColor: user.connections?.telegram ? '#181C19' : '#131316',
                            border: `1px solid ${user.connections?.telegram ? '#223828' : '#1C1C22'}`,
                            color: user.connections?.telegram ? '#A7F3D0' : '#454550',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '0.68rem'
                          }}
                        >
                          <MessageCircle size={12} />
                        </span>

                        <span
                          title={user.connections?.claude ? 'Claude MCP: Connected' : 'Claude MCP: Not connected'}
                          style={{
                            padding: '4px 6px',
                            borderRadius: '4px',
                            backgroundColor: user.connections?.claude ? '#181C19' : '#131316',
                            border: `1px solid ${user.connections?.claude ? '#223828' : '#1C1C22'}`,
                            color: user.connections?.claude ? '#A7F3D0' : '#454550',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '0.68rem'
                          }}
                        >
                          <Bot size={12} />
                        </span>

                        <span
                          title={user.connections?.hyperliquid ? 'Hyperliquid (HI): Active' : 'Hyperliquid: Not active'}
                          style={{
                            padding: '4px 6px',
                            borderRadius: '4px',
                            backgroundColor: user.connections?.hyperliquid ? '#181C19' : '#131316',
                            border: `1px solid ${user.connections?.hyperliquid ? '#223828' : '#1C1C22'}`,
                            color: user.connections?.hyperliquid ? '#A7F3D0' : '#454550',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '0.68rem'
                          }}
                        >
                          <Layers size={12} />
                        </span>

                        <span
                          title={user.connections?.threads ? 'Threads: Connected' : 'Threads: Not connected'}
                          style={{
                            padding: '4px 6px',
                            borderRadius: '4px',
                            backgroundColor: user.connections?.threads ? '#181C19' : '#131316',
                            border: `1px solid ${user.connections?.threads ? '#223828' : '#1C1C22'}`,
                            color: user.connections?.threads ? '#A7F3D0' : '#454550',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '0.68rem'
                          }}
                        >
                          <AtSign size={12} />
                        </span>

                        <span
                          title={user.connections?.baseWallet ? 'Base Web3 Wallet: Linked' : 'Base Wallet: Unlinked'}
                          style={{
                            padding: '4px 6px',
                            borderRadius: '4px',
                            backgroundColor: user.connections?.baseWallet ? '#181C19' : '#131316',
                            border: `1px solid ${user.connections?.baseWallet ? '#223828' : '#1C1C22'}`,
                            color: user.connections?.baseWallet ? '#A7F3D0' : '#454550',
                            display: 'flex',
                            alignItems: 'center',
                            fontSize: '0.68rem'
                          }}
                        >
                          <Wallet size={12} />
                        </span>
                      </div>
                    </td>

                    {/* Active Triggers Count */}
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        color: user.activeTriggersCount > 0 ? '#D4D4D8' : '#52525B'
                      }}>
                        {user.activeTriggersCount || 0}
                      </span>
                    </td>

                    {/* Action Button */}
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectUser(user); }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '5px',
                          backgroundColor: '#181820',
                          border: '1px solid #262632',
                          color: '#D4D4D8',
                          fontSize: '0.72rem',
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          cursor: 'pointer',
                          transition: 'all 0.12s ease'
                        }}
                      >
                        Inspect <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
