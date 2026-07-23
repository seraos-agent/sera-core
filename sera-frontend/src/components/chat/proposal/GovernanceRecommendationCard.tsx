import { useState } from 'react';
import { CheckCircle2, XCircle, Brain, Sparkles } from 'lucide-react';
import type { ThemeType } from '../../../theme';

export interface MetaCognitiveRecommendationPayload {
  id: string;
  target: string;
  proposedAction: string;
  rationale: string;
  confidence: number;
  evidenceCount: number;
  institutionalPrecedent?: {
    approvalRate: number;
    patternStabilityScore: number;
  };
  communicationState?: {
    presentationStrategy: 'STANDARD' | 'CAUTIONARY' | 'ASSERTIVE';
    uncertaintyDisclosureLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  status: 'PENDING_GOVERNANCE_REVIEW' | 'APPROVED' | 'REJECTED';
  createdAt: number;
}

export function GovernanceRecommendationCard({
  theme,
  recommendation,
  onRespond
}: {
  theme: ThemeType;
  recommendation: MetaCognitiveRecommendationPayload;
  onRespond: (recommendationId: string, decision: 'APPROVED' | 'REJECTED', rationale?: string) => void;
}) {
  const [localStatus, setLocalStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [userRationale, setUserRationale] = useState('');
  const [showRationaleInput, setShowRationaleInput] = useState(false);

  const currentStatus = recommendation.status === 'PENDING_GOVERNANCE_REVIEW' ? localStatus : (recommendation.status as any);

  const handleRespond = (decision: 'APPROVED' | 'REJECTED') => {
    if (currentStatus !== 'PENDING') return;
    setLocalStatus(decision);
    onRespond(recommendation.id, decision, userRationale || undefined);
  };

  const confidencePct = Math.round((recommendation.confidence || 0) * 100);
  const strategy = recommendation.communicationState?.presentationStrategy || 'STANDARD';

  return (
    <div style={{
      marginTop: 12,
      background: theme.isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
      border: `1px solid ${strategy === 'CAUTIONARY' ? '#F59E0B' : theme.border}`,
      borderRadius: 16,
      padding: 24,
      minWidth: 380,
      maxWidth: '100%',
      fontFamily: 'Inter, sans-serif',
      boxShadow: theme.isDark ? '0 4px 20px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${theme.border}`, paddingBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={18} color={theme.accent} />
          <span style={{ fontSize: 15, fontWeight: 600, color: theme.ink }}>
            Meta-Governance Review
          </span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 20,
          background: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          border: `1px solid ${theme.border}`
        }}>
          <Sparkles size={13} color={theme.accent} />
          <span style={{ fontSize: 11, fontWeight: 600, color: theme.ink, textTransform: 'uppercase' }}>
            Target: {recommendation.target}
          </span>
        </div>
      </div>

      {/* Main Proposed Action */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Proposed Governance Adjustment
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.ink, lineHeight: 1.4 }}>
          {recommendation.proposedAction}
        </div>
      </div>

      {/* Rationale & Evidence */}
      <div style={{
        background: theme.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)',
        borderRadius: 10,
        padding: 12,
        border: `1px solid ${theme.border}`,
        fontSize: 13,
        color: theme.inkSoft,
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }}>
        <div><strong>Rationale:</strong> {recommendation.rationale}</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 12 }}>
          <span>📊 Confidence: <strong>{confidencePct}%</strong></span>
          <span>📁 Evidence Observations: <strong>{recommendation.evidenceCount}</strong></span>
        </div>
      </div>

      {/* Rationale Input toggle */}
      {currentStatus === 'PENDING' && (
        <div>
          {!showRationaleInput ? (
            <button
              onClick={() => setShowRationaleInput(true)}
              style={{ background: 'none', border: 'none', color: theme.inkSoft, fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              + Add review notes/rationale (optional)
            </button>
          ) : (
            <input
              type="text"
              placeholder="Provide decision rationale..."
              value={userRationale}
              onChange={(e) => setUserRationale(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: theme.isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                color: theme.ink,
                fontSize: 13,
                outline: 'none'
              }}
            />
          )}
        </div>
      )}

      {/* Action Buttons or Status Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingTop: 4 }}>
        {currentStatus === 'PENDING' ? (
          <>
            <button
              onClick={() => handleRespond('REJECTED')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 10,
                border: `1px solid ${theme.isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5'}`,
                background: theme.isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
                color: '#EF4444', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}
            >
              <XCircle size={15} /> Reject
            </button>
            <button
              onClick={() => handleRespond('APPROVED')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 10,
                border: 'none',
                background: theme.accent,
                color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
              }}
            >
              <CheckCircle2 size={15} /> Approve Recommendation
            </button>
          </>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 20,
            background: currentStatus === 'APPROVED' ? (theme.isDark ? 'rgba(34,197,94,0.15)' : '#DCFCE7') : (theme.isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2'),
            color: currentStatus === 'APPROVED' ? '#16A34A' : '#EF4444',
            fontSize: 13, fontWeight: 600
          }}>
            {currentStatus === 'APPROVED' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {currentStatus === 'APPROVED' ? 'Recommendation Approved' : 'Recommendation Rejected'}
          </div>
        )}
      </div>
    </div>
  );
}
