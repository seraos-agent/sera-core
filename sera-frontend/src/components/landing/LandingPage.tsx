import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, Box, Database, Terminal, Wallet } from 'lucide-react';
import './LandingPage.css';
import './PremiumPalette.css';
import seraLogo from '../../assets/sera-logo.png';
import globeMapSrc from '../../assets/globe-map.png';

type Scene = 'reception' | 'crypto' | 'automation' | 'security' | 'general' | 'start';

type SceneContent = { title: string; response: string; label: string };

const headerPrompts = [
  { label: 'Show automation', prompt: 'Show me a safe automation.' },
  { label: 'Review my wallet', prompt: 'Can SERA help me understand my wallet?' },
  { label: 'Plan a workflow', prompt: 'Help me plan a recurring action.' },
  { label: 'Explore safeguards', prompt: 'How does SERA stay in control?' },
  { label: 'Connect a system', prompt: 'How can I connect a wallet or tool?' },
];

const mobilePrompts = [
  'Try: Show a safe automation',
  'Try: Review my wallet',
  'Try: Plan a workflow',
  'Try: Explore safeguards',
  'Try: Connect a system',
];

function interpret(message: string): { scene: Exclude<Scene, 'reception'>; content: SceneContent } {
  const input = message.toLowerCase();
  if (input.includes('crypto') || input.includes('wallet') || input.includes('base') || input.includes('portfolio')) {
    return { scene: 'crypto', content: { label: 'WALLET INTELLIGENCE', title: 'Crypto, with a clearer next step.', response: 'SERA observes your wallet context, explains the available options, and presents a proposal before any action can move forward.' } };
  }
  if (input.includes('automation') || input.includes('schedule') || input.includes('transfer') || input.includes('recurring')) {
    return { scene: 'automation', content: { label: 'AUTOMATION', title: 'Intent becomes a proposal.', response: 'SERA turns a recurring request into a clear action plan. You decide when it is ready to execute.' } };
  }
  if (input.includes('safe') || input.includes('security') || input.includes('approval') || input.includes('risk')) {
    return { scene: 'security', content: { label: 'GOVERNANCE', title: 'Power, with boundaries.', response: 'SERA keeps observation, reasoning, approval, and execution separate—so you always know what is happening and why.' } };
  }
  if (input.includes('start') || input.includes('launch') || input.includes('create')) {
    return { scene: 'start', content: { label: 'YOUR WORKSPACE', title: 'You are ready.', response: "Let's create a personal Operational Partner shaped around your context, permissions, and goals." } };
  }
  return { scene: 'general', content: { label: 'SERA', title: '', response: 'SERA learns context, plans with constraints, and helps you act across the systems that matter—without losing human judgment.' } };
}

export function LandingPage({ onLaunchApp }: { onLaunchApp: () => void }) {
  const [scene, setScene] = useState<Scene>('reception');
  const [message, setMessage] = useState('');
  const [question, setQuestion] = useState('');
  const [content, setContent] = useState<SceneContent | null>(null);
  const [streamedResponse, setStreamedResponse] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [remaining, setRemaining] = useState(60);
  const [mobilePromptIndex, setMobilePromptIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const responseTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const endSession = () => {
    if (responseTimer.current) window.clearTimeout(responseTimer.current);
    setScene('reception');
    setMessage('');
    setQuestion('');
    setContent(null);
    setStreamedResponse('');
    setIsThinking(false);
    setRemaining(60);
  };

  const send = (value: string) => {
    const next = value.trim();
    if (!next || isThinking) return;
    const result = interpret(next);
    if (responseTimer.current) window.clearTimeout(responseTimer.current);
    setQuestion(next);
    setMessage('');
    setIsThinking(true);
    setScene(result.scene);
    setRemaining(60);
    responseTimer.current = window.setTimeout(() => {
      setContent(result.content);
      setIsThinking(false);
      setRemaining(60);
    }, 520);
  };

  const submit = (event: FormEvent) => { event.preventDefault(); send(message); };
  const chooseHeaderPrompt = (prompt: string) => {
    if (isThinking) return;
    setMessage(prompt);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    if (scene === 'reception' || isThinking) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setRemaining(value => {
        if (value <= 1) { window.setTimeout(endSession, 0); return 0; }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [scene, isThinking]);

  useEffect(() => () => { if (responseTimer.current) window.clearTimeout(responseTimer.current); }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isMobile || scene !== 'reception') { setMobilePromptIndex(0); return; }
    const interval = window.setInterval(() => setMobilePromptIndex(index => (index + 1) % mobilePrompts.length), 3800);
    return () => window.clearInterval(interval);
  }, [isMobile, scene]);

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

  const isClosing = remaining <= 10;

  return (
    <main className={`sera-room scene-${scene}`}>
      <div className="room-glow room-glow-one" /><div className="room-glow room-glow-two" />
      {scene === 'reception' && <GlobeAccent />}
      <header className="room-header">
        <a href="#reception" className="room-brand" onClick={endSession}><img src={seraLogo} alt="SERA" /><span>SERA</span></a>
        <div className="header-prompt-rail" aria-label="Explore SERA">
          <div className="header-prompt-track">
            {headerPrompts.map(item => <button type="button" key={item.label} onClick={() => chooseHeaderPrompt(item.prompt)}>{item.label}</button>)}
          </div>
        </div>
        <button className="header-launch" onClick={onLaunchApp}>Launch SERA</button>
      </header>

      <section className="room-stage" id="reception">
        {scene === 'reception' ? <IdleScene /> : <IntentScene scene={scene} question={question} content={content} streamedResponse={streamedResponse} isThinking={isThinking} />}
      </section>

      {scene !== 'reception' && !isThinking && <div className={`session-control ${isClosing ? 'is-closing' : ''}`}>
        <span className="session-pulse" />
        <span>{isClosing ? `Returning to reception in ${remaining}s` : `Session active · Return in ${remaining}s`}</span>
        {isClosing && <button onClick={() => setRemaining(60)}>Stay here</button>}
        <button onClick={endSession}>{isClosing ? 'End now' : 'Selesai'}</button>
      </div>}

      <form className={`room-input ${scene !== 'reception' ? 'is-engaged' : ''}`} onSubmit={submit}>
        <input ref={inputRef} value={message} onChange={event => setMessage(event.target.value)} disabled={isThinking} placeholder={scene === 'reception' ? (isMobile ? mobilePrompts[mobilePromptIndex] : 'What would you like to accomplish today?') : 'Continue the conversation…'} aria-label="Message SERA" />
        <button type="submit" disabled={!message.trim() || isThinking} aria-label="Send message">{isThinking ? <i /> : '↑'}</button>
      </form>
    </main>
  );
}


function GlobeAccent() {
  const rotationRef = useRef<SVGAnimateTransformElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => rotationRef.current?.beginElement());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="globe-accent" aria-hidden="true">
      <svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="globe-clip">
            <circle cx="250" cy="250" r="248" />
          </clipPath>
          <radialGradient id="pixel-globe-sphere" cx="38%" cy="30%" r="68%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="60%" stopColor="#7889ca" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#4056ab" stopOpacity="0.16" />
          </radialGradient>
          <radialGradient id="pixel-globe-vignette" cx="50%" cy="50%" r="50%">
            <stop offset="68%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#5266ba" stopOpacity="0.28" />
          </radialGradient>
          <pattern id="pixel-globe-base-grid" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.05" fill="#7182c8" />
          </pattern>
          <pattern id="pixel-globe-land-grid" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.25" fill="#4d60b5" />
          </pattern>
          <filter id="pixel-globe-contrast" colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="discrete" tableValues="0 0 0 1 1" />
              <feFuncG type="discrete" tableValues="0 0 0 1 1" />
              <feFuncB type="discrete" tableValues="0 0 0 1 1" />
            </feComponentTransfer>
          </filter>
          <mask id="pixel-globe-land-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="500" height="500">
            <rect width="500" height="500" fill="#000" />
            <g filter="url(#pixel-globe-contrast)">
              <animateTransform ref={rotationRef} attributeName="transform" type="translate" from="0 0" to="-996 0" dur="40s" begin="indefinite" repeatCount="indefinite" />
              <image href={globeMapSrc} x="-248" y="0" width="996" height="500" preserveAspectRatio="none" />
              <image href={globeMapSrc} x="718" y="0" width="996" height="500" preserveAspectRatio="none" />
            </g>
          </mask>
        </defs>

        <g clipPath="url(#globe-clip)">
          <circle cx="250" cy="250" r="248" fill="url(#pixel-globe-sphere)" />
          <rect width="500" height="500" fill="url(#pixel-globe-base-grid)" opacity=".48" />
          <rect width="500" height="500" fill="url(#pixel-globe-land-grid)" mask="url(#pixel-globe-land-mask)" opacity=".88" />
          <circle cx="250" cy="250" r="248" fill="url(#pixel-globe-vignette)" />
        </g>
      </svg>
    </div>
  );
}

const ecosystemTokens = [
  { key: 'wallets', label: '500+ Wallets', icon: Wallet },
  { key: 'trading', label: 'Trading', icon: Activity },
  { key: 'finance', label: 'Financial Systems', icon: Database },
  { key: 'automation', label: 'Automation', icon: Terminal },
  { key: 'tools', label: 'APIs & Tools', icon: Box },
];

function IdleScene() {
  return (
    <div className="idle-scene">
      <p className="idle-kicker">The Universal Agent OS</p>

      <h1 className="idle-headline">
        <span className="idle-word idle-word-1">An intelligence for every system</span>
      </h1>

      <p className="idle-sub">
        Connect the systems that matter. SERA turns context into clear, considered action, never without your intent.
      </p>

      <div className="idle-ecosystem" aria-label="Supported networks">
        <div className="idle-token-row">
          {ecosystemTokens.map((token) => (
            <div key={token.key} className="idle-token" title={token.label}>
              <div className="idle-token-icon"><token.icon strokeWidth={1.65} /></div>
              <span>{token.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntentScene({ scene, question, content, streamedResponse, isThinking }: { scene: Scene; question: string; content: SceneContent | null; streamedResponse: string; isThinking: boolean }) {
  const isResponseComplete = Boolean(content && streamedResponse.length >= content.response.length);
  return <div className="intent-scene"><div className="conversation-column"><div className="user-message"><p>{question}</p></div>{isThinking || !content ? <div className="thinking"><span>S</span><p>SERA is considering your request<i /><i /><i /></p></div> : <div className="sera-message"><p className="room-kicker">{content.label}</p><p className="streamed-copy">{streamedResponse}<b className={streamedResponse.length < content.response.length ? 'stream-cursor' : 'stream-cursor is-hidden'} /></p></div>}</div><div className="intent-visual-space">{isResponseComplete && <ExplanationAnimation key={question} scene={scene} />}</div></div>;
}

function ExplanationAnimation({ scene }: { scene: Scene }) {
  if (scene === 'automation') return <ProposalCard />;
  if (scene === 'crypto') return <div className="motion-card wallet-motion"><div className="motion-topline"><span className="motion-orb" /> WALLET INTELLIGENCE <small>LIVE DEMO</small></div><p className="wallet-label">OBSERVING CONTEXT</p><strong>$24,860<span>.20</span></strong><div className="motion-chart"><i /><i /><i /><i /><i /><i /><i /></div><div className="motion-check"><i>✓</i> Proposal required for action</div></div>;
  if (scene === 'security') return <div className="motion-card security-motion"><div className="motion-topline"><span className="motion-orb" /> EXECUTION BOUNDARY</div><div className="motion-flow"><span>Observe</span><i>→</i><span>Evaluate</span><i>→</i><span>Approve</span><i>→</i><b>Act</b></div><p>Every critical action is evaluated before it can proceed.</p><div className="motion-check"><i>✓</i> Human approval required</div></div>;
  return <ProposalCard />;
}

function ProposalCard() {
  const [approvePressed, setApprovePressed] = useState(false);
  const [showSecondCard, setShowSecondCard] = useState(false);
  const [rejectPressed, setRejectPressed] = useState(false);
  const [isCrumbling, setIsCrumbling] = useState(false);
  const [removeSecondCard, setRemoveSecondCard] = useState(false);

  useEffect(() => {
    const pressApprove = window.setTimeout(() => setApprovePressed(true), 1200);
    const showSecond = window.setTimeout(() => setShowSecondCard(true), 2300);
    const pressReject = window.setTimeout(() => setRejectPressed(true), 4600);
    const crumble = window.setTimeout(() => setIsCrumbling(true), 5300);
    const remove = window.setTimeout(() => setRemoveSecondCard(true), 6200);
    return () => [pressApprove, showSecond, pressReject, crumble, remove].forEach(window.clearTimeout);
  }, []);

  return <div className="proposal-sequence">
    <div className={`motion-card automation-motion proposal-card proposal-card-one ${approvePressed ? 'is-pressing' : ''}`}>
      <div className="motion-topline"><span className="motion-orb" /> SERA PROPOSAL <small>{showSecondCard ? 'APPROVED' : 'REVIEW REQUIRED'}</small></div>
      <h3>Recurring USDC transfer</h3>
      <div className="proposal-copy"><span>DESCRIPTION</span><p>SERA prepared this automation from your request. Review the details before allowing execution.</p></div>
      <div className="proposal-action"><span>ACTION</span><strong>Transfer 250.00 USDC</strong><p>To Treasury wallet · Every Friday, 08:00</p></div>
      <div className="proposal-outcome"><span>APPROVED</span><p>{showSecondCard ? 'Ready to execute' : 'Awaiting a decision'}</p></div>
      <div className="demo-actions" aria-hidden="true"><span className="demo-button demo-primary is-target">Approve</span><span className="demo-button demo-reject">Reject</span></div>
    </div>
    {showSecondCard && !removeSecondCard && <div className={`motion-card automation-motion proposal-card proposal-card-two ${rejectPressed ? 'is-pressing' : ''} ${isCrumbling ? 'is-crumbling' : ''}`}>
      <div className="motion-topline"><span className="motion-orb" /> NEW PROPOSAL <small>REVIEW REQUIRED</small></div>
      <h3>Transfer policy update</h3>
      <div className="proposal-copy"><span>DESCRIPTION</span><p>SERA surfaced a separate request for review. It will not proceed without a decision.</p></div>
      <div className="proposal-action"><span>ACTION</span><strong>Transfer 1,200.00 USDC</strong><p>To Operations wallet · One-time action</p></div>
      <div className="proposal-outcome"><span>REVIEW</span><p>Awaiting a decision</p></div>
      <div className="demo-actions" aria-hidden="true"><span className="demo-button demo-primary">Approve</span><span className="demo-button demo-reject is-target">Reject</span></div>
    </div>}
  </div>;
}
