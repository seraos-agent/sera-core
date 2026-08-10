import { useEffect, useRef, useState, useCallback } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './LandingPage.css';
import './PremiumPalette.css';
import './LaunchNotice.css';
import seraLogo from '../../assets/sera-logo.png';
import { PartnerMarquee } from './PartnerMarquee';
import { getReceptionReply } from '../../services/reception/receptionClient';
import type { ReceptionReply, ReceptionVisual } from '../../services/reception/receptionClient';
import type { ReceptionTurn } from '../../services/reception/receptionClient';
import { Sun, Moon, Globe, MoreVertical } from 'lucide-react';

type Scene = 'reception' | ReceptionVisual;

/* ─── Scroll Reveal Hook ─── */
function useScrollReveal() {
  const observe = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      node.classList.add('is-visible');
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.classList.add('is-visible');
          observer.unobserve(node);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(node);
  }, []);
  return observe;
}

const inputPrompts = [
  'What is SERA?',
  'What can SERA help me accomplish?',
  'How does SERA work?',
  'How does SERA stay safe?',
  'What can SERA connect to?',
];

const visualScenes = new Set<Scene>(['operating', 'security', 'automation', 'crypto']);

export function LandingPage() {
  const { t, setLanguage } = useTranslation();
  const [scene, setScene] = useState<Scene>('reception');
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sera-landing-theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isLangOpen, setIsLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('sera-landing-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDocsOpen(false);
      }
    }
    if (isDocsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDocsOpen]);

  useEffect(() => {
    function handleLangClickOutside(event: MouseEvent) {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    }
    if (isLangOpen) {
      document.addEventListener('mousedown', handleLangClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleLangClickOutside);
    };
  }, [isLangOpen]);

  const [message, setMessage] = useState('');
  const [question, setQuestion] = useState('');
  const [content, setContent] = useState<ReceptionReply | null>(null);
  const [streamedResponse, setStreamedResponse] = useState('');
  const [conversationHistory, setConversationHistory] = useState<ReceptionTurn[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [activeVisual, setActiveVisual] = useState<{ scene: Scene; id: number } | null>(null);
  const [isVisualTransitioning, setIsVisualTransitioning] = useState(false);
  const [remaining, setRemaining] = useState(45);
  const [inputPromptIndex, setInputPromptIndex] = useState(0);
  const responseTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const endSession = () => {
    if (responseTimer.current) window.clearTimeout(responseTimer.current);
    setScene('reception');
    setMessage('');
    setQuestion('');
    setContent(null);
    setStreamedResponse('');
    setConversationHistory([]);
    setIsThinking(false);
    setActiveVisual(null);
    setIsVisualTransitioning(false);
    setRemaining(45);
  };

  const send = async (value: string) => {
    const next = value.trim();
    if (!next || isThinking) return;
    if (responseTimer.current) window.clearTimeout(responseTimer.current);
    setQuestion(next);
    setMessage('');
    setContent(null);
    setStreamedResponse('');
    setIsThinking(true);
    setIsVisualTransitioning(false);
    setScene('general');
    setRemaining(45);
    const result = await getReceptionReply(next, conversationHistory);
    setConversationHistory(previous => [...previous, { role: 'user' as const, content: next }, { role: 'assistant' as const, content: result.response }].slice(-4));
    setScene(result.visual);
    responseTimer.current = window.setTimeout(() => {
      setContent(result);
      setIsThinking(false);
      setRemaining(45);
    }, 520);
  };

  const submit = (event: FormEvent) => { event.preventDefault(); send(message); };

  const isResponseComplete = Boolean(content && content.response.length > 0 && streamedResponse.length >= content.response.length);

  useEffect(() => {
    if (scene === 'reception' || isThinking || !isResponseComplete) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setRemaining(value => {
        if (value <= 1) { window.setTimeout(endSession, 0); return 0; }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [scene, isThinking, isResponseComplete]);

  useEffect(() => () => { if (responseTimer.current) window.clearTimeout(responseTimer.current); }, []);

  useEffect(() => {
    if (scene !== 'reception') { setInputPromptIndex(0); return; }
    const interval = window.setInterval(() => setInputPromptIndex(index => (index + 1) % inputPrompts.length), 3800);
    return () => window.clearInterval(interval);
  }, [scene]);

  useEffect(() => {
    if (!content) { setStreamedResponse(''); return; }
    let cursor = 0;
    setStreamedResponse('');
    const stream = window.setInterval(() => {
      cursor += 1;
      setStreamedResponse(content.response.slice(0, cursor));
      if (cursor >= content.response.length) window.clearInterval(stream);
    }, 16);
    return () => window.clearInterval(stream);
  }, [content]);

  useEffect(() => {
    if (!content || streamedResponse.length < content.response.length) return;
    const nextScene: Scene = visualScenes.has(scene) ? scene : 'general';
    if (activeVisual?.scene === nextScene) return;
    setIsVisualTransitioning(true);
    const transition = window.setTimeout(() => {
      setActiveVisual({ scene: nextScene, id: Date.now() });
      setIsVisualTransitioning(false);
    }, 260);
    return () => window.clearTimeout(transition);
  }, [content, streamedResponse, scene, activeVisual?.scene]);

  const isClosing = remaining <= 10;
  const [showNotice, setShowNotice] = useState(false);
  const launchApp = () => {
    if (import.meta.env?.DEV) {
      window.location.href = 'http://localhost:5173/?bypass=true';
    } else {
      setShowNotice(true);
    }
  };

  /* Scroll reveal refs for each section */
  const reveal = useScrollReveal();
  const reveal2 = useScrollReveal();
  const reveal3 = useScrollReveal();
  const reveal4 = useScrollReveal();
  const reveal5 = useScrollReveal();

  const handleSamplePromptClick = (promptText: string) => {
    send(promptText);
    const interactiveEl = document.getElementById('interactive');
    if (interactiveEl) {
      interactiveEl.scrollIntoView({ behavior: 'smooth' });
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <main className={`sera-room scene-${scene} ${isDark ? 'is-dark' : ''}`}>
      <div className="room-glow room-glow-one" /><div className="room-glow room-glow-two" />

      {scene === 'reception' && (
        <header className="room-header">
          <a href="#hero" className="room-brand" onClick={endSession}><img src={seraLogo} alt="SERA" /><span>SERA</span></a>

          <nav className="room-header-nav" aria-label="Main Navigation">
            <a href="#hero" className="nav-link">{t('nav.home')}</a>
            <a href="#about" className="nav-link">{t('nav.why')}</a>
            <a href="#features" className="nav-link">{t('nav.features')}</a>
            <a href="#how-it-works" className="nav-link">{t('nav.how')}</a>
            <a href="#interactive" className="nav-link">{t('nav.try')}</a>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ position: 'relative' }} ref={langRef}>
              <button
                className="theme-toggle-header"
                onClick={() => setIsLangOpen(!isLangOpen)}
                aria-label={t('nav.select_language')}
                title={t('nav.select_language')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--ink)',
                  opacity: 0.75,
                  transition: 'opacity 0.2s',
                  textDecoration: 'none'
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                onMouseOut={(e) => e.currentTarget.style.opacity = '0.75'}
              >
                <Globe size={18} />
              </button>
              {isLangOpen && (
                <div className="header-dropdown" style={{ minWidth: '160px' }}>
                  <div className="dropdown-section-title">{t('nav.select_language')}</div>
                  <button className="dropdown-link" style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => { setLanguage('en'); setIsLangOpen(false); }}>English (EN)</button>
                  <button className="dropdown-link" style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => { setLanguage('id'); setIsLangOpen(false); }}>Indonesia (ID)</button>
                  <button className="dropdown-link" style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => { setLanguage('zh'); setIsLangOpen(false); }}>中文 (ZH)</button>
                </div>
              )}
            </div>
            <button
              className="theme-toggle-header"
              onClick={() => setIsDark(!isDark)}
              aria-label="Toggle theme"
              title="Toggle theme"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--ink)',
                opacity: 0.75,
                transition: 'opacity 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '0.75'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                className="theme-toggle-header"
                onClick={() => setIsDocsOpen(!isDocsOpen)}
                aria-label="Documentation"
                title="Documentation"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--ink)',
                  opacity: 0.75,
                  transition: 'opacity 0.2s',
                  textDecoration: 'none'
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                onMouseOut={(e) => e.currentTarget.style.opacity = '0.75'}
              >
                <MoreVertical size={18} />
              </button>
              {isDocsOpen && (
                <div className="header-dropdown">
                  <div className="dropdown-section-title">{t('nav.products')}</div>
                  <a href="https://docs.seraos.xyz/docs/engine" target="_blank" rel="noreferrer" className="dropdown-link" onClick={() => setIsDocsOpen(false)}>Agent Engine</a>
                  <a href="https://docs.seraos.xyz/docs/mpc" target="_blank" rel="noreferrer" className="dropdown-link" onClick={() => setIsDocsOpen(false)}>MPC Wallet</a>
                  <a href="https://docs.seraos.xyz/docs/workflows" target="_blank" rel="noreferrer" className="dropdown-link" onClick={() => setIsDocsOpen(false)}>Action Workflows</a>
                  <a href="https://docs.seraos.xyz/docs/compute" target="_blank" rel="noreferrer" className="dropdown-link" onClick={() => setIsDocsOpen(false)}>Verifiable Compute</a>

                  <div className="dropdown-divider"></div>

                  <div className="dropdown-section-title">{t('nav.developers')}</div>
                  <a href="https://docs.seraos.xyz/docs/intro" target="_blank" rel="noreferrer" className="dropdown-link" onClick={() => setIsDocsOpen(false)}>Documentation</a>
                  <a href="https://docs.seraos.xyz/docs/workflows" target="_blank" rel="noreferrer" className="dropdown-link" onClick={() => setIsDocsOpen(false)}>API Reference</a>
                  <a href="https://docs.seraos.xyz/docs/engine" target="_blank" rel="noreferrer" className="dropdown-link" onClick={() => setIsDocsOpen(false)}>Architecture Overview</a>
                  <a href="https://github.com/seraos-agent/sera-core" target="_blank" rel="noreferrer" className="dropdown-link" onClick={() => setIsDocsOpen(false)}>GitHub</a>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {scene === 'reception' && (
        <>
          {/* SECTION 1: HERO SECTION */}
          <section className="landing-section hero-section" id="hero">
            {/* Animated gradient mesh background */}
            <DelayedMesh />
            <ConnectorFlowBackground />
            <div className="landing-container">
              <div className="hero-split-layout">
                <div className="hero-content-left">
                  <div className="section-badge">{t('hero.badge')}</div>
                  <h1 className="hero-title">
                    {t('hero.title')}
                  </h1>
                  <p className="hero-subtitle">
                    {t('hero.subtitle')}
                  </p>
                  <div className="hero-cta-group">
                    <button onClick={launchApp} className="cta-button cta-primary">
                      {t('hero.launch')}
                    </button>
                    <a href="#about" className="cta-button cta-secondary">
                      {t('hero.learn')}
                    </a>
                  </div>
                  <div className="hero-stats-row" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-gray)', marginTop: '8px' }}>
                    {t('hero.stats')}
                  </div>
                </div>

                <div className="hero-graphic-right">
                  <div className="hero-workflow-tree">
                    {/* Desktop Snake Lines (Wide) */}
                    <svg className="workflow-lines-snake workflow-lines-desktop" preserveAspectRatio="none" viewBox="0 0 340 100" fill="none" style={{ overflow: 'visible' }}>
                      <defs>
                        <linearGradient id="snake-grad-desktop" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="rgba(79, 107, 255, 0)" />
                          <stop offset="50%" stopColor="rgba(79, 107, 255, 0.8)" />
                          <stop offset="100%" stopColor="rgba(79, 107, 255, 0)" />
                        </linearGradient>
                      </defs>
                      <path pathLength="1000" vectorEffect="non-scaling-stroke" d="M 170 10 L 290 10 C 450 10, 450 37, 290 37 L 50 37 C -110 37, -110 63, 50 63 L 290 63 C 450 63, 450 90, 290 90 L 170 90" 
                            stroke="rgba(79, 107, 255, 0.15)" strokeWidth="1.5" fill="none" strokeDasharray="10 10" />
                      <path pathLength="1000" vectorEffect="non-scaling-stroke" d="M 170 10 L 290 10 C 450 10, 450 37, 290 37 L 50 37 C -110 37, -110 63, 50 63 L 290 63 C 450 63, 450 90, 290 90 L 170 90" 
                            className="tree-flow-pulse-snake" stroke="url(#snake-grad-desktop)" strokeWidth="2" fill="none" />
                    </svg>

                    {/* Mobile Snake Lines (Narrow) */}
                    <svg className="workflow-lines-snake workflow-lines-mobile" preserveAspectRatio="none" viewBox="0 0 320 100" fill="none" style={{ overflow: 'visible' }}>
                      <defs>
                        <linearGradient id="snake-grad-mobile" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="rgba(79, 107, 255, 0)" />
                          <stop offset="50%" stopColor="rgba(79, 107, 255, 0.8)" />
                          <stop offset="100%" stopColor="rgba(79, 107, 255, 0)" />
                        </linearGradient>
                      </defs>
                      <path pathLength="1000" vectorEffect="non-scaling-stroke" d="M 160 10 L 270 10 C 330 10, 330 37, 270 37 L 50 37 C -10 37, -10 63, 50 63 L 270 63 C 330 63, 330 90, 270 90 L 160 90" 
                            stroke="rgba(79, 107, 255, 0.15)" strokeWidth="1.5" fill="none" strokeDasharray="10 10" />
                      <path pathLength="1000" vectorEffect="non-scaling-stroke" d="M 160 10 L 270 10 C 330 10, 330 37, 270 37 L 50 37 C -10 37, -10 63, 50 63 L 270 63 C 330 63, 330 90, 270 90 L 160 90" 
                            className="tree-flow-pulse-snake" stroke="url(#snake-grad-mobile)" strokeWidth="2" fill="none" />
                    </svg>

                    <div className="workflow-node">
                      <div className="node-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                      </div>
                      <span>{t('workflow.user_intent')}</span>
                      <span className="node-status-dot dot-green"></span>
                    </div>

                    <div className="workflow-node">
                      <div className="node-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      </div>
                      <span>{t('workflow.read_state')}</span>
                    </div>

                    <div className="workflow-node">
                      <div className="node-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                      </div>
                      <span>{t('workflow.validate')}</span>
                    </div>

                    <div className="workflow-node">
                      <div className="node-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                      </div>
                      <span>{t('workflow.execute')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2: WHY SERA */}
          <section className="landing-section" id="about" ref={reveal}>
            <div className="landing-container">
              <div className="about-header-block">
                <div className="section-badge reveal-child reveal-delay-1" style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff', background: 'rgba(255,255,255,0.1)' }}>{t('why.badge')}</div>
                <h2 className="section-title reveal-child reveal-delay-2" style={{ color: '#fff' }}>{t('why.title')}</h2>
                <p className="section-subtitle reveal-child reveal-delay-3" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {t('why.subtitle')}
                </p>
              </div>
              <div className="about-grid reveal-child reveal-delay-4">
                <div className="about-card">
                  <div className="about-card-header">
                    <div className="about-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg>
                    </div>
                    <h3>{t('why.card1.title')}</h3>
                  </div>
                  <p>{t('why.card1.desc')}</p>
                </div>
                <div className="about-card">
                  <div className="about-card-header">
                    <div className="about-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                    </div>
                    <h3>{t('why.card2.title')}</h3>
                  </div>
                  <p>{t('why.card2.desc')}</p>
                </div>
                <div className="about-card">
                  <div className="about-card-header">
                    <div className="about-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                    </div>
                    <h3>{t('why.card3.title')}</h3>
                  </div>
                  <p>{t('why.card3.desc')}</p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3: CORE CAPABILITIES */}
          <section className="landing-section" id="features" ref={reveal2}>
            <div className="landing-container">
              <div className="section-badge reveal-child reveal-delay-1">{t('core.badge')}</div>
              <h2 className="section-title reveal-child reveal-delay-2">{t('core.title')}</h2>
              <p className="section-subtitle reveal-child reveal-delay-3">
                {t('core.subtitle')}
              </p>
              <div className="features-grid reveal-child reveal-delay-4">
                <div className="feature-card">
                  <div className="feature-card-header">

                    <h3>{t('core.card1.title')}</h3>
                  </div>
                  <p>{t('core.card1.desc')}</p>
                </div>
                <div className="feature-card">
                  <div className="feature-card-header">

                    <h3>{t('core.card2.title')}</h3>
                  </div>
                  <p>{t('core.card2.desc')}</p>
                </div>
                <div className="feature-card">
                  <div className="feature-card-header">

                    <h3>{t('core.card3.title')}</h3>
                  </div>
                  <p>{t('core.card3.desc')}</p>
                </div>
                <div className="feature-card">
                  <div className="feature-card-header">

                    <h3>{t('core.card4.title')}</h3>
                  </div>
                  <p>{t('core.card4.desc')}</p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 4: HOW IT WORKS */}
          <section className="landing-section" id="how-it-works" ref={reveal3}>
            <div className="landing-container">
              <div className="how-it-works-split reveal-child reveal-delay-2">
                <div className="how-it-works-left">
                  <div className="section-badge" style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff', background: 'rgba(255,255,255,0.1)' }}>{t('how.badge')}</div>
                  <h2 className="section-title" style={{ color: '#fff' }}>{t('how.title')}</h2>
                  <p className="section-subtitle" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    {t('how.subtitle')}
                  </p>
                </div>
                <div className="how-it-works-right">
                  <div className="split-step-card reveal-child reveal-delay-3">
                    <div className="split-step-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                    <div className="split-step-content">
                      <h3>{t('how.step1.title')}</h3>
                      <p>{t('how.step1.desc')}</p>
                    </div>
                  </div>
                  <div className="split-step-card reveal-child reveal-delay-4">
                    <div className="split-step-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                    </div>
                    <div className="split-step-content">
                      <h3>{t('how.step2.title')}</h3>
                      <p>{t('how.step2.desc')}</p>
                    </div>
                  </div>
                  <div className="split-step-card reveal-child reveal-delay-5">
                    <div className="split-step-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <div className="split-step-content">
                      <h3>{t('how.step3.title')}</h3>
                      <p>{t('how.step3.desc')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 5: THE UNIVERSAL AGENT OS */}
          <section className="landing-section" id="use-cases" ref={reveal4}>
            <div className="landing-container" style={{ textAlign: 'center' }}>
              <div className="section-badge reveal-child reveal-delay-1">{t('os.badge')}</div>
              <h2 className="section-title reveal-child reveal-delay-2">{t('os.title')}</h2>
              <p className="section-subtitle reveal-child reveal-delay-3" style={{ margin: '0 auto 48px auto' }}>
                {t('os.subtitle')}
              </p>
              <div className="reveal-child reveal-delay-4">
                <PartnerMarquee />
              </div>
            </div>
          </section>

          {/* SECTION 5.5: DEMO SHOWCASE */}
          <section className="landing-section demo-section" id="demo" ref={reveal5}>
            <div className="landing-container">
              <div className="section-badge reveal-child reveal-delay-1">{t('demo.badge')}</div>
              <h2 className="section-title reveal-child reveal-delay-2">{t('demo.title')}</h2>
              <p className="section-subtitle reveal-child reveal-delay-3">
                {t('demo.subtitle')}
              </p>
              <div className="demo-showcase reveal-child reveal-delay-4">
                <div className="demo-frame">
                  {/* Browser mockup top bar */}
                  <div className="demo-browser-bar">
                    <span className="demo-dot" /><span className="demo-dot" /><span className="demo-dot" />
                    <div className="demo-url-bar">sera-os.app/demo</div>
                  </div>
                  {/* Placeholder content simulating product */}
                  <div className="demo-content">
                    <div className="demo-sidebar">
                      <div className="demo-sidebar-item active" />
                      <div className="demo-sidebar-item" />
                      <div className="demo-sidebar-item" />
                      <div className="demo-sidebar-item" />
                    </div>
                    <div className="demo-main">
                      <div className="demo-line demo-line-short" />
                      <div className="demo-line" />
                      <div className="demo-line demo-line-medium" />
                      <div className="demo-card-row">
                        <div className="demo-mini-card" />
                        <div className="demo-mini-card" />
                        <div className="demo-mini-card" />
                      </div>
                      <div className="demo-line" />
                      <div className="demo-line demo-line-short" />
                    </div>
                  </div>
                  {/* Play overlay */}
                  <div className="demo-overlay">
                    <div className="demo-play-ring">
                      <svg viewBox="0 0 48 48" fill="none"><polygon points="18,12 38,24 18,36" fill="currentColor" /></svg>
                    </div>
                    <span>{t('demo.play')}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* SECTION 6: INTERACTIVE TERMINAL EXPERIENCE (Reception Chat & Footer) */}
      <div id="interactive" className="interactive-section">

        <section className="room-stage" id="reception">
          {scene === 'reception' ? <IdleScene onSuggestion={handleSamplePromptClick} /> : <IntentScene scene={scene} question={question} content={content} streamedResponse={streamedResponse} isThinking={isThinking} activeVisual={activeVisual} isVisualTransitioning={isVisualTransitioning} onSuggestion={send} onLaunchApp={launchApp} />}
        </section>


        {scene !== 'reception' && !isThinking && isResponseComplete && <div className={`session-control ${isClosing ? 'is-closing' : ''}`}>
          <span className="session-pulse" />
          <span>{isClosing ? `Returning to reception in ${remaining}s` : `Session active · Return in ${remaining}s`}</span>
          {isClosing && <button type="button" onClick={() => setRemaining(45)}>Stay here</button>}
          <button type="button" onClick={endSession}>{isClosing ? 'End now' : 'End session'}</button>
        </div>}

        <form className={`room-input ${scene !== 'reception' ? 'is-engaged' : ''}`} onSubmit={submit}>
          <input ref={inputRef} value={message} onChange={event => setMessage(event.target.value)} disabled={isThinking} placeholder={scene === 'reception' ? inputPrompts[inputPromptIndex] : 'Continue the conversation…'} aria-label="Message SERA" />
          <button type="submit" disabled={!message.trim() || isThinking} aria-label="Send message">{isThinking ? <i /> : '↑'}</button>
        </form>
      </div>

      {scene === 'reception' && (
        <footer className="landing-footer-pro">
          <div className="landing-footer-content">
            <div className="footer-col">
              <h4 style={{ color: 'var(--ink)' }}>SERA OS</h4>
              <p>{t('footer.description')}</p>
              <div className="system-status">
                <span className="status-dot"></span>
                {t('footer.system_operational')}
              </div>
            </div>
            <div className="footer-col">
              <h4 style={{ color: 'var(--ink)' }}>{t('nav.products')}</h4>
              <a href="https://docs.seraos.xyz/docs/engine" target="_blank" rel="noreferrer">Agent Engine</a>
              <a href="https://docs.seraos.xyz/docs/mpc" target="_blank" rel="noreferrer">MPC Wallet</a>
              <a href="https://docs.seraos.xyz/docs/workflows" target="_blank" rel="noreferrer">Action Workflows</a>
              <a href="https://docs.seraos.xyz/docs/compute" target="_blank" rel="noreferrer">Verifiable Compute</a>
            </div>
            <div className="footer-col">
              <h4 style={{ color: 'var(--ink)' }}>{t('nav.developers')}</h4>
              <a href="https://docs.seraos.xyz/docs/intro" target="_blank" rel="noreferrer">Documentation</a>
              <a href="https://docs.seraos.xyz/docs/workflows" target="_blank" rel="noreferrer">API Reference</a>
              <a href="https://docs.seraos.xyz/docs/engine" target="_blank" rel="noreferrer">Architecture Overview</a>
              <a href="https://github.com/seraos-agent/sera-core" target="_blank" rel="noreferrer">GitHub</a>
            </div>
            <div className="footer-col">
              <h4 style={{ color: 'var(--ink)' }}>{t('footer.community')}</h4>
              <a href="https://x.com/seraos_agent?t=s86TFhszPI6ETJhYXO_L6A&s=09" target="_blank" rel="noreferrer">Twitter (X)</a>
              <a href="https://t.me/Seraos_agent" target="_blank" rel="noreferrer">Telegram</a>
            </div>
          </div>
          <div className="landing-footer-bottom">
            <span className="copyright">{t('footer.rights')}</span>
            <div className="footer-legal">
              <a href="#privacy">Privacy Policy</a>
              <a href="#terms">Terms of Service</a>
            </div>
          </div>
        </footer>
      )}

      {showNotice && <LaunchNotice onClose={() => setShowNotice(false)} />}
    </main>
  );
}

function ConnectorFlowBackground() {
  return (
    <div className="connector-flow-bg">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="flow-glow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(79, 107, 255, 0)" />
            <stop offset="50%" stopColor="rgba(79, 107, 255, 0.8)" />
            <stop offset="100%" stopColor="rgba(79, 107, 255, 0)" />
          </linearGradient>
          <linearGradient id="flow-glow-vert" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(79, 107, 255, 0)" />
            <stop offset="50%" stopColor="rgba(79, 107, 255, 0.8)" />
            <stop offset="100%" stopColor="rgba(79, 107, 255, 0)" />
          </linearGradient>
        </defs>

        {/* Animated Pulses */}
        <line x1="0" y1="20%" x2="100%" y2="20%" className="pulse-line pulse-horizontal" stroke="url(#flow-glow)" />
        <line x1="0" y1="50%" x2="100%" y2="50%" className="pulse-line pulse-horizontal" stroke="url(#flow-glow)" style={{ animationDelay: '2s', animationDuration: '7s' }} />
        <line x1="0" y1="80%" x2="100%" y2="80%" className="pulse-line pulse-horizontal" stroke="url(#flow-glow)" style={{ animationDelay: '4s' }} />

        <line x1="30%" y1="0" x2="30%" y2="100%" className="pulse-line pulse-vertical" stroke="url(#flow-glow-vert)" />
        <line x1="70%" y1="0" x2="70%" y2="100%" className="pulse-line pulse-vertical" stroke="url(#flow-glow-vert)" style={{ animationDelay: '3s' }} />
      </svg>
    </div>
  );
}


function DelayedMesh() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Delay rendering the heavy CSS blur filters so they don't block the initial text paint (LCP)
    const timer = setTimeout(() => setIsMounted(true), 150);
    return () => clearTimeout(timer);
  }, []);

  if (!isMounted) return <div className="hero-mesh" aria-hidden="true" style={{ opacity: 0 }} />;

  return (
    <div className="hero-mesh" aria-hidden="true">
      <span className="hero-blob hero-blob-1" />
      <span className="hero-blob hero-blob-2" />
      <span className="hero-blob hero-blob-3" />
      <span className="hero-blob hero-blob-4" />
    </div>
  );
}

/* ─── Metrics Strip Component ─── */

function IdleScene({ onSuggestion }: { onSuggestion: (prompt: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="idle-scene">
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div className="section-badge" style={{ margin: '0 auto 14px' }}>{t('idle.badge')}</div>
        <h2 className="section-title" style={{ fontSize: 'clamp(22px, 3vw, 32px)', marginBottom: '12px' }}>
          {t('idle.title')}
        </h2>
        <p className="section-subtitle" style={{ margin: '0 auto' }}>
          {t('idle.subtitle')}
        </p>
      </div>

      <div className="prompts-grid" style={{ position: 'relative', zIndex: 10 }}>
        <div className="prompt-card" onClick={() => onSuggestion(t('idle.prompt1'))}>
          <div className="prompt-card-bg"></div>
          <div className="prompt-card-content">
            <div className="prompt-card-header">
              <div className="prompt-icon icon-intro">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              </div>
              <div className="prompt-card-category">{t('idle.cat.intro')}</div>
            </div>
            <p className="prompt-card-text">"{t('idle.prompt1')}"</p>
            <div className="prompt-card-action">{t('idle.try')} <span className="arrow">→</span></div>
          </div>
        </div>

        <div className="prompt-card" onClick={() => onSuggestion(t('idle.prompt2'))}>
          <div className="prompt-card-bg"></div>
          <div className="prompt-card-content">
            <div className="prompt-card-header">
              <div className="prompt-icon icon-cap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              </div>
              <div className="prompt-card-category">{t('idle.cat.cap')}</div>
            </div>
            <p className="prompt-card-text">"{t('idle.prompt2')}"</p>
            <div className="prompt-card-action">{t('idle.try')} <span className="arrow">→</span></div>
          </div>
        </div>

        <div className="prompt-card" onClick={() => onSuggestion(t('idle.prompt3'))}>
          <div className="prompt-card-bg"></div>
          <div className="prompt-card-content">
            <div className="prompt-card-header">
              <div className="prompt-icon icon-sec">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              </div>
              <div className="prompt-card-category">{t('idle.cat.sec')}</div>
            </div>
            <p className="prompt-card-text">"{t('idle.prompt3')}"</p>
            <div className="prompt-card-action">{t('idle.try')} <span className="arrow">→</span></div>
          </div>
        </div>

        <div className="prompt-card" onClick={() => onSuggestion(t('idle.prompt4'))}>
          <div className="prompt-card-bg"></div>
          <div className="prompt-card-content">
            <div className="prompt-card-header">
              <div className="prompt-icon icon-int">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              </div>
              <div className="prompt-card-category">{t('idle.cat.int')}</div>
            </div>
            <p className="prompt-card-text">"{t('idle.prompt4')}"</p>
            <div className="prompt-card-action">{t('idle.try')} <span className="arrow">→</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntentScene({ scene, question, content, streamedResponse, isThinking, activeVisual, isVisualTransitioning, onSuggestion, onLaunchApp }: {
  scene: Scene;
  question: string;
  content: ReceptionReply | null;
  streamedResponse: string;
  isThinking: boolean;
  activeVisual: { scene: Scene; id: number } | null;
  isVisualTransitioning: boolean;
  onSuggestion: (prompt: string) => void;
  onLaunchApp: () => void;
}) {
  const isResponseComplete = Boolean(content && content.response.length > 0 && streamedResponse.length >= content.response.length);
  const hasVisual = visualScenes.has(scene);
  const activeHasCard = Boolean(activeVisual && visualScenes.has(activeVisual.scene));

  const response = !content ? null : (
    <div className={`markdown-copy ${!isResponseComplete ? 'is-streaming' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {isResponseComplete ? content.response : streamedResponse + ' █'}
      </ReactMarkdown>
    </div>
  );

  return (
    <div className={`intent-scene ${hasVisual ? 'has-visual' : 'is-text-only'}`}>
      <div className="conversation-column">
        <div className="user-message"><p>{question}</p></div>
        {isThinking || !content
          ? <div className="thinking"><span className="thinking-spinner" /><p>Preparing your request…</p></div>
          : <div className="sera-message">
            {response}
            {isResponseComplete && hasVisual && (
              <div className="mobile-inline-visual" aria-label="SERA explanation visual">
                <div className="mobile-inline-scale">
                  <ExplanationAnimation key={`${question}-mobile`} scene={scene} />
                </div>
              </div>
            )}
            {isResponseComplete && scene === 'start' && (
              <button type="button" className="conversation-launch" onClick={onLaunchApp}>Launch SERA</button>
            )}
            {isResponseComplete && scene !== 'start' && content.suggestedQuestions.length > 0 && (
              <div className="sera-suggestions">
                {content.suggestedQuestions.map(suggestion => (
                  <button type="button" key={suggestion} onClick={() => onSuggestion(suggestion)}>{suggestion}</button>
                ))}
              </div>
            )}
          </div>
        }
      </div>
      {activeHasCard
        ? <div className={`intent-visual-space persistent-visual ${isVisualTransitioning ? 'is-transitioning' : ''}`}>
          <ExplanationAnimation key={activeVisual!.id} scene={activeVisual!.scene} />
        </div>
        : <div className={`ambient-visual-space persistent-visual ${isVisualTransitioning ? 'is-transitioning' : ''}`}>
          {activeVisual && <AmbientDiagram key={activeVisual.id} scene={activeVisual.scene} />}
        </div>
      }
    </div>
  );
}

function AmbientDiagram({ scene }: { scene: Scene }) {
  const diagram = scene === 'capabilities'
    ? { inputs: ['Wallets', 'Finance', 'Tools'], outputs: ['Insight', 'Automation', 'Review'] }
    : scene === 'ecosystem'
      ? { inputs: ['Wallet layer', 'Financial systems', 'Connectors'], outputs: ['One context', 'Policies', 'Actions'] }
      : scene === 'introduction'
        ? { inputs: ['Context', 'Intent', 'Systems'], outputs: ['Clarity', 'Proposal', 'Action'] }
        : { inputs: ['Signals', 'Intent', 'Constraints'], outputs: ['Clarity', 'Plan', 'Approval'] };

  return <div className={`ambient-diagram ambient-${scene}`} aria-hidden="true">
    <span className="ambient-field" /><span className="ambient-halo ambient-halo-one" /><span className="ambient-halo ambient-halo-two" /><span className="ambient-halo ambient-halo-three" />
    <svg className="ambient-network" viewBox="0 0 360 270" fill="none" preserveAspectRatio="none">
      <path className="ambient-link" d="M104 55 C128 55 136 103 159 119" /><path className="ambient-link" d="M104 135 C128 135 136 135 159 135" /><path className="ambient-link" d="M104 215 C128 215 136 167 159 151" />
      <path className="ambient-link ambient-link-output" d="M201 119 C224 103 232 55 256 55" /><path className="ambient-link ambient-link-output" d="M201 135 C224 135 232 135 256 135" /><path className="ambient-link ambient-link-output" d="M201 151 C224 167 232 215 256 215" />
      <path className="ambient-flow" d="M104 55 C128 55 136 103 159 119" /><path className="ambient-flow" d="M104 135 C128 135 136 135 159 135" /><path className="ambient-flow" d="M104 215 C128 215 136 167 159 151" />
      <path className="ambient-flow ambient-flow-output" d="M201 119 C224 103 232 55 256 55" /><path className="ambient-flow ambient-flow-output" d="M201 135 C224 135 232 135 256 135" /><path className="ambient-flow ambient-flow-output" d="M201 151 C224 167 232 215 256 215" />
    </svg>
    <span className="ambient-core"><img src={seraLogo} alt="" /></span>
    <span className="ambient-core-label">SERA</span>
    {diagram.inputs.map((node, index) => <span className={`ambient-node ambient-input ambient-input-${index + 1}`} key={node}>{node}</span>)}
    {diagram.outputs.map((node, index) => <span className={`ambient-node ambient-output ambient-output-${index + 1}`} key={node}>{node}</span>)}
    <p>Context becomes considered action</p>
  </div>;
}

function ExplanationAnimation({ scene }: { scene: Scene }) {
  if (scene === 'introduction') return <SeraIntroductionCard />;
  if (scene === 'capabilities') return <CapabilitiesCard />;
  if (scene === 'operating') return <OperatingModelCard />;
  if (scene === 'ecosystem') return <EcosystemCard />;
  if (scene === 'automation') return <ProposalCard />;
  if (scene === 'crypto') return <div className="motion-card wallet-motion"><div className="motion-topline"><span className="motion-orb" /> WALLET INTELLIGENCE <small>CONTEXT READY</small></div><div className="wallet-context-heading"><p>WALLET LAYER</p><strong>Ready to understand</strong><span>Clarity before any action.</span></div><div className="wallet-context-grid"><div><i>01</i><b>Portfolio context</b><small>Read for clarity</small></div><div><i>02</i><b>Permission scope</b><small>Defined by you</small></div></div><div className="motion-check"><i>✓</i> Proposal required for action</div></div>;
  if (scene === 'security') return <SafeguardsCard />;
  if (scene === 'general') return <ReceptionCard />;
  return <ProposalCard />;
}

function SeraIntroductionCard() {
  return <div className="motion-card sera-introduction-card">
    <div className="motion-topline"><span className="motion-orb" /> SERA / UNIVERSAL AGENT OS <small>LIVE MODEL</small></div>
    <div className="sera-system-visual" aria-hidden="true">
      <span className="sera-orbit sera-orbit-one" /><span className="sera-orbit sera-orbit-two" />
      <span className="sera-link sera-link-one" /><span className="sera-link sera-link-two" /><span className="sera-link sera-link-three" />
      <span className="sera-core"><img src={seraLogo} alt="" /></span>
      <span className="sera-node sera-node-context">Context</span>
      <span className="sera-node sera-node-plan">Plan</span>
      <span className="sera-node sera-node-action">Action</span>
    </div>
    <p className="sera-card-caption">One intelligence that turns context into considered action.</p>
  </div>;
}

function CapabilitiesCard() {
  return <div className="motion-card capabilities-card">
    <div className="motion-topline"><span className="motion-orb" /> SERA CAPABILITIES <small>ONE CONTEXT</small></div>
    <div className="capability-map" aria-hidden="true">
      <span className="capability-ring capability-ring-one" /><span className="capability-ring capability-ring-two" />
      <span className="capability-core"><img src={seraLogo} alt="" /></span>
      <span className="capability-node capability-wallets">Wallets</span>
      <span className="capability-node capability-finance">Finance</span>
      <span className="capability-node capability-automation">Automation</span>
      <span className="capability-node capability-tools">Tools</span>
    </div>
    <div className="capability-summary"><span>OBSERVE</span><i>→</i><span>REASON</span><i>→</i><b>PROPOSE</b></div>
  </div>;
}

function OperatingModelCard() {
  return <div className="motion-card operating-system-card">
    <div className="motion-topline"><span className="motion-orb" /> SERA OPERATING MODEL <small>HUMAN-IN-LOOP</small></div>
    <div className="operating-canvas" aria-hidden="true">
      <span className="operating-path operating-path-one" /><span className="operating-path operating-path-two" />
      <span className="operating-pulse operating-pulse-one" /><span className="operating-pulse operating-pulse-two" />
      <div className="operating-node operating-node-context"><i>01</i><b>Context</b><small>Signals aligned</small></div>
      <div className="operating-core"><span><img src={seraLogo} alt="" /></span><b>Reasoning</b></div>
      <div className="operating-node operating-node-proposal"><i>03</i><b>Proposal</b><small>Ready to review</small></div>
    </div>
    <div className="operating-review"><span>✓</span><p>A proposal makes the next action reviewable.</p><i>Approval required</i></div>
  </div>;
}

function SafeguardsCard() {
  return <div className="motion-card safeguard-system-card">
    <div className="motion-topline"><span className="motion-orb" /> SAFEGUARD LAYER <small>AUTHORIZATION</small></div>
    <div className="safeguard-canvas" aria-hidden="true">
      <div className="safeguard-context"><span>Context</span><i>Read</i></div>
      <span className="safeguard-rail safeguard-rail-one" /><span className="safeguard-rail safeguard-rail-two" />
      <span className="safeguard-pulse" />
      <div className="safeguard-gate"><span>✓</span><b>Approval</b><small>Required</small></div>
      <div className="safeguard-action"><span>Action</span><i>Only if approved</i></div>
    </div>
    <div className="safeguard-status"><span><i>✓</i> Scoped access</span><span><i>✓</i> Review record</span><span><i>✓</i> Human control</span></div>
  </div>;
}

function EcosystemCard() {
  return <div className="motion-card ecosystem-card">
    <div className="motion-topline"><span className="motion-orb" /> SERA ECOSYSTEM <small>YOUR CHOICE</small></div>
    <div className="ecosystem-map" aria-hidden="true">
      <span className="ecosystem-line ecosystem-line-one" /><span className="ecosystem-line ecosystem-line-two" /><span className="ecosystem-line ecosystem-line-three" />
      <span className="ecosystem-core"><img src={seraLogo} alt="" /></span>
      <span className="ecosystem-node ecosystem-node-wallet">500+ Wallet options</span>
      <span className="ecosystem-node ecosystem-node-finance">Financial systems</span>
      <span className="ecosystem-node ecosystem-node-connectors">Connectors</span>
    </div>
    <p className="ecosystem-caption">Bring only the systems you choose into one considered view.</p>
  </div>;
}

function ReceptionCard() {
  return <div className="motion-card reception-card">
    <div className="motion-topline"><span className="motion-orb" /> SERA RECEPTION <small>READY</small></div>
    <div className="reception-card-mark"><img src={seraLogo} alt="" /></div>
    <p>Ask about SERA, its operating model, safeguards, or the systems it can understand.</p>
    <div className="reception-card-topics"><span>Introduction</span><span>Capabilities</span><span>Safeguards</span></div>
  </div>;
}

function ProposalCard() {
  const [approvePressed, setApprovePressed] = useState(false);
  const [showSecondCard, setShowSecondCard] = useState(false);
  const [rejectPressed, setRejectPressed] = useState(false);
  const [isCrumbling, setIsCrumbling] = useState(false);
  const [removeSecondCard, setRemoveSecondCard] = useState(false);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    setApprovePressed(false);
    setShowSecondCard(false);
    setRejectPressed(false);
    setIsCrumbling(false);
    setRemoveSecondCard(false);
    const pressApprove = window.setTimeout(() => setApprovePressed(true), 1200);
    const showSecond = window.setTimeout(() => setShowSecondCard(true), 2300);
    const pressReject = window.setTimeout(() => setRejectPressed(true), 4600);
    const crumble = window.setTimeout(() => setIsCrumbling(true), 5300);
    const remove = window.setTimeout(() => setRemoveSecondCard(true), 6200);
    const restart = window.setTimeout(() => setCycle(value => value + 1), 7100);
    return () => [pressApprove, showSecond, pressReject, crumble, remove, restart].forEach(window.clearTimeout);
  }, [cycle]);

  return <div className="proposal-sequence" key={cycle}>
    <div className={`motion-card automation-motion proposal-card proposal-card-one ${approvePressed ? 'is-pressing' : ''}`}>
      <div className="motion-topline"><span className="motion-orb" /> SERA PROPOSAL <small>REVIEW REQUIRED</small></div>
      <h3>Weekly transfer</h3>
      <div className="proposal-copy"><span>DESCRIPTION</span><p>SERA prepared this automation from your request. Review the details before allowing execution.</p></div>
      <div className="proposal-action"><span>ACTION</span><strong>Transfer 250.00 USDC</strong><p>To Treasury wallet · Every Friday, 08:00</p></div>
      <div className="proposal-outcome"><span>APPROVAL GATE</span><p>Waiting for explicit review</p></div>
      <div className="demo-actions" aria-hidden="true"><span className="demo-button demo-primary is-target">Approve</span><span className="demo-button demo-reject">Reject</span></div>
    </div>
    {showSecondCard && !removeSecondCard && <div className={`motion-card automation-motion proposal-card proposal-card-two ${rejectPressed ? 'is-pressing' : ''} ${isCrumbling ? 'is-crumbling' : ''}`}>
      <div className="motion-topline"><span className="motion-orb" /> NEW PROPOSAL <small>REVIEW REQUIRED</small></div>
      <h3>Transfer policy update</h3>
      <div className="proposal-copy"><span>DESCRIPTION</span><p>A separate scope needs its own review. Approval does not carry over.</p></div>
      <div className="proposal-action"><span>ACTION</span><strong>Transfer 1,200.00 USDC</strong><p>To Operations wallet · One-time action</p></div>
      <div className="proposal-outcome"><span>REVIEW</span><p>Awaiting a decision</p></div>
      <div className="demo-actions" aria-hidden="true"><span className="demo-button demo-primary">Approve</span><span className="demo-button demo-reject is-target">Reject</span></div>
    </div>}
  </div>;
}

function LaunchNotice({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return <div className="launch-notice-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="launch-notice" role="dialog" aria-modal="true" aria-labelledby="launch-notice-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="launch-notice-status"><div className="launch-notice-mark"><img src={seraLogo} alt="SERA" /></div><p className="launch-notice-kicker">{t('modal.badge')}</p></div>
      <h1 id="launch-notice-title">{t('modal.title')}</h1>
      <p>{t('modal.desc')}</p>
      <div className="launch-notice-actions">
        <div className="launch-notice-contacts" aria-label="Contact SERA">
          <a href="https://mail.google.com/mail/?view=cm&fs=1&to=seraos.agent%40gmail.com" target="_blank" rel="noreferrer" aria-label="Email SERA with Gmail" title="Open Gmail"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.25 18V6.25" stroke="#4285F4" strokeWidth="3.1" strokeLinecap="round" /><path d="m4.25 6.25 7.75 5.8" stroke="#EA4335" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" /><path d="m12 12.05 7.75-5.8" stroke="#FBBC04" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" /><path d="M19.75 6.25V18" stroke="#34A853" strokeWidth="3.1" strokeLinecap="round" /></svg></a>
          <a className="launch-notice-x" href="https://x.com/seraos_agent?t=s86TFhszPI6ETJhYXO_L6A&s=09" target="_blank" rel="noreferrer" aria-label="Follow SERA on X" title="Open X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.042 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932Zm-1.29 19.468h2.039L6.486 3.259H4.298L17.61 20.62Z" /></svg></a>
          <a className="launch-notice-telegram" href="https://t.me/Seraos_agent" target="_blank" rel="noreferrer" aria-label="Contact SERA on Telegram" title="Open Telegram"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 3.4a1.45 1.45 0 0 0-1.5-.22L2.95 9.8a1.44 1.44 0 0 0 .12 2.72l4.2 1.32 1.6 5.07a1.42 1.42 0 0 0 2.4.53l2.34-2.35 4.17 3.05a1.44 1.44 0 0 0 2.26-.85l2.18-14.4a1.43 1.43 0 0 0-.82-1.48ZM9.42 13.02l8.24-5.1-6.75 6.53-.26 2.62-1.23-3.9Z" /></svg></a>
        </div>
        <button type="button" onClick={onClose}>{t('modal.button')}</button>
      </div>
    </section>
  </div>;
}
