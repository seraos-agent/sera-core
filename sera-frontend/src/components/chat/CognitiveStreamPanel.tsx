import type { ThemeType } from "../../theme";
import type { CognitiveObservationPayload } from "../../../../src/core/events/types";

export interface CognitiveStreamPanelProps {
  theme: ThemeType;
  observations: CognitiveObservationPayload[];
  onClose: () => void;
}

export function CognitiveStreamPanel({ theme, observations, onClose }: CognitiveStreamPanelProps) {
  // Sort observations to show newest first if they aren't already
  // Assuming they are appended to the end, we'll reverse them for display.
  const displayObs = [...observations].reverse();

  return (
    <>
      <div 
        style={{ position: "fixed", inset: 0, zIndex: 90 }} 
        onClick={onClose} 
      />
      <div style={{ 
        position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 16,
        background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 20,
        boxShadow: theme.shellShadow, zIndex: 100,
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: "walletPageIn 200ms ease forwards"
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: theme.ink, marginBottom: 2 }}>Cognitive Stream</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkSoft }}>Live intelligence and system observations</div>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {displayObs.length === 0 && (
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkFaint, textAlign: "center", padding: "20px 0" }}>
              No observations yet.
            </div>
          )}
          {displayObs.map((notif, index) => {
            return (
              <div key={index} style={{ 
                background: theme.surface2, borderRadius: 16, padding: "16px", 
                border: `1px solid ${theme.border}`, position: "relative"
              }}>
                <div style={{ position: "absolute", top: 20, right: 16, width: 6, height: 6, borderRadius: "50%", background: notif.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, color: theme.ink, marginBottom: 4, paddingRight: 16 }}>
                    {notif.title}
                  </div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkSoft, lineHeight: 1.4, marginBottom: 8 }}>
                    {notif.desc}
                  </div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: theme.inkFaint }}>
                    Just now &middot; {notif.signal}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
