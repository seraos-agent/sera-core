import { useState } from 'react';
import { ShieldAlert, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { ThemeType } from '../../theme';
import { getWalletLabel } from '../../utils/walletLabels';

function shortenAddress(address?: string) {
  if (!address || typeof address !== 'string' || !address.startsWith('0x')) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export interface ProposalPayload {
  proposalId: string;
  intent: string;
  parameters: Record<string, any>;
  status?: 'APPROVED' | 'REJECTED';
  candidates?: any[];
}

export function ProposalCard({ 
  theme, 
  proposal, 
  onRespond 
}: { 
  theme: ThemeType;
  proposal: ProposalPayload;
  onRespond: (proposalId: string, action: 'APPROVE' | 'REJECT', candidateId?: string) => void;
}) {
  const [localStatus, setLocalStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [selectedCandidate, setSelectedCandidate] = useState<string>('');
  
  const status = proposal.status || localStatus;

  const handleRespond = (action: 'APPROVE' | 'REJECT') => {
    if (status !== 'PENDING') return;
    setLocalStatus(action === 'APPROVE' ? 'APPROVED' : 'REJECTED');
    onRespond(proposal.proposalId, action, selectedCandidate || undefined);
  };

  const isSchedule = proposal.intent === 'SCHEDULE_GOAL';
  const targetIntent = isSchedule ? proposal.parameters?.actionIntent : proposal.intent;
  const isTransfer = targetIntent === 'TRANSFER_FUNDS';
  const isPurchase = proposal.intent === 'PURCHASE_INTEGRATION';
  
  let title = "Action Proposal";
  if (isPurchase) title = "Integration Purchase";
  else if (isSchedule && isTransfer) title = "Recurring Transfer";
  else if (isSchedule) title = "Scheduled Automation";
  else if (isTransfer) title = "Wallet Transfer";

  const p = isSchedule ? proposal.parameters?.actionParameters || {} : proposal.parameters || {};

  return (
    <div style={{
      marginTop: 12,
      background: theme.isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: 20,
      fontFamily: 'Inter, sans-serif',
      boxShadow: theme.isDark ? '0 4px 20px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isSchedule ? (
          <Clock size={18} color={theme.accent} />
        ) : (
          <ShieldAlert size={18} color={theme.accent} />
        )}
        <span style={{ 
          fontSize: 15, 
          fontWeight: 600, 
          color: theme.ink,
        }}>
          {title}
        </span>
      </div>

      {/* Human-readable Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        
        {isSchedule && proposal.parameters?.humanIntent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Schedule</span>
            <span style={{ fontSize: 14, color: theme.ink }}>{proposal.parameters.humanIntent}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</span>
          <span style={{ fontSize: 14, color: theme.ink }}>
            {isPurchase ? `Install ${p.integrationName} Integration` : isTransfer ? `Transfer ${p.asset?.toUpperCase() || 'USDC'} from my balance` : (targetIntent?.replace(/_/g, ' ') || 'Execute action')}
          </span>
        </div>

        {isPurchase && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monthly Cost</span>
              <span style={{ fontSize: 14, color: theme.status, fontWeight: 600 }}>
                {p.priceUsdc} USDC / month
              </span>
            </div>
          </>
        )}

        {isTransfer && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Network</span>
              <span style={{ fontSize: 14, color: theme.ink, fontWeight: 500 }}>
                Base Mainnet
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recipient</span>
              <span style={{ fontSize: 14, color: p.recipient ? theme.ink : theme.status, fontWeight: p.recipient ? 500 : 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: (p.recipient?.type === 'EXTERNAL_ADDRESS' || (typeof p.recipient === 'string' && p.recipient.startsWith('0x'))) ? 'monospace' : 'inherit' }}>
                  {p.recipient?.type === 'EXTERNAL_ADDRESS' || (typeof p.recipient === 'string' && p.recipient.startsWith('0x'))
                    ? shortenAddress(p.recipient?.address || p.recipient) 
                    : getWalletLabel(p.recipient)}
                </span>
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</span>
              <span style={{ fontSize: 14, color: p.amount ? theme.ink : theme.status, fontWeight: p.amount ? 500 : 500 }}>
                {p.amount ? `${p.amount} ${p.asset?.toUpperCase() || 'USDC'}` : 'Not set yet ⚠️'}
              </span>
            </div>
          </>
        )}

        {proposal.candidates && proposal.candidates.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Candidates</span>
            {proposal.candidates.map((c: any) => (
              <label key={c.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: 12, borderRadius: 8,
                border: `1px solid ${selectedCandidate === c.id ? theme.accent : theme.border}`,
                background: selectedCandidate === c.id ? (theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)') : 'transparent',
                cursor: status === 'PENDING' ? 'pointer' : 'default',
                opacity: status === 'PENDING' ? 1 : 0.7,
                transition: 'all 0.2s'
              }}>
                <input 
                  type="radio" 
                  name={`candidate-${proposal.proposalId}`} 
                  value={c.id} 
                  checked={selectedCandidate === c.id}
                  onChange={() => status === 'PENDING' && setSelectedCandidate(c.id)}
                  style={{ marginTop: 2, accentColor: theme.accent }}
                  disabled={status !== 'PENDING'}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.ink }}>{c.title}</span>
                  <span style={{ fontSize: 12, color: theme.inkSoft }}>{c.rationale}</span>
                  <span style={{ fontSize: 11, color: theme.accent, marginTop: 4 }}>Type: {c.category}</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons or Status */}
      {status === 'PENDING' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
          <div style={{ fontSize: 13, color: theme.inkSoft, fontStyle: 'italic' }}>
            Do you approve this automation?
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button 
              onClick={() => handleRespond('APPROVE')}
              disabled={(proposal.candidates?.length ?? 0) > 0 && !selectedCandidate}
              style={{
                flex: 1,
                background: theme.ink,
                color: theme.bg,
                border: 'none',
                padding: '10px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: (proposal.candidates?.length ?? 0) > 0 && !selectedCandidate ? 'not-allowed' : 'pointer',
                opacity: (proposal.candidates?.length ?? 0) > 0 && !selectedCandidate ? 0.5 : 1,
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => { if (!((proposal.candidates?.length ?? 0) > 0 && !selectedCandidate)) e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { if (!((proposal.candidates?.length ?? 0) > 0 && !selectedCandidate)) e.currentTarget.style.opacity = '1'; }}
            >
              Approve
            </button>
            <button 
              onClick={() => handleRespond('REJECT')}
              style={{
                flex: 1,
                background: 'transparent',
                color: theme.ink,
                border: `1px solid ${theme.border}`,
                padding: '10px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Reject
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          marginTop: 4,
          padding: 12,
          borderRadius: 8,
          background: status === 'APPROVED' ? theme.statusSoft : theme.isDark ? 'rgba(255,100,100,0.1)' : 'rgba(255,0,0,0.05)',
          color: status === 'APPROVED' ? theme.status : '#ff4444',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 600
        }}>
          {status === 'APPROVED' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {status === 'APPROVED' ? 'Proposal Approved' : 'Proposal Rejected'}
        </div>
      )}
    </div>
  );
}
