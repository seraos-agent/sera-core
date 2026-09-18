import React, { useState, useEffect, useRef } from 'react';
import type { ThemeType } from '../../theme';
import { Mail, ArrowRight, KeyRound, Edit3 } from 'lucide-react';

interface EmailLoginGatewayProps {
  theme: ThemeType;
  onAuthenticated: (authData: { token: string; userId: string; email: string }) => void;
}

export function EmailLoginGateway({ theme, onAuthenticated }: EmailLoginGatewayProps) {
  const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [emailFocused, setEmailFocused] = useState(false);

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
      setError('Please enter a valid email address.');
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
        throw new Error(data.message || 'Failed to send verification code.');
      }

      setStep('OTP');
      setCountdown(60);
      setInfoMessage(`A 6-digit verification code was sent to ${emailToSend}`);
      if (data.otpCodeDev) {
        setDevOtpCode(data.otpCodeDev);
      }
    } catch (err: any) {
      setError(err.message || 'Network error connecting to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = codeToVerify || otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter all 6 digits of the verification code.');
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
        throw new Error(data.message || 'Invalid or expired verification code.');
      }

      if (data.token && data.userId) {
        onAuthenticated({
          token: data.token,
          userId: data.userId,
          email: data.email || email.trim().toLowerCase()
        });
      } else {
        throw new Error('Server failed to return a valid session.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check the code and try again.');
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
        <p style={{ fontSize: '14px', color: theme.inkSoft, marginBottom: '24px', lineHeight: 1.5 }}>
          {step === 'EMAIL'
            ? 'Passwordless sign-in. Continue with WhatsApp or enter your email:'
            : infoMessage || 'Enter the 6-digit verification code sent to:'}
        </p>

        {/* STEP 1: WHATSAPP / EMAIL GATEWAY */}
        {step === 'EMAIL' && (
          <div style={{ width: '100%' }}>
            {/* WhatsApp Quick Action (Option 3) */}
            <a
              href="https://wa.me/6285126485464?text=Hi%20SERA"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '9px',
                backgroundColor: theme.bg,
                padding: '13px 18px',
                borderRadius: '10px',
                border: `1px solid ${theme.border}`,
                color: theme.ink,
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'border-color 0.2s, background-color 0.2s, transform 0.1s',
                boxSizing: 'border-box',
                width: '100%'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#25D366';
                e.currentTarget.style.backgroundColor = `${theme.border}33`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.border;
                e.currentTarget.style.backgroundColor = theme.bg;
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'scale(0.99)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="currentColor"
                style={{ color: '#25D366', flexShrink: 0 }}
                aria-hidden="true"
              >
                <path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.276-.1-.476-.15-.676.15-.2.3-.776.978-.952 1.178-.176.2-.351.226-.652.076-.301-.15-1.27-.468-2.42-1.493-.894-.798-1.498-1.784-1.674-2.085-.176-.301-.019-.464.132-.614.135-.135.301-.351.451-.527.15-.176.2-.301.301-.502.101-.2.05-.376-.025-.527-.075-.15-.676-1.63-.926-2.233-.244-.587-.492-.507-.676-.516-.175-.008-.376-.01-.577-.01-.201 0-.527.076-.803.376s-1.053 1.028-1.053 2.509c0 1.48 1.078 2.91 1.229 3.111.15.201 2.122 3.24 5.141 4.545.718.311 1.278.497 1.715.636.721.23 1.378.197 1.898.119.58-.088 1.78-.727 2.031-1.43.251-.703.251-1.305.176-1.43-.075-.126-.276-.201-.577-.351zM12.04 2c-5.502 0-9.98 4.478-9.98 9.98 0 1.758.459 3.475 1.332 4.992l-1.417 5.176 5.306-1.391c1.464.798 3.117 1.218 4.759 1.218 5.502 0 9.98-4.478 9.98-9.98 0-5.502-4.478-9.995-9.98-9.995zm0 18.232c-1.487 0-2.94-.4-4.205-1.152l-.301-.179-3.129.821.835-3.048-.196-.312c-.827-1.317-1.264-2.846-1.264-4.417 0-4.542 3.696-8.238 8.243-8.238 4.547 0 8.243 3.696 8.243 8.238 0 4.547-3.696 8.248-8.226 8.248z" />
              </svg>
              <span>Continue on WhatsApp</span>
            </a>

            {/* "or" Divider */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              margin: '20px 0',
              width: '100%',
              gap: '12px'
            }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: theme.border }} />
              <span style={{
                fontSize: '12px',
                color: theme.inkFaint,
                fontWeight: 500,
                textTransform: 'lowercase',
                letterSpacing: '0.04em'
              }}>
                or
              </span>
              <div style={{ flex: 1, height: '1px', backgroundColor: theme.border }} />
            </div>

            {/* Email Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendOtp();
              }}
              style={{ width: '100%' }}
            >
              <div style={{ position: 'relative', width: '100%', marginBottom: '16px' }}>
                {!email && !emailFocused && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      color: theme.inkFaint,
                      pointerEvents: 'none',
                      fontSize: '15px',
                      fontFamily: 'Inter, sans-serif'
                    }}
                  >
                    <Mail size={17} />
                    <span>name@example.com</span>
                  </div>
                )}
                <input
                  type="email"
                  required
                  placeholder={emailFocused ? 'name@example.com' : ''}
                  value={email}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    borderRadius: '10px',
                    border: `1px solid ${error ? '#ef4444' : theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.ink,
                    fontSize: '15px',
                    textAlign: 'center',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                    fontFamily: 'Inter, sans-serif'
                  }}
                />
              </div>

              {error && (
                <div style={{
                  color: '#ef4444',
                  fontSize: '13px',
                  marginBottom: '14px',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}>
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
                    Sending code...
                  </>
                ) : (
                  <>
                    Continue with Email
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
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
                title="Change Email"
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
                <span>🧪 Dev Test: Click to autofill ({devOtpCode})</span>
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
                  Verifying...
                </>
              ) : (
                <>
                  <KeyRound size={17} />
                  Verify & Sign In
                </>
              )}
            </button>

            {/* Resend OTP button */}
            <div style={{ fontSize: '13px', color: theme.inkSoft }}>
              Didn't receive the code?{' '}
              {countdown > 0 ? (
                <span style={{ color: theme.inkFaint }}>Resend in {countdown}s</span>
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
                  Resend Code
                </button>
              )}
            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
