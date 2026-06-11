import PageHeader from "@/components/shell/PageHeader";
import FaseNote from "@/components/shell/FaseNote";
import MarkdownLite from "@/components/shell/MarkdownLite";
import Icon from "@/components/shell/Icon";
import { readVaultNote } from "@/lib/vault";
import { buildDeckSummary } from "@/lib/deck";
import GoalsClient from "./GoalsClient";

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
    // remote-first: edits commit to the live vault, so the stale in-repo
    // mirror must not shadow them
    readVaultNote("wiki/os/roadmap-naeste-skridt", { preferRemote: true }),
    readVaultNote("context/priser"),
    buildDeckSummary(),
  ]);

  const goals = roadmap.ok ? parseCheckboxes(roadmap.body) : [];

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Target"
        title="Goals"
        subtitle={roadmap.ok ? `Fra vaulten (${roadmap.source}) · ${roadmap.frontmatter.horizon ?? "90 dage"}` : "Vaulten er ikke koblet på — viser skelet."}
      />

      <div style={{ display: "grid", gap: 18 }}>
        {roadmap.ok && goals.length > 0 ? (
          <GoalsClient initialGoals={goals} />
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
