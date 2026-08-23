import { type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, BadgeCheck, ShieldCheck, Wallet } from 'lucide-react';
import type { ThemeType } from '../../theme';
import type { WalletState } from '../../hooks/useWallet';
import './ProfilePage.css';

interface ProfilePageProps {
  theme: ThemeType;
  walletState: WalletState;
  mode: 'light' | 'dark';
  onModeChange: (mode: 'light' | 'dark') => void;
  onBack: () => void;
  onManageWallet: () => void;
  onDisconnect: () => void;
  isMobileView?: boolean;
}

function shortAddress(address?: string): string {
  if (!address || address === 'Connecting...') return 'Not connected';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Section({ title, description, children, theme }: { title: string; description?: string; children: ReactNode; theme: ThemeType }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 className="profile-section-title" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: theme.ink, letterSpacing: -0.2 }}>{title}</h2>
        {description && <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5, color: theme.inkSoft }}>{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function ProfilePage({
  theme,
  walletState,
  mode: _mode,
  onModeChange: _onModeChange,
  onBack,
  onManageWallet,
  onDisconnect,
  isMobileView,
}: ProfilePageProps) {
  const pad = isMobileView ? 16 : 40;
  const connectedAddress = walletState.fullAddress;
  const agentAddress = walletState.vaultAddress;
  
  const cardStyle: CSSProperties = {
    border: `1px solid ${theme.border}`,
    borderRadius: 16,
    background: theme.surface2,
    padding: isMobileView ? 16 : 24,
  };
  
  const secondaryButton: CSSProperties = {
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.ink,
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: isMobileView ? '100%' : 'auto',
  };

  const cssVariables = {
    '--ink': theme.ink,
    '--ink-soft': theme.inkSoft,
  } as React.CSSProperties;

  return (
    <div className="profile-page-container" style={{ ...cssVariables, background: theme.bg }}>
      <div style={{ height: 60, padding: `0 ${isMobileView ? 16 : 24}px`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderBottom: `1px solid ${theme.border}`, background: theme.surface }}>
        <button onClick={onBack} className="profile-button-secondary" aria-label="Back to chat" style={{ border: 'none', background: 'transparent', color: theme.inkSoft, padding: 8, borderRadius: '50%', width: 'auto' }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>Profile settings</span>
      </div>

      <main style={{ flex: 1, overflowY: 'auto', padding: `${isMobileView ? 24 : 32}px ${pad}px ${isMobileView ? 40 : 80}px`, color: theme.ink }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobileView ? 32 : 48 }}>
          
          <header style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <h1 className="profile-header-title" style={{ margin: 0, fontWeight: 600, fontSize: isMobileView ? 26 : 40, letterSpacing: -1 }}>Your SERA profile</h1>
              {walletState?.tier && (
                <span style={{
                  fontFamily: "Inter, sans-serif", fontSize: isMobileView ? 10 : 12, fontWeight: 700,
                  background: walletState?.tier === "WHALE" ? "rgba(168, 85, 247, 0.15)" : (walletState?.tier === "PRO" ? theme.accentSoft : theme.surface2),
                  color: walletState?.tier === "WHALE" ? "#a855f7" : (walletState?.tier === "PRO" ? theme.accent : theme.inkSoft),
                  padding: "4px 8px", borderRadius: 6, letterSpacing: 0.5, flexShrink: 0
                }}>
                  {walletState?.tier}
                </span>
              )}
            </div>
            <p style={{ margin: 0, color: theme.inkSoft, fontSize: isMobileView ? 15 : 16, lineHeight: 1.6, maxWidth: 600 }}>
              Your profile keeps your access, wallets, and connected workspaces securely integrated via the SERA Core.
            </p>
          </header>

          <Section title="Account & access" description="The currently verified connection to your SERA account." theme={theme}>
            <div className="profile-card" style={{ ...cardStyle, display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
                <div className="profile-icon-wrapper" style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', color: theme.status, background: theme.statusSoft }}>
                  <BadgeCheck size={22} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: theme.ink, fontSize: 15, fontWeight: 600 }}>Connected account</div>
                  <div style={{ color: theme.inkSoft, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, marginTop: 4, wordBreak: 'break-all' }}>{shortAddress(connectedAddress)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', width: isMobileView ? '100%' : 'auto' }}>
                <button onClick={onManageWallet} className="profile-button-secondary" style={secondaryButton}>Manage connection</button>
                <button onClick={onDisconnect} className="profile-button-secondary profile-danger-button" style={{ ...secondaryButton, color: '#D04646', borderColor: theme.isDark ? '#6D3434' : '#F0CACA' }}>Disconnect</button>
              </div>
            </div>
          </Section>

          <Section title="Wallets" description="Personal wallet access is separate from SERA’s operational wallet." theme={theme}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobileView ? '1fr' : '1fr 1fr', gap: 16 }}>
              <div className="profile-card" style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: theme.ink, fontSize: 15, fontWeight: 600 }}>
                  <div className="profile-icon-wrapper"><Wallet size={18} /></div> Personal wallet
                </div>
                <div style={{ marginTop: 16, color: theme.inkSoft, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, background: theme.surface, padding: '8px 12px', borderRadius: 8, display: 'inline-block', wordBreak: 'break-all' }}>{shortAddress(connectedAddress)}</div>
                <p style={{ margin: '16px 0 0', color: theme.inkSoft, fontSize: 13, lineHeight: 1.5 }}>You control this wallet and its private key.</p>
              </div>
              <div className="profile-card" style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: theme.ink, fontSize: 15, fontWeight: 600 }}>
                  <div className="profile-icon-wrapper"><ShieldCheck size={18} /></div> SERA Agent Wallet
                </div>
                <div style={{ marginTop: 16, color: theme.inkSoft, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, background: theme.surface, padding: '8px 12px', borderRadius: 8, display: 'inline-block', wordBreak: 'break-all' }}>{agentAddress ? shortAddress(agentAddress) : 'Provisioning...'}</div>
                <p style={{ margin: '16px 0 0', color: theme.inkSoft, fontSize: 13, lineHeight: 1.5 }}>SERA never stores your personal private key.</p>
              </div>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}

