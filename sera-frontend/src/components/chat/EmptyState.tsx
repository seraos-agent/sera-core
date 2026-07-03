import type { ThemeType } from "../../theme";

export function EmptyState({ theme }: { theme: ThemeType }) {
  const hour = new Date().getHours();
  let greeting = "Good evening";
  if (hour < 12) greeting = "Good morning";
  else if (hour < 18) greeting = "Good afternoon";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", animation: "walletPageIn 400ms ease forwards" }}>
      <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 18, color: theme.ink, marginBottom: 8, letterSpacing: -0.2 }}>
        {greeting}
      </div>
      <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 15, color: theme.inkSoft }}>
        What would you like to do?
      </div>
    </div>
  );
}
