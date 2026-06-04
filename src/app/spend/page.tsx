import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/shell/Icon";
import { summarize, DAILY_ALERT_DKK } from "@/lib/spend-log";

export const metadata = { title: "AI Spend · Command Center" };
export const dynamic = "force-dynamic";

const kr = (n: number) => `${n.toLocaleString("da-DK", { maximumFractionDigits: 2 })} kr`;

export default function SpendPage() {
  const s = summarize();
  const maxDay = Math.max(1, ...s.byDay.map((d) => d.costUSD));
  const maxModel = Math.max(1, ...s.byModel.map((m) => m.costUSD));
  const dkk = (usd: number) => usd * 6.9;

  return (
    <div className="cc-fade">
      <PageHeader
        icon="CircleDollarSign"
        title="AI Spend"
        subtitle="Estimeret forbrug pr. model (tokens anslået fra længde). En måler, ikke en faktura."
      />

      {s.alert && (
        <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 10, alignItems: "center", borderColor: "var(--amber)", marginBottom: 16 }}>
          <Icon name="Activity" style={{ width: 18, height: 18, color: "var(--amber)" }} />
          <span style={{ fontSize: 13.5 }}>Dagsforbrug over {DAILY_ALERT_DKK} kr ({kr(s.todayDKK)}). Værd at kigge på.</span>
        </div>
      )}

      <div className="cc-numbers" style={{ marginBottom: 16 }}>
        <Stat label="i dag" value={kr(s.todayDKK)} />
        <Stat label="i alt" value={kr(s.totalDKK)} />
        <Stat label="kald" value={String(s.top.length ? s.byModel.reduce((a, m) => a + m.calls, 0) : 0)} />
        <Stat label="modeller" value={String(s.byModel.length)} />
      </div>

      {s.byDay.length === 0 ? (
        <div className="cc-card">
          <div className="cc-empty">
            <Icon name="CircleDollarSign" />
            <div>Ingen AI-kald registreret endnu.</div>
            <div className="cc-dim" style={{ fontSize: 12 }}>Forbrug logges automatisk når en model-nøgle er sat og motoren kører.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start" }} className="cc-spend-grid">
          <section className="cc-card cc-card-pad">
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Pr. dag</h2>
            <div style={{ display: "grid", gap: 9 }}>
              {s.byDay.slice(-14).map((d) => (
                <div key={d.key} style={{ display: "grid", gridTemplateColumns: "84px 1fr 64px", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                  <span className="cc-dim">{d.key.slice(5)}</span>
                  <span style={{ height: 10, borderRadius: 999, background: "var(--bg-3)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${(d.costUSD / maxDay) * 100}%`, background: "var(--accent)", borderRadius: 999 }} />
                  </span>
                  <span style={{ textAlign: "right" }}>{kr(dkk(d.costUSD))}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="cc-card cc-card-pad">
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Pr. model</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {s.byModel.map((m) => (
                <div key={m.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600 }}>{m.key}</span>
                    <span className="cc-dim">{kr(dkk(m.costUSD))} · {m.calls} kald</span>
                  </div>
                  <span style={{ display: "block", height: 8, borderRadius: 999, background: "var(--bg-3)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${(m.costUSD / maxModel) * 100}%`, background: "var(--accent-ink)", borderRadius: 999 }} />
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {s.top.length > 0 && (
        <section className="cc-card cc-card-pad" style={{ marginTop: 16 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Dyreste kald</h2>
          <div style={{ display: "grid", gap: 0 }}>
            {s.top.map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, padding: "8px 0", borderTop: i ? "1px solid var(--border)" : "none", fontSize: 12.5, alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{e.task} · {e.model}</span>
                <span className="cc-dim">{e.inputTokens + e.outputTokens} tok</span>
                <span style={{ width: 70, textAlign: "right" }}>{kr(dkk(e.costUSD))}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <style>{`@media (max-width:760px){ .cc-spend-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="cc-numbers-cell">
      <div className="cc-stat-n" style={{ fontSize: 22 }}>{value}</div>
      <div className="cc-stat-l">{label}</div>
    </div>
  );
}
