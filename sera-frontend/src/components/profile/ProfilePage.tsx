import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, BadgeCheck, CircleUserRound, CreditCard, Link2, Palette, ShieldCheck, Wallet } from 'lucide-react';
import type { ThemeType } from '../../theme';
import type { WalletState } from '../../hooks/useWallet';

interface ProfilePageProps {
  theme: ThemeType;
  walletState: WalletState;
  mode: 'light' | 'dark';
  onModeChange: (mode: 'light' | 'dark') => void;
  onBack: () => void;
  onManageWallet: () => void;
  onDisconnect: () => void;
  onLinkWallet?: () => void;
  isLinkingWallet?: boolean;
  onUpgradePlan?: (amountUsdc: number) => void;
  isMobileView?: boolean;
}

function shortAddress(address?: string): string {
  if (!address || address === 'Connecting...') return 'Not connected';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'inherit' }}>{title}</h2>
        {description && <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.5, color: 'inherit', opacity: 0.68 }}>{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function ProfilePage({
  theme,
  walletState,
  mode,
  onModeChange,
  onBack,
  onManageWallet,
  onDisconnect,
  onLinkWallet,
  isLinkingWallet,
  onUpgradePlan,
  isMobileView,
}: ProfilePageProps) {
  const pad = isMobileView ? 20 : 40;
  const connectedAddress = walletState.fullAddress;
  const agentAddress = walletState.vaultAddress;
  const plan = walletState.tier || 'FREE';
  const planCards = [
    { id: 'PRO', name: 'Pro', price: 19, description: 'Research, automate, and build.', features: ['10k Base LLM tokens / month', 'SERA Base Agent', 'Full cognitive execution & memory'] },
    { id: 'WHALE', name: 'Whale', price: 295, description: 'Higher limits and priority execution.', features: ['100k Base LLM tokens / month', 'SERA Advanced Agent', 'Unlocked deep reasoning mode'] },
  ] as const;
  const cardStyle: CSSProperties = {
    border: `1px solid ${theme.border}`,
    borderRadius: 16,
    background: theme.surface2,
    padding: isMobileView ? 16 : 20,
  };
  const secondaryButton: CSSProperties = {
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.ink,
    borderRadius: 9,
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: theme.bg, animation: 'walletPageIn 300ms ease forwards' }}>
      <div style={{ height: 52, padding: `0 ${isMobileView ? 16 : 24}px`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} aria-label="Back to chat" style={{ border: 'none', background: 'transparent', color: theme.inkSoft, display: 'flex', padding: 4, cursor: 'pointer' }}>
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: theme.ink }}>Profile</span>
      </div>

      <main style={{ flex: 1, overflowY: 'auto', padding: `18px ${pad}px ${isMobileView ? 32 : 56}px`, color: theme.ink }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 34 }}>
          <header style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: 15, display: 'grid', placeItems: 'center', background: theme.accentSoft, color: theme.accent, flexShrink: 0 }}>
              <CircleUserRound size={24} />
            </div>
            <div>
              <h1 style={{ margin: 0, color: theme.ink, fontFamily: 'Fraunces, serif', fontWeight: 400, fontSize: isMobileView ? 29 : 36, letterSpacing: -0.7 }}>Your SERA profile</h1>
              <p style={{ margin: '8px 0 0', color: theme.inkSoft, fontSize: 14, lineHeight: 1.55, maxWidth: 570 }}>
                Your profile keeps your access, wallets, agreements, and SERA continuity together—independent of how you sign in.
              </p>
            </div>
          </header>

          <Section title="Account & access" description="The currently verified connection to your SERA account.">
            <div style={{ ...cardStyle, display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', color: theme.status, background: theme.statusSoft }}><BadgeCheck size={19} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: theme.ink, fontSize: 14, fontWeight: 600 }}>Connected wallet</div>
                  <div style={{ color: theme.inkSoft, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, marginTop: 3 }}>{shortAddress(connectedAddress)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={onManageWallet} style={secondaryButton}>Manage connection</button>
                <button onClick={onDisconnect} style={{ ...secondaryButton, color: '#D04646', borderColor: theme.isDark ? '#6D3434' : '#F0CACA' }}>Disconnect</button>
              </div>
            </div>
          </Section>

          <Section title="Wallets" description="Personal wallet access is separate from SERA’s operational wallet.">
            <div style={{ display: 'grid', gridTemplateColumns: isMobileView ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme.ink, fontSize: 14, fontWeight: 600 }}><Wallet size={17} /> Personal wallet</div>
                <div style={{ marginTop: 12, color: theme.inkSoft, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{shortAddress(connectedAddress)}</div>
                <p style={{ margin: '12px 0 0', color: theme.inkSoft, fontSize: 12, lineHeight: 1.5 }}>You control this wallet and its private key.</p>
              </div>
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme.ink, fontSize: 14, fontWeight: 600 }}><ShieldCheck size={17} /> SERA Agent Wallet</div>
                <div style={{ marginTop: 12, color: theme.inkSoft, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{agentAddress ? shortAddress(agentAddress) : 'Provisioning when custody is activated'}</div>
                <p style={{ margin: '12px 0 0', color: theme.inkSoft, fontSize: 12, lineHeight: 1.5 }}>SERA never stores your personal private key.</p>
              </div>
            </div>
            {onLinkWallet && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button onClick={onLinkWallet} disabled={isLinkingWallet} style={{ ...secondaryButton, opacity: isLinkingWallet ? 0.65 : 1, cursor: isLinkingWallet ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Link2 size={16} /> {isLinkingWallet ? 'Choose the wallet to link' : 'Link another wallet'}
                </button>
              </div>
            )}
          </Section>

          <Section title="Network scope" description="Connections can span networks. SERA enables capabilities per network, not by assumption.">
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: theme.ink, fontSize: 14, fontWeight: 600 }}>Base</div>
                <div style={{ color: theme.inkSoft, fontSize: 12, marginTop: 4 }}>Operational wallet and read-only balance support</div>
              </div>
              <span style={{ fontSize: 11, color: theme.status, background: theme.statusSoft, borderRadius: 999, padding: '5px 8px', fontWeight: 700 }}>ACTIVE</span>
            </div>
          </Section>

          <Section title="Preferences">
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Palette size={18} color={theme.inkSoft} />
                <div><div style={{ color: theme.ink, fontSize: 14, fontWeight: 600 }}>Appearance</div><div style={{ color: theme.inkSoft, fontSize: 12, marginTop: 3 }}>Choose how SERA appears on this device.</div></div>
              </div>
              <div style={{ display: 'flex', gap: 6, padding: 3, borderRadius: 10, background: theme.surface, border: `1px solid ${theme.border}` }}>
                {(['light', 'dark'] as const).map(option => <button key={option} onClick={() => onModeChange(option)} style={{ border: 'none', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', textTransform: 'capitalize', fontSize: 12, fontWeight: 600, background: mode === option ? theme.accent : 'transparent', color: mode === option ? theme.accentInk : theme.inkSoft }}>{option}</button>)}
              </div>
            </div>
          </Section>

          <Section title="Plan & usage" description="Plan is one part of your SERA account, not its identity.">
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CreditCard size={18} color={theme.inkSoft} />
                <div><div style={{ color: theme.ink, fontSize: 14, fontWeight: 600 }}>{plan} plan</div><div style={{ color: theme.inkSoft, fontSize: 12, marginTop: 3 }}>Usage and billing controls will appear here when billing is enabled.</div></div>
              </div>
              <span style={{ color: theme.inkSoft, fontSize: 12 }}>No action needed</span>
            </div>
          </Section>

          <Section title="Upgrade your plan" description="Choose the level of capacity that fits what you want SERA to manage.">
            <div style={{ display: 'grid', gridTemplateColumns: isMobileView ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
              {planCards.map(card => {
                const isCurrent = plan === card.id;
                return (
                  <div key={card.id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 18, borderColor: isCurrent ? theme.accent : theme.border }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ color: theme.ink, fontSize: 17, fontWeight: 650 }}>{card.name}</div>
                        <div style={{ color: theme.inkSoft, fontSize: 12, lineHeight: 1.5, marginTop: 5 }}>{card.description}</div>
                      </div>
                      {isCurrent && <span style={{ color: theme.accent, background: theme.accentSoft, fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '5px 7px' }}>CURRENT</span>}
                    </div>
                    <div style={{ color: theme.ink, fontSize: 28, fontWeight: 650, letterSpacing: -0.5 }}>${card.price}<span style={{ color: theme.inkSoft, fontSize: 12, fontWeight: 500, letterSpacing: 0 }}> / month</span></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {card.features.map(feature => <div key={feature} style={{ color: theme.inkSoft, fontSize: 12, lineHeight: 1.4 }}>• {feature}</div>)}
                    </div>
                    <button
                      onClick={() => onUpgradePlan?.(card.price)}
                      disabled={isCurrent || !onUpgradePlan}
                      style={{ border: 'none', borderRadius: 9, padding: '10px 12px', marginTop: 'auto', background: isCurrent ? theme.surface : theme.ink, color: isCurrent ? theme.inkSoft : theme.bg, fontSize: 13, fontWeight: 650, cursor: isCurrent ? 'default' : 'pointer', opacity: !onUpgradePlan && !isCurrent ? 0.6 : 1 }}
                    >
                      {isCurrent ? 'Current plan' : `Choose ${card.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
