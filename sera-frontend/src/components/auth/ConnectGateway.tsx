import { useEffect } from 'react';
import type { ThemeType } from '../../theme';
import { Wallet } from 'lucide-react';

interface ConnectGatewayProps {
  theme: ThemeType;
  onConnect: () => void;
}

export function ConnectGateway({ theme, onConnect }: ConnectGatewayProps) {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('autoConnect=true')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('autoConnect');
      window.history.replaceState({}, '', url.toString());

      const timer = setTimeout(() => {
        onConnect();
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [onConnect]);

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
          Welcome to SERA OS
        </h1>
        <p style={{ fontSize: '15px', color: theme.inkSoft, marginBottom: '32px', lineHeight: 1.5 }}>
          Connect your wallet to access your agent, manage your intelligent portfolio, and enter the prediction arena.
        </p>

        <button
          onClick={onConnect}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            width: '100%',
            padding: '14px 20px',
            backgroundColor: theme.ink,
            color: theme.surface,
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
          <Wallet size={18} />
          Connect Wallet
        </button>
      </div>
    </div>
  );
}
