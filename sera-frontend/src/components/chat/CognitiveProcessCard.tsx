import { useState, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { ThemeType } from '../../theme';

export interface CognitiveStep {
  title: string;
  detail?: string;
  status?: 'completed' | 'active';
}

export interface CognitiveProcessCardProps {
  theme: ThemeType;
  phase?: 'THINKING' | 'WORKING' | 'COMPLETED';
  subText?: string;
  steps?: CognitiveStep[];
  isLive?: boolean;
  startTime?: number;
  durationSeconds?: number;
  hadTools?: boolean;
}

function getCleanSubText(subText?: string, phase?: string): string | null {
  if (!subText) return null;
  const trimmed = subText.trim();
  const lower = trimmed.toLowerCase();

  // Filter out redundant "Thinking" or "Working" text
  if (
    lower === 'thinking' ||
    lower === 'thinking...' ||
    lower === 'working' ||
    lower === 'working...' ||
    lower === 'memproses...' ||
    lower === 'memproses' ||
    (phase === 'THINKING' && (lower.startsWith('thinking') || lower.startsWith('menganalisis niat & strategi kognitif'))) ||
    (phase === 'WORKING' && lower.startsWith('working'))
  ) {
    return null;
  }

  // Cap length nicely for inline display
  if (trimmed.length > 50) {
    return trimmed.slice(0, 48) + '...';
  }
  return trimmed;
}

export function CognitiveProcessCard({
  theme,
  phase = 'COMPLETED',
  subText,
  steps = [],
  isLive = false,
  startTime,
  durationSeconds,
  hadTools = false
}: CognitiveProcessCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [elapsed, setElapsed] = useState(() => {
    if (!startTime) return 0;
    return Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  });

  useEffect(() => {
    if (!isLive || !startTime) return;
    setElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive, startTime]);

  const effectiveDuration = (durationSeconds !== undefined && durationSeconds > 0)
    ? durationSeconds
    : (elapsed > 0 ? elapsed : 1);

  const isWorking = phase === 'WORKING';

  // Determine main header title
  let mainTitle = 'Thinking';
  if (isLive) {
    mainTitle = isWorking ? 'Working' : 'Thinking';
  } else {
    // Completed state: clean single-line title (e.g. "Worked 20s" or "Thought 2s")
    const actionVerb = hadTools || (steps && steps.length > 1) ? 'Worked' : 'Thought';
    mainTitle = `${actionVerb} ${effectiveDuration}s`;
  }

  const cleanSub = isLive ? getCleanSubText(subText, phase) : null;

  return (
    <div style={{
      width: "100%",
      maxWidth: 620,
      fontFamily: "Inter, sans-serif",
      display: "flex",
      flexDirection: "column",
      marginBottom: isLive ? 12 : 8
    }}>
      {/* Main Cognitive Bar: Clean, Borderless & Capsule-Free */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 4px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          outline: "none",
          textAlign: "left",
          gap: 12
        }}
      >
        {/* Left Side: Status & Optional Sub-text */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {isLive ? (
            <div style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: `2px solid ${theme.accent}35`,
              borderTopColor: theme.accent,
              animation: "cognitive-spin 0.85s linear infinite",
              flexShrink: 0
            }} />
          ) : (
            <div style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: `${theme.accent}18`,
              color: theme.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              <Check size={11} strokeWidth={3} />
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{
              color: theme.ink,
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "-0.01em"
            }}>
              {mainTitle}
            </span>

            {/* Non-redundant distinct subtext */}
            {cleanSub && (
              <span style={{
                color: theme.inkSoft,
                fontSize: 12,
                fontWeight: 450,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}>
                • {cleanSub}
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Timer & Enlarged Dropdown Icon */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {isLive && elapsed > 0 && (
            <span style={{
              fontSize: 11.5,
              color: theme.inkFaint,
              fontFamily: "monospace",
              marginRight: 2
            }}>
              {elapsed}s
            </span>
          )}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: 6,
            color: theme.inkSoft,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease"
          }}>
            <ChevronDown size={19} />
          </div>
        </div>
      </button>

      {/* Sub-process Flow Capsule (Only renders inside a container when toggled open) */}
      {isOpen && (
        <div style={{
          marginTop: 6,
          padding: "10px 14px 12px",
          borderRadius: 12,
          background: theme.surface2,
          border: `1px solid ${theme.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
        }}>
          {steps && steps.length > 0 ? (
            steps.map((step, idx) => {
              const isStepActive = isLive && (step.status === 'active' || (!step.status && idx === steps.length - 1));
              return (
                <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                  {isStepActive ? (
                    <div style={{
                      marginTop: 4,
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      border: `2px solid ${theme.accent}35`,
                      borderTopColor: theme.accent,
                      animation: "cognitive-spin 0.85s linear infinite",
                      flexShrink: 0
                    }} />
                  ) : (
                    <div style={{
                      marginTop: 5,
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: theme.accent,
                      flexShrink: 0
                    }} />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.ink }}>
                      {(step.title === 'Menganalisis Niat Permintaan' || step.title === 'Menganalisis Niat & Strategi Kognitif')
                        ? 'Analyzing'
                        : step.title}
                    </span>
                    {step.detail && (
                      <span style={{ fontSize: 11, color: theme.inkFaint, lineHeight: 1.4 }}>
                        {step.detail.replace(/^Address user inquiry:\s*/i, '').replace(/^Respond to user:\s*/i, '')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: theme.accent,
                flexShrink: 0
              }} />
              <span style={{ fontSize: 11.5, color: theme.inkSoft }}>
                {isLive ? 'Analyzing context and preparing steps...' : 'Cognitive steps completed.'}
              </span>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes cognitive-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
