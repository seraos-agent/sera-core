import { useState } from 'react';
import { CheckCircle2, Clock, ShieldAlert, ShieldCheck, XCircle, Zap, Repeat, Timer } from 'lucide-react';
import type { ThemeType } from '../../theme';
import { TransferProposal } from './proposal/TransferProposal';
import { ScheduleProposal } from './proposal/ScheduleProposal';

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
  onRespond,
  walletState
}: {
  theme: ThemeType;
  proposal: ProposalPayload;
  onRespond: (proposalId: string, action: 'APPROVE' | 'REJECT', candidateId?: string) => void;
  walletState?: any;
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
  const isOperatingAgreement = proposal.intent === 'ACTIVATE_AUTONOMY_AGREEMENT';

  let title = "Action Proposal";
  if (isPurchase) title = "Integration Purchase";
  else if (isSchedule && isTransfer) title = "Recurring Transfer";
  else if (isSchedule) title = "Scheduled Automation";
  else if (isTransfer) title = "Wallet Transfer";
  else if (isOperatingAgreement) title = "Operating Agreement";

  const p = isSchedule ? proposal.parameters?.actionParameters || {} : proposal.parameters || {};

  return (
    <div style={{
      marginTop: 12,
      background: theme.isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: 24,
      minWidth: 380,
      maxWidth: '100%',
      fontFamily: 'Inter, sans-serif',
      boxShadow: theme.isDark ? '0 4px 20px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${theme.border}`, padding: '0 24px 16px 24px', margin: '0 -24px -4px -24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isOperatingAgreement ? (
            <ShieldCheck size={18} color={theme.accent} />
          ) : isSchedule ? (
            <Clock size={18} color={theme.accent} />
          ) : (
            <ShieldAlert size={18} color={theme.accent} />
          )}
          <span style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>
            {title}
          </span>
        </div>
        
        {/* Execution Type Badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 20,
          background: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          border: `1px solid ${theme.border}`
        }}>
          {isSchedule ? (
            proposal.parameters?.scheduleType === 'cron' ? (
              <><Repeat size={14} color={theme.accent} /><span style={{ fontSize: 12, fontWeight: 700, color: theme.ink, fontFamily: 'monospace' }}>∞</span></>
            ) : (
              <><Timer size={14} color={theme.accent} /><span style={{ fontSize: 11, fontWeight: 700, color: theme.ink, textTransform: 'uppercase' }}>Delay</span></>
            )
          ) : (
            <><Zap size={14} color={theme.accent} /><span style={{ fontSize: 12, fontWeight: 700, color: theme.ink, fontFamily: 'monospace' }}>1x</span></>
          )}
        </div>
      </div>

      {/* Human-readable Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {isSchedule && proposal.parameters && (
          <ScheduleProposal theme={theme} parameters={proposal.parameters} walletState={walletState} />
        )}

        {!isTransfer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</span>
            <span style={{ fontSize: 14, color: theme.ink }}>
              {isOperatingAgreement
                ? `Activate ${p.mode === 'FULL_ACCESS' ? 'Full Access' : 'Assistant'} for ${p.title || 'this ongoing intent'}`
                : isPurchase ? `Install ${p.integrationName} Integration` : (targetIntent?.replace(/_/g, ' ') || 'Execute action')}
            </span>
          </div>
        )}

        {isOperatingAgreement && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Scope</span>
              <span style={{ fontSize: 14, color: theme.ink }}>{p.intent || 'Ongoing activity'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Authority</span>
              <span style={{ fontSize: 14, color: theme.ink }}>{p.mode === 'FULL_ACCESS' ? 'Acts within this exact scope after approval' : 'Requests approval for each action'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Safety boundary</span>
              <span style={{ fontSize: 14, color: theme.ink }}>
                {Array.isArray(p.permissions) && p.permissions.length === 1 && p.permissions[0] === 'PAPER_TRADE'
                  ? 'Local paper-trading simulation only. No real order or balance can change.'
                  : 'Only the explicit actions in this agreement are authorized.'}
              </span>
            </div>
          </>
        )}

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

        {isTransfer && !isSchedule && (
          <TransferProposal theme={theme} parameters={p} walletState={walletState} />
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
            {isOperatingAgreement ? 'Approve this agreement?' : 'Approve this transaction?'}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              onClick={() => handleRespond('APPROVE')}
              disabled={(proposal.candidates?.length ?? 0) > 0 && !selectedCandidate}
              style={{
                flex: 1,
                background: ((proposal.candidates?.length ?? 0) > 0 && !selectedCandidate) ? theme.border : theme.ink,
                color: theme.bg,
                border: 'none',
                padding: '12px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: ((proposal.candidates?.length ?? 0) > 0 && !selectedCandidate) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: ((proposal.candidates?.length ?? 0) > 0 && !selectedCandidate) ? 'none' : '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'all 0.2s',
                opacity: ((proposal.candidates?.length ?? 0) > 0 && !selectedCandidate) ? 0.5 : 1
              }}
            >
              <CheckCircle2 size={18} /> Approve
            </button>
            <button 
              onClick={() => handleRespond('REJECT')}
              style={{
                flex: 1,
                background: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                color: theme.ink,
                border: `1px solid ${theme.border}`,
                padding: '12px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s'
              }}
            >
              <XCircle size={18} /> Reject
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
