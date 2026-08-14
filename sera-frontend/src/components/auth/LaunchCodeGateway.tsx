import { useState } from 'react';
import type { ThemeType } from '../../theme';
import { VALID_LAUNCH_CODE_HASHES } from '../../config/launchCodes';

interface LaunchCodeGatewayProps {
  theme: ThemeType;
  onVerify: () => void;
}

export function LaunchCodeGateway({ theme, onVerify }: LaunchCodeGatewayProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputCode = code.trim();
    if (!inputCode) return;

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(inputCode);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      if (VALID_LAUNCH_CODE_HASHES.includes(hashHex)) {
        onVerify();
      } else {
        setError('Invalid launch code. Please try again.');
      }
    } catch (err) {
      setError('Verification error. Please try again.');
    }
  };

  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      color: theme.ink,
      fontFamily: 'Inter, sans-serif',
      padding: '24px'
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        padding: '40px 32px',
        backgroundColor: theme.surface2,
        borderRadius: '16px',
        border: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        boxShadow: '0 12px 40px rgba(0,0,0,0.08)'
      }}>
        <img
          src="/sera-logo.png"
          alt="SERA"
          style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '24px' }}
        />
        <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '12px', color: theme.ink }}>
          Early Access Alpha
        </h1>
        <p style={{ fontSize: '15px', color: theme.inkSoft, marginBottom: '32px', lineHeight: 1.5 }}>
          Enter your launch code to securely unlock SERA OS and connect your wallet.
        </p>

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError('');
            }}
            placeholder="Enter Launch Code"
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.bg,
              color: theme.ink,
              fontSize: '15px',
              marginBottom: '16px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          
          {error && (
            <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '-8px', marginBottom: '16px', textAlign: 'left' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              padding: '14px 20px',
              backgroundColor: theme.accent,
              color: theme.accentInk,
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.2s, transform 0.1s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            Verify Access
          </button>
        </form>
      </div>
    </div>
  );
}
