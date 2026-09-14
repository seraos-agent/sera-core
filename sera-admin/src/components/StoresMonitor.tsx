import React, { useState, useEffect } from 'react';
import {
  Store,
  Clock,
  MessageCircle,
  MapPin,
  ExternalLink,
  RotateCcw,
  Search,
  Package,
  Wrench,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { StoreSummary } from '../types';
import { fetchStores, updateStoreOverride } from '../api';

export const StoresMonitor: React.FC = () => {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [updatingStoreId, setUpdatingStoreId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadStores = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStores();
      setStores(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch merchant stores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStores();
  }, []);

  const handleToggleOverride = async (store: StoreSummary, newOverride: boolean | null) => {
    try {
      setUpdatingStoreId(store.storeId);
      setError(null);
      await updateStoreOverride(store.storeId, newOverride);
      setActionSuccess(`Status toko "${store.storeName}" berhasil diperbarui.`);
      setTimeout(() => setActionSuccess(null), 3500);
      await loadStores();
    } catch (err: any) {
      setError(err.message || 'Gagal mengubah status toko');
    } finally {
      setUpdatingStoreId(null);
    }
  };

  const filteredStores = stores.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.storeName.toLowerCase().includes(q) ||
      s.storeId.toLowerCase().includes(q) ||
      (s.ownerWhatsApp || '').includes(q) ||
      (s.category || '').toLowerCase().includes(q)
    );
  });

  const totalStores = stores.length;
  const openStores = stores.filter((s) => s.status?.isOpen).length;
  const goodsStores = stores.filter((s) => s.businessType === 'GOODS').length;
  const serviceStores = stores.filter((s) => s.businessType === 'SERVICE').length;

  return (
    <div>
      {/* KPI Header Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div className="glass-card" style={{ padding: '16px 18px', backgroundColor: '#111116', border: '1px solid #1F1F28', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#71717A', letterSpacing: '0.04em' }}>TOTAL REGISTERED STORES</span>
            <Store size={15} style={{ color: '#3B82F6' }} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F4F4F6' }}>{totalStores}</div>
          <div style={{ fontSize: '0.72rem', color: '#71717A', marginTop: '2px' }}>Multi-merchant catalog</div>
        </div>

        <div className="glass-card" style={{ padding: '16px 18px', backgroundColor: '#111116', border: '1px solid #1F1F28', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#71717A', letterSpacing: '0.04em' }}>OPEN RIGHT NOW</span>
            <span className="status-indicator status-active" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10B981' }}>{openStores}</div>
          <div style={{ fontSize: '0.72rem', color: '#71717A', marginTop: '2px' }}>Accepting instant orders</div>
        </div>

        <div className="glass-card" style={{ padding: '16px 18px', backgroundColor: '#111116', border: '1px solid #1F1F28', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#71717A', letterSpacing: '0.04em' }}>GOODS (PRODUCTS)</span>
            <Package size={15} style={{ color: '#A78BFA' }} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F4F4F6' }}>{goodsStores}</div>
          <div style={{ fontSize: '0.72rem', color: '#71717A', marginTop: '2px' }}>Food, hampers, retail</div>
        </div>

        <div className="glass-card" style={{ padding: '16px 18px', backgroundColor: '#111116', border: '1px solid #1F1F28', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#71717A', letterSpacing: '0.04em' }}>SERVICES (BOOKINGS)</span>
            <Wrench size={15} style={{ color: '#F59E0B' }} />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F4F4F6' }}>{serviceStores}</div>
          <div style={{ fontSize: '0.72rem', color: '#71717A', marginTop: '2px' }}>Mechanic, cleaning, repair</div>
        </div>
      </div>

      {/* Main Stores Table Panel */}
      <div className="glass-panel" style={{ padding: '20px 24px', backgroundColor: '#111115', border: '1px solid #1E1E26' }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Store size={18} style={{ color: '#10B981' }} />
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#F4F4F6' }}>
                Merchant Stores & Operating Hours
              </h2>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#71717A', marginTop: '2px' }}>
              Realtime sync with Supabase `merchant_stores` table and Meta Commerce catalog brands.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative', minWidth: '240px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#71717A' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search store name, category, or WA..."
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  backgroundColor: '#0A0A0E',
                  border: '1px solid #202028',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  color: '#F4F4F6',
                  outline: 'none'
                }}
              />
            </div>

            <button
              onClick={loadStores}
              style={{
                padding: '7px 12px',
                borderRadius: '6px',
                backgroundColor: '#14141C',
                border: '1px solid #262634',
                color: '#D4D4D8',
                fontSize: '0.78rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Notifications */}
        {actionSuccess && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            color: '#34D399',
            fontSize: '0.8rem',
            marginBottom: '16px'
          }}>
            <CheckCircle2 size={15} />
            <span>{actionSuccess}</span>
          </div>
        )}

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#F87171',
            fontSize: '0.8rem',
            marginBottom: '16px'
          }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Table Content */}
        {loading ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '220px',
            gap: '10px',
            color: '#71717A',
            fontSize: '0.85rem'
          }}>
            <Loader2 size={20} className="animate-spin" style={{ color: '#3B82F6' }} />
            <span>Loading merchant stores from Supabase...</span>
          </div>
        ) : filteredStores.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#71717A',
            fontSize: '0.85rem'
          }}>
            No merchant stores found matching "{search}".
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1E1E26', color: '#71717A', fontSize: '0.7rem', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>STORE NAME & ID</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>TYPE</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>OPERATING STATUS</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>SCHEDULE (WIB)</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>OWNER WHATSAPP</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>COVERAGE AREA</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>OVERRIDE CONTROLS</th>
                </tr>
              </thead>
              <tbody>
                {filteredStores.map((s) => {
                  const isOpen = s.status?.isOpen ?? false;
                  const isOverridden = s.isOpenManualOverride !== null && s.isOpenManualOverride !== undefined;
                  const isUpdating = updatingStoreId === s.storeId;

                  return (
                    <tr
                      key={s.storeId}
                      style={{
                        borderBottom: '1px solid #17171E',
                        transition: 'background-color 0.12s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#14141B'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      {/* Store Name & ID */}
                      <td style={{ padding: '14px 12px' }}>
                        <div style={{ fontWeight: 600, color: '#F4F4F6', fontSize: '0.84rem' }}>
                          {s.storeName}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#71717A', fontFamily: 'monospace' }}>
                          {s.storeId}
                        </div>
                        {s.category && (
                          <div style={{ fontSize: '0.68rem', color: '#A1A1AA', marginTop: '2px' }}>
                            {s.category}
                          </div>
                        )}
                      </td>

                      {/* Business Type */}
                      <td style={{ padding: '14px 12px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          backgroundColor: s.businessType === 'SERVICE' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                          color: s.businessType === 'SERVICE' ? '#FBBF24' : '#60A5FA',
                          border: s.businessType === 'SERVICE' ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(59, 130, 246, 0.25)'
                        }}>
                          {s.businessType === 'SERVICE' ? <Wrench size={11} /> : <Package size={11} />}
                          {s.businessType}
                        </span>
                      </td>

                      {/* Live Operating Status */}
                      <td style={{ padding: '14px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            className="status-indicator"
                            style={{
                              backgroundColor: isOpen ? '#10B981' : '#EF4444'
                            }}
                          />
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: isOpen ? '#34D399' : '#F87171'
                          }}>
                            {isOpen ? 'BUKA (OPEN)' : 'TUTUP (CLOSED)'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#71717A', marginTop: '3px' }}>
                          {isOverridden
                            ? (s.isOpenManualOverride ? '⚡ Force Open Override' : '🛑 Force Closed (Libur)')
                            : '⏰ Mengikuti Jadwal Otomatis'}
                        </div>
                        {!isOpen && s.allowPreOrder && (
                          <div style={{ fontSize: '0.65rem', color: '#FBBF24', marginTop: '2px' }}>
                            ✓ Pre-order queue active
                          </div>
                        )}
                      </td>

                      {/* Schedule */}
                      <td style={{ padding: '14px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#D4D4D8' }}>
                          <Clock size={12} style={{ color: '#71717A' }} />
                          <span>{s.operatingHours.open} - {s.operatingHours.close}</span>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#71717A', marginTop: '2px' }}>
                          {s.operatingHours.days?.length === 7 ? 'Setiap Hari (Senin-Minggu)' : `${s.operatingHours.days?.length || 0} hari aktif`}
                        </div>
                      </td>

                      {/* Owner WhatsApp */}
                      <td style={{ padding: '14px 12px' }}>
                        {s.ownerWhatsApp ? (
                          <a
                            href={`https://wa.me/${s.ownerWhatsApp.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: '#34D399',
                              textDecoration: 'none',
                              fontSize: '0.78rem',
                              fontFamily: 'monospace'
                            }}
                            title="Chat Merchant WhatsApp"
                          >
                            <MessageCircle size={13} />
                            +{s.ownerWhatsApp}
                            <ExternalLink size={10} style={{ opacity: 0.6 }} />
                          </a>
                        ) : (
                          <span style={{ color: '#52525B', fontSize: '0.72rem' }}>Not linked</span>
                        )}
                      </td>

                      {/* Coverage Area */}
                      <td style={{ padding: '14px 12px', color: '#A1A1AA', fontSize: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={12} style={{ color: '#71717A', flexShrink: 0 }} />
                          <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.coverageArea || s.address || 'Semua Area'}
                          </span>
                        </div>
                      </td>

                      {/* Admin Override Controls */}
                      <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          {isUpdating ? (
                            <Loader2 size={16} className="animate-spin" style={{ color: '#3B82F6' }} />
                          ) : (
                            <>
                              {/* Force Open button */}
                              <button
                                onClick={() => handleToggleOverride(s, true)}
                                title="Force Open (Buka Manual)"
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '5px',
                                  fontSize: '0.7rem',
                                  fontWeight: 500,
                                  backgroundColor: s.isOpenManualOverride === true ? '#064E3B' : '#14141C',
                                  color: s.isOpenManualOverride === true ? '#34D399' : '#9CA3AF',
                                  border: s.isOpenManualOverride === true ? '1px solid #059669' : '1px solid #22222C',
                                  cursor: 'pointer'
                                }}
                              >
                                Buka
                              </button>

                              {/* Force Close button */}
                              <button
                                onClick={() => handleToggleOverride(s, false)}
                                title="Force Close / Holiday (Tutup/Libur)"
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '5px',
                                  fontSize: '0.7rem',
                                  fontWeight: 500,
                                  backgroundColor: s.isOpenManualOverride === false ? '#7F1D1D' : '#14141C',
                                  color: s.isOpenManualOverride === false ? '#F87171' : '#9CA3AF',
                                  border: s.isOpenManualOverride === false ? '1px solid #DC2626' : '1px solid #22222C',
                                  cursor: 'pointer'
                                }}
                              >
                                Libur
                              </button>

                              {/* Reset to Auto button */}
                              {isOverridden && (
                                <button
                                  onClick={() => handleToggleOverride(s, null)}
                                  title="Reset ke Jadwal Otomatis"
                                  style={{
                                    padding: '4px 6px',
                                    borderRadius: '5px',
                                    fontSize: '0.7rem',
                                    backgroundColor: '#181822',
                                    color: '#A1A1AA',
                                    border: '1px solid #282836',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <RotateCcw size={12} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
