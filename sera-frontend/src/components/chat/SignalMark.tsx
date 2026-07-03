export function SignalMark({ active, size = 14, color }: { active: boolean, size?: number, color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, height: size }} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: active ? 10 : 4,
            height: 4,
            borderRadius: 2,
            background: color,
            opacity: active ? 1 : 0.55,
            transition: "width 420ms cubic-bezier(.4,0,.2,1), opacity 420ms",
            transitionDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </span>
  );
}
