import fs from "node:fs";
import path from "node:path";
import PageHeader from "@/components/shell/PageHeader";
import FaseNote from "@/components/shell/FaseNote";
import Icon from "@/components/shell/Icon";
import MarkdownLite from "@/components/shell/MarkdownLite";

export const metadata = { title: "Hermes · Command Center" };
export const dynamic = "force-dynamic";

export default function HermesPage() {
  const deployed = Boolean(process.env.HERMES_URL);
  let setupDoc: string | null = null;
  try {
    setupDoc = fs.readFileSync(path.join(process.cwd(), "SETUP_HERMES.md"), "utf-8");
  } catch {
    setupDoc = null;
  }

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Radio"
        title="Hermes"
        subtitle="Den 24/7 baggrundsagent."
        action={
          <span className="cc-chip" style={{ background: deployed ? "var(--accent-soft)" : "var(--bg-3)", color: deployed ? "var(--accent-ink)" : "var(--text-muted)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: deployed ? "var(--accent)" : "var(--border-strong)", display: "inline-block" }} />
            {deployed ? "kører" : "klar til Railway-setup"}
          </span>
        }
      />

      <div style={{ display: "grid", gap: 18 }}>
        <section className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <Icon name="Server" style={{ width: 20, height: 20, color: deployed ? "var(--accent-ink)" : "var(--text-dim)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{deployed ? "Hermes er deployet" : "Hermes er ikke deployet endnu"}</div>
            <div className="cc-dim" style={{ fontSize: 12.5 }}>
              {deployed ? process.env.HERMES_URL : "Skelettet ligger i hermes/. Følg trinene nedenfor på Railway — deploy er dit eget skridt."}
            </div>
          </div>
        </section>

        <FaseNote
          phase="hermes/"
          title="Hvad Hermes skal kunne"
          points={[
            "Telegram-styring: 'kør motoren' / 'hvad kræver mig?' — kun fra din egen chat.",
            "Natlig vault-sweep der foreslår oprydning (ændrer aldrig kerne-filer selv).",
            "Skriver til samme KnowledgeOS-vault som appen læser fra (mobil-noter dukker op her).",
            "Kan ALDRIG sende mail uden din bekræftelse — samme guardrails som her.",
          ]}
        />

        {setupDoc && (
          <section className="cc-card cc-card-pad">
            <div className="cc-kicker" style={{ marginBottom: 8 }}>SETUP_HERMES.md</div>
            <MarkdownLite source={setupDoc} />
          </section>
        )}
      </div>
    </div>
  );
}
