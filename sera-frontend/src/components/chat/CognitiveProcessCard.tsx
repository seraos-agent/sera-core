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

function getCleanSubText(subText?: string): string | null {
  if (!subText) return null;
  const trimmed = subText.trim();
  const lower = trimmed.toLowerCase();

  // Filter out redundant raw placeholders
  if (
    lower === 'thinking' ||
    lower === 'thinking...' ||
    lower === 'working' ||
    lower === 'working...'
  ) {
    return null;
  }

  // Cap nicely for inline display (allows natural cognitive phrasing)
  if (trimmed.length > 80) {
    return trimmed.slice(0, 77) + '...';
  }
  return trimmed;
}

/**
 * Extracts only the executive intent / opening formulation from raw reasoning text (Option A).
 * Discards internal scratchpad calculations, prompt rule debates, and self-checks.
 */
function extractExecutiveSummary(rawReasoning?: string): string {
  if (!rawReasoning || typeof rawReasoning !== 'string') return '';
  const trimmed = rawReasoning.trim();
  if (!trimmed) return '';

  // Clean meta headers like "Thinking Process:" or "Thought Process:"
  let cleaned = trimmed
    .replace(/^(?:thinking process|thought process|reasoning process|reasoning):\s*/i, '')
    .trim();

  // Split into distinct blocks separated by blank lines
  const blocks = cleaned.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  let candidate = blocks[0] || cleaned;

  // If the first block is a short header (< 30 chars), combine with the next block
  if (candidate.length < 30 && blocks.length > 1) {
    candidate = `${candidate} ${blocks[1]}`;
  }

  // If the executive block is overly verbose (> 320 chars), extract the first 1-2 complete sentences
  if (candidate.length > 320) {
    const sentenceMatch = candidate.match(/^((?:[^.!?\n]+[.!?\n]){1,2})/);
    if (sentenceMatch && sentenceMatch[1].trim().length >= 35) {
      candidate = sentenceMatch[1].trim();
    } else {
      const truncated = candidate.slice(0, 300);
      const lastSpace = truncated.lastIndexOf(' ');
      candidate = (lastSpace > 200 ? truncated.slice(0, lastSpace) : truncated).trim() + '...';
    }
  }

  return candidate.trim();
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

  const cleanSub = isLive ? getCleanSubText(subText) : null;

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
      {isOpen && (() => {
        // Deduplicate consecutive identical steps (same title & detail) for clean presentation
        const displayedSteps = (steps || []).reduce<CognitiveStep[]>((acc, current) => {
          const last = acc[acc.length - 1];
          const isCurrentAnalysis = current.title === 'Thinking Process' || current.title === 'Analyzing' || current.title === 'Analyzed';
          const isLastAnalysis = last && (last.title === 'Thinking Process' || last.title === 'Analyzing' || last.title === 'Analyzed');

          // If both are cognitive analysis steps, update to the most recent info
          if (last && isCurrentAnalysis && isLastAnalysis) {
            last.title = current.title;
            if (current.detail) last.detail = current.detail;
            if (current.status) last.status = current.status;
            return acc;
          }

          if (last && last.title === current.title && last.detail === current.detail) {
            if (current.status === 'active') {
              last.status = 'active';
            }
            return acc;
          }
          acc.push({ ...current });
          return acc;
        }, []);

        return (
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
            {displayedSteps && displayedSteps.length > 0 ? (
              displayedSteps.map((step, idx) => {
                const isStepActive = isLive && (step.status === 'active' || (!step.status && idx === displayedSteps.length - 1));
                const isAnalysis = step.title === 'Thinking Process' || step.title === 'Analyzing' || step.title === 'Analyzed';
                const displayTitle = isAnalysis ? (isStepActive ? 'Analyzing' : 'Analyzed') : step.title;
                const formattedDetail = isAnalysis ? extractExecutiveSummary(step.detail) : step.detail;

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
                        {displayTitle}
                      </span>
                      {formattedDetail && (
                        isAnalysis ? (
                          <div style={{
                            fontSize: 11.5,
                            color: theme.inkSoft,
                            lineHeight: 1.55,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            background: "rgba(0,0,0,0.025)",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: `1px solid ${theme.border}`,
                            marginTop: 4,
                            fontFamily: "Inter, sans-serif"
                          }}>
                            {formattedDetail}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: theme.inkFaint, lineHeight: 1.4 }}>
                            {formattedDetail.replace(/^Address user inquiry:\s*/i, '').replace(/^Respond to user:\s*/i, '')}
                          </span>
                        )
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
        );
      })()}

      <style>{`
        @keyframes cognitive-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
