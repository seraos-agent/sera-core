import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

export function CountdownTimer({ expiryTime, resolved, size = 14 }: { expiryTime: number, resolved: boolean, size?: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (resolved) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resolved]);

  if (resolved) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#10b981", fontWeight: 600 }}>
        <Clock size={size} /> Resolved
      </span>
    );
  }

  const timeLeft = Math.max(0, Math.floor((expiryTime - now) / 1000));
  if (timeLeft === 0) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#ef4444", fontWeight: 600 }}>
        <Clock size={size} /> Resolving...
      </span>
    );
  }

  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#ef4444", fontWeight: 600 }}>
      <Clock size={size} /> {m}m {s}s left
    </span>
  );
}
