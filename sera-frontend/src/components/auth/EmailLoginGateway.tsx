import React, { useState, useEffect, useRef } from 'react';
import type { ThemeType } from '../../theme';
import { Mail, ArrowRight, KeyRound, Edit3, MessageSquare, Wallet } from 'lucide-react';

interface EmailLoginGatewayProps {
  theme: ThemeType;
  onAuthenticated: (authData: { token: string; userId: string; email: string }) => void;
  onOpenWeb3Modal?: () => void;
}

export function EmailLoginGateway({ theme, onAuthenticated, onOpenWeb3Modal }: EmailLoginGatewayProps) {
  const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resolve API Base URL
  const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://127.0.0.1:3001';
      }
    }
    return 'https://api.seraos.xyz';
  };

  // Countdown timer effect
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Focus first OTP box when entering OTP step
  useEffect(() => {
    if (step === 'OTP') {
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    }
  }, [step]);

  const handleSendOtp = async (targetEmail?: string) => {
    const emailToSend = (targetEmail || email).trim().toLowerCase();
    if (!emailToSend || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToSend)) {
      setError('Mohon masukkan alamat email yang valid.');
      return;
    }

    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const res = await fetch(`${getApiUrl()}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailToSend })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gagal mengirim kode OTP.');
      }

      setStep('OTP');
      setCountdown(60);
      setInfoMessage(`Kode OTP 6-digit telah dikirim ke ${emailToSend}`);
      if (data.otpCodeDev) {
        setDevOtpCode(data.otpCodeDev);
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi gangguan saat menghubungi server. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = codeToVerify || otpDigits.join('');
    if (code.length !== 6) {
      setError('Masukkan 6 digit kode OTP secara lengkap.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${getApiUrl()}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Kode OTP tidak valid atau kedaluwarsa.');
      }

      if (data.token && data.userId) {
        onAuthenticated({
          token: data.token,
          userId: data.userId,
          email: data.email || email.trim().toLowerCase()
        });
      } else {
        throw new Error('Server tidak mengembalikan sesi login yang sah.');
      }
    } catch (err: any) {
      setError(err.message || 'Verifikasi gagal. Pastikan kode yang dimasukkan benar.');
    } finally {
      setLoading(false);
    }
  };

  // OTP Box inputs handler
  const handleDigitChange = (index: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1);
    const updated = [...otpDigits];
    updated[index] = char;
    setOtpDigits(updated);
    setError('');

    if (char && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto verify if all 6 digits are filled
    const fullCode = updated.join('');
    if (fullCode.length === 6 && !updated.includes('')) {
      handleVerifyOtp(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const updated = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      updated[i] = pasted[i] || '';
    }
    setOtpDigits(updated);
    setError('');

    const nextIndex = Math.min(pasted.length, 5);
    otpInputRefs.current[nextIndex]?.focus();

    if (pasted.length === 6) {
      handleVerifyOtp(pasted);
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
        maxWidth: '440px',
        width: '100%',
        padding: '40px 32px',
        backgroundColor: theme.surface2,
        borderRadius: '20px',
        border: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        boxShadow: '0 16px 48px rgba(0,0,0,0.06)',
        position: 'relative'
      }}>
        {/* SERA Branding */}
        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <img
            src="/sera-logo.png"
            alt="SERA OS"
            style={{ width: '52px', height: '52px', objectFit: 'contain' }}
          />
        </div>

        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: theme.ink, letterSpacing: '-0.02em' }}>
          Welcome to SERA OS
        </h1>
        <p style={{ fontSize: '14px', color: theme.inkSoft, marginBottom: '28px', lineHeight: 1.5 }}>
          {step === 'EMAIL'
            ? 'Masuk praktis tanpa password. Masukkan email Anda untuk menerima 6-digit kode OTP:'
            : infoMessage || `Masukkan 6-digit kode verifikasi yang telah kami kirimkan ke:`}
        </p>

        {/* STEP 1: EMAIL INPUT */}
        {step === 'EMAIL' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendOtp();
            }}
            style={{ width: '100%' }}
          >
            <div style={{ position: 'relative', width: '100%', marginBottom: '16px' }}>
              <div style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: theme.inkFaint,
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none'
              }}>
                <Mail size={18} />
              </div>
              <input
                type="email"
                required
                autoFocus
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 44px',
                  borderRadius: '10px',
                  border: `1px solid ${error ? '#ef4444' : theme.border}`,
                  backgroundColor: theme.bg,
                  color: theme.ink,
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                  fontFamily: 'Inter, sans-serif'
                }}
              />
            </div>

            {error && (
              <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '14px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚠️</span> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '14px 20px',
                backgroundColor: theme.ink,
                color: theme.surface,
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: (loading || !email.trim()) ? 'not-allowed' : 'pointer',
                opacity: (loading || !email.trim()) ? 0.6 : 1,
                transition: 'opacity 0.2s, transform 0.1s'
              }}
              onMouseEnter={(e) => { if (!loading && email.trim()) e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { if (!loading && email.trim()) e.currentTarget.style.opacity = '1'; }}
              onMouseDown={(e) => { if (!loading && email.trim()) e.currentTarget.style.transform = 'scale(0.99)'; }}
              onMouseUp={(e) => { if (!loading && email.trim()) e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  Mengirim OTP...
                </>
              ) : (
                <>
                  Lanjut dengan Email
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: OTP VERIFICATION */}
        {step === 'OTP' && (
          <div style={{ width: '100%' }}>
            {/* Email pill with edit option */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              padding: '6px 14px',
              borderRadius: '20px',
              marginBottom: '24px',
              fontSize: '13px',
              color: theme.ink,
              fontWeight: 500
            }}>
              <span>{email}</span>
              <button
                onClick={() => {
                  setStep('EMAIL');
                  setError('');
                  setOtpDigits(['', '', '', '', '', '']);
                }}
                title="Ganti Email"
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.accent,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 2
                }}
              >
                <Edit3 size={13} />
              </button>
            </div>

            {/* 6 Digit Input Boxes */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { otpInputRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  disabled={loading}
                  style={{
                    width: '46px',
                    height: '52px',
                    borderRadius: '10px',
                    border: `2px solid ${digit ? theme.ink : theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.ink,
                    fontSize: '22px',
                    fontWeight: 700,
                    textAlign: 'center',
                    outline: 'none',
                    transition: 'border-color 0.15s, transform 0.1s',
                    fontFamily: 'monospace'
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = theme.accent; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = digit ? theme.ink : theme.border; }}
                />
              ))}
            </div>

            {/* Dev Helper Badge */}
            {devOtpCode && (
              <div
                onClick={() => {
                  const chars = devOtpCode.split('');
                  setOtpDigits(chars);
                  handleVerifyOtp(devOtpCode);
                }}
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  border: '1px dashed #3b82f6',
                  color: '#3b82f6',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  marginBottom: '16px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🧪 Dev Test: Klik untuk auto-fill ({devOtpCode})</span>
              </div>
            )}

            {error && (
              <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '14px', textAlign: 'center' }}>
                ⚠️ {error}
              </div>
            )}

            <button
              onClick={() => handleVerifyOtp()}
              disabled={loading || otpDigits.join('').length !== 6}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '14px 20px',
                backgroundColor: theme.ink,
                color: theme.surface,
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: (loading || otpDigits.join('').length !== 6) ? 'not-allowed' : 'pointer',
                opacity: (loading || otpDigits.join('').length !== 6) ? 0.6 : 1,
                marginBottom: '16px',
                transition: 'opacity 0.2s, transform 0.1s'
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  Memverifikasi...
                </>
              ) : (
                <>
                  <KeyRound size={17} />
                  Verifikasi & Masuk
                </>
              )}
            </button>

            {/* Resend OTP button */}
            <div style={{ fontSize: '13px', color: theme.inkSoft }}>
              Tidak menerima kode?{' '}
              {countdown > 0 ? (
                <span style={{ color: theme.inkFaint }}>Kirim ulang ({countdown}s)</span>
              ) : (
                <button
                  onClick={() => handleSendOtp(email)}
                  disabled={loading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: theme.accent,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  Kirim Ulang Kode
                </button>
              )}
            </div>
          </div>
        )}

        {/* Informative Footer & WhatsApp Chat Notice */}
        <div style={{
          marginTop: '28px',
          paddingTop: '20px',
          borderTop: `1px solid ${theme.border}`,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            backgroundColor: theme.bg,
            padding: '12px 14px',
            borderRadius: '10px',
            border: `1px solid ${theme.border}`,
            textAlign: 'left'
          }}>
            <MessageSquare size={18} style={{ color: '#25D366', marginTop: '2px', flexShrink: 0 }} />
            <div style={{ fontSize: '12px', lineHeight: 1.5, color: theme.inkSoft }}>
              <strong style={{ color: theme.ink }}>Bisa juga via WhatsApp:</strong> Chat bot SERA langsung dengan mengirim email Anda untuk login & berbelanja tanpa perlu buka website.
            </div>
          </div>

          {onOpenWeb3Modal && (
            <button
              onClick={onOpenWeb3Modal}
              style={{
                background: 'none',
                border: 'none',
                color: theme.inkFaint,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                marginTop: '4px',
                transition: 'color 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = theme.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = theme.inkFaint; }}
            >
              <Wallet size={13} />
              Hubungkan Wallet Eksternal (Web3)
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
