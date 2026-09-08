import React, { useState } from 'react';
import { Shield, Key, Mail, Lock, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { loginAdmin } from '../api';
import { AdminUser } from '../types';

interface LoginModalProps {
  onSuccess: (user: AdminUser) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess }) => {
  const [tab, setTab] = useState<'supabase' | 'secret'>('supabase');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tab === 'supabase') {
        if (!email.trim() || !password) {
          throw new Error('Please enter both email and password.');
        }
        const res = await loginAdmin({ email: email.trim(), password });
        onSuccess(res.user);
      } else {
        if (!adminKey.trim()) {
          throw new Error('Please enter the master admin key.');
        }
        const res = await loginAdmin({ adminKey: adminKey.trim() });
        onSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#0A0A0C',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      zIndex: 9999
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '400px',
        backgroundColor: '#111115',
        border: '1px solid #1E1E26',
        borderRadius: '12px',
        padding: '32px'
      }}>
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            backgroundColor: '#181822',
            border: '1px solid #282834',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#D4D4D8'
          }}>
            <Shield size={16} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em', color: '#F4F4F6' }}>
              SERA CONTROL TOWER
            </h1>
            <p style={{ fontSize: '0.72rem', color: '#71717A' }}>Executive System Administration</p>
          </div>
        </div>

        {/* Auth Mode Tabs */}
        <div style={{
          display: 'flex',
          backgroundColor: '#09090C',
          borderRadius: '7px',
          padding: '3px',
          marginTop: '20px',
          marginBottom: '20px',
          border: '1px solid #1C1C24'
        }}>
          <button
            type="button"
            onClick={() => { setTab('supabase'); setError(null); }}
            style={{
              flex: 1,
              padding: '7px 10px',
              fontSize: '0.78rem',
              fontWeight: 500,
              borderRadius: '5px',
              backgroundColor: tab === 'supabase' ? '#181822' : 'transparent',
              color: tab === 'supabase' ? '#F4F4F6' : '#71717A',
              border: tab === 'supabase' ? '1px solid #282834' : '1px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.12s ease'
            }}
          >
            <Mail size={13} /> Team Account
          </button>
          <button
            type="button"
            onClick={() => { setTab('secret'); setError(null); }}
            style={{
              flex: 1,
              padding: '7px 10px',
              fontSize: '0.78rem',
              fontWeight: 500,
              borderRadius: '5px',
              backgroundColor: tab === 'secret' ? '#181822' : 'transparent',
              color: tab === 'secret' ? '#F4F4F6' : '#71717A',
              border: tab === 'secret' ? '1px solid #282834' : '1px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.12s ease'
            }}
          >
            <Key size={13} /> Master Key
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#1E1416',
            border: '1px solid #382024',
            borderRadius: '6px',
            padding: '10px 12px',
            marginBottom: '16px',
            color: '#F87171',
            fontSize: '0.78rem'
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          {tab === 'supabase' ? (
            <>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#71717A', marginBottom: '5px', fontWeight: 500 }}>
                  Admin Email
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#52525B' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seraos.agent@gmail.com"
                    required
                    style={{
                      width: '100%',
                      padding: '8px 10px 8px 32px',
                      backgroundColor: '#09090C',
                      border: '1px solid #1E1E26',
                      borderRadius: '6px',
                      color: '#F4F4F6',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#71717A', marginBottom: '5px', fontWeight: 500 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#52525B' }} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    style={{
                      width: '100%',
                      padding: '8px 10px 8px 32px',
                      backgroundColor: '#09090C',
                      border: '1px solid #1E1E26',
                      borderRadius: '6px',
                      color: '#F4F4F6',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#71717A', marginBottom: '5px', fontWeight: 500 }}>
                Master Admin Secret Key
              </label>
              <div style={{ position: 'relative' }}>
                <Key size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#52525B' }} />
                <input
                  type="password"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  placeholder="Enter SERA_ADMIN_SECRET"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px 8px 32px',
                    backgroundColor: '#09090C',
                    border: '1px solid #1E1E26',
                    borderRadius: '6px',
                    color: '#F4F4F6',
                    fontSize: '0.82rem',
                    fontFamily: 'JetBrains Mono, monospace',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '9px 14px',
              backgroundColor: '#1E1E26',
              border: '1px solid #2E2E38',
              color: '#F4F4F6',
              fontWeight: 600,
              fontSize: '0.82rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'background-color 0.12s ease'
            }}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Authenticating...
              </>
            ) : (
              <>
                Enter Control Tower <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
