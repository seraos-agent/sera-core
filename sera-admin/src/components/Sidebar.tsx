import React from 'react';
import {
  Shield,
  RefreshCw,
  LogOut,
  Terminal,
  Users,
  Store,
  Cpu,
  Activity,
  ChevronRight
} from 'lucide-react';
import { AdminUser } from '../types';

export type AdminTab = 'users' | 'stores' | 'automations' | 'system';

interface SidebarProps {
  user: AdminUser;
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onLogout: () => void;
  usersCount?: number;
  storesCount?: number;
  triggersCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing,
  onLogout,
  usersCount = 0,
  storesCount = 0,
  triggersCount = 0
}) => {
  const navItems: Array<{
    id: AdminTab;
    label: string;
    icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
    badge?: number | string;
    badgeColor?: string;
  }> = [
    {
      id: 'users',
      label: 'Users & Subscriptions',
      icon: Users,
      badge: usersCount > 0 ? usersCount : undefined,
      badgeColor: '#3B82F6'
    },
    {
      id: 'stores',
      label: 'Merchant Stores',
      icon: Store,
      badge: storesCount > 0 ? storesCount : undefined,
      badgeColor: '#10B981'
    },
    {
      id: 'automations',
      label: 'Automations',
      icon: Cpu,
      badge: triggersCount > 0 ? triggersCount : undefined,
      badgeColor: '#F59E0B'
    },
    {
      id: 'system',
      label: 'System Health',
      icon: Activity
    }
  ];

  return (
    <aside style={{
      width: '260px',
      minWidth: '260px',
      height: '100vh',
      position: 'sticky',
      top: 0,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: '#0C0C10',
      borderRight: '1px solid #1C1C24',
      padding: '20px 14px',
      zIndex: 40,
      userSelect: 'none'
    }}>
      {/* Top Header & Brand */}
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px 18px 8px',
          borderBottom: '1px solid #1C1C24'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#181822',
              border: '1px solid #282834',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#D4D4D8',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
            }}>
              <Shield size={18} style={{ color: '#3B82F6' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '0.02em', color: '#F4F4F6' }}>
                  SERA
                </span>
                <span style={{
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  backgroundColor: '#181824',
                  color: '#A1A1AA',
                  border: '1px solid #262636'
                }}>
                  CONTROL TOWER
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                <span className="status-indicator status-active" />
                <span style={{ fontSize: '0.68rem', color: '#10B981', fontWeight: 500 }}>Runtime Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section Label */}
        <div style={{
          padding: '16px 8px 8px 8px',
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#52525B',
          textTransform: 'uppercase'
        }}>
          Navigation & Controls
        </div>

        {/* Navigation Menu */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#F4F4F6' : '#8E8E98',
                  backgroundColor: isActive ? '#181822' : 'transparent',
                  border: isActive ? '1px solid #2B2B38' : '1px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.12s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '#13131A';
                    e.currentTarget.style.color = '#E4E4E7';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#8E8E98';
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon
                    size={16}
                    style={{
                      color: isActive ? '#3B82F6' : '#71717A',
                      transition: 'color 0.12s ease'
                    }}
                  />
                  <span>{item.label}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {item.badge !== undefined && (
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: '10px',
                      backgroundColor: isActive ? '#242434' : '#14141C',
                      color: item.badgeColor || '#9CA3AF',
                      border: '1px solid #282836'
                    }}>
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight size={13} style={{ color: '#71717A' }} />}
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile & Actions Card */}
      <div style={{
        paddingTop: '16px',
        borderTop: '1px solid #1C1C24'
      }}>
        {/* Admin Account Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          backgroundColor: '#121218',
          border: '1px solid #20202A',
          borderRadius: '8px',
          marginBottom: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              backgroundColor: '#1B1B26',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#A1A1AA',
              flexShrink: 0
            }}>
              <Terminal size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#E4E4E7',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {user.email || 'Root Admin'}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#71717A' }}>
                {user.authMethod === 'secret_key' ? 'Master Secret Key' : 'Supabase Superadmin'}
              </div>
            </div>
          </div>
        </div>

        {/* Actions Button Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onRefresh}
            title="Sync Control Tower Data"
            disabled={isRefreshing}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '6px',
              backgroundColor: '#14141C',
              border: '1px solid #242432',
              color: '#D4D4D8',
              fontSize: '0.74rem',
              fontWeight: 500,
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              transition: 'all 0.12s ease'
            }}
            onMouseEnter={(e) => {
              if (!isRefreshing) e.currentTarget.style.backgroundColor = '#1C1C28';
            }}
            onMouseLeave={(e) => {
              if (!isRefreshing) e.currentTarget.style.backgroundColor = '#14141C';
            }}
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} style={{ color: '#3B82F6' }} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Data'}</span>
          </button>

          <button
            onClick={onLogout}
            title="Sign out of Admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '7px 10px',
              borderRadius: '6px',
              backgroundColor: '#14141C',
              border: '1px solid #242432',
              color: '#71717A',
              cursor: 'pointer',
              transition: 'all 0.12s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)';
              e.currentTarget.style.color = '#F87171';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#14141C';
              e.currentTarget.style.color = '#71717A';
              e.currentTarget.style.borderColor = '#242432';
            }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
};
