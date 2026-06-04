import PageHeader from "@/components/shell/PageHeader";
import FaseNote from "@/components/shell/FaseNote";
import MarkdownLite from "@/components/shell/MarkdownLite";
import Icon from "@/components/shell/Icon";
import { readVaultNote } from "@/lib/vault";
import { buildDeckSummary } from "@/lib/deck";

export const metadata = { title: "Goals · Command Center" };
export const dynamic = "force-dynamic";

interface Checkbox { done: boolean; text: string }

function parseCheckboxes(md: string): Checkbox[] {
  const out: Checkbox[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
    if (m) out.push({ done: m[1].toLowerCase() === "x", text: m[2].trim() });
  }
  return out;
}

export default async function GoalsPage() {
  const [roadmap, priser, summary] = await Promise.all([
    readVaultNote("wiki/os/roadmap-naeste-skridt"),
    readVaultNote("context/priser"),
    buildDeckSummary(),
  ]);

  const goals = roadmap.ok ? parseCheckboxes(roadmap.body) : [];
  const done = goals.filter((g) => g.done).length;
  const pct = goals.length ? Math.round((done / goals.length) * 100) : 0;

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Target"
        title="Goals"
        subtitle={roadmap.ok ? `Fra vaulten (${roadmap.source}) · ${roadmap.frontmatter.horizon ?? "90 dage"}` : "Vaulten er ikke koblet på — viser skelet."}
      />

      <div style={{ display: "grid", gap: 18 }}>
        {roadmap.ok && goals.length > 0 ? (
          <section className="cc-card cc-card-pad">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>90-dages mål</h2>
              <span className="cc-dim" style={{ fontSize: 13 }}>{done} / {goals.length} klaret</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "var(--bg-3)", overflow: "hidden", marginBottom: 18 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width 400ms cubic-bezier(0.22,1,0.36,1)" }} />
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 9 }}>
              {goals.map((g, i) => (
                <li key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: "grid", placeItems: "center", background: g.done ? "var(--accent)" : "var(--bg-3)", border: g.done ? "none" : "1px solid var(--border-strong)" }}>
                    {g.done && <Icon name="CheckCheck" style={{ width: 12, height: 12, color: "#fff" }} />}
                  </span>
                  <span style={{ color: g.done ? "var(--text-dim)" : "var(--text)", textDecoration: g.done ? "line-through" : "none" }}>{g.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <FaseNote phase="vault" title="Mål fra vaulten" points={["Læg en note i KnowledgeOS/wiki/os/roadmap-naeste-skridt.md med checkbokse, så vises de her med fremdrift.", roadmap.reason ?? ""]} />
        )}

        <section className="cc-card cc-card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
            <Icon name="Briefcase" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Indtjening vs. mål</h2>
            <span className="cc-chip" style={{ marginLeft: "auto" }}>{summary.numbers.wonThisWeek} vundet i ugen</span>
          </div>
          {priser.ok ? (
            <div style={{ marginTop: 8 }}><MarkdownLite source={priser.body} /></div>
          ) : (
            <p className="cc-dim" style={{ fontSize: 13 }}>Priser hentes fra KnowledgeOS/context/priser.md ({priser.reason}).</p>
          )}
        </section>
      </div>
    </div>
  );
}
