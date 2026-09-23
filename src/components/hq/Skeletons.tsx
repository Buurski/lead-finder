// Rolige skelet-tilstande mens Hermes/Omverden hentes (Suspense-fallback).
export function AgentCardSkeleton() {
  return (
    <div className="hq-agent-card" aria-hidden="true">
      <div className="cc-skel" style={{ height: 14, width: 90, marginBottom: 14 }} />
      <div className="cc-skel" style={{ height: 20, width: "85%", marginBottom: 16 }} />
      <div className="cc-skel" style={{ height: 12, width: "70%", marginBottom: 9 }} />
      <div className="cc-skel" style={{ height: 12, width: "60%", marginBottom: 9 }} />
      <div className="cc-skel" style={{ height: 12, width: "65%" }} />
    </div>
  );
}

export function OmverdenSkeleton() {
  return (
    <section className="hq-omverden-wrap" aria-hidden="true">
      <div className="hq-section-label">Omverden</div>
      <div className="hq-omverden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="hq-om-card">
            <div className="cc-skel" style={{ height: 40, width: "100%" }} />
          </div>
        ))}
      </div>
    </section>
  );
}
