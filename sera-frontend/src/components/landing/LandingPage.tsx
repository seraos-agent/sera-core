import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, Database, Plug, Terminal, Wallet } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './LandingPage.css';
import './PremiumPalette.css';
import seraLogo from '../../assets/sera-logo.png';
import globeMapSrc from '../../assets/globe-map.png';
import { getReceptionReply } from '../../services/reception/receptionClient';
import type { ReceptionReply, ReceptionVisual } from '../../services/reception/receptionClient';
import type { ReceptionTurn } from '../../services/reception/receptionClient';

type Scene = 'reception' | ReceptionVisual;

const headerPrompts = [
  { label: 'Introduction', prompt: 'What is SERA?' },
  { label: 'Capabilities', prompt: 'What can SERA help me accomplish?' },
  { label: 'How it works', prompt: 'How does SERA work?' },
  { label: 'Safeguards', prompt: 'How does SERA stay safe?' },
  { label: 'Ecosystem', prompt: 'What can SERA connect to?' },
];

const inputPrompts = [
  'What is SERA?',
  'What can SERA help me accomplish?',
  'How does SERA work?',
  'How does SERA stay safe?',
  'What can SERA connect to?',
];

const visualScenes = new Set<Scene>(['operating', 'security', 'automation', 'crypto']);

export function LandingPage({ onLaunchApp }: { onLaunchApp: () => void }) {
  const [scene, setScene] = useState<Scene>('reception');
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
        {scene === 'reception' ? <IdleScene /> : <IntentScene scene={scene} question={question} content={content} streamedResponse={streamedResponse} isThinking={isThinking} activeVisual={activeVisual} isVisualTransitioning={isVisualTransitioning} onSuggestion={send} onLaunchApp={onLaunchApp} />}
      </section>

      {scene !== 'reception' && !isThinking && <div className={`session-control ${isClosing ? 'is-closing' : ''}`}>
        <span className="session-pulse" />
        <span>{isClosing ? `Returning to reception in ${remaining}s` : `Session active · Return in ${remaining}s`}</span>
        {isClosing && <button onClick={() => setRemaining(45)}>Stay here</button>}
        <button onClick={endSession}>{isClosing ? 'End now' : 'End session'}</button>
      </div>}

      {scene === 'reception' && <footer className="landing-footer" aria-label="SERA information">
        <div className="landing-footer-identity"><span>SERA OS · 2026</span><span className="landing-footer-trust">Public reception · Read-only</span></div>
        <div className="landing-footer-links">
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
      </footer>}

      <form className={`room-input ${scene !== 'reception' ? 'is-engaged' : ''}`} onSubmit={submit}>
        <input ref={inputRef} value={message} onChange={event => setMessage(event.target.value)} disabled={isThinking} placeholder={scene === 'reception' ? inputPrompts[inputPromptIndex] : 'Continue the conversation…'} aria-label="Message SERA" />
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
  { key: 'wallets', label: 'Wallet Access', icon: Wallet },
  { key: 'trading', label: 'Market Context', icon: Activity },
  { key: 'finance', label: 'Financial Systems', icon: Database },
  { key: 'automation', label: 'Automation', icon: Terminal },
  { key: 'tools', label: 'Connectors', icon: Plug },
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

      <div className="idle-ecosystem" aria-label="SERA capability areas">
        <div className="idle-token-row">
          {ecosystemTokens.map((token) => (
            <div key={token.key} className="idle-token">
              <div className="idle-token-icon"><token.icon strokeWidth={1.65} /></div>
              <span>{token.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntentScene({ scene, question, content, streamedResponse, isThinking, activeVisual, isVisualTransitioning, onSuggestion, onLaunchApp }: { scene: Scene; question: string; content: ReceptionReply | null; streamedResponse: string; isThinking: boolean; activeVisual: { scene: Scene; id: number } | null; isVisualTransitioning: boolean; onSuggestion: (prompt: string) => void; onLaunchApp: () => void }) {
  const isResponseComplete = Boolean(content && streamedResponse.length >= content.response.length);
  const hasVisual = visualScenes.has(scene);
  const activeHasCard = Boolean(activeVisual && visualScenes.has(activeVisual.scene));
  const response = !content ? null : isResponseComplete
    ? <div className="markdown-copy"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content.response}</ReactMarkdown></div>
    : <p className="streamed-copy">{streamedResponse}<b className="stream-cursor" /></p>;
  return <div className={`intent-scene ${hasVisual ? 'has-visual' : 'is-text-only'}`}><div className="conversation-column"><div className="user-message"><p>{question}</p></div>{isThinking || !content ? <div className="thinking"><span className="thinking-spinner" /><p>Preparing your request…</p></div> : <div className="sera-message">{response}{isResponseComplete && hasVisual && <div className="mobile-inline-visual" aria-label="SERA explanation visual"><div className="mobile-inline-scale"><ExplanationAnimation key={`${question}-mobile`} scene={scene} /></div></div>}{isResponseComplete && scene === 'start' && <button type="button" className="conversation-launch" onClick={onLaunchApp}>Launch SERA</button>}{isResponseComplete && scene !== 'start' && content.suggestedQuestions.length > 0 && <div className="sera-suggestions">{content.suggestedQuestions.map(suggestion => <button type="button" key={suggestion} onClick={() => onSuggestion(suggestion)}>{suggestion}</button>)}</div>}</div>}</div>{activeHasCard ? <div className={`intent-visual-space persistent-visual ${isVisualTransitioning ? 'is-transitioning' : ''}`}><ExplanationAnimation key={activeVisual!.id} scene={activeVisual!.scene} /></div> : <div className={`ambient-visual-space persistent-visual ${isVisualTransitioning ? 'is-transitioning' : ''}`}>{activeVisual && <AmbientDiagram key={activeVisual.id} scene={activeVisual.scene} />}</div>}</div>;
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
