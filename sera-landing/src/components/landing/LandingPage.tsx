import { useEffect, useRef, useState, useCallback } from 'react';
import type { FormEvent } from 'react';
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
import { Sun, Moon } from 'lucide-react';

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

/* ─── Animated Counter Hook ─── */
function useCountUp(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const animate = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
          observer.unobserve(node);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [target, duration]);

  return { count, ref };
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
  const [scene, setScene] = useState<Scene>('reception');
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sera-landing-theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('sera-landing-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

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
    setShowNotice(true);
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

      <header className="room-header">
        <a href="#hero" className="room-brand" onClick={endSession}><img src={seraLogo} alt="SERA" /><span>SERA</span></a>

        <nav className="room-header-nav" aria-label="Main Navigation">
          <a href="#hero" className="nav-link">Home</a>
          <a href="#about" className="nav-link">Why SERA</a>
          <a href="#features" className="nav-link">Features</a>
          <a href="#how-it-works" className="nav-link">How It Works</a>
          <a href="#use-cases" className="nav-link">Use Cases</a>
          <a href="#interactive" className="nav-link">Try SERA</a>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="theme-toggle-header"
            onClick={() => setIsDark(!isDark)}
            aria-label="Toggle theme"
            title="Toggle theme"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '6px',
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
          <button className="header-launch" onClick={launchApp}>Launch SERA</button>
        </div>
      </header>

      {scene === 'reception' && (
        <>
          {/* SECTION 1: HERO SECTION */}
          <section className="landing-section hero-section" id="hero">
            {/* Animated gradient mesh background */}
            <DelayedMesh />
            <div className="landing-container">
              <div className="section-badge">SERA OS · Universal AI Agent Engine</div>
              <h1 className="hero-title">
                Autonomous Intelligence That Executes Your Intent
              </h1>
              <p className="hero-subtitle">
                Beyond standard text responses. SERA evaluates real-world state, formulates actionable plans, and securely executes workflows for you.
              </p>
              <div className="hero-cta-group">
                <a href="#interactive" className="cta-button cta-primary">
                  Try SERA Now
                </a>
                <a href="#about" className="cta-button cta-secondary">
                  Learn More
                </a>
              </div>
              <div className="hero-stats-row">
                <div className="hero-stat-item"><span>100% Autonomous Planning</span></div>
                <div className="hero-stat-item"><span>Real-Time WorldState Integration</span></div>
                <div className="hero-stat-item"><span>Verifiable Safeguards & Security</span></div>
              </div>
            </div>
          </section>

          {/* SECTION 1.5: METRICS STRIP */}
          <MetricsStrip />

          {/* SECTION 2: WHY SERA */}
          <section className="landing-section" id="about" ref={reveal}>
            <div className="landing-container">
              <div className="section-badge reveal-child reveal-delay-1">WHY SERA</div>
              <h2 className="section-title reveal-child reveal-delay-2">Bridging Natural Intent With Complex Execution</h2>
              <p className="section-subtitle reveal-child reveal-delay-3">
                Designed for non-technical users to orchestrate intelligent workflows without needing engineering skills.
              </p>
              <div className="about-grid reveal-child reveal-delay-4">
                <div className="about-card">

                  <h3>Zero Technical Friction</h3>
                  <p>No syntax or complex commands to memorize. Simply express your goals in everyday human language.</p>
                </div>
                <div className="about-card">

                  <h3>Real-World Execution</h3>
                  <p>Most AI tools stop at generating text. SERA constructs structured action plans and executes them for real.</p>
                </div>
                <div className="about-card">

                  <h3>Real-Time State Awareness</h3>
                  <p>SERA inspects live system state before acting, ensuring zero false assumptions during task execution.</p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3: CORE CAPABILITIES */}
          <section className="landing-section" id="features" ref={reveal2}>
            <div className="landing-container">
              <div className="section-badge reveal-child reveal-delay-1">CORE CAPABILITIES</div>
              <h2 className="section-title reveal-child reveal-delay-2">The Power Behind SERA OS</h2>
              <p className="section-subtitle reveal-child reveal-delay-3">
                Combining artificial intelligence, system automation, and verifiable human control.
              </p>
              <div className="features-grid reveal-child reveal-delay-4">
                <div className="feature-card">
                  <div className="feature-card-header">

                    <h3>Natural Language Interaction</h3>
                  </div>
                  <p>Describe goals in your own words. SERA understands context and intent accurately.</p>
                </div>
                <div className="feature-card">
                  <div className="feature-card-header">

                    <h3>Autonomous Planner</h3>
                  </div>
                  <p>Decomposes complex requests into structured, step-by-step proposals automatically.</p>
                </div>
                <div className="feature-card">
                  <div className="feature-card-header">

                    <h3>Multi-System & Web3 Connectors</h3>
                  </div>
                  <p>Integrates seamlessly with wallets, external APIs, data services, and automated tasks.</p>
                </div>
                <div className="feature-card">
                  <div className="feature-card-header">

                    <h3>Verifiable Control & Safeguards</h3>
                  </div>
                  <p>Critical actions require your explicit review and approval before execution.</p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 4: HOW IT WORKS */}
          <section className="landing-section" id="how-it-works" ref={reveal3}>
            <div className="landing-container">
              <div className="section-badge reveal-child reveal-delay-1">HOW IT WORKS</div>
              <h2 className="section-title reveal-child reveal-delay-2">In 3 Simple Steps</h2>
              <p className="section-subtitle reveal-child reveal-delay-3">
                A transparent journey from initial instruction to verified outcome.
              </p>
              <div className="steps-wrapper reveal-child reveal-delay-4">
                <div className="step-card">
                  <div className="step-number">01</div>
                  <h3>Express Your Intent</h3>
                  <p>Type your request or question in SERA's interactive console at the bottom of this page.</p>
                </div>
                <div className="step-connector" aria-hidden="true">
                  <svg viewBox="0 0 80 20" fill="none">
                    <path className="flow-line" d="M0 10h70" stroke="currentColor" strokeWidth="2" />
                    <path className="arrow-head" d="M64 4l7 6-7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="step-card">
                  <div className="step-number">02</div>
                  <h3>SERA Formulates a Plan</h3>
                  <p>SERA evaluates real-time state, checks policy constraints, and builds a proposed action workflow.</p>
                </div>
                <div className="step-connector" aria-hidden="true">
                  <svg viewBox="0 0 80 20" fill="none">
                    <path className="flow-line" d="M0 10h70" stroke="currentColor" strokeWidth="2" />
                    <path className="arrow-head" d="M64 4l7 6-7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="step-card">
                  <div className="step-number">03</div>
                  <h3>Execute & Verify</h3>
                  <p>Upon review, SERA completes the task safely and delivers transparent execution reports.</p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 5: SAMPLE USE CASES */}
          <section className="landing-section" id="use-cases" ref={reveal4}>
            <div className="landing-container">
              <div className="section-badge reveal-child reveal-delay-1">SAMPLE USE CASES</div>
              <h2 className="section-title reveal-child reveal-delay-2">What Can You Ask SERA To Do?</h2>
              <p className="section-subtitle reveal-child reveal-delay-3">
                Click any sample prompt below to populate the interactive console at the bottom and try it out!
              </p>
              <div className="prompts-grid reveal-child reveal-delay-4">
                <div className="prompt-card" onClick={() => handleSamplePromptClick('What is SERA?')}>
                  <div className="prompt-card-category">INTRODUCTION</div>
                  <p className="prompt-card-text">"What is SERA?"</p>
                  <div className="prompt-card-action">Try This Prompt <span>→</span></div>
                </div>
                <div className="prompt-card" onClick={() => handleSamplePromptClick('What can SERA help me accomplish?')}>
                  <div className="prompt-card-category">CAPABILITIES</div>
                  <p className="prompt-card-text">"What can SERA help me accomplish?"</p>
                  <div className="prompt-card-action">Try This Prompt <span>→</span></div>
                </div>
                <div className="prompt-card" onClick={() => handleSamplePromptClick('How does SERA stay safe?')}>
                  <div className="prompt-card-category">SECURITY</div>
                  <p className="prompt-card-text">"How does SERA stay safe?"</p>
                  <div className="prompt-card-action">Try This Prompt <span>→</span></div>
                </div>
                <div className="prompt-card" onClick={() => handleSamplePromptClick('What can SERA connect to?')}>
                  <div className="prompt-card-category">INTEGRATIONS</div>
                  <p className="prompt-card-text">"What can SERA connect to?"</p>
                  <div className="prompt-card-action">Try This Prompt <span>→</span></div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 5.5: DEMO SHOWCASE */}
          <section className="landing-section demo-section" id="demo" ref={reveal5}>
            <div className="landing-container">
              <div className="section-badge reveal-child reveal-delay-1">PRODUCT DEMO</div>
              <h2 className="section-title reveal-child reveal-delay-2">See SERA in Action</h2>
              <p className="section-subtitle reveal-child reveal-delay-3">
                Watch how SERA transforms natural language into real, verified execution.
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
                    <span>Play Demo</span>
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
          {scene === 'reception' ? <IdleScene /> : <IntentScene scene={scene} question={question} content={content} streamedResponse={streamedResponse} isThinking={isThinking} activeVisual={activeVisual} isVisualTransitioning={isVisualTransitioning} onSuggestion={send} onLaunchApp={launchApp} />}
        </section>


        {scene !== 'reception' && !isThinking && isResponseComplete && <div className={`session-control ${isClosing ? 'is-closing' : ''}`}>
          <span className="session-pulse" />
          <span>{isClosing ? `Returning to reception in ${remaining}s` : `Session active · Return in ${remaining}s`}</span>
          {isClosing && <button type="button" onClick={() => setRemaining(45)}>Stay here</button>}
          <button type="button" onClick={endSession}>{isClosing ? 'End now' : 'End session'}</button>
        </div>}

        <footer className="landing-footer" aria-label="SERA information">
          {scene === 'reception' && (
            <div className="landing-footer-identity">
              <span>SERA OS · 2026</span>
              <span className="landing-footer-trust">Public reception · Read-only</span>
            </div>
          )}

          {scene === 'reception' && (
            <div className="landing-footer-links">
              <a className="landing-footer-social" href="https://github.com/seraos-agent/sera-core" target="_blank" rel="noreferrer" aria-label="SERA OS on GitHub" title="Open GitHub">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
              </a>
              <a className="landing-footer-social" href="https://x.com/seraos_agent?t=s86TFhszPI6ETJhYXO_L6A&s=09" target="_blank" rel="noreferrer" aria-label="Follow SERA on X">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.042 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932Zm-1.29 19.468h2.039L6.486 3.259H4.298L17.61 20.62Z" /></svg>
              </a>
              <a className="landing-footer-social" href="https://t.me/Seraos_agent" target="_blank" rel="noreferrer" aria-label="Contact SERA on Telegram" title="Open Telegram">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 3.4a1.45 1.45 0 0 0-1.5-.22L2.95 9.8a1.44 1.44 0 0 0 .12 2.72l4.2 1.32 1.6 5.07a1.42 1.42 0 0 0 2.4.53l2.34-2.35 4.17 3.05a1.44 1.44 0 0 0 2.26-.85l2.18-14.4a1.43 1.43 0 0 0-.82-1.48ZM9.42 13.02l8.24-5.1-6.75 6.53-.26 2.62-1.23-3.9Z" /></svg>
              </a>
              <a className="landing-footer-gmail" href="https://mail.google.com/mail/?view=cm&fs=1&to=seraos.agent%40gmail.com" target="_blank" rel="noreferrer" aria-label="Email SERA with Gmail" title="Open Gmail">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.25 18V6.25" stroke="#4285F4" strokeWidth="3.1" strokeLinecap="round" /><path d="m4.25 6.25 7.75 5.8" stroke="#EA4335" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" /><path d="m12 12.05 7.75-5.8" stroke="#FBBC04" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" /><path d="M19.75 6.25V18" stroke="#34A853" strokeWidth="3.1" strokeLinecap="round" /></svg>
              </a>
            </div>
          )}
        </footer>

        <form className={`room-input ${scene !== 'reception' ? 'is-engaged' : ''}`} onSubmit={submit}>
          <input ref={inputRef} value={message} onChange={event => setMessage(event.target.value)} disabled={isThinking} placeholder={scene === 'reception' ? inputPrompts[inputPromptIndex] : 'Continue the conversation…'} aria-label="Message SERA" />
          <button type="submit" disabled={!message.trim() || isThinking} aria-label="Send message">{isThinking ? <i /> : '↑'}</button>
        </form>
      </div>
      {showNotice && <LaunchNotice onClose={() => setShowNotice(false)} />}
    </main>
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
const metricsData = [
  { value: 100, suffix: '+', label: 'Systems Connected' },
  { value: 24, suffix: '/7', label: 'Autonomous Operation' },
  { value: 2, prefix: '< ', suffix: 's', label: 'Average Response' },
  { value: 0, suffix: '', label: 'Unauthorized Actions', display: 'Zero' },
];

function MetricCard({ value, suffix, prefix, label, display }: { value: number; suffix: string; prefix?: string; label: string; display?: string }) {
  const { count, ref } = useCountUp(value, 1800);
  return (
    <div className="metric-card" ref={ref}>
      <span className="metric-number">{display || `${prefix || ''}${count}${suffix}`}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}

function MetricsStrip() {
  const reveal = useScrollReveal();
  return (
    <section className="metrics-strip" ref={reveal}>
      <div className="landing-container">
        <div className="metrics-row reveal-child reveal-delay-2">
          {metricsData.map((m) => (
            <MetricCard key={m.label} {...m} />
          ))}
        </div>
      </div>
    </section>
  );
}

function IdleScene() {
  return (
    <div className="idle-scene">
      <p className="room-kicker">The Universal Agent OS</p>

      <h1 className="idle-headline">
        <span className="idle-word idle-word-1">An intelligence for every system</span>
      </h1>

      <p className="idle-copy">
        Connect the systems that matter. SERA turns context into clear, considered action, never without your intent.
      </p>

      <PartnerMarquee />
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
  return <div className="launch-notice-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="launch-notice" role="dialog" aria-modal="true" aria-labelledby="launch-notice-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="launch-notice-status"><div className="launch-notice-mark"><img src={seraLogo} alt="SERA" /></div><p className="launch-notice-kicker">SERA · CONTROLLED RELEASE</p></div>
      <h1 id="launch-notice-title">Your Operational Partner is preparing for public access.</h1>
      <p>The private application is currently in a controlled release. You can continue exploring SERA through the public Reception, or contact us directly.</p>
      <div className="launch-notice-actions">
        <div className="launch-notice-contacts" aria-label="Contact SERA">
          <a href="https://mail.google.com/mail/?view=cm&fs=1&to=seraos.agent%40gmail.com" target="_blank" rel="noreferrer" aria-label="Email SERA with Gmail" title="Open Gmail"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.25 18V6.25" stroke="#4285F4" strokeWidth="3.1" strokeLinecap="round" /><path d="m4.25 6.25 7.75 5.8" stroke="#EA4335" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" /><path d="m12 12.05 7.75-5.8" stroke="#FBBC04" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" /><path d="M19.75 6.25V18" stroke="#34A853" strokeWidth="3.1" strokeLinecap="round" /></svg></a>
          <a className="launch-notice-x" href="https://x.com/seraos_agent?t=s86TFhszPI6ETJhYXO_L6A&s=09" target="_blank" rel="noreferrer" aria-label="Follow SERA on X" title="Open X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.042 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932Zm-1.29 19.468h2.039L6.486 3.259H4.298L17.61 20.62Z" /></svg></a>
          <a className="launch-notice-telegram" href="https://t.me/Seraos_agent" target="_blank" rel="noreferrer" aria-label="Contact SERA on Telegram" title="Open Telegram"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 3.4a1.45 1.45 0 0 0-1.5-.22L2.95 9.8a1.44 1.44 0 0 0 .12 2.72l4.2 1.32 1.6 5.07a1.42 1.42 0 0 0 2.4.53l2.34-2.35 4.17 3.05a1.44 1.44 0 0 0 2.26-.85l2.18-14.4a1.43 1.43 0 0 0-.82-1.48ZM9.42 13.02l8.24-5.1-6.75 6.53-.26 2.62-1.23-3.9Z" /></svg></a>
        </div>
        <button type="button" onClick={onClose}>Return to Reception</button>
      </div>
    </section>
  </div>;
}
