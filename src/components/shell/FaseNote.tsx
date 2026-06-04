import Icon from "./Icon";

// A calm, honest "this surface exists but its live data lands in a later phase"
// block. Better than a fake-populated screen: it shows the planned shape and
// names the phase that wires it.
export default function FaseNote({
  phase,
  title,
  points,
}: {
  phase: string;
  title: string;
  points: string[];
}) {
  return (
    <section className="cc-card cc-card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <Icon name="Sparkles" style={{ width: 17, height: 17, color: "var(--text-dim)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>{title}</h2>
        <span className="cc-chip" style={{ marginLeft: "auto" }}>{phase}</span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 9 }}>
        {points.map((p) => (
          <li key={p} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Icon name="ChevronRight" style={{ width: 15, height: 15, color: "var(--text-dim)", marginTop: 2, flexShrink: 0 }} />
            <span className="cc-muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>{p}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
