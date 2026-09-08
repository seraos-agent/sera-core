import React from 'react';
import { Shield, RefreshCw, LogOut, Terminal, Users, Cpu, Activity } from 'lucide-react';
import { AdminUser } from '../types';

interface NavbarProps {
  user: AdminUser;
  activeTab: 'users' | 'automations' | 'system';
  onTabChange: (tab: 'users' | 'automations' | 'system') => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing,
  onLogout
}) => {
  return (
    <header style={{
      borderBottom: '1px solid #1E1E26',
      backgroundColor: '#0E0E12',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <div style={{
        maxWidth: '1440px',
        margin: '0 auto',
        padding: '0 24px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Brand & Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: '#181822',
              border: '1px solid #282834',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#D4D4D8'
            }}>
              <Shield size={15} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', letterSpacing: '0.02em', color: '#F4F4F6' }}>
                SERA
              </span>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '0.04em',
                padding: '1px 5px',
                borderRadius: '4px',
                backgroundColor: '#181820',
                color: '#A1A1AA',
                border: '1px solid #242430'
              }}>
                CONTROL TOWER
              </span>
            </div>
          </div>

          <div style={{
            height: '20px',
            width: '1px',
            backgroundColor: '#1E1E26'
          }} />

          {/* Navigation Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              onClick={() => onTabChange('users')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: activeTab === 'users' ? '#F4F4F6' : '#71717A',
                backgroundColor: activeTab === 'users' ? '#181822' : 'transparent',
                border: activeTab === 'users' ? '1px solid #282834' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
            >
              <Users size={14} /> Users & Subscriptions
            </button>

            <button
              onClick={() => onTabChange('automations')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: activeTab === 'automations' ? '#F4F4F6' : '#71717A',
                backgroundColor: activeTab === 'automations' ? '#181822' : 'transparent',
                border: activeTab === 'automations' ? '1px solid #282834' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
            >
              <Cpu size={14} /> Automations
            </button>

            <button
              onClick={() => onTabChange('system')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: activeTab === 'system' ? '#F4F4F6' : '#71717A',
                backgroundColor: activeTab === 'system' ? '#181822' : 'transparent',
                border: activeTab === 'system' ? '1px solid #282834' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
            >
              <Activity size={14} /> System Health
            </button>
          </nav>
        </div>

        {/* Right Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Status Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 8px',
            borderRadius: '5px',
            backgroundColor: '#131518',
            border: '1px solid #20242B',
            fontSize: '0.72rem',
            color: '#A1A1AA'
          }}>
            <span className="status-indicator status-active" />
            <span>Online</span>
          </div>

          {/* Refresh Action */}
          <button
            onClick={onRefresh}
            title="Refresh dashboard data"
            style={{
              padding: '6px',
              borderRadius: '6px',
              backgroundColor: '#14141A',
              border: '1px solid #22222C',
              color: '#8E8E98',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          </button>

          {/* Admin User Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px',
            backgroundColor: '#14141A',
            border: '1px solid #22222C',
            borderRadius: '6px'
          }}>
            <Terminal size={13} style={{ color: '#71717A' }} />
            <span style={{ fontSize: '0.72rem', color: '#D4D4D8', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email || 'Root Admin'}
            </span>
          </div>

          {/* Logout Button */}
          <button
            onClick={onLogout}
            title="Sign out"
            style={{
              padding: '6px',
              borderRadius: '6px',
              backgroundColor: '#14141A',
              border: '1px solid #22222C',
              color: '#71717A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </header>
  );
};
