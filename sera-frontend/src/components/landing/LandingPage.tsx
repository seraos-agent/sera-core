import React from 'react';
import './LandingPage.css';

export function LandingPage({ onLaunchApp }: { onLaunchApp: () => void }) {
  const handleLaunchApp = (e: React.MouseEvent) => {
    e.preventDefault();
    onLaunchApp();
  };

  return (
    <div className="landing-page">
      <nav className="nav">
        <div className="wrap">
          <div className="nav-logo"><span className="nav-mark"><span></span><span></span></span>SERA</div>
          <div className="nav-links">
            <a href="#capabilities">Capabilities</a>
            <a href="#architecture">Architecture</a>
            <a href="#integrations">Integrations</a>
            <a href="#product">Product</a>
          </div>
          <a href="#" className="btn btn-primary" onClick={handleLaunchApp}>Launch App</a>
        </div>
      </nav>

      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <div className="hero-eyebrow"><span className="tick"></span>AUTONOMOUS AGENT SYSTEM</div>
            <h1>SERA</h1>
            <div className="subtitle">A Universal Autonomous AI Agent System</div>
            <p className="desc">SERA executes real-world actions across digital systems using natural language — from financial operations to external service automation.</p>
            <div className="hero-ctas">
              <a href="#" className="btn btn-primary btn-lg" onClick={handleLaunchApp}>Launch App</a>
              <a href="#product" className="btn btn-ghost btn-lg">View Demo</a>
            </div>
          </div>

          <div className="console-stack">
            <div className="console-back">
              <div className="mock-label">Cognitive Stream</div>
              <div className="feed-item"><span className="feed-ts">14:02</span><span>Task queue nominal</span></div>
              <div className="feed-item"><span className="feed-ts">14:00</span><span>2 workflows scheduled</span></div>
            </div>
            <div className="console">
              <div className="console-head">
                <div className="console-dots"><span></span><span></span><span></span></div>
                <div className="console-status"><span className="dot"></span>AGENT SESSION · ACTIVE</div>
              </div>
              <div className="console-body">
                <div className="msg-bubble">transfer 500 usdc to treasury every friday</div>
                <div className="translate-arrow">↓ interpreted as</div>
                <div className="action-block">
                  <div><span className="k">action:</span> <span className="v">transfer</span></div>
                  <div><span className="k">amount:</span> <span className="v">500 USDC</span></div>
                  <div><span className="k">schedule:</span> <span className="v">weekly · fri 09:00</span></div>
                  <div><span className="k">layer:</span> <span className="v">blockchain</span></div>
                </div>
                <div className="console-actions">
                  <span className="chip approve">Approve</span>
                  <span className="chip reject">Reject</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="core-idea section-pad">
        <div className="wrap core-inner">
          <div className="core-bar"></div>
          <div className="core-text">
            <p className="core-line-1">SERA is not <span className="strike">a chatbot.</span></p>
            <p className="core-line-2">It is an <em>execution-capable</em> agent system.</p>
          </div>
        </div>
      </section>

      <section className="section-pad" id="capabilities">
        <div className="wrap">
          <div className="eyebrow">Capabilities</div>
          <div className="bento">
            <div className="card card-wide">
              <div className="card-num mono">01</div>
              <h3>Natural Language Execution</h3>
              <p>Convert human intent into structured actions.</p>
              <div className="translate-demo">
                <div className="raw">"pay 500 usdc to treasury every friday"</div>
                <div className="arrow">↓</div>
                <div className="structured">
                  <div><span className="k">action:</span> <span className="v">transfer</span></div>
                  <div><span className="k">amount:</span> <span className="v">500 USDC</span></div>
                  <div><span className="k">schedule:</span> <span className="v">weekly:fri</span></div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-num mono">02</div>
              <h3>Autonomous Workflows</h3>
              <p>Schedule and automate multi-step tasks across systems.</p>
            </div>
            <div className="card">
              <div className="card-num mono">03</div>
              <h3>Cross-System Integration</h3>
              <p>Connects to APIs, blockchain networks, and external services.</p>
            </div>
            <div className="card">
              <div className="card-num mono">04</div>
              <h3>Human-in-the-loop Control</h3>
              <p>All critical actions require approval before execution.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="architecture section-pad" id="architecture">
        <div className="wrap">
          <div className="eyebrow">System Flow</div>
          <div className="stack">
            <div className="layer">User Intent<span className="sub">natural language input</span></div>
            <div className="stack-connector"><div className="line"></div></div>
            <div className="layer">Dialogue Engine<span className="sub">interprets intent</span></div>
            <div className="stack-connector"><div className="line"></div></div>
            <div className="layer">Approval Layer<span className="sub">human confirms action</span></div>
            <div className="stack-connector"><div className="line"></div></div>
            <div className="layer">Execution Layer<span className="sub">runs the confirmed action</span></div>

            <div className="fanout">
              <div className="fanout-trunk"></div>
              <div className="fanout-bar"></div>
              <div className="fanout-nodes">
                <div className="fnode">
                  <div className="fnode-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2 21 7v10l-9 5-9-5V7z"/></svg>
                  </div>
                  <div className="fnode-box">Blockchain networks</div>
                </div>
                <div className="fnode">
                  <div className="fnode-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 4 4 12l4 8M16 4l4 8-4 8"/></svg>
                  </div>
                  <div className="fnode-box">APIs</div>
                </div>
                <div className="fnode">
                  <div className="fnode-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 18a4 4 0 0 1-1-7.87A5 5 0 0 1 15.9 8H16a4.5 4.5 0 0 1 1 8.9"/></svg>
                  </div>
                  <div className="fnode-box">External services</div>
                </div>
                <div className="fnode plus">
                  <div className="fnode-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 5v14M5 12h14"/></svg>
                  </div>
                  <div className="fnode-box">More</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-pad" id="integrations">
        <div className="wrap">
          <div className="eyebrow">Extensible by Design</div>
          <h2 style={{fontSize:"clamp(26px,3.6vw,36px)", fontWeight:600, maxWidth:"640px", marginBottom:"14px"}}>One agent system, many execution layers</h2>
          <p style={{color:"var(--text-secondary)", fontSize:"15.5px", maxWidth:"600px"}}>SERA supports multiple execution environments including blockchain networks (e.g. Base), APIs, and external services. Each integration acts as an execution layer within a unified agent system.</p>

          <div className="integrations-row">
            <div className="integration-nodes">
              <div className="inode"><span className="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2 21 7v10l-9 5-9-5V7z"/></svg></span>Blockchain networks</div>
              <div className="inode"><span className="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8 4 4 12l4 8M16 4l4 8-4 8"/></svg></span>APIs</div>
              <div className="inode"><span className="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7 18a4 4 0 0 1-1-7.87A5 5 0 0 1 15.9 8H16a4.5 4.5 0 0 1 1 8.9"/></svg></span>External services</div>
              <div className="inode"><span className="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg></span>More</div>
            </div>
            <div className="converge-arrow">→</div>
            <div className="hub"><span className="dot"></span>Unified Agent System</div>
          </div>
        </div>
      </section>

      <section className="section-pad" id="product">
        <div className="wrap">
          <div className="eyebrow">Product</div>
          <h2 style={{fontSize:"clamp(26px,3.6vw,36px)", fontWeight:600, marginBottom:"44px"}}>One system, multiple capabilities</h2>

          <div className="preview-grid">
            <div className="mock mock-tall">
              <div className="mock-label">Chat Proposal System</div>
              <div className="msg-bubble">Schedule a 500 USDC transfer to Treasury every Friday at 09:00?</div>
              <div className="console-actions">
                <span className="chip approve">Approve</span>
                <span className="chip reject">Reject</span>
              </div>
              <span className="mono" style={{fontSize:"10.5px", color:"var(--text-tertiary)"}}>Proposal #114 · awaiting approval</span>
            </div>

            <div className="preview-col">
              <div className="mock">
                <div className="mock-label">Scheduling Automation</div>
                <div className="sched-row"><span className="k">Action</span><span className="v">Recurring Transfer</span></div>
                <div className="sched-row"><span className="k">Frequency</span><span className="v">Weekly</span></div>
                <div className="sched-row"><span className="k">Next run</span><span className="v">Fri 09:00</span></div>
                <span className="status-pill">● Scheduled</span>
              </div>
              <div className="mock">
                <div className="mock-label">Cognitive Stream</div>
                <div className="feed-item"><span className="feed-ts">14:02</span><span>Proposal #114 approved</span></div>
                <div className="feed-item"><span className="feed-ts">13:58</span><span>New workflow detected</span></div>
                <div className="feed-item"><span className="feed-ts">13:51</span><span>External API sync completed</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="wrap">
          <h2>Start building with SERA</h2>
          <p style={{marginBottom:"28px", marginTop:"0"}}>A universal agent system for real-world execution.</p>
          <a href="#" className="btn btn-primary btn-lg" onClick={handleLaunchApp}>Launch App</a>
        </div>
      </section>

      <footer>
        <div className="wrap footer-row">
          <div className="footer-logo">SERA</div>
          <div className="footer-position">SERA is a universal autonomous AI agent system for executing real-world digital actions.</div>
          <div className="footer-copy">© 2026 SERA</div>
        </div>
      </footer>
    </div>
  );
}
