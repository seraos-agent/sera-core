import type { ThemeType } from '../../../theme';
import { Clock, Repeat, Zap } from 'lucide-react';

export function ScheduleProposal({ 
  theme, 
  parameters,
  walletState: _walletState
}: { 
  theme: ThemeType;
  parameters: any;
  walletState?: any;
}) {
  const p = parameters || {};
  const isRecurring = p.scheduleType === 'cron';
  const isTransfer = p.actionIntent === 'TRANSFER_FUNDS';
  const actionParams = p.actionParameters || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
      
      {/* Schedule Banner */}
      <div style={{ 
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px', borderRadius: 12,
        background: theme.isDark ? 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)' : 'linear-gradient(135deg, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.01) 100%)',
        border: `1px solid ${theme.border}`,
        boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.02)',
        position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', width: 80, height: 80, background: theme.accent, filter: 'blur(40px)', opacity: 0.15 }} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, zIndex: 1 }}>
          {isRecurring ? <Repeat size={14} color={theme.accent} /> : <Clock size={14} color={theme.accent} />}
          <span style={{ fontSize: 12, color: theme.inkSoft, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            {isRecurring ? 'Recurring Schedule' : 'Scheduled Event'}
          </span>
        </div>
        
        <span style={{ fontSize: 22, color: theme.ink, fontWeight: 800, letterSpacing: -0.5, zIndex: 1, textAlign: 'center' }}>
          {p.humanIntent || 'Future Execution'}
        </span>
      </div>

      {/* Action Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 12, background: theme.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: theme.inkSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Schedule Type</span>
          <span style={{ 
            fontSize: 11, fontWeight: 700, 
            color: isRecurring ? '#10b981' : theme.accent, 
            background: isRecurring ? 'rgba(16, 185, 129, 0.1)' : theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', 
            padding: '3px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 
          }}>
            {isRecurring ? <Repeat size={11} /> : <Zap size={11} />}
            {isRecurring ? 'Recurring (Cron)' : 'One-Time Delay'}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: theme.inkSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Target Action</span>
          <span style={{ fontSize: 13, color: theme.accent, fontWeight: 700, background: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', padding: '4px 10px', borderRadius: 6 }}>
            {p.actionIntent?.replace(/_/g, ' ') || 'Execute action'}
          </span>
        </div>

        {actionParams.coin && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: theme.inkSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Asset</span>
            <span style={{ fontSize: 13, color: theme.ink, fontWeight: 700 }}>
              {actionParams.coin}
            </span>
          </div>
        )}
        
        {isTransfer && actionParams.amount && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: theme.inkSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Value</span>
            <span style={{ fontSize: 14, color: theme.ink, fontWeight: 700 }}>
              {actionParams.amount === 'all' ? 'Entire Balance' : actionParams.amount} {actionParams.asset?.toUpperCase()}
            </span>
          </div>
        )}
      </div>

    </div>
  );
}
