import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { OverviewCards } from './components/OverviewCards';
import { UserTable } from './components/UserTable';
import { UserDetailModal } from './components/UserDetailModal';
import { AutomationsMonitor } from './components/AutomationsMonitor';
import { SystemHealth } from './components/SystemHealth';
import { LoginModal } from './components/LoginModal';
import { getStoredAuth, clearStoredAuth, fetchOverview, fetchUsers } from './api';
import { AdminUser, AdminOverview, UserSummary } from './types';
import { Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'automations' | 'system'>('users');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check initial stored auth
  useEffect(() => {
    const { token, adminKey, user } = getStoredAuth();
    if (token || adminKey) {
      setAdminUser(user || { id: 'admin', email: 'admin@seraos.xyz', authMethod: 'secret_key' });
    } else {
      setLoading(false);
    }
  }, []);

  const loadDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      setError(null);
      const [ovData, usersData] = await Promise.all([
        fetchOverview(),
        fetchUsers()
      ]);
      setOverview(ovData);
      setUsers(usersData);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        setAdminUser(null);
        clearStoredAuth();
      } else {
        setError(err.message || 'Failed to sync control tower data.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (adminUser) {
      loadDashboardData();

      // Poll updates every 20 seconds
      const timer = setInterval(() => {
        loadDashboardData(true);
      }, 20000);

      return () => clearInterval(timer);
    }
  }, [adminUser, loadDashboardData]);

  const handleLogout = () => {
    clearStoredAuth();
    setAdminUser(null);
    setOverview(null);
    setUsers([]);
    setSelectedUser(null);
  };

  if (!adminUser) {
    return <LoginModal onSuccess={(user) => setAdminUser(user)} />;
  }

  const totalCredits = users.reduce((sum, u) => sum + (u.agentCredits || 0), 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#08080A', color: '#F3F4F6' }}>
      <Navbar
        user={adminUser}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={() => loadDashboardData()}
        isRefreshing={refreshing}
        onLogout={handleLogout}
      />

      <main style={{ maxWidth: '1440px', margin: '0 auto', padding: '28px 24px' }}>
        {error && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            color: '#F87171',
            fontSize: '0.82rem',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            gap: '12px',
            color: '#9CA3AF'
          }}>
            <Loader2 size={28} className="animate-spin" style={{ color: '#3B82F6' }} />
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Connecting to SERA Control Tower Runtime...</span>
          </div>
        ) : (
          <>
            {/* Executive KPIs */}
            <OverviewCards overview={overview} totalCredits={totalCredits} />

            {/* Tab Views */}
            {activeTab === 'users' && (
              <UserTable
                users={users}
                onSelectUser={(u) => setSelectedUser(u)}
              />
            )}

            {activeTab === 'automations' && (
              <AutomationsMonitor />
            )}

            {activeTab === 'system' && (
              <SystemHealth overview={overview} />
            )}
          </>
        )}
      </main>

      {/* User Inspection & Control Modal */}
      {selectedUser && (
        <UserDetailModal
          userSummary={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUserUpdated={() => loadDashboardData(true)}
        />
      )}
    </div>
  );
};

export default App;
