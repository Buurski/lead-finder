import PageHeader from "@/components/shell/PageHeader";
import FaseNote from "@/components/shell/FaseNote";
import Icon from "@/components/shell/Icon";

export const metadata = { title: "Journal · Command Center" };

export default function JournalPage() {
  return (
    <div className="cc-fade">
      <PageHeader icon="BookOpen" title="Journal" subtitle="Daglige briefs og logs — den rolige version af 'hvad skete der / hvad nu'." />
      <div style={{ display: "grid", gap: 18 }}>
        <section className="cc-card">
          <div className="cc-card-pad" style={{ borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Seneste briefs</h2>
          </div>
          <div className="cc-empty">
            <Icon name="BookOpen" />
            <div>Ingen briefs endnu.</div>
            <div className="cc-dim" style={{ fontSize: 12 }}>Morgen-briefen skriver til KnowledgeOS/daily/ og spejles her.</div>
          </div>
        </section>

        <FaseNote
          phase="Fase C"
          title="Morgen-brief"
          points={[
            "Nat: drafts produceret, emails fundet, svar modtaget + hvordan de klassificerede, opkald i dag.",
            "Foreslået fokus: de 3 vigtigste 'kræver dig'-punkter.",
            "Én linje sundhed: build / kø / AI-provider-status.",
            "Skrives til buur.aigro om morgenen ad en overvåget vej — aldrig af nat-agenten selv.",
          ]}
        />
      </div>
    </div>
  );
}
