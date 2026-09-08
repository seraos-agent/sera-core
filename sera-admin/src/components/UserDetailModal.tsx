import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Coins,
  Shield,
  Zap,
  HardDrive,
  MessageCircle,
  AtSign,
  Brain,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Wallet,
  Bot,
  Layers
} from 'lucide-react';
import { UserSummary, UserDetail } from '../types';
import {
  fetchUserDetail,
  adjustUserCredits,
  forceDisconnectIntegration,
  cancelUserTrigger
} from '../api';

interface UserDetailModalProps {
  userSummary: UserSummary;
  onClose: () => void;
  onUserUpdated: () => void;
}

export const UserDetailModal: React.FC<UserDetailModalProps> = ({
  userSummary,
  onClose,
  onUserUpdated
}) => {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Credit adjustment state
  const [creditDelta, setCreditDelta] = useState<string>('');
  const [isUpdatingCredits, setIsUpdatingCredits] = useState(false);
  const [creditActionSuccess, setCreditActionSuccess] = useState<string | null>(null);

  // Disconnect & Trigger state
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const loadDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchUserDetail(userSummary.id);
      setDetail(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch detailed user record.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [userSummary.id]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  const handleAdjustCredits = async (amount: number) => {
    if (!amount || isNaN(amount)) return;
    try {
      setIsUpdatingCredits(true);
      setError(null);
      const newCredits = await adjustUserCredits(userSummary.id, amount);
      if (detail) {
        setDetail({ ...detail, agentCredits: newCredits });
      }
      setCreditActionSuccess(`Credits ${amount > 0 ? 'granted' : 'deducted'}: ${Math.abs(amount).toLocaleString()} credits.`);
      setTimeout(() => setCreditActionSuccess(null), 3000);
      setCreditDelta('');
      onUserUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to adjust credits.');
    } finally {
      setIsUpdatingCredits(false);
    }
  };

  const handleForceDisconnect = async (provider: string) => {
    if (!confirm(`Are you sure you want to force disconnect ${provider} for user ${userSummary.id}?`)) {
      return;
    }
    try {
      setActionInProgress(`disconnect-${provider}`);
      await forceDisconnectIntegration(userSummary.id, provider);
      await loadDetail();
      onUserUpdated();
    } catch (err: any) {
      setError(err.message || `Failed to disconnect ${provider}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancelTrigger = async (triggerId: string) => {
    if (!confirm(`Terminate background trigger ${triggerId}?`)) return;
    try {
      setActionInProgress(`trigger-${triggerId}`);
      await cancelUserTrigger(userSummary.id, triggerId);
      await loadDetail();
      onUserUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel trigger.');
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#111115',
        border: '1px solid #1E1E26',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '820px',
        maxHeight: '88vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #1E1E26',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          backgroundColor: '#111115',
          zIndex: 10
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="font-mono" style={{ fontSize: '1.05rem', fontWeight: 600, color: '#F4F4F6' }}>
                {userSummary.id}
              </span>
              <button
                onClick={() => handleCopy(userSummary.id)}
                title="Copy Session ID"
                style={{ color: '#71717A', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
              >
                {copiedId ? <Check size={14} style={{ color: '#10B981' }} /> : <Copy size={14} />}
              </button>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 500,
                padding: '2px 7px',
                borderRadius: '4px',
                backgroundColor: userSummary.isInstanceActive ? '#151C17' : '#18181D',
                color: userSummary.isInstanceActive ? '#A7F3D0' : '#71717A',
                border: `1px solid ${userSummary.isInstanceActive ? '#203324' : '#222228'}`
              }}>
                {userSummary.isInstanceActive ? 'ACTIVE' : 'DORMANT'}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
              {(detail?.walletAddress || userSummary.walletAddress) && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#16161D',
                  padding: '3px 8px',
                  borderRadius: '5px',
                  border: '1px solid #22222D'
                }}>
                  <span style={{ fontSize: '0.62rem', color: '#A1A1AA', fontWeight: 600 }}>USER:</span>
                  <span className="font-mono" style={{ fontSize: '0.72rem', color: '#E4E4E7' }}>
                    {detail?.walletAddress || userSummary.walletAddress}
                  </span>
                  <a
                    href={`https://basescan.org/address/${detail?.walletAddress || userSummary.walletAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.68rem', marginLeft: '2px' }}
                  >
                    BaseScan <ExternalLink size={10} />
                  </a>
                </div>
              )}

              {(detail?.agentVaultAddress || userSummary.agentVaultAddress) && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#141419',
                  padding: '3px 8px',
                  borderRadius: '5px',
                  border: '1px solid #20202A'
                }}>
                  <span style={{ fontSize: '0.62rem', color: '#818CF8', fontWeight: 600 }}>VAULT:</span>
                  <span className="font-mono" style={{ fontSize: '0.72rem', color: '#C7D2FE' }}>
                    {detail?.agentVaultAddress || userSummary.agentVaultAddress}
                  </span>
                  <a
                    href={`https://basescan.org/address/${detail?.agentVaultAddress || userSummary.agentVaultAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#A5B4FC', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.68rem', marginLeft: '2px' }}
                  >
                    BaseScan <ExternalLink size={10} />
                  </a>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '6px',
              borderRadius: '6px',
              backgroundColor: '#181820',
              border: '1px solid #242430',
              color: '#71717A',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: '#1E1416',
              border: '1px solid #382024',
              color: '#F87171',
              fontSize: '0.78rem'
            }}>
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {creditActionSuccess && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: '#131A15',
              border: '1px solid #203325',
              color: '#A7F3D0',
              fontSize: '0.78rem'
            }}>
              <CheckCircle2 size={15} />
              <span>{creditActionSuccess}</span>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', color: '#71717A', gap: '8px' }}>
              <Loader2 size={18} className="animate-spin" />
              <span style={{ fontSize: '0.82rem' }}>Loading user state...</span>
            </div>
          ) : (
            <>
              {/* 1. Credit Management Card */}
              <div className="glass-card" style={{ padding: '18px', backgroundColor: '#131317', border: '1px solid #1E1E26' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Coins size={15} style={{ color: '#A1A1AA' }} />
                    <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#F4F4F6' }}>
                      Compute Credits
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#71717A' }}>Balance:</span>
                    <span className="font-mono" style={{ fontSize: '1rem', fontWeight: 600, color: '#F4F4F6' }}>
                      {(detail?.agentCredits ?? userSummary.agentCredits ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#71717A' }}>Quick Grant:</span>
                  <button
                    disabled={isUpdatingCredits}
                    onClick={() => handleAdjustCredits(50000)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '5px',
                      backgroundColor: '#181822',
                      border: '1px solid #262634',
                      color: '#D4D4D8',
                      fontSize: '0.72rem',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    +50,000
                  </button>
                  <button
                    disabled={isUpdatingCredits}
                    onClick={() => handleAdjustCredits(250000)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '5px',
                      backgroundColor: '#181822',
                      border: '1px solid #262634',
                      color: '#D4D4D8',
                      fontSize: '0.72rem',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    +250,000
                  </button>
                  <button
                    disabled={isUpdatingCredits}
                    onClick={() => handleAdjustCredits(1000000)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '5px',
                      backgroundColor: '#181822',
                      border: '1px solid #262634',
                      color: '#D4D4D8',
                      fontSize: '0.72rem',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    +1,000,000
                  </button>
                </div>

                {/* Custom Adjust Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    value={creditDelta}
                    onChange={(e) => setCreditDelta(e.target.value)}
                    placeholder="Custom amount (e.g. 100000 or -50000)"
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      backgroundColor: '#0A0A0E',
                      border: '1px solid #1F1F28',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      color: '#F4F4F6',
                      fontFamily: 'JetBrains Mono, monospace',
                      outline: 'none'
                    }}
                  />
                  <button
                    disabled={isUpdatingCredits || !creditDelta}
                    onClick={() => handleAdjustCredits(Number(creditDelta))}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '6px',
                      backgroundColor: '#1E1E26',
                      border: '1px solid #2E2E38',
                      color: '#F4F4F6',
                      fontSize: '0.78rem',
                      fontWeight: 500,
                      cursor: isUpdatingCredits || !creditDelta ? 'not-allowed' : 'pointer',
                      opacity: isUpdatingCredits || !creditDelta ? 0.6 : 1
                    }}
                  >
                    {isUpdatingCredits ? 'Updating...' : 'Apply'}
                  </button>
                </div>
              </div>

              {/* 2. Twin-Wallet Architecture (Base Mainnet) */}
              <div className="glass-card" style={{ padding: '18px', backgroundColor: '#131317', border: '1px solid #1E1E26' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Wallet size={15} style={{ color: '#A1A1AA' }} />
                    <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#F4F4F6' }}>
                      Twin-Wallet Architecture (Base Mainnet)
                    </h3>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#71717A' }}>
                    Reown Personal + Thirdweb Agent Vault
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                  {/* Personal Wallet */}
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#0D0D11',
                    border: '1px solid #1C1C24'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#A1A1AA', letterSpacing: '0.04em' }}>
                        USER PERSONAL WALLET
                      </span>
                      <span style={{ fontSize: '0.65rem', color: '#10B981', backgroundColor: '#102A1E', padding: '1px 5px', borderRadius: '3px' }}>
                        {detail?.walletAccounts?.find(w => w.kind === 'PERSONAL')?.status || (detail?.walletAddress || userSummary.walletAddress ? 'READY' : 'UNLINKED')}
                      </span>
                    </div>
                    {(detail?.walletAddress || userSummary.walletAddress) ? (
                      <div>
                        <div className="font-mono" style={{ fontSize: '0.75rem', color: '#E4E4E7', wordBreak: 'break-all' }}>
                          {detail?.walletAddress || userSummary.walletAddress}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                          <span style={{ fontSize: '0.68rem', color: '#71717A' }}>Provider: Reown AppKit</span>
                          <a
                            href={`https://basescan.org/address/${detail?.walletAddress || userSummary.walletAddress}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem' }}
                          >
                            BaseScan <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#52525B' }}>No personal wallet connected yet</span>
                    )}
                  </div>

                  {/* Agent Vault */}
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#0D0D11',
                    border: '1px solid #1C1C24'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#818CF8', letterSpacing: '0.04em' }}>
                        AUTONOMOUS AGENT VAULT
                      </span>
                      <span style={{ fontSize: '0.65rem', color: '#818CF8', backgroundColor: '#18192E', padding: '1px 5px', borderRadius: '3px' }}>
                        {detail?.walletAccounts?.find(w => w.kind === 'AGENT')?.status || (detail?.agentVaultAddress || userSummary.agentVaultAddress ? 'READY' : 'PROVISIONING')}
                      </span>
                    </div>
                    {(detail?.agentVaultAddress || userSummary.agentVaultAddress) ? (
                      <div>
                        <div className="font-mono" style={{ fontSize: '0.75rem', color: '#C7D2FE', wordBreak: 'break-all' }}>
                          {detail?.agentVaultAddress || userSummary.agentVaultAddress}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                          <span style={{ fontSize: '0.68rem', color: '#71717A' }}>Provider: Thirdweb Engine</span>
                          <a
                            href={`https://basescan.org/address/${detail?.agentVaultAddress || userSummary.agentVaultAddress}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#A5B4FC', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem' }}
                          >
                            BaseScan <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#52525B' }}>Agent vault not yet provisioned</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Connected Integrations Control */}
              <div className="glass-card" style={{ padding: '18px', backgroundColor: '#131317', border: '1px solid #1E1E26' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                  <HardDrive size={15} style={{ color: '#A1A1AA' }} />
                  <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#F4F4F6' }}>
                    Cloud Integrations
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                  {/* Google Drive */}
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#0D0D11',
                    border: '1px solid #1C1C24',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <HardDrive size={14} style={{ color: (detail?.connections?.googleDrive ?? userSummary.connections?.googleDrive) ? '#A7F3D0' : '#52525B' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#E4E4E7' }}>Google Drive</span>
                      </div>
                      <span style={{
                        fontSize: '0.65rem',
                        color: (detail?.connections?.googleDrive ?? userSummary.connections?.googleDrive) ? '#A7F3D0' : '#71717A'
                      }}>
                        {(detail?.connections?.googleDrive ?? userSummary.connections?.googleDrive) ? 'Connected' : 'Offline'}
                      </span>
                    </div>
                    {(detail?.connections?.googleDrive ?? userSummary.connections?.googleDrive) && (
                      <button
                        onClick={() => handleForceDisconnect('google-drive')}
                        disabled={actionInProgress === 'disconnect-google-drive'}
                        style={{
                          padding: '4px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#1E1416',
                          color: '#F87171',
                          border: '1px solid #341E22',
                          fontSize: '0.68rem',
                          cursor: 'pointer'
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>

                  {/* Telegram */}
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#0D0D11',
                    border: '1px solid #1C1C24',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MessageCircle size={14} style={{ color: (detail?.connections?.telegram ?? userSummary.connections?.telegram) ? '#A7F3D0' : '#52525B' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#E4E4E7' }}>Telegram</span>
                      </div>
                      <span style={{
                        fontSize: '0.65rem',
                        color: (detail?.connections?.telegram ?? userSummary.connections?.telegram) ? '#A7F3D0' : '#71717A'
                      }}>
                        {(detail?.connections?.telegram ?? userSummary.connections?.telegram) ? 'Connected' : 'Offline'}
                      </span>
                    </div>
                    {detail?.telegramId && (
                      <div style={{ fontSize: '0.68rem', color: '#71717A' }} className="font-mono">
                        TG ID: {detail.telegramId}
                      </div>
                    )}
                  </div>

                  {/* Claude MCP */}
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#0D0D11',
                    border: '1px solid #1C1C24',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Bot size={14} style={{ color: (detail?.connections?.claude ?? userSummary.connections?.claude) ? '#A7F3D0' : '#52525B' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#E4E4E7' }}>Claude MCP</span>
                      </div>
                      <span style={{
                        fontSize: '0.65rem',
                        color: (detail?.connections?.claude ?? userSummary.connections?.claude) ? '#A7F3D0' : '#71717A'
                      }}>
                        {(detail?.connections?.claude ?? userSummary.connections?.claude) ? 'Connected' : 'Offline'}
                      </span>
                    </div>
                  </div>

                  {/* Hyperliquid */}
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#0D0D11',
                    border: '1px solid #1C1C24',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={14} style={{ color: (detail?.connections?.hyperliquid ?? userSummary.connections?.hyperliquid) ? '#A7F3D0' : '#52525B' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#E4E4E7' }}>Hyperliquid</span>
                      </div>
                      <span style={{
                        fontSize: '0.65rem',
                        color: (detail?.connections?.hyperliquid ?? userSummary.connections?.hyperliquid) ? '#A7F3D0' : '#71717A'
                      }}>
                        {(detail?.connections?.hyperliquid ?? userSummary.connections?.hyperliquid) ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {/* Threads */}
                  <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: '#0D0D11',
                    border: '1px solid #1C1C24',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AtSign size={14} style={{ color: (detail?.connections?.threads ?? userSummary.connections?.threads) ? '#A7F3D0' : '#52525B' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#E4E4E7' }}>Threads</span>
                      </div>
                      <span style={{
                        fontSize: '0.65rem',
                        color: (detail?.connections?.threads ?? userSummary.connections?.threads) ? '#A7F3D0' : '#71717A'
                      }}>
                        {(detail?.connections?.threads ?? userSummary.connections?.threads) ? 'Connected' : 'Offline'}
                      </span>
                    </div>
                    {(detail?.connections?.threads ?? userSummary.connections?.threads) && (
                      <button
                        onClick={() => handleForceDisconnect('threads')}
                        disabled={actionInProgress === 'disconnect-threads'}
                        style={{
                          padding: '4px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#1E1416',
                          color: '#F87171',
                          border: '1px solid #341E22',
                          fontSize: '0.68rem',
                          cursor: 'pointer'
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Active Background Automations / Triggers */}
              <div className="glass-card" style={{ padding: '18px', backgroundColor: '#131317', border: '1px solid #1E1E26' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                  <Zap size={15} style={{ color: '#A1A1AA' }} />
                  <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#F4F4F6' }}>
                    Active Background Triggers ({detail?.triggers?.length || 0})
                  </h3>
                </div>

                {!detail?.triggers || detail.triggers.length === 0 ? (
                  <p style={{ fontSize: '0.75rem', color: '#71717A' }}>
                    No triggers or daemon automations scheduled for this user.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {detail.triggers.map((trig) => (
                      <div
                        key={trig.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#0A0A0E',
                          border: '1px solid #1C1C24'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="font-mono" style={{ fontSize: '0.75rem', color: '#E4E4E7' }}>
                              {trig.id}
                            </span>
                            <span style={{
                              fontSize: '0.65rem',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              backgroundColor: '#181822',
                              color: '#A1A1AA',
                              border: '1px solid #242430'
                            }}>
                              {trig.type || 'CRON'}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.72rem', color: '#8E8E98', marginTop: '3px' }}>
                            {trig.prompt || trig.task || JSON.stringify(trig.condition || '')}
                          </p>
                        </div>

                        <button
                          onClick={() => handleCancelTrigger(trig.id)}
                          disabled={actionInProgress === `trigger-${trig.id}`}
                          title="Terminate Trigger"
                          style={{
                            padding: '5px',
                            borderRadius: '4px',
                            backgroundColor: '#1E1416',
                            color: '#F87171',
                            border: '1px solid #341E22',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. Long-term Beliefs & Autonomy Agreements */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {/* Memory Beliefs */}
                <div className="glass-card" style={{ padding: '16px', backgroundColor: '#131317', border: '1px solid #1E1E26' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <Brain size={14} style={{ color: '#A1A1AA' }} />
                    <h4 style={{ fontSize: '0.82rem', fontWeight: 600, color: '#F4F4F6' }}>
                      Long-Term Beliefs ({detail?.memoryBeliefs?.length || 0})
                    </h4>
                  </div>
                  {!detail?.memoryBeliefs || detail.memoryBeliefs.length === 0 ? (
                    <p style={{ fontSize: '0.72rem', color: '#71717A' }}>No protected beliefs recorded.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {detail.memoryBeliefs.map((b, idx) => (
                        <li key={idx} style={{ fontSize: '0.72rem', color: '#D4D4D8', padding: '5px 8px', borderRadius: '4px', backgroundColor: '#0A0A0E' }}>
                          • {b.belief || JSON.stringify(b)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Autonomy Agreements */}
                <div className="glass-card" style={{ padding: '16px', backgroundColor: '#131317', border: '1px solid #1E1E26' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <Shield size={14} style={{ color: '#A1A1AA' }} />
                    <h4 style={{ fontSize: '0.82rem', fontWeight: 600, color: '#F4F4F6' }}>
                      Autonomy Agreements ({detail?.agreements?.length || 0})
                    </h4>
                  </div>
                  {!detail?.agreements || detail.agreements.length === 0 ? (
                    <p style={{ fontSize: '0.72rem', color: '#71717A' }}>No active agreements.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {detail.agreements.map((a, idx) => (
                        <li key={idx} style={{ fontSize: '0.72rem', color: '#D4D4D8', padding: '5px 8px', borderRadius: '4px', backgroundColor: '#0A0A0E' }}>
                          ✓ {a.toolIntent} ({a.scope || 'unlimited'})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
