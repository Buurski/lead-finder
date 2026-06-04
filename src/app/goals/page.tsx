import PageHeader from "@/components/shell/PageHeader";
import FaseNote from "@/components/shell/FaseNote";
import { buildDeckSummary } from "@/lib/deck";

export const metadata = { title: "Goals · Command Center" };
export const dynamic = "force-dynamic";

const GOALS = [
  { label: "5 betalende kunder", target: 5, unit: "kunder", live: true },
  { label: "10.000 kr / md i abonnement", target: 10000, unit: "kr", live: false },
  { label: "30 varme svar", target: 30, unit: "svar", live: false },
];

export default async function GoalsPage() {
  const s = await buildDeckSummary();
  const goals = GOALS.map((g) => ({ ...g, current: g.live ? s.numbers.wonThisWeek : 0 }));

  return (
    <div className="cc-fade">
      <PageHeader icon="Target" title="Goals" subtitle="90-dages mål. Det live signal er tyndt indtil vaulten er koblet på." />
      <div style={{ display: "grid", gap: 18 }}>
        <section className="cc-card cc-card-pad">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, marginBottom: 16 }}>90-dages mål</h2>
          <div style={{ display: "grid", gap: 16 }}>
            {goals.map((g) => {
              const pct = Math.min(100, Math.round((g.current / g.target) * 100));
              return (
                <div key={g.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600 }}>{g.label}</span>
                    <span className="cc-dim">{g.current.toLocaleString("da-DK")} / {g.target.toLocaleString("da-DK")} {g.unit}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "var(--bg-3)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 999 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <FaseNote
          phase="Fase C"
          title="Mål & priser fra vaulten"
          points={[
            "Læser og skriver KnowledgeOS/wiki/os/ så mål bor ét sted og kan redigeres fra mobilen.",
            "Indtjening vs. mål hentes fra context/priser.md, ikke hårdkodet her.",
          ]}
        />
      </div>
    </div>
  );
}
