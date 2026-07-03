import { SignalMark } from "./SignalMark";
import { SUGGESTIONS } from "../../theme";
import type { ThemeType } from "../../theme";

export function EmptyState({ theme }: { theme: ThemeType }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: theme.accent, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <SignalMark active={false} size={12} color={theme.accentInk} />
      </div>
      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 24, color: theme.ink, marginBottom: 28 }}>
        Operational Partner SERA siap membantu.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 380 }}>
        {SUGGESTIONS.slice(0, 3).map((s) => (
          <div
            key={s}
            style={{
              padding: "7px 14px",
              borderRadius: 20,
              border: `1px solid ${theme.border}`,
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              color: theme.inkSoft,
              cursor: "pointer",
            }}
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
